import type { GeoPoint } from '@/src/types/app';

export type TrackerStatus = 'off' | 'waiting_start' | 'in_progress';
export type TrackerZone = 'none' | 'start' | 'end';

export const ARRIVAL_THRESHOLD_METERS = 90;

export function distanceInMeters(origin: GeoPoint, destination: GeoPoint) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
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

  if (trackerStatus === 'in_progress') {
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
