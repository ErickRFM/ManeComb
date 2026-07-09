import {
  projectPointOnRoute,
  type TrackerStatus,
} from '@/src/hooks/point-to-point-tracker-core';
import type {
  AssignedRoute,
  GeoPoint,
  NavigationRouteOption,
  Vehicle,
} from '@/src/types/app';
import { normalizeAssignedRoute } from '@/src/utils/navigation-data';

type TrackedLocation = GeoPoint & {
  heading?: number | null;
  speed?: number | null;
};

export type ActiveRouteProgress = {
  checkpointCount: number;
  currentCheckpointIndex: number;
  distanceAlongRoute: number;
  distanceFromRoute: number;
  distanceRemaining: number;
  etaAt: string | null;
  heading?: number | null;
  isOffRoute: boolean;
  progressPercent: number;
  snappedLocation: GeoPoint | null;
  speedMetersPerSecond: number | null;
  timeRemainingSeconds: number;
  timestamp: string;
};

export type ActiveRouteSnapshot = {
  id: string;
  name: string;
  origin: GeoPoint | null;
  originLabel: string;
  destination: GeoPoint;
  destinationLabel: string;
  route: NavigationRouteOption;
  assignedRoute: AssignedRoute;
  progress: ActiveRouteProgress | null;
  status: 'idle' | 'waiting_start' | 'in_progress' | 'off_route' | 'paused' | 'arrived';
  driver: {
    id: string | null;
    name: string;
  };
  vehicle: {
    id: string;
    code: string;
  };
};

function normalizeSpeedMetersPerSecond(speed: number | null | undefined) {
  if (typeof speed !== 'number' || !Number.isFinite(speed) || speed <= 0) {
    return null;
  }

  return speed > 45 ? speed / 3.6 : speed;
}

function normalizeRouteProgress(value: unknown): ActiveRouteProgress | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const progress = value as Partial<ActiveRouteProgress>;
  const progressPercent = Number(progress.progressPercent);
  const distanceRemaining = Number(progress.distanceRemaining);
  const timeRemainingSeconds = Number(progress.timeRemainingSeconds);

  if (
    !Number.isFinite(progressPercent) ||
    !Number.isFinite(distanceRemaining) ||
    !Number.isFinite(timeRemainingSeconds)
  ) {
    return null;
  }

  return {
    checkpointCount: Math.max(0, Number(progress.checkpointCount) || 0),
    currentCheckpointIndex: Math.max(0, Number(progress.currentCheckpointIndex) || 0),
    distanceAlongRoute: Math.max(0, Number(progress.distanceAlongRoute) || 0),
    distanceFromRoute: Math.max(0, Number(progress.distanceFromRoute) || 0),
    distanceRemaining: Math.max(0, distanceRemaining),
    etaAt: typeof progress.etaAt === 'string' ? progress.etaAt : null,
    heading: typeof progress.heading === 'number' && Number.isFinite(progress.heading) ? progress.heading : null,
    isOffRoute: Boolean(progress.isOffRoute),
    progressPercent: Math.max(0, Math.min(100, Math.round(progressPercent))),
    snappedLocation: progress.snappedLocation || null,
    speedMetersPerSecond:
      typeof progress.speedMetersPerSecond === 'number' && Number.isFinite(progress.speedMetersPerSecond)
        ? progress.speedMetersPerSecond
        : null,
    timeRemainingSeconds: Math.max(0, Math.round(timeRemainingSeconds)),
    timestamp: typeof progress.timestamp === 'string' ? progress.timestamp : new Date().toISOString(),
  };
}

export function buildRouteProgressSnapshot({
  plannedDurationSeconds,
  persistedProgress,
  routeDistanceMeters,
  routePolyline,
  startedAt,
  trackedLocation,
}: {
  plannedDurationSeconds: number;
  persistedProgress?: unknown;
  routeDistanceMeters: number;
  routePolyline: GeoPoint[];
  startedAt?: string | null;
  trackedLocation: TrackedLocation | null;
}): ActiveRouteProgress | null {
  if (!trackedLocation || routePolyline.length < 2) {
    return normalizeRouteProgress(persistedProgress);
  }

  const projection = projectPointOnRoute({
    point: trackedLocation,
    polyline: routePolyline,
  });

  if (!projection) {
    return normalizeRouteProgress(persistedProgress);
  }

  const speedMetersPerSecond = normalizeSpeedMetersPerSecond(trackedLocation.speed);
  const startedAtTime = startedAt ? new Date(startedAt).getTime() : null;
  const elapsedSeconds =
    startedAtTime && Number.isFinite(startedAtTime)
      ? Math.max(1, Math.round((Date.now() - startedAtTime) / 1000))
      : null;
  const averageSpeed =
    elapsedSeconds && projection.distanceAlongRoute > 0
      ? projection.distanceAlongRoute / elapsedSeconds
      : null;
  const effectiveSpeed =
    speedMetersPerSecond && speedMetersPerSecond >= 1
      ? speedMetersPerSecond
      : averageSpeed && averageSpeed >= 1
        ? averageSpeed
        : null;
  const distanceRemaining =
    routeDistanceMeters > 0 && projection.totalDistance > 0
      ? Math.max(0, routeDistanceMeters - (projection.distanceAlongRoute / projection.totalDistance) * routeDistanceMeters)
      : projection.distanceRemaining;
  const fallbackSeconds =
    plannedDurationSeconds > 0 && projection.totalDistance > 0
      ? Math.max(0, Math.round(plannedDurationSeconds * (projection.distanceRemaining / projection.totalDistance)))
      : 0;
  const timeRemainingSeconds = effectiveSpeed
    ? Math.max(0, Math.round(distanceRemaining / effectiveSpeed))
    : fallbackSeconds;
  const etaAt = timeRemainingSeconds
    ? new Date(Date.now() + timeRemainingSeconds * 1000).toISOString()
    : null;

  return {
    checkpointCount: projection.checkpointCount,
    currentCheckpointIndex: projection.currentCheckpointIndex,
    distanceAlongRoute: projection.distanceAlongRoute,
    distanceFromRoute: projection.distanceFromRoute,
    distanceRemaining,
    etaAt,
    heading: trackedLocation.heading ?? null,
    isOffRoute: projection.isOffRoute,
    progressPercent: projection.progressPercent,
    snappedLocation: projection.snappedLocation,
    speedMetersPerSecond,
    timeRemainingSeconds,
    timestamp: new Date().toISOString(),
  };
}

export function getAssignedRouteLabel(assignedRoute: AssignedRoute | null | undefined) {
  if (!assignedRoute) {
    return '';
  }

  const routeLabel = assignedRoute.route?.label?.trim();

  if (routeLabel) {
    return routeLabel;
  }

  return `${assignedRoute.originLabel || 'Punto inicial'} - ${assignedRoute.destinationLabel || 'Punto final'}`;
}

export function buildActiveRouteSnapshot({
  startedAt,
  trackerStatus,
  trackedLocation,
  vehicle,
}: {
  startedAt?: string | null;
  trackerStatus?: TrackerStatus | null;
  trackedLocation?: TrackedLocation | null;
  vehicle: Vehicle | null | undefined;
}): ActiveRouteSnapshot | null {
  if (!vehicle) {
    return null;
  }

  const assignedRoute = normalizeAssignedRoute(vehicle.assignedRoute);

  if (!assignedRoute) {
    return null;
  }

  const route = assignedRoute.route;
  const progress = buildRouteProgressSnapshot({
    plannedDurationSeconds: route.durationInTrafficSeconds || route.durationSeconds || 0,
    persistedProgress: vehicle.activeRouteProgress,
    routeDistanceMeters: route.distanceMeters || 0,
    routePolyline: route.polyline || [],
    startedAt,
    trackedLocation: trackedLocation || vehicle.location || null,
  });
  const status =
    trackerStatus === 'paused'
      ? 'paused'
      : progress?.progressPercent === 100
        ? 'arrived'
        : trackerStatus === 'waiting_start'
          ? 'waiting_start'
          : progress?.isOffRoute || trackerStatus === 'off_route'
            ? 'off_route'
            : trackerStatus === 'in_progress'
              ? 'in_progress'
              : 'idle';

  return {
    assignedRoute,
    destination: assignedRoute.destination,
    destinationLabel: assignedRoute.destinationLabel || 'Punto final',
    driver: {
      id: vehicle.driverId || null,
      name: vehicle.driverName || 'Operador sin asignar',
    },
    id: `${vehicle.id}:${assignedRoute.assignedAt}`,
    name: getAssignedRouteLabel(assignedRoute),
    origin: assignedRoute.origin || route.polyline[0] || null,
    originLabel: assignedRoute.originLabel || 'Punto inicial',
    progress,
    route,
    status,
    vehicle: {
      code: vehicle.code,
      id: vehicle.id,
    },
  };
}
