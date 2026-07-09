import { useEffect, useRef } from 'react';
import type { GeoPoint } from '@/src/types/app';
import { buildVehicleLocationPayload, shouldSyncVehicleLocation } from '../services/tracking-service';

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
    const now = Date.now();
    if (
      !shouldSyncVehicleLocation({
        connectionMode,
        coordinates,
        isWithinSchedule,
        lastSyncAt: lastLocationSyncRef.current,
        now,
        vehicleId,
      })
    ) {
      return;
    }

    lastLocationSyncRef.current = now;
    sendVehicleLocation(
      buildVehicleLocationPayload({
        coordinates: coordinates!,
        lastUpdatedAt,
        vehicleId: vehicleId!,
      })
    ).catch(() => undefined);
  }, [connectionMode, coordinates, isWithinSchedule, lastUpdatedAt, sendVehicleLocation, vehicleId]);
}
