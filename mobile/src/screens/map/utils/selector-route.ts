import type { GeoPoint, NavigationPlaceResult, NavigationPlan, NavigationStop } from '@/src/types/app';
import type { MapSelectorParams, SelectorPointRole, SelectorRole } from '../types';

export function isSelectorMode(point: MapSelectorParams['point']) {
  return point === 'origin' || point === 'destination' || point === 'stop';
}

export function looksLikeCoordinates(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  return /^-?\d{1,3}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?$/.test(value.trim());
}

export function getSelectorFallback(role: SelectorRole, order = 0) {
  if (role === 'origin') return 'Punto inicial';
  if (role === 'destination') return 'Punto final';
  return `Parada ${order + 1}`;
}

export function getSafePlaceLabel(value: string | null | undefined, fallback: string) {
  const label = value?.trim();
  return label && !looksLikeCoordinates(label) ? label : fallback;
}

export function parseOptionalPoint(
  params: Record<string, string | undefined>,
  role: SelectorPointRole
): NavigationPlaceResult | null {
  const latitude = Number(params[`${role}Latitude`]);
  const longitude = Number(params[`${role}Longitude`]);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const fallbackLabel = getSelectorFallback(role);
  const label = getSafePlaceLabel(params[`${role}Label`] || params[`${role}Address`], fallbackLabel);
  const address = getSafePlaceLabel(params[`${role}Address`] || label, label);

  return {
    id: `map-${role}-${latitude}-${longitude}`,
    label,
    address,
    location: { latitude, longitude },
  };
}

export function createCoordinatePoint(role: SelectorRole, location: GeoPoint, order = 0): NavigationPlaceResult {
  const label = getSelectorFallback(role, order);

  return {
    id: `map-${role}-${location.latitude}-${location.longitude}`,
    label,
    address: label,
    location,
  };
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
        address: getSafePlaceLabel(String(stop?.address || ''), getSelectorFallback('stop', index)),
        order: Math.max(0, Number(stop?.order) || index),
      }))
      .filter((stop) => Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude))
      .sort((left, right) => left.order - right.order)
      .map((stop, index) => ({ ...stop, order: index }));
  } catch {
    return [];
  }
}

export function createStopFromPoint(point: NavigationPlaceResult, order: number): NavigationStop {
  const label = getSafePlaceLabel(point.address || point.label, getSelectorFallback('stop', order));

  return {
    id: `stop-${Date.now()}`,
    latitude: point.location.latitude,
    longitude: point.location.longitude,
    address: label,
    order,
  };
}

export function getSelectorCopy(hasOrigin: boolean, hasDestination: boolean, stopCount: number) {
  const step = !hasOrigin ? 1 : !hasDestination ? 2 : 3;
  const title =
    step === 1
      ? 'Selecciona el punto de inicio'
      : step === 2
        ? 'Selecciona el destino'
        : 'Deseas agregar paradas?';
  const hint =
    step === 1
      ? 'Toca el mapa para fijar el origen de la ruta.'
      : step === 2
        ? 'Toca el mapa para fijar el destino y calcular la ruta.'
        : stopCount
          ? 'Cada toque agrega otro waypoint. Puedes deshacer el ultimo o continuar.'
          : 'Las paradas son opcionales. Toca el mapa para agregar una o continua.';

  return { step, title, hint };
}

export function buildConfirmSelectionParams(
  params: Pick<MapSelectorParams, 'vehicleId' | 'returnFilter' | 'historyScrollY' | 'routeNameDraft' | 'editingRouteId'>,
  origin: NavigationPlaceResult,
  destination: NavigationPlaceResult,
  stops: NavigationStop[],
  plan: NavigationPlan | null
) {
  const paramsToSet: Record<string, string> = {};
  const route = plan?.routes[0] || null;

  if (params.vehicleId) {
    paramsToSet.vehicleId = params.vehicleId;
  }
  if (params.returnFilter) paramsToSet.returnFilter = params.returnFilter;
  if (params.historyScrollY) paramsToSet.historyScrollY = params.historyScrollY;
  if (params.routeNameDraft) paramsToSet.routeNameDraft = params.routeNameDraft;
  if (params.editingRouteId) paramsToSet.editingRouteId = params.editingRouteId;
  paramsToSet.originLatitude = String(origin.location.latitude);
  paramsToSet.originLongitude = String(origin.location.longitude);
  paramsToSet.originAddress = origin.address;
  paramsToSet.originLabel = origin.label;
  paramsToSet.destinationLatitude = String(destination.location.latitude);
  paramsToSet.destinationLongitude = String(destination.location.longitude);
  paramsToSet.destinationAddress = destination.address;
  paramsToSet.destinationLabel = destination.label;

  if (plan && route) {
    paramsToSet.routeProvider = plan.provider;
    paramsToSet.routeDistanceMeters = String(route.distanceMeters);
    paramsToSet.routeDurationSeconds = String(route.durationSeconds);
    paramsToSet.routeDurationInTrafficSeconds = String(route.durationInTrafficSeconds);
    paramsToSet.routeTrafficLevel = route.trafficLevel;
    paramsToSet.routePolyline = JSON.stringify(route.polyline);
  }
  paramsToSet.stops = JSON.stringify(stops);

  return paramsToSet;
}

export function hasDuplicateStop(
  location: GeoPoint,
  origin: NavigationPlaceResult | null,
  destination: NavigationPlaceResult | null,
  stops: NavigationStop[]
) {
  const stopKey = `${location.latitude.toFixed(6)},${location.longitude.toFixed(6)}`;
  const originKey = origin
    ? `${origin.location.latitude.toFixed(6)},${origin.location.longitude.toFixed(6)}`
    : '';
  const destinationKey = destination
    ? `${destination.location.latitude.toFixed(6)},${destination.location.longitude.toFixed(6)}`
    : '';

  return (
    stopKey === originKey ||
    stopKey === destinationKey ||
    stops.some((current) => `${current.latitude.toFixed(6)},${current.longitude.toFixed(6)}` === stopKey)
  );
}
