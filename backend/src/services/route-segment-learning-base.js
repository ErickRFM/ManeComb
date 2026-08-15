const { createHash } = require("crypto");
const corridorConfig = require("../config/route-corridor");
const {
  compareCorridors,
  distanceMeters,
  normalizePolyline,
  polylineLengthMeters,
  projectPointOnRoute,
  resamplePolyline,
  simplifyPolyline,
  slicePolyline
} = require("../domain/route-geometry");
const {
  decodeSegmentGeometryVersion,
  encodeSegmentGeometryVersion
} = require("../domain/learned-route-segment");

function timestampMs(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function buildSegmentCorridorCluster(polyline) {
  const points = normalizePolyline(polyline);
  if (points.length < 2) return "";
  const referenceLatitude = points.reduce((total, point) => total + point.latitude, 0) / points.length;
  const latitudeCell = corridorConfig.segmentCorridorDistanceMeters / 111320;
  const longitudeCell = corridorConfig.segmentCorridorDistanceMeters /
    (111320 * Math.max(0.1, Math.cos(referenceLatitude * Math.PI / 180)));
  const signature = resamplePolyline(points, 10)
    .map((point) => `${Math.round(point.latitude / latitudeCell)}:${Math.round(point.longitude / longitudeCell)}`)
    .join("|");
  return createHash("sha256").update(signature).digest("hex").slice(0, 24);
}

function anchorCell(distanceAlongRoute) {
  return Math.round((Number(distanceAlongRoute) || 0) / corridorConfig.segmentAnchorCellMeters);
}

function buildSegmentGroupKey({
  organizationId,
  routeId,
  routeRevision,
  startDistanceMeters,
  endDistanceMeters,
  corridorCluster,
  algorithmVersion
}) {
  return createHash("sha256").update([
    organizationId,
    routeId,
    routeRevision,
    anchorCell(startDistanceMeters),
    anchorCell(endDistanceMeters),
    corridorCluster,
    algorithmVersion
  ].join("|")).digest("hex");
}

function buildCandidatePolyline(startProjection, offRoutePoints, endProjection, toleranceMeters = 12) {
  return simplifyPolyline([
    startProjection.snappedLocation,
    ...offRoutePoints.map((entry) => ({ latitude: entry.latitude, longitude: entry.longitude })),
    endProjection.snappedLocation
  ], toleranceMeters);
}

function isMeaningfulSegment(segment) {
  if (!segment) return false;
  if (segment.points.length < corridorConfig.segmentMinPoints) return false;
  if (segment.endProjection.distanceAlongRoute <= segment.startProjection.distanceAlongRoute) return false;
  const durationSeconds = Math.round((segment.finishedAtMs - segment.startedAtMs) / 1000);
  if (durationSeconds < corridorConfig.segmentMinDurationSeconds) return false;
  const candidatePolyline = buildCandidatePolyline(segment.startProjection, segment.points, segment.endProjection);
  if (candidatePolyline.length < 2 || polylineLengthMeters(candidatePolyline) < corridorConfig.segmentMinDistanceMeters) return false;
  return true;
}

function finalizeSegment(active, endEntry, officialPolyline) {
  if (!active || !endEntry?.projection) return null;
  const segment = {
    ...active,
    endProjection: endEntry.projection,
    finishedAtMs: timestampMs(endEntry.timestamp)
  };
  if (!segment.finishedAtMs || !isMeaningfulSegment(segment)) return null;
  const candidatePolyline = buildCandidatePolyline(segment.startProjection, segment.points, segment.endProjection);
  const baselinePolyline = slicePolyline(
    officialPolyline,
    segment.startProjection.distanceAlongRoute,
    segment.endProjection.distanceAlongRoute
  );
  const corridorComparison = compareCorridors(candidatePolyline, baselinePolyline, {
    maxDistanceMeters: corridorConfig.segmentCorridorDistanceMeters,
    minOverlap: corridorConfig.segmentCorridorOverlap
  });
  if (corridorComparison.matches) return null;
  return {
    startProjection: segment.startProjection,
    endProjection: segment.endProjection,
    startedAtMs: segment.startedAtMs,
    finishedAtMs: segment.finishedAtMs,
    durationSeconds: Math.max(1, Math.round((segment.finishedAtMs - segment.startedAtMs) / 1000)),
    candidatePolyline,
    baselinePolyline,
    distanceMeters: Math.round(polylineLengthMeters(candidatePolyline)),
    baselineDistanceMeters: Math.round(polylineLengthMeters(baselinePolyline)),
    corridorComparison
  };
}

function extractDeviationSegments(positions, officialPolyline) {
  const route = normalizePolyline(officialPolyline);
  if (route.length < 2) return [];
  const projected = (Array.isArray(positions) ? positions : [])
    .map((position) => ({
      ...position,
      projection: projectPointOnRoute({ point: position, polyline: route })
    }))
    .filter((entry) => entry.projection && timestampMs(entry.timestamp));
  const results = [];
  let active = null;
  let previous = null;

  for (const entry of projected) {
    const distance = entry.projection.distanceFromRoute;
    if (!active && distance >= corridorConfig.segmentCandidateMeters) {
      const startEntry = previous?.projection && previous.projection.distanceFromRoute <= corridorConfig.nearRouteMeters
        ? previous
        : entry;
      active = {
        startProjection: startEntry.projection,
        startedAtMs: timestampMs(startEntry.timestamp),
        points: [entry]
      };
      previous = entry;
      continue;
    }

    if (active) {
      if (distance <= corridorConfig.segmentRecoveryMeters) {
        const finalized = finalizeSegment(active, entry, route);
        if (finalized) results.push(finalized);
        active = null;
      } else {
        active.points.push(entry);
      }
    }
    previous = entry;
  }

  // A segment must rejoin the official corridor. An unfinished tail is evidence of
  // a real diversion or an incomplete session, not a safe route improvement.
  return results;
}

function matchingSegmentCandidate(candidate, {
  algorithmVersion,
  routeId,
  routeRevision,
  startDistanceMeters,
  endDistanceMeters,
  polyline
}) {
  if (candidate.algorithmVersion !== algorithmVersion) return false;
  const metadata = decodeSegmentGeometryVersion(candidate.geometryVersion);
  if (!metadata || metadata.routeId !== routeId || metadata.routeRevision !== routeRevision) return false;
  if (Math.abs(metadata.startDistanceMeters - startDistanceMeters) > corridorConfig.segmentAnchorMatchMeters) return false;
  if (Math.abs(metadata.endDistanceMeters - endDistanceMeters) > corridorConfig.segmentAnchorMatchMeters) return false;
  return compareCorridors(candidate.polyline, polyline, {
    maxDistanceMeters: corridorConfig.segmentCorridorDistanceMeters,
    minOverlap: corridorConfig.segmentCorridorOverlap
  }).matches;
}

async function persistDeviationSegments({
  store,
  session,
  route,
  positions,
  serviceDate,
  observedAt,
  algorithmVersion,
  geometryFormatVersion,
  minimumEvidenceCount,
  minimumDistinctServiceDays
}) {
  const extracted = extractDeviationSegments(positions, route.polyline);
  if (!extracted.length) return [];
  const existing = await store.listLearnedRouteCandidates({ organizationId: session.organizationId });
  const persisted = [];

  for (const segment of extracted) {
    const startDistanceMeters = Math.round(segment.startProjection.distanceAlongRoute);
    const endDistanceMeters = Math.round(segment.endProjection.distanceAlongRoute);
    const matching = existing.find((candidate) => matchingSegmentCandidate(candidate, {
      algorithmVersion,
      routeId: route.id,
      routeRevision: route.revision,
      startDistanceMeters,
      endDistanceMeters,
      polyline: segment.candidatePolyline
    }));
    const corridorCluster = matching?.corridorCluster || buildSegmentCorridorCluster(segment.candidatePolyline);
    const geometryVersion = matching?.geometryVersion || encodeSegmentGeometryVersion({
      formatVersion: geometryFormatVersion,
      routeId: route.id,
      routeRevision: route.revision,
      startDistanceMeters,
      endDistanceMeters
    });
    if (!geometryVersion) continue;
    const candidate = await store.upsertLearnedRouteCandidate({
      organizationId: session.organizationId,
      vehicleId: session.vehicleId,
      sessionId: session.id,
      groupKey: matching?.groupKey || buildSegmentGroupKey({
        organizationId: session.organizationId,
        routeId: route.id,
        routeRevision: route.revision,
        startDistanceMeters,
        endDistanceMeters,
        corridorCluster,
        algorithmVersion
      }),
      corridorCluster,
      direction: "FORWARD",
      origin: segment.startProjection.snappedLocation,
      destination: segment.endProjection.snappedLocation,
      polyline: segment.candidatePolyline,
      distanceMeters: segment.distanceMeters,
      durationSeconds: segment.durationSeconds,
      algorithmVersion,
      geometryVersion,
      representativeSessionId: matching?.representativeSessionId || session.id,
      serviceDate,
      observedAt,
      minimumEvidenceCount,
      minimumDistinctServiceDays
    });
    persisted.push({
      candidate,
      baselineDistanceMeters: segment.baselineDistanceMeters,
      startDistanceMeters,
      endDistanceMeters
    });
  }

  return persisted;
}

module.exports = {
  buildSegmentCorridorCluster,
  buildSegmentGroupKey,
  extractDeviationSegments,
  matchingSegmentCandidate,
  persistDeviationSegments
};
