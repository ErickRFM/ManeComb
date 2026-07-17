const ROUTE_DEVIATION_THRESHOLD_METERS = 50;

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function distanceInMeters(origin, destination) {
  const earthRadius = 6371000;
  const latitudeDelta = toRadians(destination.latitude - origin.latitude);
  const longitudeDelta = toRadians(destination.longitude - origin.longitude);
  const latitudeA = toRadians(origin.latitude);
  const latitudeB = toRadians(destination.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2) +
    Math.cos(latitudeA) *
      Math.cos(latitudeB) *
      Math.sin(longitudeDelta / 2) *
      Math.sin(longitudeDelta / 2);

  return 2 * earthRadius * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function toLocalMeters(point, origin) {
  const earthRadius = 6371000;
  const latitude = toRadians(point.latitude - origin.latitude) * earthRadius;
  const longitude =
    toRadians(point.longitude - origin.longitude) *
    earthRadius *
    Math.cos(toRadians((point.latitude + origin.latitude) / 2));

  return { x: longitude, y: latitude };
}

function fromLocalMeters(point, origin) {
  const earthRadius = 6371000;
  const latitude = origin.latitude + (point.y / earthRadius) * (180 / Math.PI);
  const longitude =
    origin.longitude +
    (point.x / (earthRadius * Math.cos(toRadians((latitude + origin.latitude) / 2)))) *
      (180 / Math.PI);

  return { latitude, longitude };
}

function normalizePoint(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return { latitude, longitude };
}

function normalizeSpeedMetersPerSecond(speed) {
  const value = Number(speed);

  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  return value > 45 ? value / 3.6 : value;
}

function getPolylineDistances(polyline) {
  const distances = [0];

  for (let index = 1; index < polyline.length; index += 1) {
    distances[index] = distances[index - 1] + distanceInMeters(polyline[index - 1], polyline[index]);
  }

  return distances;
}

function getCheckpointCount(distanceMeters) {
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) {
    return 0;
  }

  return Math.max(1, Math.round(distanceMeters / 1500));
}

function projectPointOnRoute({ point, polyline }) {
  if (!point || !Array.isArray(polyline) || polyline.length < 2) {
    return null;
  }

  const cumulativeDistances = getPolylineDistances(polyline);
  let best = null;

  for (let index = 0; index < polyline.length - 1; index += 1) {
    const start = polyline[index];
    const end = polyline[index + 1];
    const projectedPoint = toLocalMeters(point, start);
    const projectedEnd = toLocalMeters(end, start);
    const segmentLengthSquared = projectedEnd.x * projectedEnd.x + projectedEnd.y * projectedEnd.y;

    if (segmentLengthSquared <= 0) {
      continue;
    }

    const ratio = Math.max(
      0,
      Math.min(
        1,
        (projectedPoint.x * projectedEnd.x + projectedPoint.y * projectedEnd.y) / segmentLengthSquared
      )
    );
    const snappedMeters = {
      x: projectedEnd.x * ratio,
      y: projectedEnd.y * ratio
    };
    const deltaX = projectedPoint.x - snappedMeters.x;
    const deltaY = projectedPoint.y - snappedMeters.y;
    const distanceFromRoute = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const segmentLength = cumulativeDistances[index + 1] - cumulativeDistances[index];
    const distanceAlongRoute = cumulativeDistances[index] + segmentLength * ratio;

    if (!best || distanceFromRoute < best.distanceFromRoute) {
      best = {
        distanceAlongRoute,
        distanceFromRoute,
        segmentIndex: index,
        snappedLocation: fromLocalMeters(snappedMeters, start)
      };
    }
  }

  if (!best) {
    return null;
  }

  const totalDistance = cumulativeDistances[cumulativeDistances.length - 1] || 0;
  const distanceAlongRoute = Math.max(0, Math.min(totalDistance, best.distanceAlongRoute));
  const distanceRemaining = Math.max(0, totalDistance - distanceAlongRoute);
  const progressPercent = totalDistance > 0 ? Math.round((distanceAlongRoute / totalDistance) * 100) : 0;
  const checkpointCount = getCheckpointCount(totalDistance);

  return {
    ...best,
    checkpointCount,
    currentCheckpointIndex: checkpointCount
      ? Math.min(checkpointCount, Math.floor((progressPercent / 100) * checkpointCount))
      : 0,
    distanceAlongRoute,
    distanceRemaining,
    isOffRoute: best.distanceFromRoute > ROUTE_DEVIATION_THRESHOLD_METERS,
    progressPercent: Math.max(0, Math.min(100, progressPercent)),
    totalDistance
  };
}

function calculateVehicleRouteProgress({ coordinates, heading, speed, timestamp, vehicle }) {
  const assignedRoute = vehicle?.assignedRoute || null;
  const route = assignedRoute?.route || null;
  const polyline = Array.isArray(route?.polyline)
    ? route.polyline.map(normalizePoint).filter(Boolean)
    : [];
  const point = normalizePoint(coordinates);

  if (!assignedRoute || !route || !point || polyline.length < 2) {
    return null;
  }

  const projection = projectPointOnRoute({ point, polyline });

  if (!projection) {
    return null;
  }

  const speedMetersPerSecond = normalizeSpeedMetersPerSecond(speed);
  const routeDistanceMeters = Number(route.distanceMeters) || projection.totalDistance || 0;
  const plannedDurationSeconds =
    Number(route.durationInTrafficSeconds) || Number(route.durationSeconds) || 0;
  const distanceRemaining =
    routeDistanceMeters > 0 && projection.totalDistance > 0
      ? Math.max(0, routeDistanceMeters - (projection.distanceAlongRoute / projection.totalDistance) * routeDistanceMeters)
      : projection.distanceRemaining;
  const fallbackSeconds =
    plannedDurationSeconds > 0 && projection.totalDistance > 0
      ? Math.max(0, Math.round(plannedDurationSeconds * (projection.distanceRemaining / projection.totalDistance)))
      : 0;
  const effectiveSpeed =
    speedMetersPerSecond && speedMetersPerSecond >= 1
      ? speedMetersPerSecond
      : plannedDurationSeconds > 0 && routeDistanceMeters > 0
        ? routeDistanceMeters / plannedDurationSeconds
        : null;
  const timeRemainingSeconds = effectiveSpeed
    ? Math.max(0, Math.round(distanceRemaining / effectiveSpeed))
    : fallbackSeconds;
  const now = timestamp && !Number.isNaN(new Date(timestamp).getTime())
    ? new Date(timestamp)
    : new Date();

  return {
    checkpointCount: projection.checkpointCount,
    currentCheckpointIndex: projection.currentCheckpointIndex,
    distanceAlongRoute: projection.distanceAlongRoute,
    distanceFromRoute: projection.distanceFromRoute,
    distanceRemaining,
    etaAt: timeRemainingSeconds ? new Date(now.getTime() + timeRemainingSeconds * 1000).toISOString() : null,
    heading: isFiniteNumber(Number(heading)) ? Number(heading) : null,
    isOffRoute: projection.isOffRoute,
    progressPercent: projection.progressPercent,
    snappedLocation: projection.snappedLocation,
    speedMetersPerSecond,
    timeRemainingSeconds,
    timestamp: now.toISOString()
  };
}

module.exports = {
  calculateVehicleRouteProgress,
  projectPointOnRoute
};
