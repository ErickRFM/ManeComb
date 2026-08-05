import { useEffect, useRef } from 'react';
import type { GeoPoint } from '@/src/types/app';
import { mobileLog } from '@/src/config/api_config';
import { buildVehicleLocationPayload, shouldSyncVehicleLocation } from '../services/tracking-service';

type SendVehicleLocation = (payload: {
  vehicleId: string;
  coordinates: GeoPoint;
  heading?: number | null;
  speed?: number | null;
  accuracy?: number | null;
  timestamp: string;
  sessionId?: string | null;
}) => Promise<{ ok: boolean; message?: string }>;

type UseLocationSyncParams = {
  enabled?: boolean;
  connectionMode: string;
  coordinates: (GeoPoint & { heading?: number | null; speed?: number | null; accuracy?: number | null }) | null;
  isWithinSchedule: boolean;
  lastUpdatedAt?: string | null;
  sendVehicleLocation: SendVehicleLocation;
  sessionId?: string | null;
  vehicleId?: string | null;
};

export function useLocationSync({
  enabled = true,
  connectionMode,
  coordinates,
  isWithinSchedule,
  lastUpdatedAt,
  sendVehicleLocation,
  sessionId,
  vehicleId,
}: UseLocationSyncParams) {
  const lastLocationSyncRef = useRef(0);

  useEffect(() => {
    const now = Date.now();
    if (
      !enabled ||
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
    const timestamp = lastUpdatedAt || new Date().toISOString();
    sendVehicleLocation({
      ...buildVehicleLocationPayload({
        coordinates: coordinates!,
        lastUpdatedAt: timestamp,
        vehicleId: vehicleId!,
      }),
      sessionId: sessionId || null,
    }).then((result) => {
      mobileLog('gps-sync', 'vehicle location result', {
        accepted: result.ok,
        decision: result.message || null,
        vehicleId,
        sessionIdPresent: Boolean(sessionId),
        timestamp,
      });
    }).catch((error) => {
      mobileLog('gps-sync', 'vehicle location rejected', {
        vehicleId,
        sessionIdPresent: Boolean(sessionId),
        timestamp,
        message: error instanceof Error ? error.message : 'unknown_error',
      });
    });
  }, [connectionMode, coordinates, enabled, isWithinSchedule, lastUpdatedAt, sendVehicleLocation, sessionId, vehicleId]);
}
