import type {
  AssignedRoute,
  GeoPoint,
  LiveLocationsData,
  NavigationRouteOption,
  NavigationStop,
  Vehicle,
} from '@/src/types/app';

const ROUTE_PROVIDERS = new Set(['mapbox', 'system', 'osrm', 'valhalla']);
const TRAFFIC_LEVELS = new Set(['low', 'medium', 'high']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function finiteNumber(value: unknown, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function stringValue(value: unknown, fallback = '') {
  const text = String(value || '').trim();
  return text || fallback;
}

function normalizePoint(value: unknown): GeoPoint | null {
  if (!isRecord(value)) {
    return null;
  }

  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return { latitude, longitude };
}

function normalizeProvider(value: unknown): AssignedRoute['provider'] {
  const provider = stringValue(value, 'system');
  return ROUTE_PROVIDERS.has(provider) ? provider as AssignedRoute['provider'] : 'system';
}

function normalizeTrafficLevel(value: unknown): NavigationRouteOption['trafficLevel'] {
  const trafficLevel = stringValue(value, 'low');
  return TRAFFIC_LEVELS.has(trafficLevel) ? trafficLevel as NavigationRouteOption['trafficLevel'] : 'low';
}

function normalizeStop(value: unknown, index: number): NavigationStop | null {
  if (!isRecord(value)) {
    return null;
  }

  const location = normalizePoint(value);

  if (!location) {
    return null;
  }

  return {
    ...location,
    address: stringValue(value.address),
    id: stringValue(value.id, `stop-${index + 1}`),
    order: Math.max(0, finiteNumber(value.order, index)),
  };
}

export function normalizeNavigationRouteOption(value: unknown): NavigationRouteOption | null {
  if (!isRecord(value)) {
    return null;
  }

  const polyline = Array.isArray(value.polyline)
    ? value.polyline.map(normalizePoint).filter((point): point is GeoPoint => Boolean(point))
    : [];

  if (polyline.length < 2) {
    return null;
  }

  return {
    distanceMeters: Math.max(0, finiteNumber(value.distanceMeters)),
    durationInTrafficSeconds: Math.max(0, finiteNumber(value.durationInTrafficSeconds)),
    durationSeconds: Math.max(0, finiteNumber(value.durationSeconds)),
    label: stringValue(value.label, 'Ruta recomendada'),
    polyline,
    trafficLevel: normalizeTrafficLevel(value.trafficLevel),
  };
}

export function normalizeAssignedRoute(value: unknown): AssignedRoute | null {
  if (!isRecord(value)) {
    return null;
  }

  const route = normalizeNavigationRouteOption(value.route);

  if (!route) {
    return null;
  }

  const destination = normalizePoint(value.destination) || route.polyline[route.polyline.length - 1] || null;

  if (!destination) {
    return null;
  }

  const origin = normalizePoint(value.origin) || route.polyline[0] || null;
  const alternatives = Array.isArray(value.alternatives)
    ? value.alternatives
        .map(normalizeNavigationRouteOption)
        .filter((entry): entry is NavigationRouteOption => Boolean(entry))
    : [];
  const stops = Array.isArray(value.stops)
    ? value.stops
        .map(normalizeStop)
        .filter((entry): entry is NavigationStop => Boolean(entry))
        .sort((left, right) => left.order - right.order)
        .map((stop, index) => ({ ...stop, order: index }))
    : [];

  return {
    alternatives,
    assignedAt: stringValue(value.assignedAt, new Date().toISOString()),
    assignedBy: stringValue(value.assignedBy, 'system'),
    destination,
    destinationLabel: stringValue(value.destinationLabel, 'Punto final'),
    origin,
    originLabel: stringValue(value.originLabel, 'Punto inicial'),
    provider: normalizeProvider(value.provider),
    route,
    routeCode: stringValue(value.routeCode),
    routeColor: stringValue(value.routeColor) || null,
    routeId: stringValue(value.routeId) || null,
    routeName: stringValue(value.routeName),
    stops,
  };
}

export function normalizeVehicle(value: Vehicle): Vehicle {
  return {
    ...value,
    assignedRoute: normalizeAssignedRoute((value as { assignedRoute?: unknown }).assignedRoute),
  };
}

export function normalizeLiveLocationsData(value: LiveLocationsData | null | undefined): LiveLocationsData | null {
  if (!value) {
    return null;
  }

  return {
    ...value,
    vehicles: Array.isArray(value.vehicles) ? value.vehicles.map(normalizeVehicle) : [],
  };
}
