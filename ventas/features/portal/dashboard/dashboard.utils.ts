import type { StatusBadgeTone } from '@/src/components/ui/status-badge';
import { formatDate, formatDistanceFromMeters, formatDurationFromSeconds } from '@/src/utils/format';
import { formatPortalStatus, getPortalStatusTone } from '../cards';
import {
  RECORDING_JOURNEY_LABEL,
  formatGpsAge,
  isRecordingRouteId,
  isTechnicalRouteId,
  stateLabel,
  type OperationalState,
  type OperationalUnitSnapshot,
} from '@shared/operational-contract';
import type { RouteEvent, RouteSession, RouteSessionPosition, User, Vehicle } from '@/src/types/app';
import type { RouteInfo, JourneyState, SessionMetricsView } from './dashboard.types';
import { maxRenderedReplayPoints, opaqueIdPattern } from './dashboard.constants';

export const formatDuration = formatDurationFromSeconds;
export const formatDistance = formatDistanceFromMeters;

export function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function numberOrZero(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function formatSpeedMetersPerSecond(speed?: number | null) {
  const value = Number(speed);
  if (!Number.isFinite(value) || value < 0) return 'Sin dato';
  const kmh = value * 3.6;
  return `${Math.round(kmh)} km/h`;
}

export function formatPercent(value?: number | null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${numeric.toFixed(0)}%` : 'Sin dato';
}

function operationalStateTone(state: OperationalState): StatusBadgeTone {
  switch (state) {
    case 'on_route': return 'positive';
    case 'stopped': return 'warning';
    case 'maintenance': return 'warning';
    case 'no_route': return 'neutral';
    case 'unknown': return 'neutral';
  }
}

// Estado operativo canonico: se lee directamente del snapshot y se traduce con
// stateLabel. Vehicle conserva solo identidad/configuracion.
export function getVehicleStatus(_vehicle: Vehicle, unit?: OperationalUnitSnapshot): { label: string; tone: StatusBadgeTone } {
  const state = unit?.operationalState;
  if (!state) return { label: 'Sin estado', tone: 'neutral' };
  return { label: stateLabel(state), tone: operationalStateTone(state) };
}

export function getEventLabel(eventType: RouteEvent['eventType']) {
  const labels: Record<RouteEvent['eventType'], string> = {
    CHECKPOINT_REACHED: 'Checkpoint',
    GPS_LOST: 'GPS perdido',
    GPS_RECOVERED: 'GPS recuperado',
    OFF_ROUTE: 'Fuera de ruta',
    ON_ROUTE: 'En ruta',
    SESSION_FINISHED: 'Fin',
    SESSION_PAUSED: 'Pausa',
    SESSION_RESUMED: 'Reanudacion',
    SESSION_STARTED: 'Inicio',
    VEHICLE_MOVING: 'Movimiento',
    VEHICLE_STOPPED: 'Detencion',
  };
  return labels[eventType] || eventType.replace(/_/g, ' ');
}

export function getDriverName(users: User[], driverId?: string | null, fallback?: string | null) {
  return users.find((user) => user.id === driverId)?.name || fallback || 'Sin chofer';
}

export function getDriverLicense(driver?: User | null) {
  const extended = driver as (User & { driverLicense?: string | null; license?: string | null; licenseNumber?: string | null }) | null | undefined;
  return extended?.licenseNumber || extended?.driverLicense || extended?.license || '';
}

export function getDriverInitials(driver?: User | null) {
  return String(driver?.name || 'SC')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((chunk) => chunk[0]?.toUpperCase() || '')
    .join('') || 'SC';
}

export function getAssignedDrivers(users: User[], vehicle: Vehicle, activeSession?: RouteSession | null) {
  const ids = new Set<string>();
  if (vehicle.driverId) ids.add(vehicle.driverId);
  if (vehicle.driver?.id) ids.add(vehicle.driver.id);
  if (activeSession?.driverId) ids.add(activeSession.driverId);
  users.forEach((user) => {
    if (user.role === 'driver' && user.vehicleId === vehicle.id) ids.add(user.id);
  });
  return Array.from(ids)
    .map((id) => users.find((user) => user.id === id) || (vehicle.driver?.id === id ? vehicle.driver : null))
    .filter(Boolean) as User[];
}

// El conductor operativo sale directamente de unit.driver. Sin snapshot -> vacio.
// NO se cae al legacy (activeSession.driverId / vehicle.driver) para no
// reintroducir el drift de fuentes multiples.
export function getActiveDriver(users: User[], _vehicle: Vehicle, unit?: OperationalUnitSnapshot) {
  const driverId = unit?.driver?.id || null;
  return users.find((user) => user.id === driverId) || null;
}

export function isOpaqueId(value?: string | null) {
  return opaqueIdPattern.test(String(value || '').trim());
}

export function getRouteInfo(vehicle?: Vehicle | null, session?: RouteSession | null): RouteInfo {
  const assignedRoute = vehicle?.assignedRoute || null;
  const route = assignedRoute?.route || null;
  const rawCode = vehicle?.routeCode || vehicle?.routeId || session?.routeId || '';
  // `recording:{vehicleId}` y `assigned:{...}` son identidades tecnicas del
  // backend, no rutas. Sin esta guarda el Portal mostraba literalmente
  // "Ruta recording:vehicle-101" y "Codigo recording:vehicle-101" en cada
  // jornada libre.
  const routeCode = isOpaqueId(rawCode) || isTechnicalRouteId(rawCode) ? '' : rawCode;
  // Una jornada libre en curso no es "sin ruta": esta grabando recorrido. Es un
  // hecho operativo util, y sigue sin afirmar que exista una ruta oficial.
  const isRecordingJourney = isRecordingRouteId(session?.routeId) &&
    (session?.status === 'RUNNING' || session?.status === 'PAUSED');
  const rawLabel = route?.label || vehicle?.routeName || assignedRoute?.destinationLabel || routeCode || 'Sin ruta asignada';
  const label = isRecordingJourney
    ? RECORDING_JOURNEY_LABEL
    : /^sin ruta/i.test(String(rawLabel).trim()) ? 'Sin ruta asignada' : String(rawLabel);
  const origin = assignedRoute?.originLabel || '';
  const destination = assignedRoute?.destinationLabel || '';
  const direction = origin && destination ? `${origin} → ${destination}` : destination || origin || '';
  const status =
    session?.status === 'RUNNING'
      ? 'En servicio'
      : session?.status === 'PAUSED'
        ? 'Pausada'
        : session?.status === 'FINISHED'
          ? 'Finalizada'
          : assignedRoute
            ? 'Asignada'
            : 'Sin ruta';
  return {
    code: routeCode ? `Codigo ${routeCode}` : '',
    direction,
    label: isRecordingJourney || label === 'Sin ruta asignada' || label.startsWith('Ruta')
      ? label
      : `Ruta ${label}`,
    status,
  };
}

export function getRouteLabel(vehicle?: Vehicle | null, session?: RouteSession | null) {
  return getRouteInfo(vehicle, session).label;
}

export function getLastGpsUpdate(unit?: OperationalUnitSnapshot) {
  return unit?.gps.recordedAt ? formatDate(unit.gps.recordedAt, { fallback: 'Sin GPS' }) : 'Sin GPS';
}

export function getTimestamp(value?: string | null) {
  const timestamp = value ? new Date(value).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function getSessionProductivity(session?: RouteSession | null) {
  return Number(session?.metrics?.effectiveTimePercent ?? 0);
}

export function getSessionMetricsView(session: RouteSession): SessionMetricsView {
  return {
    checkpoints: session.completedCheckpoints ?? 0,
    distance: formatDistance(session.totalDistance),
    duration: formatDuration(session.totalDuration),
    laps: session.completedLaps ?? 0,
    productivity: formatPercent(session.metrics?.effectiveTimePercent),
    stopped: formatDuration(session.stoppedTime),
  };
}

export function getRouteProgressPercent(unit?: OperationalUnitSnapshot, session?: RouteSession | null) {
  if (session?.status === 'FINISHED') return 100;
  if (!session) return 0;
  const progress = Number(unit?.route?.progressRatio) * 100;
  return Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : 0;
}

export function getEtaLabel(unit?: OperationalUnitSnapshot) {
  if (unit?.route?.etaAt) {
    return formatDate(unit.route.etaAt);
  }
  if (typeof unit?.route?.remainingTimeSeconds === 'number') {
    return `${Math.max(0, Math.round(unit.route.remainingTimeSeconds / 60))} min`;
  }
  return 'Sin ETA';
}

/**
 * Presenta la taxonomia canonica del backend. NO recalcula umbrales.
 *
 * `stale: true` significa "no hay enlace vivo que sostenga una afirmacion
 * operacional", no "el dato es basura": la ultima posicion conocida se sigue
 * mostrando en el mapa.
 */
export function getGpsState(unit?: OperationalUnitSnapshot, session?: RouteSession | null): { label: string; stale: boolean; tone: StatusBadgeTone } {
  const connectionState = unit?.gps.connectionState || 'never_reported';
  const age = formatGpsAge(unit?.gps.ageSeconds ?? null);

  // Nunca llego un paquete: no hay nada vencido, hay algo que aun no ocurre.
  if (connectionState === 'never_reported') {
    return { label: 'Esperando primera ubicación', stale: true, tone: 'neutral' };
  }

  if (connectionState === 'live') {
    if ((session?.gpsLostEvents || 0) > 0 && session?.status !== 'RUNNING') {
      return { label: 'GPS con perdidas', stale: false, tone: 'warning' };
    }
    return { label: 'GPS en vivo', stale: false, tone: 'positive' };
  }

  // Una jornada cerrada no reclama enlace vivo: su GPS no esta "caido".
  if (session?.status === 'FINISHED') {
    return { label: age ? `Última ubicación · ${age}` : 'Última ubicación', stale: false, tone: 'neutral' };
  }

  if (connectionState === 'delayed') {
    return { label: age ? `GPS retrasado · ${age}` : 'GPS retrasado', stale: true, tone: 'warning' };
  }
  if (connectionState === 'stale') {
    return { label: age ? `GPS sin señal · ${age}` : 'GPS sin señal', stale: true, tone: 'warning' };
  }
  return {
    label: age ? `GPS perdido · última ubicación ${age}` : 'GPS perdido',
    stale: true,
    tone: 'danger',
  };
}

export function getJourneyState(unit?: OperationalUnitSnapshot, session?: RouteSession | null): JourneyState {
  if (unit?.route?.isOffRoute) return { label: 'Fuera de ruta', tone: 'danger' };
  // La etiqueta la resuelve la autoridad canonica: una unidad que jamas reporto
  // no puede anunciarse como "GPS perdido".
  const gps = getGpsState(unit, session);
  if (gps.stale && session && session.status !== 'FINISHED') return { label: gps.label, tone: gps.tone };
  if (!session) return { label: 'Esperando salida', tone: 'neutral' };
  return { label: formatPortalStatus(session.status), tone: getPortalStatusTone(session.status) };
}

export function getRouteGeometry(vehicle?: Vehicle | null) {
  if (!vehicle?.assignedRoute) return [];
  const polyline = vehicle.assignedRoute.route?.polyline || [];
  if (polyline.length >= 2) return polyline;
  const orderedStops = [...(vehicle.assignedRoute.stops || [])].sort((left, right) => left.order - right.order);
  return [vehicle.assignedRoute.origin, ...orderedStops, vehicle.assignedRoute.destination].filter(Boolean) as { latitude: number; longitude: number }[];
}

export function downsamplePositions(positions: RouteSessionPosition[], maxPoints = maxRenderedReplayPoints) {
  if (positions.length <= maxPoints) return positions;
  const step = Math.ceil(positions.length / maxPoints);
  return positions.filter((_, index) => index % step === 0 || index === positions.length - 1);
}

export function getOperationalAlerts(
  unit?: OperationalUnitSnapshot,
  session?: RouteSession | null
) {
  const alerts: { label: string; tone: StatusBadgeTone }[] = [];
  const gps = getGpsState(unit, session);
  if (unit?.route?.isOffRoute) alerts.push({ label: 'Fuera de ruta', tone: 'danger' });
  if (gps.stale) alerts.push({ label: gps.label, tone: 'warning' });
  if (
    session &&
    session.status !== 'FINISHED' &&
    unit?.gps.speedKmh != null &&
    unit.gps.speedKmh <= 3 &&
    Number(session.stoppedTime) > 300
  ) {
    alerts.push({ label: 'Detenido demasiado tiempo', tone: 'warning' });
  }
  return alerts;
}
