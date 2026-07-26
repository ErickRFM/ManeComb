import type { OperationalUnitSnapshot } from '@shared/operational-contract';
import { driverLabel, routeLabel } from '@shared/operational-contract';
import type { useAppTheme } from '@/src/hooks/use-app-theme';
import type {
  FleetControlLog,
  GeoPoint,
  NavigationPlan,
  NavigationPlaceResult,
  NavigationRouteOption,
  NavigationStop,
  RouteShape,
  Vehicle,
} from '@/src/types/app';
import { normalizeAssignedRoute } from '@/src/utils/navigation-data';

export type OperationalStatus = 'available' | 'active' | 'completed' | 'cancelled' | 'delayed';
export type OperationalRecord = {
  id: string;
  vehicleId: string;
  vehicleCode: string;
  driverName: string;
  routeName: string;
  departureAt: string | null;
  arrivalAt: string | null;
  etaAt: string | null;
  delayMinutes: number;
  status: OperationalStatus;
  lastRouteStatus: Extract<OperationalStatus, 'completed' | 'cancelled'> | null;
  vehicle: Vehicle;
};
export const MANECOMB_ROUTE_COLOR = '#E31E24';

export function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);

  if (hours) {
    return `${hours} h ${minutes} min`;
  }

  return `${Math.max(1, minutes)} min`;
}

export function formatDistance(meters: number) {
  if (!Number.isFinite(meters) || meters <= 0) {
    return 'Sin datos';
  }

  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }

  return `${(meters / 1000).toFixed(1)} km`;
}

function getLogTimestamp(log: FleetControlLog) {
  return new Date(log.arrivalAt || log.departureAt).getTime();
}

export function getLatestLog(logs: FleetControlLog[], vehicleId: string) {
  return logs
    .filter((log) => log.vehicleId === vehicleId)
    .sort(
      (left, right) =>
        getLogTimestamp(right) - getLogTimestamp(left)
    )[0] || null;
}

export function getActiveLog(logs: FleetControlLog[], vehicleId: string) {
  // Historical inconsistencies can leave more than one non-terminal log. The
  // vigente record is always the one with the newest operational timestamp.
  return logs
    .filter(
      (log) =>
        log.vehicleId === vehicleId &&
        log.status !== 'completed' &&
        log.status !== 'cancelled'
    )
    .sort((left, right) => getLogTimestamp(right) - getLogTimestamp(left))[0] || null;
}

function getVehicleOperationalStatus(vehicle: Vehicle, sessionLog: FleetControlLog | null): OperationalStatus {
  if (sessionLog?.status === 'completed') {
    return 'completed';
  }

  if (sessionLog?.status === 'cancelled') {
    return 'cancelled';
  }

  if (sessionLog?.status === 'delayed') {
    return 'delayed';
  }

  if (sessionLog?.status === 'active') {
    return vehicle.delayMinutes > 0 ? 'delayed' : 'active';
  }

  return 'available';
}

/**
 * Registro operativo de una unidad.
 *
 * Identidad, conductor, ruta y ETA provienen exclusivamente del snapshot
 * canonico del backend. Antes esta pantalla construia `vehicleCode` en tres
 * lugares distintos y el camino de historial no tenia respaldo cuando el
 * vehiculo carecia de `code`: por eso C-1 y C-3 aparecian sin nombre mientras
 * C-2 si se leia. `unit.label` esta garantizado no vacio por contrato.
 */
export function buildOperationalRecord(
  unit: OperationalUnitSnapshot,
  vehicle: Vehicle,
  sessionLogs: FleetControlLog[]
): OperationalRecord {
  const latestLog = getLatestLog(sessionLogs, unit.unitId);
  const activeLog = getActiveLog(sessionLogs, unit.unitId);
  // El historial terminal describe el resultado de la ultima ruta, no la
  // disponibilidad actual. Solo un registro vigente define la operacion en curso.
  const status =
    unit.operationalState === 'on_route'
      ? vehicle.delayMinutes > 0 ? 'delayed' : 'active'
      : getVehicleOperationalStatus(vehicle, activeLog);

  return {
    id: latestLog?.id || `vehicle-record-${unit.unitId}`,
    vehicleId: unit.unitId,
    vehicleCode: unit.label,
    driverName: driverLabel(unit.driver),
    routeName: routeLabel(unit.route),
    departureAt: activeLog?.departureAt || latestLog?.departureAt || null,
    arrivalAt: latestLog?.arrivalAt || null,
    // Unica fuente de ETA. Nunca `salida + minutos`.
    etaAt: unit.route?.etaAt || null,
    delayMinutes: vehicle.delayMinutes || 0,
    status,
    lastRouteStatus:
      latestLog?.status === 'completed' || latestLog?.status === 'cancelled'
        ? latestLog.status
        : null,
    vehicle,
  };
}

export function getStatusLabel(status: OperationalStatus) {
  if (status === 'active') return 'En ruta';
  if (status === 'completed') return 'Finalizado';
  if (status === 'cancelled') return 'Cancelado';
  if (status === 'delayed') return 'Retraso';
  return 'Disponible';
}

export function getStatusTone(status: OperationalStatus): 'danger' | 'info' | 'positive' | 'warning' | 'neutral' {
  if (status === 'active') return 'info';
  if (status === 'completed') return 'positive';
  if (status === 'cancelled') return 'danger';
  if (status === 'delayed') return 'warning';
  return 'neutral';
}

export function getStatusColor(theme: ReturnType<typeof useAppTheme>['theme'], status: OperationalStatus) {
  if (status === 'active') return theme.colors.info;
  if (status === 'completed') return theme.colors.success;
  if (status === 'cancelled') return theme.colors.danger;
  if (status === 'delayed') return theme.colors.warning;
  return theme.colors.muted;
}

export function parseRoutePolylineParam(value?: string): GeoPoint[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((point) => ({
        latitude: Number(point?.latitude),
        longitude: Number(point?.longitude),
      }))
      .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
  } catch {
    return [];
  }
}

export function parseStopsParam(value?: string): NavigationStop[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((stop, index) => ({
        id: String(stop?.id || `stop-${index + 1}`),
        latitude: Number(stop?.latitude),
        longitude: Number(stop?.longitude),
        address: String(stop?.address || ''),
        order: Math.max(0, Number(stop?.order) || index),
      }))
      .filter((stop) => Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude))
      .sort((left, right) => left.order - right.order)
      .map((stop, index) => ({ ...stop, order: index }));
  } catch {
    return [];
  }
}

function getPointSignature(point: GeoPoint | null | undefined) {
  if (!point) {
    return '';
  }

  return `${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`;
}

function looksLikeCoordinates(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  return /^-?\d{1,3}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?$/.test(value.trim());
}

export function getPlaceLabel(place: NavigationPlaceResult | null | undefined, fallback: string) {
  const label = place?.label?.trim();
  const address = place?.address?.trim();

  if (label && !looksLikeCoordinates(label)) {
    return label;
  }

  if (address && !looksLikeCoordinates(address)) {
    return address;
  }

  return fallback;
}

export function getSafeLabel(value: string | null | undefined, fallback: string) {
  const label = value?.trim();
  return label && !looksLikeCoordinates(label) ? label : fallback;
}

export function getStopLabel(stop: NavigationStop, index: number) {
  const address = stop.address?.trim();

  if (address && !looksLikeCoordinates(address)) {
    return address;
  }

  return `Parada ${index + 1}`;
}

export function getStopsSignature(stops: NavigationStop[] | null | undefined) {
  return (stops || [])
    .map((stop, index) => `${index}:${getPointSignature(stop)}`)
    .join(',');
}

export function getRouteSignature(args: {
  destination: GeoPoint | null | undefined;
  distanceMeters?: number;
  origin: GeoPoint | null | undefined;
  polyline?: GeoPoint[];
  stops?: NavigationStop[];
}) {
  const polyline = args.polyline || [];
  const first = polyline[0] || args.origin || null;
  const last = polyline[polyline.length - 1] || args.destination || null;

  return [
    getPointSignature(args.origin),
    getPointSignature(args.destination),
    Math.round(Number(args.distanceMeters || 0)),
    getPointSignature(first),
    getPointSignature(last),
    getStopsSignature(args.stops),
    polyline.length,
  ].join('|');
}

export function buildAssignedRouteSelection(vehicle: Vehicle): {
  destination: NavigationPlaceResult;
  origin: NavigationPlaceResult;
  plan: NavigationPlan;
} | null {
  const assignedRoute = normalizeAssignedRoute(vehicle.assignedRoute);
  const route = assignedRoute?.route || null;
  const routeOrigin = assignedRoute?.origin || route?.polyline[0] || null;

  if (!assignedRoute || !route || !routeOrigin || !assignedRoute.destination) {
    return null;
  }

  const originLabel = assignedRoute.originLabel || 'Punto inicial';
  const destinationLabel = assignedRoute.destinationLabel || 'Punto final';

  return {
    origin: {
      id: `assigned-origin-${vehicle.id}`,
      label: originLabel,
      address: originLabel,
      location: routeOrigin,
    },
    destination: {
      id: `assigned-destination-${vehicle.id}`,
      label: destinationLabel,
      address: destinationLabel,
      location: assignedRoute.destination,
    },
    plan: {
      provider: assignedRoute.provider,
      origin: routeOrigin,
      destination: assignedRoute.destination,
      stops: assignedRoute.stops || [],
      routes: [route, ...(assignedRoute.alternatives || [])],
      updatedAt: assignedRoute.assignedAt,
    },
  };
}

export function buildSavedRouteSelection(route: RouteShape): {
  destination: NavigationPlaceResult;
  origin: NavigationPlaceResult;
  plan: NavigationPlan;
} | null {
  const origin = route.origin || route.polyline[0] || null;
  const destination = route.destination || route.polyline[route.polyline.length - 1] || null;

  if (!origin || !destination || route.polyline.length < 2) return null;

  return {
    origin: {
      id: `route-origin-${route.id}`,
      label: getSafeLabel(route.originLabel, route.name),
      address: getSafeLabel(route.originLabel, route.name),
      location: origin,
    },
    destination: {
      id: `route-destination-${route.id}`,
      label: getSafeLabel(route.destinationLabel, route.name),
      address: getSafeLabel(route.destinationLabel, route.name),
      location: destination,
    },
    plan: {
      provider: 'system',
      origin,
      destination,
      stops: route.stops || [],
      routes: [{
        label: route.name,
        distanceMeters: route.distanceMeters || 0,
        durationSeconds: route.durationSeconds || 0,
        durationInTrafficSeconds: route.durationInTrafficSeconds || route.durationSeconds || 0,
        trafficLevel: 'low',
        polyline: route.polyline,
      }],
      updatedAt: new Date().toISOString(),
    },
  };
}

export function buildRouteStops(
  origin: NavigationPlaceResult | null,
  destination: NavigationPlaceResult | null,
  route: NavigationRouteOption | null,
  routeStopEntries: NavigationStop[] = []
) {
  const routeStops: {
    id: string;
    label: string;
    address: string;
    location: GeoPoint;
    type: 'origin' | 'stop' | 'destination';
  }[] = [];

  if (origin) {
    const label = getPlaceLabel(origin, 'Punto inicial');
    routeStops.push({
      id: 'origin',
      label,
      address: label,
      location: origin.location,
      type: 'origin',
    });
  }

  routeStopEntries.forEach((stop, index) => {
    const location = { latitude: stop.latitude, longitude: stop.longitude };
    const label = getStopLabel(stop, index);

    if (Number.isFinite(location.latitude) && Number.isFinite(location.longitude)) {
      routeStops.push({
        id: stop.id,
        label,
        address: label,
        location,
        type: 'stop',
      });
    }
  });

  if (destination) {
    const label = getPlaceLabel(destination, 'Punto final');
    routeStops.push({
      id: 'destination',
      label,
      address: label,
      location: destination.location,
      type: 'destination',
    });
  }

  return routeStops;
}
