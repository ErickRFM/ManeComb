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
  GpsConnectionState,
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

/**
 * Formato unico de antiguedad GPS. Exportado para que ninguna superficie
 * escriba su propia version de "hace X".
 */
export function formatGpsAge(ageSeconds: number | null): string | null {
  if (ageSeconds === null) return null;
  if (ageSeconds < 60) return `hace ${Math.max(0, Math.round(ageSeconds))} s`;

  const minutes = Math.floor(ageSeconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} d`;
}

export function formatFreshness(gps: OperationalUnitSnapshot['gps']): string {
  // Jamas llego un paquete de esta unidad. No hay nada vencido: hay algo que
  // todavia no ha ocurrido. Decir "GPS vencido" aqui era el error que hacia
  // parecer averiada a una unidad recien dada de alta.
  if (gps.connectionState === 'never_reported') return 'Esperando primera ubicación';

  if (gps.connectionState === 'live') return 'GPS en vivo';

  const age = formatGpsAge(gps.ageSeconds);

  // El backend ya resolvio la severidad. La UI solo la hace visible para que un
  // dato viejo no parezca una unidad sana ni una ultima posicion desaparezca.
  if (gps.connectionState === 'delayed') {
    return age ? `GPS retrasado · ${age}` : 'GPS retrasado';
  }
  if (gps.connectionState === 'stale') {
    return age ? `GPS sin señal · ${age}` : 'GPS sin señal';
  }
  if (gps.connectionState === 'lost') {
    return age ? `GPS perdido · última ubicación ${age}` : 'GPS perdido';
  }

  return age ? `Última ubicación · ${age}` : 'Sin GPS';
}

export function formatSpeed(gps: OperationalUnitSnapshot['gps']): string {
  if (gps.speedKmh === null) return '—';
  return `${Math.round(gps.speedKmh)} km/h`;
}

const STATE_LABELS: Record<OperationalState, string> = {
  on_route: 'En ruta',
  stopped: 'Detenida',
  no_route: 'Sin ruta',
  maintenance: 'Mantenimiento',
  // No afirmamos movimiento sin dato de GPS.
  unknown: 'Sin datos'
};

export function stateLabel(state: OperationalState): string {
  return STATE_LABELS[state] ?? 'Sin estado';
}

/** Paleta unica de estado operacional para mapa, listas y tarjetas. */
const STATE_COLORS: Record<OperationalState, string> = {
  on_route: '#16A34A',
  stopped: '#F59E0B',
  no_route: '#64748B',
  maintenance: '#DC2626',
  // Gris claro, distinguible de `no_route`: son cosas distintas. `no_route`
  // es un hecho conocido; `unknown` es ausencia de informacion.
  unknown: '#94A3B8'
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
 * Atenuacion heredada por frescura de posicion. Se conserva para superficies
 * que aun no necesitan distinguir el lease de conectividad.
 */
export function freshnessOpacity(freshness: GpsFreshness): number {
  return FRESHNESS_OPACITY[freshness] ?? 1;
}

const CONNECTION_OPACITY: Record<GpsConnectionState, number> = {
  live: 1,
  delayed: 0.58,
  stale: 0.4,
  lost: 0.25,
  // Sin coordenada no hay marcador que atenuar; se iguala a `lost` para que
  // ninguna superficie tenga que ramificar por su cuenta.
  never_reported: 0.25
};

/**
 * Atenuacion por estado de conexion ya resuelto por backend. `delayed` se ve
 * distinto desde el primer heartbeat vencido aunque la ultima coordenada siga
 * siendo util; asi una unidad sin reporte no conserva apariencia de activa.
 */
export function connectionOpacity(connectionState: GpsConnectionState): number {
  return CONNECTION_OPACITY[connectionState] ?? CONNECTION_OPACITY.lost;
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
  // Una unidad de la que no sabemos nada exige atencion antes que una que
  // esta sana y parada por un motivo conocido.
  if (unit.operationalState === 'unknown') rank -= 15;
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

/**
 * Conteos del encabezado de la pantalla de inicio.
 *
 * `unknown` se cuenta aparte a proposito: agruparlo con `stopped` o con
 * `onRoute` seria volver a afirmar algo que no sabemos.
 */
export function summarizeFleet(units: readonly OperationalUnitSnapshot[]) {
  return {
    total: units.length,
    onRoute: units.filter((unit) => unit.operationalState === 'on_route').length,
    stopped: units.filter((unit) => unit.operationalState === 'stopped').length,
    unknown: units.filter((unit) => unit.operationalState === 'unknown').length,
    noRoute: units.filter((unit) => unit.operationalState === 'no_route').length,
    withoutGps: units.filter((unit) => unit.gps.freshness === 'missing').length,
    maintenance: units.filter((unit) => unit.operationalState === 'maintenance').length
  };
}