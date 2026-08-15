const { createHash } = require("crypto");
const config = require("../config/auto-route");
const { toServiceDate } = require("../utils/service-date");
const { incrementMetric, observeDuration } = require("./metrics");
const logger = require("./logger");

const EARTH_RADIUS_METERS = 6371000;

function toRadians(value) {
  return Number(value) * Math.PI / 180;
}

function distanceMeters(left, right) {
  const latDelta = toRadians(right.latitude - left.latitude);
  const lngDelta = toRadians(right.longitude - left.longitude);
  const a = Math.sin(latDelta / 2) ** 2 +
    Math.cos(toRadians(left.latitude)) * Math.cos(toRadians(right.latitude)) * Math.sin(lngDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function perpendicularDistanceMeters(point, start, end) {
  const segmentLength = distanceMeters(start, end);
  if (!segmentLength) return distanceMeters(point, start);
  const latScale = 111320;
  const lngScale = Math.cos(toRadians(point.latitude)) * 111320;
  const px = (point.longitude - start.longitude) * lngScale;
  const py = (point.latitude - start.latitude) * latScale;
  const ex = (end.longitude - start.longitude) * lngScale;
  const ey = (end.latitude - start.latitude) * latScale;
  const ratio = Math.max(0, Math.min(1, (px * ex + py * ey) / (ex * ex + ey * ey || 1)));
  return Math.hypot(px - ratio * ex, py - ratio * ey);
}

function simplifyPolyline(points, toleranceMeters) {
  if (points.length <= 2) return points;
  let maxDistance = 0;
  let splitIndex = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = perpendicularDistanceMeters(points[index], points[0], points[points.length - 1]);
    if (distance > maxDistance) {
      maxDistance = distance;
      splitIndex = index;
    }
  }
  if (maxDistance <= toleranceMeters) return [points[0], points[points.length - 1]];
  const left = simplifyPolyline(points.slice(0, splitIndex + 1), toleranceMeters);
  const right = simplifyPolyline(points.slice(splitIndex), toleranceMeters);
  return [...left.slice(0, -1), ...right];
}

function normalizeEvidencePositions(rawPositions) {
  const sorted = (Array.isArray(rawPositions) ? rawPositions : [])
    .map((entry) => ({
      latitude: Number(entry.latitude),
      longitude: Number(entry.longitude),
      accuracy: Number(entry.accuracy),
      timestamp: new Date(entry.timestamp)
    }))
    .filter((entry) =>
      Number.isFinite(entry.latitude) && Number.isFinite(entry.longitude) &&
      Math.abs(entry.latitude) <= 90 && Math.abs(entry.longitude) <= 180 &&
      !Number.isNaN(entry.timestamp.getTime()) &&
      (!Number.isFinite(entry.accuracy) || entry.accuracy <= config.maxAccuracyMeters)
    )
    .sort((left, right) => left.timestamp - right.timestamp);
  const accepted = [];
  for (const point of sorted) {
    const previous = accepted[accepted.length - 1];
    if (!previous) {
      accepted.push(point);
      continue;
    }
    const elapsedSeconds = (point.timestamp - previous.timestamp) / 1000;
    if (elapsedSeconds <= 0) continue;
    const segmentDistance = distanceMeters(previous, point);
    const speedKmh = segmentDistance / elapsedSeconds * 3.6;
    if (elapsedSeconds > config.maxGapSeconds || speedKmh > config.maxSpeedKmh) continue;
    if (segmentDistance < 2) continue;
    accepted.push(point);
  }
  return accepted;
}

function buildDirection(origin, destination) {
  const northSouth = destination.latitude >= origin.latitude ? "N" : "S";
  const eastWest = destination.longitude >= origin.longitude ? "E" : "W";
  return `${northSouth}${eastWest}`;
}

function gridKey(point) {
  return `${Math.round(point.latitude / config.endpointGridDegrees)}:${Math.round(point.longitude / config.endpointGridDegrees)}`;
}

function polylineLengthMeters(polyline) {
  return polyline.slice(1).reduce((total, point, index) => total + distanceMeters(polyline[index], point), 0);
}

function resamplePolyline(polyline, sampleCount = config.corridorSamplePoints) {
  if (!Array.isArray(polyline) || polyline.length < 2) return polyline || [];
  const cumulative = [0];
  for (let index = 1; index < polyline.length; index += 1) {
    cumulative.push(cumulative[index - 1] + distanceMeters(polyline[index - 1], polyline[index]));
  }
  const total = cumulative[cumulative.length - 1];
  if (!total) return [polyline[0]];
  return Array.from({ length: sampleCount }, (_, sampleIndex) => {
    const target = total * sampleIndex / (sampleCount - 1);
    let segmentIndex = 1;
    while (segmentIndex < cumulative.length - 1 && cumulative[segmentIndex] < target) segmentIndex += 1;
    const start = polyline[segmentIndex - 1];
    const end = polyline[segmentIndex];
    const segmentLength = cumulative[segmentIndex] - cumulative[segmentIndex - 1];
    const ratio = segmentLength ? (target - cumulative[segmentIndex - 1]) / segmentLength : 0;
    return {
      latitude: start.latitude + (end.latitude - start.latitude) * ratio,
      longitude: start.longitude + (end.longitude - start.longitude) * ratio
    };
  });
}

function distanceToPolylineMeters(point, polyline) {
  if (polyline.length === 1) return distanceMeters(point, polyline[0]);
  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 1; index < polyline.length; index += 1) {
    nearest = Math.min(nearest, perpendicularDistanceMeters(point, polyline[index - 1], polyline[index]));
  }
  return nearest;
}

function directedCorridorStats(source, target) {
  const distances = resamplePolyline(source).map((point) => distanceToPolylineMeters(point, target));
  const nearbyCount = distances.filter((value) => value <= config.maxCorridorDistanceMeters).length;
  return {
    overlap: distances.length ? nearbyCount / distances.length : 0,
    averageDistanceMeters: distances.length
      ? distances.reduce((total, value) => total + value, 0) / distances.length
      : Number.POSITIVE_INFINITY
  };
}

function compareCorridors(left, right) {
  const leftLength = polylineLengthMeters(left);
  const rightLength = polylineLengthMeters(right);
  const lengthDifferenceRatio = Math.abs(leftLength - rightLength) / Math.max(leftLength, rightLength, 1);
  const forward = directedCorridorStats(left, right);
  const reverse = directedCorridorStats(right, left);
  const overlap = Math.min(forward.overlap, reverse.overlap);
  const averageDistanceMeters = (forward.averageDistanceMeters + reverse.averageDistanceMeters) / 2;
  return {
    matches: lengthDifferenceRatio <= config.maxLengthDifferenceRatio &&
      overlap >= config.minCorridorOverlap &&
      averageDistanceMeters <= config.maxCorridorDistanceMeters,
    overlap,
    averageDistanceMeters,
    lengthDifferenceRatio
  };
}

function buildCorridorCluster(polyline) {
  const referenceLatitude = polyline.reduce((total, point) => total + point.latitude, 0) / polyline.length;
  const latitudeCell = config.corridorGridMeters / 111320;
  const longitudeCell = config.corridorGridMeters / (111320 * Math.max(0.1, Math.cos(toRadians(referenceLatitude))));
  const signature = resamplePolyline(polyline, 12)
    .map((point) => `${Math.round(point.latitude / latitudeCell)}:${Math.round(point.longitude / longitudeCell)}`)
    .join("|");
  return createHash("sha256").update(signature).digest("hex").slice(0, 24);
}

function buildGroupKey({ organizationId, origin, destination, direction, corridorCluster }) {
  const raw = [organizationId, gridKey(origin), gridKey(destination), direction, corridorCluster, config.algorithmVersion].join("|");
  return createHash("sha256").update(raw).digest("hex");
}

function endpointsMatch(candidate, origin, destination, direction) {
  return candidate.algorithmVersion === config.algorithmVersion &&
    candidate.direction === direction &&
    gridKey(candidate.origin) === gridKey(origin) &&
    gridKey(candidate.destination) === gridKey(destination);
}

async function findMatchingCandidate(store, { organizationId, origin, destination, direction, polyline }) {
  const candidates = await store.listLearnedRouteCandidates({ organizationId });
  return candidates.find((candidate) =>
    endpointsMatch(candidate, origin, destination, direction) && compareCorridors(candidate.polyline, polyline).matches
  ) || null;
}

function evaluateEvidence(session, positions) {
  if (!session || session.status !== "FINISHED") return { eligible: false, reason: "session_not_finished" };
  if (positions.length < config.minPointCount) return { eligible: false, reason: "insufficient_points" };
  const durationSeconds = Math.round((positions[positions.length - 1].timestamp - positions[0].timestamp) / 1000);
  const distance = positions.slice(1).reduce((total, point, index) => total + distanceMeters(positions[index], point), 0);
  if (durationSeconds < config.minDurationSeconds) return { eligible: false, reason: "insufficient_duration" };
  if (distance < config.minDistanceMeters) return { eligible: false, reason: "insufficient_distance" };
  return { eligible: true, distanceMeters: Math.round(distance), durationSeconds };
}

async function processCompletedRouteSession(store, sessionId) {
  if (!config.learningEnabled) return { processed: false, reason: "learning_disabled" };
  const startedAt = Date.now();
  const session = await store.getRouteSessionById(sessionId);
  if (!session) return { processed: false, reason: "session_not_found" };
  const claim = await store.claimAutoRouteProcessing({
    sessionId,
    organizationId: session.organizationId,
    algorithmVersion: config.algorithmVersion
  });
  if (!claim?.claimed) {
    incrementMetric("auto_route_sessions_duplicate", 1);
    return { processed: false, reason: "already_processed", processing: claim };
  }
  try {
    const positions = normalizeEvidencePositions(await store.listRouteSessionPositions({
      sessionId,
      limit: 50000
    }));
    const eligibility = evaluateEvidence(session, positions);
    if (!eligibility.eligible) {
      await store.completeAutoRouteProcessing(claim.id, { status: "REJECTED", reason: eligibility.reason });
      incrementMetric("auto_route_evidence_rejected", 1, { reason: eligibility.reason });
      return { processed: true, eligible: false, reason: eligibility.reason };
    }
    const polyline = simplifyPolyline(
      positions.map(({ latitude, longitude }) => ({ latitude, longitude })),
      config.simplifyToleranceMeters
    );
    const origin = polyline[0];
    const destination = polyline[polyline.length - 1];
    const direction = buildDirection(origin, destination);
    const matchingCandidate = await findMatchingCandidate(store, {
      organizationId: session.organizationId,
      origin,
      destination,
      direction,
      polyline
    });
    const corridorCluster = matchingCandidate?.corridorCluster || buildCorridorCluster(polyline);
    const candidate = await store.upsertLearnedRouteCandidate({
      organizationId: session.organizationId,
      vehicleId: session.vehicleId,
      sessionId,
      groupKey: matchingCandidate?.groupKey || buildGroupKey({
        organizationId: session.organizationId,
        origin,
        destination,
        direction,
        corridorCluster
      }),
      corridorCluster,
      direction,
      origin,
      destination,
      polyline,
      distanceMeters: eligibility.distanceMeters,
      durationSeconds: eligibility.durationSeconds,
      algorithmVersion: config.algorithmVersion,
      geometryVersion: config.geometryVersion,
      representativeSessionId: matchingCandidate?.representativeSessionId || sessionId,
      // El dia operativo se toma del INICIO de la jornada y en la zona de
      // operacion: un turno nocturno pertenece al dia en que arranco, no al que
      // impone el cambio de fecha UTC a media jornada.
      serviceDate: toServiceDate(session.startedAt || positions[0].timestamp),
      observedAt: new Date(session.startedAt || positions[0].timestamp).toISOString(),
      minimumEvidenceCount: config.minEvidenceCount,
      minimumDistinctServiceDays: config.minDistinctServiceDays
    });
    await store.completeAutoRouteProcessing(claim.id, { status: "COMPLETED", candidateId: candidate.id });
    incrementMetric("auto_route_evidence_accepted", 1);
    if (candidate.status === "READY_FOR_REVIEW") incrementMetric("auto_route_candidates_ready", 1);
    observeDuration("auto_route_processing_duration_ms", Date.now() - startedAt);
    return { processed: true, eligible: true, candidate };
  } catch (error) {
    await store.completeAutoRouteProcessing(claim.id, { status: "FAILED", reason: "processing_failed" });
    logger.error({ module: "AutoRoute", action: "session.process", status: "error", error,
      organizationId: session.organizationId, metadata: { sessionId } });
    incrementMetric("auto_route_processing_failed", 1);
    throw error;
  }
}

module.exports = {
  buildDirection,
  buildCorridorCluster,
  buildGroupKey,
  compareCorridors,
  distanceMeters,
  evaluateEvidence,
  normalizeEvidencePositions,
  polylineLengthMeters,
  processCompletedRouteSession,
  resamplePolyline,
  simplifyPolyline
};
