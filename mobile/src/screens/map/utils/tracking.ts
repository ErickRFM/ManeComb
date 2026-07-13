import type { Incident, LiveLocationsData, Vehicle } from '@/src/types/app';

const ACTIVE_TRACKING_STATUSES = new Set(['online', 'patrolling', 'on-route']);

export function hasVehicleLiveLocation(vehicle: Vehicle | null | undefined) {
  return Boolean(
    vehicle?.locationTimestamp &&
    Number.isFinite(Number(vehicle.location?.latitude)) &&
    Number.isFinite(Number(vehicle.location?.longitude))
  );
}

export function getPrioritizedVehicles(vehicles: Vehicle[] = []) {
  return [...vehicles].sort((left, right) => {
    return right.delayMinutes - left.delayMinutes || left.code.localeCompare(right.code);
  });
}

export function getVehicleById(vehicles: Vehicle[]) {
  return new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
}

export function getSelectedVehicle(
  selectedVehicleId: string | null,
  prioritizedVehicles: Vehicle[],
  vehicleById: Map<string, Vehicle>
) {
  return selectedVehicleId
    ? vehicleById.get(selectedVehicleId) || prioritizedVehicles[0] || null
    : prioritizedVehicles[0] || null;
}

export function getTrackingVehicles(vehicles: Vehicle[]) {
  return vehicles.filter((vehicle) => ACTIVE_TRACKING_STATUSES.has(vehicle.status) && hasVehicleLiveLocation(vehicle));
}

export function getActiveRouteCount(vehicles: Vehicle[]) {
  return vehicles.filter((vehicle) => vehicle.status === 'on-route').length;
}

export function getVisibleIncidents(mapData: LiveLocationsData | null, vehicleById: Map<string, Vehicle>) {
  if (!mapData) {
    return [];
  }

  return mapData.incidents.filter((incident) =>
    (typeof incident.vehicleId === 'string' && vehicleById.has(incident.vehicleId)) ||
    (
      Number.isFinite(Number(incident.location?.latitude)) &&
      Number.isFinite(Number(incident.location?.longitude))
    )
  );
}

export function getActiveIncident(incidents: Incident[], activeAlertIndex: number) {
  return incidents.length ? incidents[activeAlertIndex % incidents.length] : null;
}
