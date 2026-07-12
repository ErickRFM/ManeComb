import { useMemo } from 'react';
import type { LiveLocationsData } from '@/src/types/app';
import {
  getActiveIncident,
  getActiveRouteCount,
  hasVehicleLiveLocation,
  getPrioritizedVehicles,
  getSelectedVehicle,
  getTrackingVehicles,
  getVehicleById,
  getVisibleIncidents,
} from '../utils/tracking';

export function useTrackingData(
  mapData: LiveLocationsData | null,
  selectedVehicleId: string | null,
  activeAlertIndex: number
) {
  const prioritizedVehicles = useMemo(
    () => getPrioritizedVehicles(mapData?.vehicles || []),
    [mapData?.vehicles]
  );
  const vehicleById = useMemo(() => getVehicleById(prioritizedVehicles), [prioritizedVehicles]);
  const liveVehicles = useMemo(
    () => prioritizedVehicles.filter(hasVehicleLiveLocation),
    [prioritizedVehicles]
  );
  const liveVehicleById = useMemo(() => getVehicleById(liveVehicles), [liveVehicles]);
  const selectedVehicle = useMemo(
    () => getSelectedVehicle(selectedVehicleId, liveVehicles.length ? liveVehicles : prioritizedVehicles, vehicleById),
    [liveVehicles, prioritizedVehicles, selectedVehicleId, vehicleById]
  );
  const trackingVehicles = useMemo(
    () => getTrackingVehicles(prioritizedVehicles),
    [prioritizedVehicles]
  );
  const activeRouteCount = useMemo(
    () => getActiveRouteCount(prioritizedVehicles),
    [prioritizedVehicles]
  );
  const visibleIncidents = useMemo(
    () => getVisibleIncidents(mapData, liveVehicleById),
    [mapData, liveVehicleById]
  );
  const activeIncident = useMemo(
    () => getActiveIncident(visibleIncidents, activeAlertIndex),
    [activeAlertIndex, visibleIncidents]
  );
  const activeIncidentVehicle = activeIncident
    ? vehicleById.get(activeIncident.vehicleId || '') || null
    : null;

  return {
    activeIncident,
    activeIncidentVehicle,
    activeRouteCount,
    liveVehicles,
    prioritizedVehicles,
    selectedVehicle,
    trackingVehicles,
    vehicleById,
    visibleIncidents,
  };
}
