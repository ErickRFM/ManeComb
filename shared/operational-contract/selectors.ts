/**
 * Selectores de presentacion.
 *
 * REGLA: estas funciones NO calculan, solo formatean lo que ya viene resuelto
 * en el snapshot. Si alguna vez necesitas derivar estado aqui, el dato falta en
 * el backend y ahi es donde debe corregirse.
 *
 * Prohibido en este archivo: Date.now() para derivar ETA, conversiones de
 * velocidad, umbrales de frescura, ordenes de fallback de conductor.
 */

import type {
  GpsFreshness,
  OperationalState,
  OperationalUnitSnapshot
} from './types';

const TIME_FORMAT: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false };

/**
 * Hora de llegada. Se muestra tal cual la calculo el backend.
 * Nunca `ahora + minutos`: ese era el origen de los ETA divergentes.
 */
export function formatEta(route: OperationalUnitSnapshot['route'], locale = 'es-MX'): string {
  if (!route?.etaAt) return 'Sin ETA';
  const eta = new Date(route.etaAt);
  if (Number.isNaN(eta.getTime())) return 'Sin ETA';
  return eta.toLocaleTimeString(locale, TIME_FORMAT);
}

export function formatFreshness(gps: OperationalUnitSnapshot['gps']): string {
  if (gps.freshness === 'fresh') return 'GPS en vivo';
  if (gps.ageSeconds === null) return 'Sin GPS';

  const minutes = Math.floor(gps.ageSeconds / 60);
  if (minutes < 1) return 'Hace segundos';
  if (minutes < 60) return `Hace ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;
  return `Hace ${Math.floor(hours / 24)} d`;
}

export function formatSpeed(gps: OperationalUnitSnapshot['gps']): string {
  if (gps.speedKmh === null) return '—';
  return `${Math.round(gps.speedKmh)} km/h`;
}

const STATE_LABELS: Record<OperationalState, string> = {
  on_route: 'En ruta',
  stopped: 'Detenida',
  no_route: 'Sin ruta',
  maintenance: 'Mantenimiento'
};

export function stateLabel(state: OperationalState): string {
  return STATE_LABELS[state] ?? 'Sin estado';
}

/** Paleta unica de estado operacional para mapa, listas y tarjetas. */
const STATE_COLORS: Record<OperationalState, string> = {
  on_route: '#16A34A',
  stopped: '#F59E0B',
  no_route: '#64748B',
  maintenance: '#DC2626'
};

export function stateColor(state: OperationalState): string {
  return STATE_COLORS[state] ?? STATE_COLORS.no_route;
}

const FRESHNESS_OPACITY: Record<GpsFreshness, number> = {
  fresh: 1,
  stale: 0.6,
  missing: 0.35
};

/**
 * Atenuacion del marcador segun frescura.
 * Sustituye al filtro que ocultaba unidades: se atenua, no se esconde.
 */
export function freshnessOpacity(freshness: GpsFreshness): number {
  return FRESHNESS_OPACITY[freshness] ?? 1;
}

export function driverLabel(driver: OperationalUnitSnapshot['driver']): string {
  return driver?.name ?? 'Sin conductor asignado';
}

export function routeLabel(route: OperationalUnitSnapshot['route']): string {
  return route?.name ?? 'Sin ruta asignada';
}

/**
 * Orden por criticidad para la pantalla de inicio y las listas de unidades:
 * primero lo que exige atencion (incidencias, GPS perdido), nunca ocultando.
 */
export function criticalityRank(unit: OperationalUnitSnapshot): number {
  let rank = 0;
  if (unit.incidents.open > 0) rank -= 100;
  if (unit.incidents.inProgress > 0) rank -= 50;
  if (unit.gps.freshness === 'missing') rank -= 40;
  if (unit.gps.freshness === 'stale') rank -= 20;
  if (unit.operationalState === 'maintenance') rank -= 10;
  return rank;
}

export function sortByCriticality(units: readonly OperationalUnitSnapshot[]): OperationalUnitSnapshot[] {
  return [...units].sort(
    (left, right) =>
      criticalityRank(left) - criticalityRank(right) ||
      left.label.localeCompare(right.label, 'es', { numeric: true })
  );
}

/** Conteos del encabezado de la pantalla de inicio. */
export function summarizeFleet(units: readonly OperationalUnitSnapshot[]) {
  return {
    total: units.length,
    onRoute: units.filter((unit) => unit.operationalState === 'on_route').length,
    stopped: units.filter((unit) => unit.operationalState === 'stopped').length,
    withoutGps: units.filter((unit) => unit.gps.freshness === 'missing').length,
    maintenance: units.filter((unit) => unit.operationalState === 'maintenance').length
  };
}
