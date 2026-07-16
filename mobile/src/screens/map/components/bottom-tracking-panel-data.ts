import type { RouteSession } from '@/src/types/app';

const ACTIVE_SESSION_STATUSES = new Set<RouteSession['status']>(['RUNNING', 'PAUSED']);

export function isFiniteMetricNumber(value: unknown): value is number {
  return value !== null && value !== undefined && Number.isFinite(Number(value));
}

function getElapsedSessionSeconds(session: RouteSession | null) {
  if (!session) return null;
  const start = new Date(session.startedAt).getTime();
  const end = session.finishedAt ? new Date(session.finishedAt).getTime() : Date.now();
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, (end - start) / 1000) : null;
}

export function getSessionDurationSeconds(session: RouteSession | null) {
  if (!session) return null;
  if (isFiniteMetricNumber(session.totalDuration)) return Number(session.totalDuration);
  if (isFiniteMetricNumber(session.metrics?.totalDuration)) return Number(session.metrics?.totalDuration);
  return getElapsedSessionSeconds(session);
}

export function getSessionDistanceMeters(session: RouteSession | null) {
  if (!session) return null;
  if (isFiniteMetricNumber(session.totalDistance)) return Number(session.totalDistance);
  if (isFiniteMetricNumber(session.metrics?.totalDistance)) return Number(session.metrics?.totalDistance);
  return null;
}

export function selectVehicleActiveSession(
  selectedVehicleId: string | null | undefined,
  activeSession: RouteSession | null,
  sessionHistory: RouteSession[]
) {
  if (!selectedVehicleId) return null;
  if (
    activeSession?.vehicleId === selectedVehicleId &&
    ACTIVE_SESSION_STATUSES.has(activeSession.status)
  ) {
    return activeSession;
  }
  return sessionHistory.find(
    (session) =>
      session.vehicleId === selectedVehicleId && ACTIVE_SESSION_STATUSES.has(session.status)
  ) || null;
}
