import type { RouteSession } from '@/src/types/app';

const ACTIVE_SESSION_STATUSES = new Set<RouteSession['status']>(['RUNNING', 'PAUSED']);

/**
 * Acepta numeros reales y cadenas numericas no vacias.
 *
 * `Number('')`, `Number(false)` y `Number([])` producen 0, pero ninguno de
 * esos valores representa una metrica enviada por backend. Rechazarlos evita
 * mostrar 0 km/0 min cuando el dato realmente falta.
 */
export function isFiniteMetricNumber(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return Boolean(trimmed) && Number.isFinite(Number(trimmed));
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

function sessionStartTimestamp(session: RouteSession) {
  const timestamp = new Date(session.startedAt).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
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

  // El endpoint suele llegar ordenado, pero la UI no debe depender de ese
  // detalle. Si por reconexion/cache hay mas de una jornada no terminal, se
  // muestra la mas reciente de la unidad seleccionada.
  return sessionHistory
    .filter(
      (session) =>
        session.vehicleId === selectedVehicleId && ACTIVE_SESSION_STATUSES.has(session.status)
    )
    .sort((left, right) => sessionStartTimestamp(right) - sessionStartTimestamp(left))[0] || null;
}
