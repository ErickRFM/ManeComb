import type { GeoPoint } from '@/src/types/app';
import { LOCATION_SYNC_INTERVAL_MS } from '../constants/tracking';

export type TrackingSyncCandidate = {
  connectionMode: string;
  coordinates: (GeoPoint & { heading?: number | null; speed?: number | null; accuracy?: number | null }) | null;
  isWithinSchedule: boolean;
  lastSyncAt: number;
  now: number;
  vehicleId?: string | null;
};

export function shouldSyncVehicleLocation({
  connectionMode,
  coordinates,
  isWithinSchedule,
  lastSyncAt,
  now,
  vehicleId,
}: TrackingSyncCandidate) {
  return Boolean(
    coordinates &&
    vehicleId &&
    connectionMode === 'online' &&
    isWithinSchedule &&
    now - lastSyncAt >= LOCATION_SYNC_INTERVAL_MS
  );
}

export function buildVehicleLocationPayload({
  coordinates,
  lastUpdatedAt,
  vehicleId,
}: {
  coordinates: GeoPoint & { heading?: number | null; speed?: number | null; accuracy?: number | null };
  lastUpdatedAt?: string | null;
  vehicleId: string;
}) {
  return {
    vehicleId,
    coordinates,
    heading: coordinates.heading,
    speed: coordinates.speed,
    accuracy: coordinates.accuracy,
    timestamp: lastUpdatedAt || new Date().toISOString(),
  };
}
