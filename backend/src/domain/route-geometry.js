const EARTH_RADIUS_METERS = 6371000;

function toRadians(value) {
  return Number(value) * Math.PI / 180;
}

function normalizePoint(value) {
  if (!value || typeof value !== "object") return null;
  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return null;
  }
  return { latitude, longitude };
}

function normalizePolyline(value) {
  return (Array.isArray(value) ? value : []).map(normalizePoint).filter(Boolean);
}

function distanceMeters(left, right) {
  const origin = normalizePoint(left);
  const destination = normalizePoint(right);
  if (!origin || !destination) return Number.POSITIVE_INFINITY;
  const latDelta = toRadians(destination.latitude - origin.latitude);
  const lngDelta = toRadians(destination.longitude - origin.longitude);
  const a = Math.sin(latDelta / 2) ** 2 +
    Math.cos(toRadians(origin.latitude)) * Math.cos(toRadians(destination.latitude)) * Math.sin(lngDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toLocalMeters(point, origin) {
  const latitude = toRadians(point.latitude - origin.latitude) * EARTH_RADIUS_METERS;
  const longitude = toRadians(point.longitude - origin.longitude) * EARTH_RADIUS_METERS *
    Math.cos(toRadians((point.latitude + origin.latitude) / 2));
  return { x: longitude, y: latitude };
}

function fromLocalMeters(point, origin) {
  const latitude = origin.latitude + point.y / EARTH_RADIUS_METERS * 180 / Math.PI;
  const longitude = origin.longitude + point.x /
    (EARTH_RADIUS_METERS * Math.max(0.1, Math.cos(toRadians((latitude + origin.latitude) / 2)))) * 180 / Math.PI;
  return { latitude, longitude };
}

function getPolylineDistances(rawPolyline) {
  const polyline = normalizePolyline(rawPolyline);
  if (!polyline.length) return [];
  const cumulative = [0];
  for (let index = 1; index < polyline.length; index += 1) {
    cumulative[index] = cumulative[index - 1] + distanceMeters(polyline[index - 1], polyline[index]);
  }
  return cumulative;
}

function polylineLengthMeters(polyline) {
  const distances = getPolylineDistances(polyline);
  return distances.length ? distances[distances.length - 1] : 0;
}

function projectPointOnRoute({ point: rawPoint, polyline: rawPolyline }) {
  const point = normalizePoint(rawPoint);
  const polyline = normalizePolyline(rawPolyline);
  if (!point || polyline.length < 2) return null;
  const cumulative = getPolylineDistances(polyline);
  let best = null;

  for (let index = 0; index < polyline.length - 1; index += 1) {
    const start = polyline[index];
    const end = polyline[index + 1];
    const localPoint = toLocalMeters(point, start);
    const localEnd = toLocalMeters(end, start);
    const lengthSquared = localEnd.x ** 2 + localEnd.y ** 2;
    if (!lengthSquared) continue;
    const ratio = Math.max(0, Math.min(1,
      (localPoint.x * localEnd.x + localPoint.y * localEnd.y) / lengthSquared
    ));
    const snappedLocal = { x: localEnd.x * ratio, y: localEnd.y * ratio };
    const deltaX = localPoint.x - snappedLocal.x;
    const deltaY = localPoint.y - snappedLocal.y;
    const segmentLength = cumulative[index + 1] - cumulative[index];
    const candidate = {
      distanceAlongRoute: cumulative[index] + segmentLength * ratio,
      distanceFromRoute: Math.hypot(deltaX, deltaY),
      ratio,
      segmentIndex: index,
      snappedLocation: fromLocalMeters(snappedLocal, start)
    };
    if (!best || candidate.distanceFromRoute < best.distanceFromRoute) best = candidate;
  }

  if (!best) return null;
  const totalDistance = cumulative[cumulative.length - 1] || 0;
  return {
    ...best,
    distanceAlongRoute: Math.max(0, Math.min(totalDistance, best.distanceAlongRoute)),
    distanceRemaining: Math.max(0, totalDistance - best.distanceAlongRoute),
    totalDistance
  };
}

function pointAtDistance(rawPolyline, rawDistance) {
  const polyline = normalizePolyline(rawPolyline);
  if (!polyline.length) return null;
  if (polyline.length === 1) return polyline[0];
  const cumulative = getPolylineDistances(polyline);
  const total = cumulative[cumulative.length - 1] || 0;
  const target = Math.max(0, Math.min(total, Number(rawDistance) || 0));
  for (let index = 1; index < polyline.length; index += 1) {
    if (cumulative[index] < target) continue;
    const startDistance = cumulative[index - 1];
    const segmentDistance = cumulative[index] - startDistance;
    const ratio = segmentDistance ? (target - startDistance) / segmentDistance : 0;
    return {
      latitude: polyline[index - 1].latitude + (polyline[index].latitude - polyline[index - 1].latitude) * ratio,
      longitude: polyline[index - 1].longitude + (polyline[index].longitude - polyline[index - 1].longitude) * ratio
    };
  }
  return polyline[polyline.length - 1];
}

function slicePolyline(rawPolyline, rawStartDistance, rawEndDistance) {
  const polyline = normalizePolyline(rawPolyline);
  if (polyline.length < 2) return polyline;
  const cumulative = getPolylineDistances(polyline);
  const total = cumulative[cumulative.length - 1] || 0;
  const startDistance = Math.max(0, Math.min(total, Number(rawStartDistance) || 0));
  const endDistance = Math.max(startDistance, Math.min(total, Number(rawEndDistance) || total));
  const startPoint = pointAtDistance(polyline, startDistance);
  const endPoint = pointAtDistance(polyline, endDistance);
  const middle = polyline.filter((_, index) => cumulative[index] > startDistance && cumulative[index] < endDistance);
  return [startPoint, ...middle, endPoint].filter(Boolean);
}

function splicePolylineSegment(rawPolyline, rawStartDistance, rawEndDistance, rawReplacement) {
  const polyline = normalizePolyline(rawPolyline);
  const replacement = normalizePolyline(rawReplacement);
  if (polyline.length < 2 || replacement.length < 2) return polyline;
  const cumulative = getPolylineDistances(polyline);
  const total = cumulative[cumulative.length - 1] || 0;
  const startDistance = Math.max(0, Math.min(total, Number(rawStartDistance) || 0));
  const endDistance = Math.max(startDistance, Math.min(total, Number(rawEndDistance) || total));
  const prefix = polyline.filter((_, index) => cumulative[index] < startDistance);
  const suffix = polyline.filter((_, index) => cumulative[index] > endDistance);
  const startAnchor = pointAtDistance(polyline, startDistance);
  const endAnchor = pointAtDistance(polyline, endDistance);
  const replacementMiddle = replacement.slice(1, -1);
  const merged = [...prefix, startAnchor, ...replacementMiddle, endAnchor, ...suffix].filter(Boolean);
  return merged.filter((point, index) => index === 0 || distanceMeters(merged[index - 1], point) > 0.5);
}

function perpendicularDistanceMeters(point, start, end) {
  const projected = projectPointOnRoute({ point, polyline: [start, end] });
  return projected ? projected.distanceFromRoute : Number.POSITIVE_INFINITY;
}

function simplifyPolyline(rawPoints, toleranceMeters = 20) {
  const points = normalizePolyline(rawPoints);
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

function resamplePolyline(rawPolyline, sampleCount = 24) {
  const polyline = normalizePolyline(rawPolyline);
  if (polyline.length < 2) return polyline;
  const count = Math.max(2, Math.round(sampleCount));
  const total = polylineLengthMeters(polyline);
  if (!total) return [polyline[0]];
  return Array.from({ length: count }, (_, index) => pointAtDistance(polyline, total * index / (count - 1)));
}

function distanceToPolylineMeters(point, rawPolyline) {
  const projection = projectPointOnRoute({ point, polyline: rawPolyline });
  return projection ? projection.distanceFromRoute : Number.POSITIVE_INFINITY;
}

function compareCorridors(left, right, { maxDistanceMeters = 90, minOverlap = 0.7, sampleCount = 24 } = {}) {
  const directed = (source, target) => {
    const distances = resamplePolyline(source, sampleCount).map((point) => distanceToPolylineMeters(point, target));
    const nearby = distances.filter((distance) => distance <= maxDistanceMeters).length;
    return {
      overlap: distances.length ? nearby / distances.length : 0,
      averageDistanceMeters: distances.length
        ? distances.reduce((total, distance) => total + distance, 0) / distances.length
        : Number.POSITIVE_INFINITY
    };
  };
  const forward = directed(left, right);
  const reverse = directed(right, left);
  const overlap = Math.min(forward.overlap, reverse.overlap);
  const averageDistanceMeters = (forward.averageDistanceMeters + reverse.averageDistanceMeters) / 2;
  return {
    matches: overlap >= minOverlap && averageDistanceMeters <= maxDistanceMeters,
    overlap,
    averageDistanceMeters
  };
}

module.exports = {
  compareCorridors,
  distanceMeters,
  distanceToPolylineMeters,
  getPolylineDistances,
  normalizePoint,
  normalizePolyline,
  pointAtDistance,
  polylineLengthMeters,
  projectPointOnRoute,
  resamplePolyline,
  simplifyPolyline,
  slicePolyline,
  splicePolylineSegment
};
