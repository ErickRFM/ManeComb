const corridor = require("../config/route-corridor");
const {
  normalizePoint,
  normalizePolyline,
  projectPointOnRoute: projectGeometryPoint
} = require("../domain/route-geometry");

const ROUTE_STATE = Object.freeze({
  ON_ROUTE: "ON_ROUTE",
  NEAR_ROUTE: "NEAR_ROUTE",
  POSSIBLE_DEVIATION: "POSSIBLE_DEVIATION",
  OFF_ROUTE_CONFIRMED: "OFF_ROUTE_CONFIRMED",
  RECOVERING: "RECOVERING"
});

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeSpeedMetersPerSecond(speed) {
  const value = Number(speed);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value > 45 ? value / 3.6 : value;
}

function getCheckpointCount(distanceMeters) {
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) return 0;
  return Math.max(1, Math.round(distanceMeters / 1500));
}

function parseTimestamp(value, fallback = new Date()) {
  const date = value ? new Date(value) : fallback;
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return fallback;
  return date;
}

/**
 * Compatibility projection used by older callers/tests. The geometry authority is
 * route-geometry; this wrapper preserves the historical progress fields while
 * moving the alert decision to the stateful corridor engine below.
 */
function projectPointOnRoute({ point, polyline }) {
  const projection = projectGeometryPoint({ point, polyline });
  if (!projection) return null;
  const checkpointCount = getCheckpointCount(projection.totalDistance);
  const progressPercent = projection.totalDistance > 0
    ? Math.max(0, Math.min(100, Math.round(projection.distanceAlongRoute / projection.totalDistance * 100)))
    : 0;
  return {
    ...projection,
    checkpointCount,
    currentCheckpointIndex: checkpointCount
      ? Math.min(checkpointCount, Math.floor(progressPercent / 100 * checkpointCount))
      : 0,
    // Compatibility only: a single point this far away is a possible deviation,
    // not yet an operational OFF_ROUTE event.
    isOffRoute: projection.distanceFromRoute > corridor.possibleDeviationMeters,
    progressPercent
  };
}

function resolveRouteState({ distanceFromRoute, previousProgress, timestamp }) {
  const now = parseTimestamp(timestamp);
  const previousState = previousProgress?.routeState ||
    (previousProgress?.isOffRoute ? ROUTE_STATE.OFF_ROUTE_CONFIRMED : ROUTE_STATE.ON_ROUTE);
  const previousStartedAt = previousProgress?.deviationStartedAt
    ? parseTimestamp(previousProgress.deviationStartedAt, null)
    : null;

  if (distanceFromRoute <= corridor.onRouteMeters) {
    return {
      routeState: previousState === ROUTE_STATE.OFF_ROUTE_CONFIRMED ? ROUTE_STATE.RECOVERING : ROUTE_STATE.ON_ROUTE,
      deviationStartedAt: null,
      deviationDurationSeconds: 0
    };
  }

  if (distanceFromRoute <= corridor.nearRouteMeters) {
    return {
      routeState: previousState === ROUTE_STATE.OFF_ROUTE_CONFIRMED ? ROUTE_STATE.RECOVERING : ROUTE_STATE.NEAR_ROUTE,
      deviationStartedAt: null,
      deviationDurationSeconds: 0
    };
  }

  const deviationStartedAt = previousStartedAt || now;
  const durationSeconds = Math.max(0, Math.round((now.getTime() - deviationStartedAt.getTime()) / 1000));
  const repeatedHardDeviation =
    distanceFromRoute >= corridor.hardDeviationMeters &&
    [ROUTE_STATE.POSSIBLE_DEVIATION, ROUTE_STATE.OFF_ROUTE_CONFIRMED].includes(previousState) &&
    durationSeconds >= Math.min(15, corridor.deviationConfirmSeconds);
  const sustainedDeviation =
    distanceFromRoute >= corridor.possibleDeviationMeters &&
    durationSeconds >= corridor.deviationConfirmSeconds;

  return {
    routeState: repeatedHardDeviation || sustainedDeviation
      ? ROUTE_STATE.OFF_ROUTE_CONFIRMED
      : ROUTE_STATE.POSSIBLE_DEVIATION,
    deviationStartedAt: deviationStartedAt.toISOString(),
    deviationDurationSeconds: durationSeconds
  };
}

function calculateVehicleRouteProgress({ coordinates, heading, speed, timestamp, vehicle }) {
  const assignedRoute = vehicle?.assignedRoute || null;
  const route = assignedRoute?.route || null;
  const polyline = normalizePolyline(route?.polyline);
  const point = normalizePoint(coordinates);

  if (!assignedRoute || !route || !point || polyline.length < 2) return null;
  const projection = projectPointOnRoute({ point, polyline });
  if (!projection) return null;

  const speedMetersPerSecond = normalizeSpeedMetersPerSecond(speed);
  const routeDistanceMeters = Number(route.distanceMeters) || projection.totalDistance || 0;
  const plannedDurationSeconds = Number(route.durationInTrafficSeconds) || Number(route.durationSeconds) || 0;
  const distanceRemaining = routeDistanceMeters > 0 && projection.totalDistance > 0
    ? Math.max(0, routeDistanceMeters - projection.distanceAlongRoute / projection.totalDistance * routeDistanceMeters)
    : projection.distanceRemaining;
  const fallbackSeconds = plannedDurationSeconds > 0 && projection.totalDistance > 0
    ? Math.max(0, Math.round(plannedDurationSeconds * projection.distanceRemaining / projection.totalDistance))
    : 0;
  const effectiveSpeed = speedMetersPerSecond && speedMetersPerSecond >= 1
    ? speedMetersPerSecond
    : plannedDurationSeconds > 0 && routeDistanceMeters > 0
      ? routeDistanceMeters / plannedDurationSeconds
      : null;
  const timeRemainingSeconds = effectiveSpeed
    ? Math.max(0, Math.round(distanceRemaining / effectiveSpeed))
    : fallbackSeconds;
  const now = parseTimestamp(timestamp);
  const routeState = resolveRouteState({
    distanceFromRoute: projection.distanceFromRoute,
    previousProgress: vehicle.activeRouteProgress,
    timestamp: now
  });

  return {
    checkpointCount: projection.checkpointCount,
    currentCheckpointIndex: projection.currentCheckpointIndex,
    distanceAlongRoute: projection.distanceAlongRoute,
    distanceFromRoute: projection.distanceFromRoute,
    distanceRemaining,
    etaAt: timeRemainingSeconds ? new Date(now.getTime() + timeRemainingSeconds * 1000).toISOString() : null,
    heading: isFiniteNumber(Number(heading)) ? Number(heading) : null,
    isOffRoute: routeState.routeState === ROUTE_STATE.OFF_ROUTE_CONFIRMED,
    progressPercent: projection.progressPercent,
    routeState: routeState.routeState,
    deviationStartedAt: routeState.deviationStartedAt,
    deviationDurationSeconds: routeState.deviationDurationSeconds,
    snappedLocation: projection.snappedLocation,
    speedMetersPerSecond,
    timeRemainingSeconds,
    timestamp: now.toISOString()
  };
}

module.exports = {
  ROUTE_STATE,
  calculateVehicleRouteProgress,
  projectPointOnRoute,
  resolveRouteState
};
