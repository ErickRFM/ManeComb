import { useEffect, useRef } from 'react';
import type { GeoPoint } from '@/src/types/app';

const LOCATION_SYNC_INTERVAL_MS = 5000;

type SendVehicleLocation = (payload: {
  vehicleId: string;
  coordinates: GeoPoint;
  heading?: number | null;
  speed?: number | null;
  timestamp: string;
}) => Promise<unknown>;

type UseLocationSyncParams = {
  connectionMode: string;
  coordinates: (GeoPoint & { heading?: number | null; speed?: number | null }) | null;
  isWithinSchedule: boolean;
  lastUpdatedAt?: string | null;
  sendVehicleLocation: SendVehicleLocation;
  vehicleId?: string | null;
};

export function useLocationSync({
  connectionMode,
  coordinates,
  isWithinSchedule,
  lastUpdatedAt,
  sendVehicleLocation,
  vehicleId,
}: UseLocationSyncParams) {
  const lastLocationSyncRef = useRef(0);

  useEffect(() => {
    if (!coordinates || !vehicleId || connectionMode !== 'online' || !isWithinSchedule) {
      return;
    }

    const now = Date.now();
    if (now - lastLocationSyncRef.current < LOCATION_SYNC_INTERVAL_MS) {
      return;
    }

    lastLocationSyncRef.current = now;
    sendVehicleLocation({
      vehicleId,
      coordinates,
      heading: coordinates.heading,
      speed: coordinates.speed,
      timestamp: lastUpdatedAt || new Date().toISOString(),
    }).catch(() => undefined);
  }, [connectionMode, coordinates, isWithinSchedule, lastUpdatedAt, sendVehicleLocation, vehicleId]);
}
