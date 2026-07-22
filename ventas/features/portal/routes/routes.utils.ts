import type { GeoPoint, Vehicle } from '@/src/types/app';

export function parseCoordinate(value: string, min: number, max: number) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  const coordinate = Number(trimmed);
  return Number.isFinite(coordinate) && coordinate >= min && coordinate <= max ? coordinate : null;
}

export function getRouteGeometry(vehicle?: Vehicle | null): GeoPoint[] {
  if (!vehicle?.assignedRoute) return [];
  const polyline = vehicle.assignedRoute.route?.polyline || [];
  if (polyline.length >= 2) return polyline;
  return [vehicle.assignedRoute.origin, vehicle.assignedRoute.destination].filter(Boolean) as GeoPoint[];
}

export function getDriverName(vehicle: Vehicle) {
  return vehicle.driver?.name || vehicle.driverName || 'Sin conductor';
}

export function getRouteLabel(vehicle: Vehicle) {
  const assignment = vehicle.assignedRoute;

  if (!assignment) {
    return 'Sin ruta asignada';
  }

  const origin = assignment.originLabel || 'Origen';
  const destination = assignment.destinationLabel || 'Destino';
  return `${origin} -> ${destination}`;
}
