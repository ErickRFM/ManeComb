import type { StatusBadgeTone } from '@/src/components/ui/status-badge';
import { formatDate, formatDistanceFromMeters, formatDurationFromSeconds } from '@/src/utils/format';
import { formatPortalStatus, getPortalStatusTone } from '../components/portal-cards';
import { isVehicleGpsFresh } from '../utils/tracking';
import type { OperationalUnitSnapshot } from '@shared/operational-contract';
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

export function formatSpeed(speed?: number | null) {
  const value = Number(speed);
  if (!Number.isFinite(value) || value < 0) return 'Sin dato';
  const kmh = value * 3.6;
  return `${Math.round(kmh)} km/h`;
}

export function formatPercent(value?: number | null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${numeric.toFixed(0)}%` : 'Sin dato';
}

export function getVehicleStatus(vehicle: Vehicle, activeSession?: RouteSession | null): { label: string; tone: StatusBadgeTone } {
  if (activeSession?.status === 'RUNNING') return { label: 'En jornada', tone: 'positive' };
  if (activeSession?.status === 'PAUSED') return { label: 'Pausada', tone: 'warning' };
  if (vehicle.status === 'maintenance') return { label: 'Mantenimiento', tone: 'warning' };
  if (vehicle.driverId) return { label: 'Asignada', tone: 'info' };
  return { label: 'Disponible', tone: 'neutral' };
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

export function getActiveDriver(users: User[], vehicle: Vehicle, activeSession?: RouteSession | null) {
  const activeDriverId = activeSession?.driverId || vehicle.driverId || vehicle.driver?.id || null;
  return users.find((user) => user.id === activeDriverId) || vehicle.driver || null;
}

export function isOpaqueId(value?: string | null) {
  return opaqueIdPattern.test(String(value || '').trim());
}

export function getRouteInfo(vehicle?: Vehicle | null, session?: RouteSession | null): RouteInfo {
  const assignedRoute = vehicle?.assignedRoute || null;
  const route = assignedRoute?.route || null;
  const rawCode = vehicle?.routeCode || vehicle?.routeId || session?.routeId || '';
  const routeCode = isOpaqueId(rawCode) ? '' : rawCode;
  const rawLabel = route?.label || vehicle?.routeName || assignedRoute?.destinationLabel || routeCode || 'Sin ruta asignada';
  const label = /^sin ruta/i.test(String(rawLabel).trim()) ? 'Sin ruta asignada' : String(rawLabel);
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
    label: label === 'Sin ruta asignada' || label.startsWith('Ruta') ? label : `Ruta ${label}`,
    status,
  };
}

export function getRouteLabel(vehicle?: Vehicle | null, session?: RouteSession | null) {
  return getRouteInfo(vehicle, session).label;
}

export function getLastGpsUpdate(vehicle: Vehicle) {
  return vehicle.locationTimestamp ? formatDate(vehicle.locationTimestamp, { fallback: 'Sin GPS' }) : 'Sin GPS';
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

export function getRouteProgressPercent(vehicle: Vehicle, session?: RouteSession | null) {
  if (session?.status === 'FINISHED') return 100;
  if (!session) return 0;
  const progress = Number(vehicle.activeRouteProgress?.progressPercent);
  return Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : 0;
}

export function getEtaLabel(vehicle: Vehicle) {
  if (vehicle.activeRouteProgress?.etaAt) {
    return formatDate(vehicle.activeRouteProgress.etaAt);
  }
  if (typeof vehicle.etaMinutes === 'number') {
    return `${Math.max(0, Math.round(vehicle.etaMinutes))} min`;
  }
  return 'Sin ETA';
}

export function applyOperationalSnapshot(vehicle: Vehicle, unit?: OperationalUnitSnapshot): Vehicle {
  if (!unit) return vehicle;
  return {
    ...vehicle,
    location: unit.gps.lat === null || unit.gps.lng === null
      ? null
      : { latitude: unit.gps.lat, longitude: unit.gps.lng },
    locationTimestamp: unit.gps.recordedAt,
    speed: unit.gps.speedKmh,
    heading: unit.gps.heading,
    gpsFreshness: {
      state: unit.gps.freshness,
      isFresh: unit.gps.freshness === 'fresh',
      evaluatedAt: unit.lastEventAt || new Date().toISOString(),
      freshUntil: null,
      thresholdMs: 0,
    },
    driverId: unit.driver?.id || null,
    driverName: unit.driver?.name || null,
    etaMinutes: unit.route?.remainingTimeSeconds == null
      ? null
      : Math.max(0, Math.round(unit.route.remainingTimeSeconds / 60)),
    activeRouteProgress: vehicle.activeRouteProgress ? {
      ...vehicle.activeRouteProgress,
      etaAt: unit.route?.etaAt || null,
      progressPercent: unit.route?.progressRatio == null
        ? vehicle.activeRouteProgress.progressPercent
        : unit.route.progressRatio * 100,
    } : vehicle.activeRouteProgress,
  } as Vehicle;
}

export function getGpsState(vehicle: Vehicle, session?: RouteSession | null): { label: string; stale: boolean; tone: StatusBadgeTone } {
  if (!vehicle.location || !vehicle.locationTimestamp) return { label: 'Sin GPS', stale: true, tone: 'warning' };
  if (!isVehicleGpsFresh(vehicle) && session?.status !== 'FINISHED') {
    return { label: 'GPS vencido', stale: true, tone: 'warning' };
  }
  if ((session?.gpsLostEvents || 0) > 0 && session?.status !== 'RUNNING') {
    return { label: 'GPS con perdidas', stale: false, tone: 'warning' };
  }
  return { label: 'GPS actualizado', stale: false, tone: 'positive' };
}

export function getJourneyState(vehicle: Vehicle, session?: RouteSession | null): JourneyState {
  if (vehicle.activeRouteProgress?.isOffRoute) return { label: 'Fuera de ruta', tone: 'danger' };
  if (getGpsState(vehicle, session).stale && session && session.status !== 'FINISHED') return { label: 'GPS perdido', tone: 'warning' };
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

export function getOperationalAlerts(vehicle: Vehicle, session?: RouteSession | null) {
  const alerts: { label: string; tone: StatusBadgeTone }[] = [];
  const gps = getGpsState(vehicle, session);
  if (vehicle.activeRouteProgress?.isOffRoute) alerts.push({ label: 'Fuera de ruta', tone: 'danger' });
  if (gps.stale) alerts.push({ label: gps.label, tone: 'warning' });
  if (session && session.status !== 'FINISHED' && Number(vehicle.speed) <= 0.8 && Number(session.stoppedTime) > 300) {
    alerts.push({ label: 'Detenido demasiado tiempo', tone: 'warning' });
  }
  return alerts;
}
