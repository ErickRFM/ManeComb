import type { GeoPoint } from '@/src/types/app';

export type TrackerStatus = 'off' | 'waiting_start' | 'in_progress' | 'off_route' | 'paused';
export type TrackerZone = 'none' | 'start' | 'end';

export const ARRIVAL_THRESHOLD_METERS = 90;
export const ROUTE_DEVIATION_THRESHOLD_METERS = 50;
export const CHECKPOINT_SPACING_METERS = 1500;

export function distanceInMeters(origin: GeoPoint, destination: GeoPoint) {
  const toDistanceRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const latitudeDelta = toDistanceRadians(destination.latitude - origin.latitude);
  const longitudeDelta = toDistanceRadians(destination.longitude - origin.longitude);
  const latitudeA = toDistanceRadians(origin.latitude);
  const latitudeB = toDistanceRadians(destination.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2) +
    Math.cos(latitudeA) *
      Math.cos(latitudeB) *
      Math.sin(longitudeDelta / 2) *
      Math.sin(longitudeDelta / 2);

  return 2 * earthRadius * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function resolveTrackerZone({
  destination,
  origin,
  trackedLocation,
  trackerStatus,
  thresholdMeters = ARRIVAL_THRESHOLD_METERS,
}: {
  destination: GeoPoint;
  origin: GeoPoint;
  trackedLocation: GeoPoint;
  trackerStatus: TrackerStatus;
  thresholdMeters?: number;
}): TrackerZone {
  const nearStart = distanceInMeters(trackedLocation, origin) <= thresholdMeters;
  const nearEnd = distanceInMeters(trackedLocation, destination) <= thresholdMeters;

  if (trackerStatus === 'in_progress' || trackerStatus === 'off_route') {
    if (nearEnd) {
      return 'end';
    }

    if (nearStart) {
      return 'start';
    }

    return 'none';
  }

  if (nearStart) {
    return 'start';
  }

  if (nearEnd) {
    return 'end';
  }

  return 'none';
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function toLocalMeters(point: GeoPoint, origin: GeoPoint) {
  const earthRadius = 6371000;
  const latitude = toRadians(point.latitude - origin.latitude) * earthRadius;
  const longitude =
    toRadians(point.longitude - origin.longitude) *
    earthRadius *
    Math.cos(toRadians((point.latitude + origin.latitude) / 2));

  return { x: longitude, y: latitude };
}

function fromLocalMeters(point: { x: number; y: number }, origin: GeoPoint): GeoPoint {
  const earthRadius = 6371000;
  const latitude = origin.latitude + (point.y / earthRadius) * (180 / Math.PI);
  const longitude =
    origin.longitude +
    (point.x / (earthRadius * Math.cos(toRadians((latitude + origin.latitude) / 2)))) *
      (180 / Math.PI);

  return { latitude, longitude };
}

function getPolylineDistances(polyline: GeoPoint[]) {
  const distances = [0];

  for (let index = 1; index < polyline.length; index += 1) {
    distances[index] = distances[index - 1] + distanceInMeters(polyline[index - 1], polyline[index]);
  }

  return distances;
}

export function getVirtualCheckpointCount(distanceMeters: number) {
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) {
    return 0;
  }

  return Math.max(1, Math.round(distanceMeters / CHECKPOINT_SPACING_METERS));
}

export function projectPointOnRoute({
  point,
  polyline,
}: {
  point: GeoPoint;
  polyline: GeoPoint[];
}) {
  if (polyline.length < 2) {
    return null;
  }

  const cumulativeDistances = getPolylineDistances(polyline);
  let best:
    | {
        distanceAlongRoute: number;
        distanceFromRoute: number;
        segmentIndex: number;
        snappedLocation: GeoPoint;
      }
    | null = null;

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
      y: projectedEnd.y * ratio,
    };
    const deltaX = projectedPoint.x - snappedMeters.x;
    const deltaY = projectedPoint.y - snappedMeters.y;
    const distanceFromRoute = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const snappedLocation = fromLocalMeters(snappedMeters, start);
    const segmentLength = cumulativeDistances[index + 1] - cumulativeDistances[index];
    const distanceAlongRoute = cumulativeDistances[index] + segmentLength * ratio;

    if (!best || distanceFromRoute < best.distanceFromRoute) {
      best = {
        distanceAlongRoute,
        distanceFromRoute,
        segmentIndex: index,
        snappedLocation,
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
  const checkpointCount = getVirtualCheckpointCount(totalDistance);

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
    totalDistance,
  };
}

export function evaluateTrackerTransition({
  destination,
  nowIso = new Date().toISOString(),
  origin,
  trackedLocation,
  trackerStartedAt,
  trackerStatus,
  trackerZone,
  thresholdMeters,
}: {
  destination: GeoPoint;
  nowIso?: string;
  origin: GeoPoint;
  trackedLocation: GeoPoint;
  trackerStartedAt: string | null;
  trackerStatus: TrackerStatus;
  trackerZone: TrackerZone;
  thresholdMeters?: number;
}) {
  const currentZone = resolveTrackerZone({
    destination,
    origin,
    trackedLocation,
    trackerStatus,
    thresholdMeters,
  });
  const isEnteringZone = currentZone !== 'none' && currentZone !== trackerZone;

  if (trackerStatus === 'waiting_start' && currentZone === 'start' && isEnteringZone) {
    return {
      currentZone,
      event: {
        type: 'start' as const,
        startedAt: nowIso,
      },
    };
  }

  if (
    trackerStatus === 'in_progress' &&
    currentZone === 'end' &&
    isEnteringZone &&
    trackerStartedAt
  ) {
    return {
      currentZone,
      event: {
        type: 'finish' as const,
        finishedAt: nowIso,
        durationSeconds: Math.max(
          1,
          Math.round((new Date(nowIso).getTime() - new Date(trackerStartedAt).getTime()) / 1000)
        ),
      },
    };
  }

  return {
    currentZone,
    event: null,
  };
}
