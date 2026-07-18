import type {
  Incident,
  RouteEvent,
  RouteSession,
  RouteShape,
  Vehicle,
} from '@/src/types/app';
import type {
  OperationalAction,
  OperationalAvailability,
  OperationalGpsState,
  OperationalUnitSnapshot,
  OperationalUnitStatus,
} from './operational-unit-snapshot';

const NON_TERMINAL_SESSION_STATUSES = new Set<RouteSession['status']>([
  'ASSIGNED',
  'READY',
  'RUNNING',
  'PAUSED',
]);

export type OperationalUnitSnapshotInput = Readonly<{
  vehicle: Vehicle;
  routes?: readonly RouteShape[];
  sessions?: readonly RouteSession[];
  incidents?: readonly Incident[];
  events?: readonly RouteEvent[];
  allowedActions?: readonly OperationalAction[];
  now?: Date | string | number;
}>;

function timestamp(value: string | null | undefined) {
  if (!value) return null;
  const result = new Date(value).getTime();
  return Number.isFinite(result) ? result : null;
}

function latestBy<T>(values: readonly T[], getValue: (value: T) => string | null | undefined) {
  return values.reduce<T | null>((latest, value) => {
    if (!latest) return value;
    return (timestamp(getValue(value)) || 0) > (timestamp(getValue(latest)) || 0) ? value : latest;
  }, null);
}

function normalizeVehicleStatus(value: string): { code: OperationalUnitStatus; reason: string } {
  const status = String(value || '').trim().toLowerCase();
  if (status === 'available') return { code: 'available', reason: 'vehicle_available' };
  if (status === 'maintenance') return { code: 'maintenance', reason: 'vehicle_maintenance' };
  if (status === 'offline') return { code: 'offline', reason: 'vehicle_offline' };
  if (['online', 'patrolling', 'on-route', 'active'].includes(status)) {
    return { code: 'running', reason: `vehicle_${status || 'active'}` };
  }
  return { code: 'unknown', reason: status ? `unmapped_vehicle_status:${status}` : 'missing_vehicle_status' };
}

function normalizeSessionStatus(status: RouteSession['status']): OperationalUnitStatus {
  return status.toLowerCase() as OperationalUnitStatus;
}

function getAvailability(status: OperationalUnitStatus): OperationalAvailability {
  if (status === 'available' || status === 'ready' || status === 'assigned') return 'available';
  if (status === 'running' || status === 'paused') return 'in_use';
  if (status === 'maintenance' || status === 'offline') return 'unavailable';
  return 'unknown';
}

function finiteOrNull(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function getGpsState(vehicle: Vehicle, nowMs: number): { state: OperationalGpsState; ageMs: number | null } {
  const recordedAt = timestamp(vehicle.locationTimestamp);
  if (!vehicle.location || recordedAt === null) return { state: 'missing', ageMs: null };

  const ageMs = Math.max(0, nowMs - recordedAt);
  const explicitState = vehicle.gpsFreshness?.state;
  if (explicitState === 'fresh' || explicitState === 'stale' || explicitState === 'missing') {
    return { state: explicitState, ageMs };
  }

  const freshUntil = timestamp(vehicle.gpsFreshness?.freshUntil);
  return { state: freshUntil !== null && freshUntil >= nowMs ? 'fresh' : 'stale', ageMs };
}

function getRoute(vehicle: Vehicle, routes: readonly RouteShape[]) {
  const assigned = vehicle.assignedRoute;
  const routeId = assigned?.routeId || vehicle.routeId || vehicle.route?.id || null;
  const catalogRoute = routeId ? routes.find((route) => route.id === routeId) || null : null;
  const name = assigned?.routeName || catalogRoute?.name || vehicle.routeName || vehicle.route?.name || assigned?.route?.label;
  if (!routeId && !name) return null;

  return {
    id: routeId,
    code: assigned?.routeCode || catalogRoute?.code || vehicle.routeCode || vehicle.route?.code || null,
    name: name || 'Ruta asignada',
  } as const;
}

function getLastUpdateAt(values: Array<string | null | undefined>) {
  const valid = values
    .map((value) => ({ value: value || null, time: timestamp(value) }))
    .filter((entry): entry is { value: string; time: number } => entry.value !== null && entry.time !== null)
    .sort((left, right) => right.time - left.time);
  return valid[0]?.value || null;
}

export function buildOperationalUnitSnapshot({
  vehicle,
  routes = [],
  sessions = [],
  incidents = [],
  events = [],
  allowedActions = [],
  now = new Date(),
}: OperationalUnitSnapshotInput): OperationalUnitSnapshot {
  const nowMs = new Date(now).getTime();
  const safeNowMs = Number.isFinite(nowMs) ? nowMs : Date.now();
  const vehicleSessions = sessions.filter((session) => session.vehicleId === vehicle.id);
  const activeSession = latestBy(
    vehicleSessions.filter((session) => NON_TERMINAL_SESSION_STATUSES.has(session.status)),
    (session) => session.updatedAt || session.startedAt
  );
  const status = activeSession
    ? { code: normalizeSessionStatus(activeSession.status), reason: `route_session_${activeSession.status.toLowerCase()}` }
    : normalizeVehicleStatus(vehicle.status);
  const gps = getGpsState(vehicle, safeNowMs);
  const progress = vehicle.activeRouteProgress;
  const driverName = vehicle.driver?.name || vehicle.driverName || null;
  const activeIncidents = incidents
    .filter((incident): incident is Incident & { status: 'open' | 'in_progress' } =>
      incident.vehicleId === vehicle.id && (incident.status === 'open' || incident.status === 'in_progress')
    )
    .sort((left, right) => (timestamp(right.createdAt) || 0) - (timestamp(left.createdAt) || 0))
    .map((incident) => ({
      id: incident.id,
      title: incident.title,
      severity: incident.severity,
      status: incident.status,
      createdAt: incident.createdAt,
    }));
  const sessionEvents = events.filter((event) =>
    event.vehicleId === vehicle.id && (!activeSession || event.sessionId === activeSession.id)
  );
  const lastEvent = latestBy(sessionEvents, (event) => event.timestamp);
  const currentCheckpointIndex = progress ? Math.max(0, Math.round(progress.currentCheckpointIndex)) : 0;
  const checkpointCount = progress ? Math.max(0, Math.round(progress.checkpointCount)) : 0;
  const effectiveTimePercent = finiteOrNull(activeSession?.metrics?.effectiveTimePercent);

  return {
    id: vehicle.id,
    unitNumber: vehicle.code,
    plate: vehicle.plate || null,
    status,
    availability: getAvailability(status.code),
    gps,
    location: vehicle.location && vehicle.locationTimestamp
      ? {
          point: vehicle.location,
          recordedAt: vehicle.locationTimestamp,
          heading: finiteOrNull(vehicle.heading),
          speedMetersPerSecond: finiteOrNull(progress?.speedMetersPerSecond ?? vehicle.speed),
        }
      : null,
    route: getRoute(vehicle, routes),
    routeProgress: progress
      ? {
          percent: clamp(progress.progressPercent, 0, 100),
          remainingDistanceMeters: Math.max(0, progress.distanceRemaining),
          remainingTimeSeconds: Math.max(0, progress.timeRemainingSeconds),
          etaAt: progress.etaAt,
          checkpointCount,
          currentCheckpointIndex,
          nextCheckpointIndex: currentCheckpointIndex < checkpointCount ? currentCheckpointIndex + 1 : null,
          isOffRoute: progress.isOffRoute,
          measuredAt: progress.timestamp,
        }
      : null,
    driver: activeSession?.driverId || vehicle.driverId || driverName
      ? {
          id: activeSession?.driverId || vehicle.driverId || null,
          name: driverName || 'Conductor asignado',
        }
      : null,
    activeJourney: activeSession
      ? {
          id: activeSession.id,
          status: activeSession.status.toLowerCase() as 'assigned' | 'ready' | 'running' | 'paused',
          startedAt: activeSession.status === 'ASSIGNED' || activeSession.status === 'READY' ? null : activeSession.startedAt,
        }
      : null,
    journeyMetrics: {
      activeTimeSeconds: finiteOrNull(activeSession?.totalDuration ?? activeSession?.metrics?.totalDuration),
      stoppedTimeSeconds: finiteOrNull(activeSession?.stoppedTime),
      distanceMeters: finiteOrNull(activeSession?.totalDistance ?? activeSession?.metrics?.totalDistance),
      completedLaps: finiteOrNull(activeSession?.completedLaps ?? activeSession?.metrics?.completedLaps),
      productivityPercent: effectiveTimePercent === null ? null : clamp(effectiveTimePercent, 0, 100),
    },
    incidents: activeIncidents,
    lastEvent: lastEvent ? { type: lastEvent.eventType, occurredAt: lastEvent.timestamp } : null,
    lastUpdateAt: getLastUpdateAt([
      vehicle.updatedAt,
      vehicle.locationTimestamp,
      progress?.timestamp,
      activeSession?.updatedAt,
      lastEvent?.timestamp,
      activeIncidents[0]?.createdAt,
    ]),
    actions: Array.from(new Set(allowedActions)),
  };
}
