import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { router, useLocalSearchParams } from '@/src/navigation/router';
import type { CSSProperties } from 'react';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { AppTheme, Typography } from '@/constants/theme';
import { EmptyState } from '@/src/components/ui/empty-state';
import { StatusBadge, type StatusBadgeTone } from '@/src/components/ui/status-badge';
import {
  getRouteSessionCheckpointVisitsRequest,
  getRouteSessionEventsRequest,
  getRouteSessionHistoryRequest,
  getRouteSessionMetricsRequest,
  getRouteSessionPositionsRequest,
  getApiErrorMessage,
} from '@/src/api/client';
import { useAppStore } from '@/src/store/use-app-store';
import type {
  CheckpointVisit,
  RouteEvent,
  RouteSession,
  RouteSessionMetrics,
  RouteSessionPosition,
  User,
  Vehicle,
} from '@/src/types/app';
import { formatDate, formatDistanceFromMeters, formatDurationFromSeconds } from '@/src/utils/format';
import { formatPortalStatus, getPortalStatusTone, PortalSectionCard } from '../components/portal-cards';
import { PortalLayout } from '../components/portal-layout';
import { portalButtonGradient, portalPalette } from '../portal-theme';
import { isVehicleGpsFresh } from '../utils/tracking';

type SessionDetail = {
  events: RouteEvent[];
  metrics: RouteSessionMetrics | null;
  positions: RouteSessionPosition[];
  positionsLimit: number;
  positionsOffset: number;
  positionsTotal: number;
  visits: CheckpointVisit[];
};

type Filters = {
  driverId: string;
  productivity: string;
  routeId: string;
  sortBy: 'time' | 'distance' | 'laps';
  status: string;
  vehicleId: string;
};

type OperationsFilter = 'ALL' | 'RUNNING' | 'STOPPED' | 'OFF_ROUTE';
type MapMode = 'operational' | 'satellite' | 'traffic';

const statusFilters = ['ALL', 'RUNNING', 'PAUSED', 'FINISHED', 'CANCELLED'] as const;
const historyPageSize = 50;
const replayPageSize = 800;
const maxRenderedReplayPoints = 900;
const replaySpeeds = [1, 2, 4] as const;
const OperationsMap = lazy(() => import('../components/operations-map').then((module) => ({ default: module.OperationsMap })));
const driverAvatarImageStyle: CSSProperties = {
  borderRadius: 20,
  height: 40,
  objectFit: 'cover',
  width: 40,
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function numberOrZero(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

const formatDuration = formatDurationFromSeconds;
const formatDistance = formatDistanceFromMeters;

// Contrato: el backend siempre entrega velocidad en metros/segundo
// (ver normalizeSpeedMetersPerSecond en backend/src/services/route-progress.js
// y normalizeSpeed en route-metrics-engine.js / route-event-engine.js).
// No adivinar la unidad por magnitud: eso rompe con GPS real >45 m/s (162 km/h).
function formatSpeed(speed?: number | null) {
  const value = Number(speed);
  if (!Number.isFinite(value) || value < 0) return 'Sin dato';
  const kmh = value * 3.6;
  return `${Math.round(kmh)} km/h`;
}

function formatPercent(value?: number | null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${numeric.toFixed(0)}%` : 'Sin dato';
}

function getVehicleStatus(vehicle: Vehicle, activeSession?: RouteSession | null): { label: string; tone: StatusBadgeTone } {
  if (activeSession?.status === 'RUNNING') return { label: 'En jornada', tone: 'positive' };
  if (activeSession?.status === 'PAUSED') return { label: 'Pausada', tone: 'warning' };
  if (vehicle.status === 'maintenance') return { label: 'Mantenimiento', tone: 'warning' };
  if (vehicle.driverId) return { label: 'Asignada', tone: 'info' };
  return { label: 'Disponible', tone: 'neutral' };
}

function getEventLabel(eventType: RouteEvent['eventType']) {
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

function getDriverName(users: User[], driverId?: string | null, fallback?: string | null) {
  return users.find((user) => user.id === driverId)?.name || fallback || 'Sin chofer';
}

type RouteInfo = {
  code: string;
  direction: string;
  label: string;
  status: string;
};

type JourneyState = {
  label: string;
  tone: StatusBadgeTone;
};

function getDriverLicense(driver?: User | null) {
  const extended = driver as (User & { driverLicense?: string | null; license?: string | null; licenseNumber?: string | null }) | null | undefined;
  return extended?.licenseNumber || extended?.driverLicense || extended?.license || '';
}

function getDriverInitials(driver?: User | null) {
  return String(driver?.name || 'SC')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((chunk) => chunk[0]?.toUpperCase() || '')
    .join('') || 'SC';
}

function getAssignedDrivers(users: User[], vehicle: Vehicle, activeSession?: RouteSession | null) {
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

function getActiveDriver(users: User[], vehicle: Vehicle, activeSession?: RouteSession | null) {
  const activeDriverId = activeSession?.driverId || vehicle.driverId || vehicle.driver?.id || null;
  return users.find((user) => user.id === activeDriverId) || vehicle.driver || null;
}

// Los routeId son UUID opacos: nunca deben llegar a la interfaz como nombre de ruta.
const opaqueIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isOpaqueId(value?: string | null) {
  return opaqueIdPattern.test(String(value || '').trim());
}

function getRouteInfo(vehicle?: Vehicle | null, session?: RouteSession | null): RouteInfo {
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

function getRouteLabel(vehicle?: Vehicle | null, session?: RouteSession | null) {
  return getRouteInfo(vehicle, session).label;
}

function getLastGpsUpdate(vehicle: Vehicle) {
  return vehicle.locationTimestamp ? formatDate(vehicle.locationTimestamp, { fallback: 'Sin GPS' }) : 'Sin GPS';
}

function getTimestamp(value?: string | null) {
  const timestamp = value ? new Date(value).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getSessionProductivity(session?: RouteSession | null) {
  return Number(session?.metrics?.effectiveTimePercent ?? 0);
}

type SessionMetricsView = {
  checkpoints: number;
  distance: string;
  duration: string;
  laps: number;
  productivity: string;
  stopped: string;
};

// Fuente unica de metricas de jornada. El panel lateral, la tarjeta de historial y el
// detalle derivan de aqui: leen los mismos campos persistidos por el backend con el mismo
// formato, de modo que no puedan mostrar valores distintos de la misma jornada.
// (El "Tiempo activo" live del panel lateral es otra metrica y se calcula aparte a proposito.)
function getSessionMetricsView(session: RouteSession): SessionMetricsView {
  return {
    checkpoints: session.completedCheckpoints ?? 0,
    distance: formatDistance(session.totalDistance),
    duration: formatDuration(session.totalDuration),
    laps: session.completedLaps ?? 0,
    productivity: formatPercent(session.metrics?.effectiveTimePercent),
    stopped: formatDuration(session.stoppedTime),
  };
}

function getRouteProgressPercent(vehicle: Vehicle, session?: RouteSession | null) {
  if (session?.status === 'FINISHED') return 100;
  if (!session) return 0;
  const progress = Number(vehicle.activeRouteProgress?.progressPercent);
  return Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : 0;
}

function getEtaLabel(vehicle: Vehicle) {
  if (vehicle.activeRouteProgress?.etaAt) {
    return formatDate(vehicle.activeRouteProgress.etaAt);
  }
  if (typeof vehicle.etaMinutes === 'number') {
    return `${Math.max(0, Math.round(vehicle.etaMinutes))} min`;
  }
  return 'Sin ETA';
}

function getGpsState(vehicle: Vehicle, session?: RouteSession | null): { label: string; stale: boolean; tone: StatusBadgeTone } {
  if (!vehicle.location || !vehicle.locationTimestamp) return { label: 'Sin GPS', stale: true, tone: 'warning' };
  if (!isVehicleGpsFresh(vehicle) && session?.status !== 'FINISHED') {
    return { label: 'GPS vencido', stale: true, tone: 'warning' };
  }
  if ((session?.gpsLostEvents || 0) > 0 && session?.status !== 'RUNNING') {
    return { label: 'GPS con perdidas', stale: false, tone: 'warning' };
  }
  return { label: 'GPS actualizado', stale: false, tone: 'positive' };
}

function getJourneyState(vehicle: Vehicle, session?: RouteSession | null): JourneyState {
  if (vehicle.activeRouteProgress?.isOffRoute) return { label: 'Fuera de ruta', tone: 'danger' };
  if (getGpsState(vehicle, session).stale && session && session.status !== 'FINISHED') return { label: 'GPS perdido', tone: 'warning' };
  if (!session) return { label: 'Esperando salida', tone: 'neutral' };
  return { label: formatPortalStatus(session.status), tone: getPortalStatusTone(session.status) };
}

function getRouteGeometry(vehicle?: Vehicle | null) {
  if (!vehicle?.assignedRoute) return [];
  const polyline = vehicle.assignedRoute.route?.polyline || [];
  if (polyline.length >= 2) return polyline;
  return [vehicle.assignedRoute.origin, vehicle.assignedRoute.destination].filter(Boolean) as { latitude: number; longitude: number }[];
}

function downsamplePositions(positions: RouteSessionPosition[], maxPoints = maxRenderedReplayPoints) {
  if (positions.length <= maxPoints) return positions;
  const step = Math.ceil(positions.length / maxPoints);
  return positions.filter((_, index) => index % step === 0 || index === positions.length - 1);
}

// Solo alertas que no esten ya cubiertas por el badge de estado (getVehicleStatus /
// getJourneyState): la pausa, por ejemplo, ya se muestra ahi.
function getOperationalAlerts(vehicle: Vehicle, session?: RouteSession | null) {
  const alerts: { label: string; tone: StatusBadgeTone }[] = [];
  const gps = getGpsState(vehicle, session);
  if (vehicle.activeRouteProgress?.isOffRoute) alerts.push({ label: 'Fuera de ruta', tone: 'danger' });
  if (gps.stale) alerts.push({ label: gps.label, tone: 'warning' });
  if (session && session.status !== 'FINISHED' && Number(vehicle.speed) <= 0.8 && Number(session.stoppedTime) > 300) {
    alerts.push({ label: 'Detenido demasiado tiempo', tone: 'warning' });
  }
  return alerts;
}

export function PortalDashboardScreen() {
  const params = useLocalSearchParams<{ sessionId?: string | string[]; vehicleId?: string | string[]; view?: string | string[] }>();
  const {
    isSubmitting,
    lastRouteSessionUpdateId,
    loadUsers,
    loadVehicles,
    routeSessionVersion,
    updateUser,
    users,
    vehicles,
  } = useAppStore(
    useShallow((state) => ({
      isSubmitting: state.isSubmitting,
      lastRouteSessionUpdateId: state.lastRouteSessionUpdateId,
      loadUsers: state.loadUsers,
      loadVehicles: state.loadVehicles,
      routeSessionVersion: state.routeSessionVersion,
      updateUser: state.updateUser,
      users: state.users,
      vehicles: state.vehicles,
    }))
  );
  const [filters, setFilters] = useState<Filters>({
    driverId: '',
    productivity: '',
    routeId: '',
    sortBy: 'time',
    status: 'ALL',
    vehicleId: getParam(params.vehicleId) || '',
  });
  const [operationsFilter, setOperationsFilter] = useState<OperationsFilter>('ALL');
  const [mapMode, setMapMode] = useState<MapMode>('operational');
  const [mapModeMenuOpen, setMapModeMenuOpen] = useState(false);
  const [history, setHistory] = useState<RouteSession[]>([]);
  const [historyLimit, setHistoryLimit] = useState(historyPageSize);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [selectedVehicleId, setSelectedVehicleId] = useState(getParam(params.vehicleId) || '');
  const [selectedSessionId, setSelectedSessionId] = useState(getParam(params.sessionId) || '');
  const [sessionDetail, setSessionDetail] = useState<SessionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isPositionsLoading, setIsPositionsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [driverSelectorVehicleId, setDriverSelectorVehicleId] = useState<string | null>(null);
  const [driverChangeMessage, setDriverChangeMessage] = useState<string | null>(null);
  const [routeFocusVehicleId, setRouteFocusVehicleId] = useState<string | null>(getParam(params.vehicleId) || null);
  const [replayIndex, setReplayIndex] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState<(typeof replaySpeeds)[number]>(1);
  const detailCache = useRef(new Map<string, SessionDetail>());
  const historyRequestKeyRef = useRef<string | null>(null);
  const detailRequestIdRef = useRef(0);
  const positionsRequestRef = useRef(false);

  useEffect(() => {
    void loadUsers();
    void loadVehicles();
  }, [loadUsers, loadVehicles]);

  const loadHistory = async ({ append = false } = {}) => {
    const offset = append ? history.length : 0;
    const requestKey = JSON.stringify({ append, filters, offset, routeSessionVersion });
    if (historyRequestKeyRef.current === requestKey) return;
    historyRequestKeyRef.current = requestKey;
    setIsLoading(true);
    setMessage(null);
    try {
      const result = await getRouteSessionHistoryRequest({
        driverId: filters.driverId || undefined,
        limit: historyPageSize,
        offset,
        routeId: filters.routeId || undefined,
        status: filters.status !== 'ALL' ? filters.status as RouteSession['status'] : undefined,
        vehicleId: filters.vehicleId || undefined,
      });
      if (historyRequestKeyRef.current !== requestKey) return;
      setHistory((current) => (append ? [...current, ...result.items] : result.items));
      setHistoryLimit(result.limit);
      setHistoryTotal(result.total);
    } catch (error) {
      if (historyRequestKeyRef.current === requestKey) {
        setMessage(getApiErrorMessage(error, 'No fue posible cargar jornadas.'));
      }
    } finally {
      if (historyRequestKeyRef.current === requestKey) {
        historyRequestKeyRef.current = null;
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    void loadHistory();
  }, [filters.driverId, filters.routeId, filters.status, filters.vehicleId, routeSessionVersion]);

  useEffect(() => {
    if (!lastRouteSessionUpdateId) return;
    detailCache.current.delete(lastRouteSessionUpdateId);
  }, [lastRouteSessionUpdateId]);

  const sessionsByVehicle = useMemo(() => {
    const map = new Map<string, RouteSession[]>();
    history.forEach((session) => {
      const list = map.get(session.vehicleId) || [];
      list.push(session);
      map.set(session.vehicleId, list);
    });
    map.forEach((list) => list.sort((left, right) => getTimestamp(right.startedAt) - getTimestamp(left.startedAt)));
    return map;
  }, [history]);

  const selectedVehicle = useMemo(
    () => vehicles.find((vehicle) => vehicle.id === selectedVehicleId) || vehicles[0] || null,
    [selectedVehicleId, vehicles]
  );
  const selectedVehicleSessions = selectedVehicle ? sessionsByVehicle.get(selectedVehicle.id) || [] : [];
  const activeSession = selectedVehicleSessions.find((session) => ['RUNNING', 'PAUSED'].includes(session.status)) || null;
  const latestSession = selectedVehicleSessions[0] || null;
  const selectedSession = history.find((session) => session.id === selectedSessionId) || latestSession || null;
  const operationsCounts = useMemo(() => {
    const running = vehicles.filter((vehicle) => sessionsByVehicle.get(vehicle.id)?.some((session) => session.status === 'RUNNING')).length;
    const stopped = vehicles.filter((vehicle) => {
      const session = sessionsByVehicle.get(vehicle.id)?.find((entry) => ['RUNNING', 'PAUSED'].includes(entry.status));
      return session?.status === 'PAUSED' || (Boolean(session) && Number(vehicle.speed) <= 0.8);
    }).length;
    const offRoute = vehicles.filter((vehicle) => Boolean(vehicle.activeRouteProgress?.isOffRoute)).length;
    return { ALL: vehicles.length, RUNNING: running, STOPPED: stopped, OFF_ROUTE: offRoute };
  }, [sessionsByVehicle, vehicles]);
  const operationalVehicles = useMemo(() => vehicles.filter((vehicle) => {
    const session = sessionsByVehicle.get(vehicle.id)?.find((entry) => ['RUNNING', 'PAUSED'].includes(entry.status));
    if (operationsFilter === 'RUNNING') return session?.status === 'RUNNING';
    if (operationsFilter === 'STOPPED') return session?.status === 'PAUSED' || (Boolean(session) && Number(vehicle.speed) <= 0.8);
    if (operationsFilter === 'OFF_ROUTE') return Boolean(vehicle.activeRouteProgress?.isOffRoute);
    return true;
  }), [operationsFilter, sessionsByVehicle, vehicles]);
  const operationsKpis = useMemo(() => {
    const active = operationsCounts.RUNNING;
    const gpsLost = vehicles.filter((vehicle) => getGpsState(vehicle, sessionsByVehicle.get(vehicle.id)?.[0]).stale).length;
    const completed = history.filter((session) => session.status === 'FINISHED');
    const productive = completed.map(getSessionProductivity).filter((value) => Number.isFinite(value));
    const productivity = productive.length ? productive.reduce((sum, value) => sum + value, 0) / productive.length : null;
    const distance = history.reduce((sum, session) => sum + numberOrZero(session.totalDistance), 0);
    return [
      { detail: 'En jornada', icon: 'bus-multiple' as const, label: 'Unidades activas', value: String(active) },
      { detail: 'Velocidad baja', icon: 'pause-circle-outline' as const, label: 'Detenidas', value: String(operationsCounts.STOPPED) },
      { detail: 'Estado actual', icon: 'map-marker-off-outline' as const, label: 'Fuera de ruta', value: String(operationsCounts.OFF_ROUTE) },
      { detail: 'Señal no vigente', icon: 'crosshairs-question' as const, label: 'GPS perdido', value: String(gpsLost) },
      { detail: 'Jornadas guardadas', icon: 'chart-line' as const, label: 'Productividad', value: productivity === null ? 'Sin dato' : formatPercent(productivity) },
      { detail: `${history.length} jornadas`, icon: 'map-marker-distance' as const, label: 'Distancia registrada', value: formatDistance(distance) },
    ];
  }, [history, operationsCounts, sessionsByVehicle, vehicles]);
  const filteredSessions = useMemo(() => {
    const productivityMin = Number(filters.productivity);
    return history
      .filter((session) => {
        if (filters.vehicleId && session.vehicleId !== filters.vehicleId) return false;
        if (filters.driverId && session.driverId !== filters.driverId) return false;
        if (filters.routeId && session.routeId !== filters.routeId) return false;
        if (filters.status !== 'ALL' && session.status !== filters.status) return false;
        if (Number.isFinite(productivityMin) && productivityMin > 0 && getSessionProductivity(session) < productivityMin) return false;
        return true;
      })
      .sort((left, right) => {
        if (filters.sortBy === 'distance') return numberOrZero(right.totalDistance) - numberOrZero(left.totalDistance);
        if (filters.sortBy === 'laps') return numberOrZero(right.completedLaps) - numberOrZero(left.completedLaps);
        return getTimestamp(right.startedAt) - getTimestamp(left.startedAt);
      });
  }, [filters, history]);

  const routeFocusVehicle = vehicles.find((vehicle) => vehicle.id === routeFocusVehicleId) || selectedVehicle;
  const routeCoordinates = useMemo(() => getRouteGeometry(routeFocusVehicle), [routeFocusVehicle]);
  const routeCheckpoints = routeFocusVehicle?.assignedRoute?.stops || [];
  const replayPosition = sessionDetail?.positions[replayIndex] || null;
  const replayPath = useMemo(() => downsamplePositions(sessionDetail?.positions || []), [sessionDetail?.positions]);
  const activeView = getParam(params.view) === 'history' ? 'history' : getParam(params.view) === 'detail' ? 'detail' : 'operations';

  const openVehicle = (vehicle: Vehicle) => {
    setSelectedVehicleId(vehicle.id);
    setFilters((current) => ({ ...current, vehicleId: vehicle.id }));
    const session = sessionsByVehicle.get(vehicle.id)?.[0];
    if (session) {
      void openSession(session);
    }
  };

  const showRoute = (vehicle: Vehicle) => {
    setRouteFocusVehicleId(vehicle.id);
    openVehicle(vehicle);
  };

  const openHistoryView = (vehicleId?: string) => {
    router.push({ pathname: '/portal', params: { ...(vehicleId ? { vehicleId } : {}), view: 'history' } } as never);
  };

  const changeDriver = async (vehicle: Vehicle, driver: User) => {
    const currentDriver = getActiveDriver(users, vehicle, sessionsByVehicle.get(vehicle.id)?.find((session) => ['RUNNING', 'PAUSED'].includes(session.status)) || null);
    if (currentDriver?.id === driver.id) {
      setDriverChangeMessage(`${driver.name} ya es el chofer activo.`);
      return;
    }
    setDriverChangeMessage(null);
    const result = await updateUser(driver.id, { vehicleId: vehicle.id });
    if (!result.ok) {
      setDriverChangeMessage(result.message || 'No fue posible cambiar el chofer.');
      return;
    }
    await Promise.all([loadUsers(), loadVehicles(), loadHistory()]);
    setDriverSelectorVehicleId(null);
    setDriverChangeMessage(`Chofer activo actualizado: ${driver.name}.`);
  };

  const openSession = async (session: RouteSession) => {
    const requestId = ++detailRequestIdRef.current;
    setSelectedSessionId(session.id);
    setReplayIndex(0);
    setReplayPlaying(false);
    const cached = detailCache.current.get(session.id);
    if (cached) {
      setSessionDetail(cached);
      return;
    }
    setIsDetailLoading(true);
    setMessage(null);
    try {
      const [metrics, events, visits, positionsResult] = await Promise.all([
        getRouteSessionMetricsRequest(session.id),
        getRouteSessionEventsRequest(session.id, { limit: 5000 }),
        getRouteSessionCheckpointVisitsRequest(session.id, 5000),
        getRouteSessionPositionsRequest(session.id, { limit: replayPageSize, offset: 0 }),
      ]);
      const detail = {
        metrics,
        events,
        positions: positionsResult.items,
        positionsLimit: positionsResult.limit,
        positionsOffset: positionsResult.items.length,
        positionsTotal: positionsResult.total,
        visits,
      };
      detailCache.current.set(session.id, detail);
      if (detailRequestIdRef.current === requestId) setSessionDetail(detail);
    } catch (error) {
      if (detailRequestIdRef.current === requestId) {
        setMessage(getApiErrorMessage(error, 'No fue posible cargar el detalle de jornada.'));
        setSessionDetail(null);
      }
    } finally {
      if (detailRequestIdRef.current === requestId) setIsDetailLoading(false);
    }
  };

  const openSessionView = async (session: RouteSession) => {
    await openSession(session);
    router.push({ pathname: '/portal', params: { sessionId: session.id, vehicleId: session.vehicleId, view: 'detail' } } as never);
  };

  const loadMorePositions = async () => {
    if (!selectedSession || !sessionDetail || sessionDetail.positionsOffset >= sessionDetail.positionsTotal || positionsRequestRef.current) return;
    positionsRequestRef.current = true;
    setIsPositionsLoading(true);
    try {
      const result = await getRouteSessionPositionsRequest(selectedSession.id, {
        limit: replayPageSize,
        offset: sessionDetail.positionsOffset,
      });
      const nextDetail = {
        ...sessionDetail,
        positions: [...sessionDetail.positions, ...result.items],
        positionsLimit: result.limit,
        positionsOffset: sessionDetail.positionsOffset + result.items.length,
        positionsTotal: result.total,
      };
      detailCache.current.set(selectedSession.id, nextDetail);
      setSessionDetail(nextDetail);
    } catch (error) {
      setMessage(getApiErrorMessage(error, 'No fue posible cargar mas posiciones.'));
    } finally {
      positionsRequestRef.current = false;
      setIsPositionsLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedSessionId) return;
    const session = history.find((entry) => entry.id === selectedSessionId);
    if (session) void openSession(session);
  }, [history, selectedSessionId]);

  useEffect(() => {
    if (!replayPlaying || !sessionDetail?.positions.length) return undefined;
    const timer = window.setInterval(() => {
      setReplayIndex((current) => {
        const next = current + 1;
        if (next >= sessionDetail.positions.length) {
          setReplayPlaying(false);
          return sessionDetail.positions.length - 1;
        }
        return next;
      });
    }, Math.max(180, 900 / replaySpeed));
    return () => window.clearInterval(timer);
  }, [replayPlaying, replaySpeed, sessionDetail?.positions.length]);

  useEffect(() => {
    if (!replayPlaying || !sessionDetail || sessionDetail.positionsOffset >= sessionDetail.positionsTotal) return;
    if (replayIndex >= sessionDetail.positions.length - 80) {
      void loadMorePositions();
    }
  }, [replayIndex, replayPlaying, sessionDetail?.positions.length, sessionDetail?.positionsOffset, sessionDetail?.positionsTotal]);

  const setFilter = <T extends keyof Filters>(field: T, value: Filters[T]) => {
    setFilters((current) => ({ ...current, [field]: value }));
  };

  return (
    <PortalLayout
      compact={activeView === 'operations'}
      wide
      title={activeView === 'history' ? 'Historial de jornadas' : activeView === 'detail' ? 'Detalle de jornada' : 'Centro de operaciones'}
      subtitle={activeView === 'history' ? 'Consulta las jornadas guardadas por unidad, conductor y estado.' : activeView === 'detail' ? 'Recorrido, eventos y métricas persistidas de la jornada.' : undefined}
      actions={
        <Pressable accessibilityRole="button" onPress={activeView === 'operations' ? () => void loadHistory() : () => router.push('/portal' as never)} disabled={activeView === 'operations' && isLoading} style={[styles.actionButton, portalButtonGradient(), isLoading ? styles.disabledButton : undefined]}>
          <MaterialCommunityIcons name={activeView === 'operations' ? 'refresh' : 'arrow-left'} size={18} color={portalPalette.text} />
          <Text style={styles.actionText}>{activeView === 'operations' ? (isLoading ? 'Actualizando' : 'Actualizar') : 'Volver a operaciones'}</Text>
        </Pressable>
      }>
      {message ? (
        <View style={styles.notice}>
          <MaterialCommunityIcons name="alert-circle-outline" size={18} color={portalPalette.warning} />
          <Text style={styles.noticeText}>{message}</Text>
        </View>
      ) : null}

      {!isLoading && vehicles.length === 0 && users.filter((u) => u.role === 'driver').length === 0 ? (
        <PortalSectionCard title="Primeros pasos" subtitle="Tu cuenta está lista. Sigue estos pasos para comenzar.">
          <View style={styles.onboardingPrompt}>
            <MaterialCommunityIcons name="flag-checkered" size={36} color={portalPalette.accent} />
            <View style={styles.flex}>
              <Text style={styles.onboardingTitle}>Completa la configuración inicial</Text>
              <Text style={styles.unitMeta}>Registra tus unidades, asigna conductores y define rutas desde el panel de activación.</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/portal/onboarding' as never)}
              style={[styles.primaryButton, portalButtonGradient()]}>
              <Text style={styles.primaryText}>Ir a activación</Text>
              <MaterialCommunityIcons name="arrow-right" size={17} color={portalPalette.text} />
            </Pressable>
          </View>
        </PortalSectionCard>
      ) : null}

      {activeView === 'operations' ? (
      <View style={styles.mainOperationsGrid}>
        <View style={styles.operationsMapCol}>
          <View style={styles.mapSurface}>
            <View style={styles.mapHeader}>
              <View style={styles.mapModeControl}>
                <Pressable accessibilityRole="button" accessibilityState={{ expanded: mapModeMenuOpen }} onPress={() => setMapModeMenuOpen((open) => !open)} style={({ hovered, pressed }: any) => [styles.mapModeButton, hovered ? styles.controlHover : undefined, pressed ? styles.controlPressed : undefined]}>
                  <Text style={styles.mapModeText}>{mapMode === 'traffic' ? 'Tráfico en vivo' : mapMode === 'satellite' ? 'Vista satélite' : 'Mapa operativo'}</Text>
                  <MaterialCommunityIcons name={mapModeMenuOpen ? 'chevron-up' : 'chevron-down'} size={17} color={portalPalette.muted} />
                </Pressable>
                {mapModeMenuOpen ? (
                  <View style={styles.mapModeMenu}>
                    {([
                      ['operational', 'map-outline', 'Mapa operativo', 'Calles y rutas con alto contraste'],
                      ['traffic', 'car-multiple', 'Tráfico en vivo', 'Incidencias y circulación vial'],
                      ['satellite', 'satellite-variant', 'Vista satélite', 'Imagen aérea con nombres de calles'],
                    ] as const).map(([value, icon, label, description]) => (
                      <Pressable key={value} accessibilityRole="button" onPress={() => { setMapMode(value); setMapModeMenuOpen(false); }} style={({ hovered }: any) => [styles.mapModeOption, mapMode === value ? styles.mapModeOptionActive : undefined, hovered ? styles.controlHover : undefined]}>
                        <MaterialCommunityIcons name={icon} size={18} color={mapMode === value ? portalPalette.accent : portalPalette.muted} />
                        <View style={styles.flex}>
                          <Text style={styles.mapModeText}>{label}</Text>
                          <Text style={styles.mapModeDescription}>{description}</Text>
                        </View>
                        {mapMode === value ? <MaterialCommunityIcons name="check" size={16} color={portalPalette.success} /> : null}
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
              <View style={styles.operationsFilters}>
                {([
                  ['ALL', 'Todas'],
                  ['RUNNING', 'En jornada'],
                  ['STOPPED', 'Detenidas'],
                  ['OFF_ROUTE', 'Fuera de ruta'],
                ] as const).map(([value, label]) => (
                  <Pressable
                    key={value}
                    accessibilityRole="button"
                    accessibilityState={{ selected: operationsFilter === value }}
                    onPress={() => setOperationsFilter(value)}
                    style={({ hovered, pressed }: any) => [styles.operationsFilter, operationsFilter === value ? styles.operationsFilterActive : undefined, hovered ? styles.controlHover : undefined, pressed ? styles.controlPressed : undefined]}>
                    <View style={[styles.filterStatusDot, value === 'RUNNING' ? styles.filterStatusRunning : value === 'STOPPED' ? styles.filterStatusStopped : value === 'OFF_ROUTE' ? styles.filterStatusOffRoute : undefined]} />
                    <Text style={styles.operationsFilterText}>{label}</Text>
                    <Text style={styles.operationsFilterCount}>{operationsCounts[value]}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={styles.mapStage}>
              <Suspense fallback={<MapFallback height={620} />}>
                <OperationsMap
                  checkpoints={routeCheckpoints}
                  height={'clamp(360px, calc(100vh - 300px), 730px)'}
                  mapMode={mapMode}
                  onVehiclePress={openVehicle}
                  routeCoordinates={routeCoordinates}
                  selectedVehicleId={selectedVehicle?.id}
                  showTraffic={false}
                  vehicles={operationalVehicles}
                />
              </Suspense>
              {operationalVehicles.length ? (
                <View style={styles.unitSelectorOverlay}>
                  <Text style={styles.mapOverlayTitle}>Unidades en mapa</Text>
                  {operationalVehicles.map((vehicle) => (
                    <OperationalUnitCard
                      key={vehicle.id}
                      active={vehicle.id === selectedVehicle?.id}
                      activeSession={sessionsByVehicle.get(vehicle.id)?.find((session) => ['RUNNING', 'PAUSED'].includes(session.status)) || null}
                      latestSession={sessionsByVehicle.get(vehicle.id)?.[0] || null}
                      vehicle={vehicle}
                      onOpen={() => showRoute(vehicle)}
                    />
                  ))}
                </View>
              ) : null}
            </View>
          </View>
          <View style={styles.kpiRow}>
            {operationsKpis.map((kpi, index) => (
              <View key={kpi.label} style={[styles.kpiCard, index === operationsKpis.length - 1 ? styles.kpiCardLast : undefined]}>
                <View style={styles.kpiTop}>
                  <MaterialCommunityIcons name={kpi.icon} size={18} color={portalPalette.accent} />
                  <Text style={styles.kpiLabel}>{kpi.label}</Text>
                </View>
                <Text style={styles.kpiValue}>{kpi.value}</Text>
                <Text style={styles.kpiDetail}>{kpi.detail}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.operationsUnitsCol}>
          <PortalSectionCard compact title="Detalle de unidad" subtitle={selectedVehicle ? selectedVehicle.code : 'Sin unidad seleccionada'}>
            {selectedVehicle ? (
              <VehicleSidePanel
                activeSession={activeSession}
                latestSession={latestSession}
                recentEvents={sessionDetail?.events || []}
                users={users}
                vehicle={selectedVehicle}
                driverChangeMessage={driverChangeMessage}
                driverSelectorOpen={driverSelectorVehicleId === selectedVehicle.id}
                isChangingDriver={isSubmitting}
                onChangeDriver={(driver) => void changeDriver(selectedVehicle, driver)}
                onCloseDriverSelector={() => setDriverSelectorVehicleId(null)}
                onDriverSelectorOpen={() => setDriverSelectorVehicleId(selectedVehicle.id)}
                onHistory={() => openHistoryView(selectedVehicle.id)}
                onOpenSession={(session) => void openSessionView(session)}
                onRoute={() => showRoute(selectedVehicle)}
                onCenter={() => openVehicle(selectedVehicle)}
              />
            ) : (
              <EmptyState icon="bus-clock" title="Selecciona una unidad" description="El panel mostrará estado, ruta, métricas y jornada activa." />
            )}
          </PortalSectionCard>
        </View>
      </View>
      ) : null}

      {activeView === 'history' ? (
      <View style={styles.detailGrid}>
        <View style={styles.detailHistoryCol}>
          <PortalSectionCard title="Historial de jornadas" subtitle="Consulta los datos guardados por fecha, unidad, conductor y estado.">
            <HistoryFilters filters={filters} sessions={history} users={users} vehicles={vehicles} onChange={setFilter} />
            <Text style={styles.unitMeta}>
              Mostrando {history.length} de {historyTotal || history.length} jornadas. Página de {historyLimit}.
            </Text>
            {filteredSessions.length ? (
              <View style={styles.historyList}>
                {filteredSessions.map((session) => (
                  <SessionHistoryCard
                    key={session.id}
                    active={session.id === selectedSessionId}
                    driverName={getDriverName(users, session.driverId)}
                    routeLabel={getRouteLabel(vehicles.find((vehicle) => vehicle.id === session.vehicleId), session)}
                    session={session}
                     vehicleCode={vehicles.find((vehicle) => vehicle.id === session.vehicleId)?.code || 'Unidad'}
                    onOpen={() => void openSessionView(session)}
                  />
                ))}
                {history.length < historyTotal ? (
                  <Pressable accessibilityRole="button" onPress={() => void loadHistory({ append: true })} style={styles.secondaryButton}>
                    <Text style={styles.secondaryText}>{isLoading ? 'Cargando' : `Cargar más (${historyTotal - history.length})`}</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <EmptyState icon="history" title="Sin jornadas" description="Ajusta filtros o espera a que existan jornadas finalizadas." />
            )}
          </PortalSectionCard>
        </View>
      </View>
      ) : null}

      {activeView === 'detail' ? (
      <PortalSectionCard
        title="Detalle de jornada"
        subtitle={selectedSession ? `${vehicles.find((vehicle) => vehicle.id === selectedSession.vehicleId)?.code || 'Unidad'} / ${formatDate(selectedSession.startedAt)}` : 'Selecciona una jornada'}
        right={selectedSession ? <StatusBadge label={formatPortalStatus(selectedSession.status)} tone={getPortalStatusTone(selectedSession.status)} /> : null}>
        {selectedSession ? (
          <SessionDetailView
            detail={sessionDetail}
            isLoading={isDetailLoading}
            isPositionsLoading={isPositionsLoading}
            onLoadMorePositions={() => void loadMorePositions()}
            replayIndex={replayIndex}
            replayPath={replayPath}
            replayPlaying={replayPlaying}
            replayPosition={replayPosition}
            replaySpeed={replaySpeed}
            session={selectedSession}
            onEventSelect={(event) => {
              const nextIndex = sessionDetail?.positions.findIndex((position) => getTimestamp(position.timestamp) >= getTimestamp(event.timestamp)) ?? -1;
              if (nextIndex >= 0) setReplayIndex(nextIndex);
            }}
            onReplayIndexChange={setReplayIndex}
            onReplayPlayingChange={setReplayPlaying}
            onReplaySpeedChange={setReplaySpeed}
          />
        ) : (
          <View style={styles.replayEmptyNote}>
            <MaterialCommunityIcons name="clipboard-text-clock-outline" size={18} color={portalPalette.muted} />
            <Text style={styles.unitMeta}>Abre una jornada del historial para consultar sus datos.</Text>
          </View>
        )}
      </PortalSectionCard>
      ) : null}
    </PortalLayout>
  );
}

// Tarjeta de lista: solo lo que sirve para elegir una unidad de un vistazo.
// El detalle completo y las acciones viven en VehicleSidePanel, que se abre al tocarla.
function OperationalUnitCard({
  active,
  activeSession,
  latestSession,
  onOpen,
  vehicle,
}: {
  active: boolean;
  activeSession: RouteSession | null;
  latestSession: RouteSession | null;
  onOpen: () => void;
  vehicle: Vehicle;
}) {
  const session = activeSession || latestSession;
  const status = getVehicleStatus(vehicle, activeSession);
  const routeInfo = getRouteInfo(vehicle, session);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ver ${vehicle.code}`}
      onPress={onOpen}
      style={({ hovered, pressed }: any) => [styles.unitCard, active ? styles.unitCardActive : undefined, hovered ? styles.unitCardHover : undefined, pressed ? styles.controlPressed : undefined]}>
      <View style={styles.unitHeader}>
        <View style={styles.flex}>
          <Text style={styles.unitCode}>{vehicle.code}</Text>
          <Text style={styles.unitMeta} numberOfLines={1}>{vehicle.plate} · {routeInfo.label}</Text>
        </View>
        <StatusBadge label={status.label} tone={status.tone} />
      </View>
    </Pressable>
  );
}

function VehicleSidePanel({
  activeSession,
  driverChangeMessage,
  driverSelectorOpen,
  isChangingDriver,
  latestSession,
  onCenter,
  onChangeDriver,
  onCloseDriverSelector,
  onDriverSelectorOpen,
  onHistory,
  onOpenSession,
  onRoute,
  recentEvents,
  users,
  vehicle,
}: {
  activeSession: RouteSession | null;
  driverChangeMessage: string | null;
  driverSelectorOpen: boolean;
  isChangingDriver: boolean;
  latestSession: RouteSession | null;
  onCenter: () => void;
  onChangeDriver: (driver: User) => void;
  onCloseDriverSelector: () => void;
  onDriverSelectorOpen: () => void;
  onHistory: () => void;
  onOpenSession: (session: RouteSession) => void;
  onRoute: () => void;
  recentEvents: RouteEvent[];
  users: User[];
  vehicle: Vehicle;
}) {
  const session = activeSession || latestSession;
  const activeDriver = getActiveDriver(users, vehicle, activeSession);
  const assignedDrivers = getAssignedDrivers(users, vehicle, activeSession);
  const routeInfo = getRouteInfo(vehicle, session);
  const journeyState = getJourneyState(vehicle, session);
  const progress = getRouteProgressPercent(vehicle, session);
  // El estado de jornada ya sale como badge en el encabezado; no repetirlo en las alertas.
  const alerts = getOperationalAlerts(vehicle, session).filter((alert) => alert.label !== journeyState.label);
  return (
    <View style={styles.sidePanel}>
      <Text style={styles.sideSectionTitle}>Estado</Text>
      <View style={styles.sideHeader}>
        <MaterialCommunityIcons name="bus" size={24} color={portalPalette.accent} />
        <View style={styles.flex}>
          <Text style={styles.sideTitle}>{vehicle.code}</Text>
          <Text style={styles.sideMeta}>Placas {vehicle.plate}</Text>
        </View>
        <StatusBadge label={journeyState.label} tone={journeyState.tone} />
      </View>
      {alerts.length ? (
        <View style={styles.alertRow}>
          {alerts.map((alert) => <StatusBadge key={alert.label} label={alert.label} tone={alert.tone} />)}
        </View>
      ) : null}
      <Text style={styles.sideSectionTitle}>Ruta</Text>
      <View style={styles.routeSummaryLarge}>
        <View style={styles.routeIcon}>
          <MaterialCommunityIcons name="map-marker-path" size={18} color={portalPalette.text} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.routeTitle}>{routeInfo.label}</Text>
          {routeInfo.direction ? <Text style={styles.unitMeta}>{routeInfo.direction}</Text> : null}
          {routeInfo.code ? <Text style={styles.unitMeta}>{routeInfo.code}</Text> : null}
        </View>
      </View>
      {session ? <ProgressBar value={progress} /> : null}
      <View style={styles.sideHighlightRow}>
        <Fact label="Velocidad" value={formatSpeed(vehicle.speed)} />
        <Fact label="ETA" value={getEtaLabel(vehicle)} />
        <Fact label="Ultimo GPS" value={getLastGpsUpdate(vehicle)} />
      </View>
      <Text style={styles.sideSectionTitle}>Conductor</Text>
      <DriverProfile driver={activeDriver} title="Chofer actual" />
      {assignedDrivers.length > 1 || driverSelectorOpen ? (
        <View style={styles.assignedDriversPanel}>
          <View style={styles.inlineHeader}>
            <Text style={styles.panelTitle}>Choferes asignados ({assignedDrivers.length})</Text>
            {driverSelectorOpen ? (
              <Pressable accessibilityRole="button" onPress={onCloseDriverSelector} style={styles.iconButton}>
                <MaterialCommunityIcons name="close" size={16} color={portalPalette.text} />
              </Pressable>
            ) : null}
          </View>
          {driverSelectorOpen ? (
            <View style={styles.driverSelector}>
              {assignedDrivers.filter((driver) => driver.id !== activeDriver?.id).length ? (
                assignedDrivers.filter((driver) => driver.id !== activeDriver?.id).map((driver) => (
                  <Pressable
                    key={driver.id}
                    accessibilityRole="button"
                    disabled={isChangingDriver}
                    onPress={() => onChangeDriver(driver)}
                    style={[styles.driverOption, isChangingDriver ? styles.disabledAction : undefined]}>
                    <Text style={styles.driverRowText}>{driver.name}</Text>
                    <MaterialCommunityIcons name="check-circle-outline" size={16} color={portalPalette.accent} />
                  </Pressable>
                ))
              ) : (
                <Text style={styles.unitMeta}>No hay otro chofer asignado disponible para esta unidad.</Text>
              )}
            </View>
          ) : (
            assignedDrivers.map((driver) => (
              <View key={driver.id} style={styles.driverRow}>
                <Text style={styles.driverRowText} numberOfLines={1}>{driver.name}</Text>
                <StatusBadge label={driver.id === activeDriver?.id ? 'Activo' : driver.status || 'Asignado'} tone={driver.id === activeDriver?.id ? 'positive' : 'neutral'} />
              </View>
            ))
          )}
          {driverChangeMessage ? <Text style={styles.noticeInline}>{driverChangeMessage}</Text> : null}
        </View>
      ) : null}
      {driverChangeMessage && assignedDrivers.length <= 1 && !driverSelectorOpen ? (
        <Text style={styles.noticeInline}>{driverChangeMessage}</Text>
      ) : null}
      {session ? <Text style={styles.sideSectionTitle}>Metricas</Text> : null}
      {session ? (
        <View style={styles.metricGrid}>
          <Fact label="Tiempo activo" value={activeSession ? formatDuration((Date.now() - getTimestamp(activeSession.startedAt)) / 1000) : 'Sin jornada activa'} />
          <Fact label="Distancia" value={formatDistance(session.totalDistance)} />
          <Fact label="Vueltas" value={String(session.completedLaps ?? 0)} />
          <Fact label="Checkpoints" value={String(session.completedCheckpoints ?? 0)} />
          <Fact label="Detenido" value={formatDuration(session.stoppedTime)} />
          <Fact label="Productividad" value={formatPercent(session.metrics?.effectiveTimePercent)} />
        </View>
      ) : null}
      <Text style={styles.sideSectionTitle}>Eventos recientes</Text>
      {recentEvents.length ? (
        <View style={styles.recentTimeline}>
          {recentEvents.slice(0, 3).map((event) => (
            <View key={event.id} style={styles.recentTimelineItem}>
              <View style={styles.recentTimelineRail}>
                <View style={styles.recentTimelineDot} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.timelineTitle}>{getEventLabel(event.eventType)}</Text>
                <Text style={styles.unitMeta}>{formatDate(event.timestamp)}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.unitMeta}>Sin eventos registrados para la jornada.</Text>
      )}
      <View style={styles.sideActions}>
        <Text style={styles.sideSectionTitle}>Acciones</Text>
        {session ? (
          <Pressable accessibilityRole="button" onPress={() => onOpenSession(session)} style={[styles.primaryButton, portalButtonGradient()]}>
            <Text style={styles.primaryText}>Ver jornada</Text>
            <MaterialCommunityIcons name="arrow-right" size={17} color={portalPalette.text} />
          </Pressable>
        ) : null}
        <View style={styles.quickActions}>
          <QuickAction icon="routes" label="Ver ruta" onPress={onRoute} />
          <QuickAction icon="history" label="Historial" onPress={onHistory} />
          <QuickAction icon="account-switch-outline" label="Cambiar chofer" onPress={onDriverSelectorOpen} />
          <QuickAction icon="crosshairs-gps" label="Centrar unidad" onPress={onCenter} />
        </View>
      </View>
    </View>
  );
}

function DriverProfile({ driver, title }: { driver: User | null; title: string }) {
  const photo = driver?.avatarUrl || driver?.avatar || '';
  const license = getDriverLicense(driver);
  return (
    <View style={styles.driverProfile}>
      {photo ? (
        <img src={photo} alt={driver?.name || 'Chofer'} style={driverAvatarImageStyle} />
      ) : (
        <View style={styles.driverAvatar}>
          <Text style={styles.driverAvatarText}>{getDriverInitials(driver)}</Text>
        </View>
      )}
      <View style={styles.flex}>
        <Text style={styles.factLabel}>{title}</Text>
        <Text style={styles.driverName} numberOfLines={1}>{driver?.name || 'Sin chofer activo'}</Text>
        <Text style={styles.unitMeta}>{driver?.phone || 'Sin telefono'}</Text>
        <Text style={styles.unitMeta}>{driver?.status || driver?.userStatus || 'Sin estado'}{license ? ` / Lic. ${license}` : ''}{driver?.shift ? ` / Turno: ${driver.shift}` : ''}</Text>
      </View>
    </View>
  );
}

function ProgressBar({ value }: { value: number }) {
  const progress = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <View style={styles.progressBlock}>
      <View style={styles.inlineHeader}>
        <Text style={styles.factLabel}>Avance de ruta</Text>
        <Text style={styles.progressValue}>{progress}%</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress}%` }]} />
      </View>
    </View>
  );
}

function MapFallback({ height = 410 }: { height?: number }) {
  return (
    <View style={[styles.mapFallback, { minHeight: height }]}>
      <Text style={styles.loadingText}>Cargando mapa...</Text>
    </View>
  );
}

function FilterChip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.filterChip, active ? styles.filterChipActive : undefined]}>
      <Text style={styles.filterChipText}>{label}</Text>
    </Pressable>
  );
}

function HistoryFilters({
  filters,
  onChange,
  sessions,
  users,
  vehicles,
}: {
  filters: Filters;
  onChange: <T extends keyof Filters>(field: T, value: Filters[T]) => void;
  sessions: RouteSession[];
  users: User[];
  vehicles: Vehicle[];
}) {
  const [expanded, setExpanded] = useState(false);
  const drivers = users.filter((user) => user.role === 'driver');
  // Solo rutas con nombre resoluble: las que no lo tienen quedan como "Sin ruta asignada"
  // y como chip no filtran nada util.
  const routes = Array.from(new Set(sessions.map((session) => session.routeId).filter(Boolean)))
    .map((routeId) => ({
      id: routeId,
      label: getRouteLabel(vehicles.find((vehicle) => vehicle.routeId === routeId), sessions.find((session) => session.routeId === routeId)),
    }))
    .filter((route) => route.label !== 'Sin ruta asignada');
  const advancedCount = [filters.driverId, filters.routeId, filters.productivity].filter(Boolean).length;
  return (
    <View style={styles.filters}>
      <View style={styles.optionRow}>
        <FilterChip label="Todas" active={!filters.vehicleId} onPress={() => onChange('vehicleId', '')} />
        {vehicles.map((vehicle) => (
          <FilterChip key={vehicle.id} label={vehicle.code} active={filters.vehicleId === vehicle.id} onPress={() => onChange('vehicleId', vehicle.id)} />
        ))}
        <View style={styles.filterSeparator} />
        {statusFilters.map((status) => (
          <FilterChip
            key={status}
            label={status === 'ALL' ? 'Todos' : formatPortalStatus(status)}
            active={filters.status === status}
            onPress={() => onChange('status', status)}
          />
        ))}
      </View>
      <Pressable accessibilityRole="button" onPress={() => setExpanded((current) => !current)} style={styles.filterToggle}>
        <MaterialCommunityIcons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={portalPalette.muted} />
        <Text style={styles.filterToggleText}>
          {expanded ? 'Menos filtros' : advancedCount ? `Más filtros (${advancedCount})` : 'Más filtros'}
        </Text>
      </Pressable>
      {expanded ? (
        <View style={styles.filters}>
          {drivers.length ? (
            <View style={styles.optionRow}>
              <FilterChip label="Todos los choferes" active={!filters.driverId} onPress={() => onChange('driverId', '')} />
              {drivers.map((driver) => (
                <FilterChip key={driver.id} label={driver.name} active={filters.driverId === driver.id} onPress={() => onChange('driverId', driver.id)} />
              ))}
            </View>
          ) : null}
          {routes.length ? (
            <View style={styles.optionRow}>
              <FilterChip label="Todas las rutas" active={!filters.routeId} onPress={() => onChange('routeId', '')} />
              {routes.map((route) => (
                <FilterChip key={route.id} label={route.label} active={filters.routeId === route.id} onPress={() => onChange('routeId', route.id)} />
              ))}
            </View>
          ) : null}
          <View style={styles.formRow}>
            <TextInput
              value={filters.productivity}
              onChangeText={(value) => onChange('productivity', value.replace(/[^0-9.]/g, ''))}
              placeholder="Productividad minima"
              placeholderTextColor={portalPalette.muted}
              style={styles.filterInput}
            />
            <Text style={styles.factLabel}>Ordenar por</Text>
            {(['time', 'distance', 'laps'] as const).map((sortBy) => (
              <FilterChip
                key={sortBy}
                label={sortBy === 'time' ? 'Tiempo' : sortBy === 'distance' ? 'Distancia' : 'Vueltas'}
                active={filters.sortBy === sortBy}
                onPress={() => onChange('sortBy', sortBy)}
              />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function SessionHistoryCard({
  active,
  driverName,
  onOpen,
  routeLabel,
  session,
  vehicleCode,
}: {
  active: boolean;
  driverName: string;
  onOpen: () => void;
  routeLabel: string;
  session: RouteSession;
  vehicleCode: string;
}) {
  const distance = formatDistance(session.totalDistance);
  const productivity = formatPercent(session.metrics?.effectiveTimePercent);
  const meta = [
    formatDuration(session.totalDuration),
    distance !== '--' ? distance : null,
    `${session.completedLaps ?? 0} vueltas`,
    productivity !== 'Sin dato' ? `${productivity} productividad` : null,
  ].filter(Boolean).join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Abrir jornada de ${vehicleCode}`}
      onPress={onOpen}
      style={[styles.historyCard, active ? styles.historyCardActive : undefined]}>
      <View style={styles.unitHeader}>
        <View style={styles.flex}>
          <Text style={styles.historyTitle}>{vehicleCode} · {formatDate(session.startedAt)}</Text>
          <Text style={styles.unitMeta} numberOfLines={1}>{driverName} · {routeLabel}</Text>
        </View>
        <StatusBadge label={formatPortalStatus(session.status)} tone={getPortalStatusTone(session.status)} />
      </View>
      <Text style={styles.historyMeta}>{meta}</Text>
    </Pressable>
  );
}

function SessionDetailView({
  detail,
  isLoading,
  isPositionsLoading,
  onEventSelect,
  onLoadMorePositions,
  onReplayIndexChange,
  onReplayPlayingChange,
  onReplaySpeedChange,
  replayIndex,
  replayPath,
  replayPlaying,
  replayPosition,
  replaySpeed,
  session,
}: {
  detail: SessionDetail | null;
  isLoading: boolean;
  isPositionsLoading: boolean;
  onEventSelect: (event: RouteEvent) => void;
  onLoadMorePositions: () => void;
  onReplayIndexChange: (index: number) => void;
  onReplayPlayingChange: (playing: boolean) => void;
  onReplaySpeedChange: (speed: (typeof replaySpeeds)[number]) => void;
  replayIndex: number;
  replayPath: RouteSessionPosition[];
  replayPlaying: boolean;
  replayPosition: RouteSessionPosition | null;
  replaySpeed: (typeof replaySpeeds)[number];
  session: RouteSession;
}) {
  if (isLoading) {
    return <Text style={styles.loadingText}>Cargando jornada...</Text>;
  }
  if (!detail) {
    return (
      <View style={styles.replayEmptyNote}>
        <MaterialCommunityIcons name="database-search-outline" size={18} color={portalPalette.muted} />
        <Text style={styles.unitMeta}>Abre el detalle para consultar eventos y posiciones persistidas.</Text>
      </View>
    );
  }
  const maxIndex = Math.max(0, detail.positions.length - 1);
  const currentVisit = detail.visits.find((visit) => getTimestamp(visit.timestamp) <= getTimestamp(replayPosition?.timestamp));
  const hasMorePositions = detail.positionsOffset < detail.positionsTotal;
  const hasPositions = detail.positions.length > 0;
  return (
    <View style={styles.sessionDetail}>
      <View style={styles.metricGrid}>
        <Fact label="Duracion" value={formatDuration(session.totalDuration)} />
        <Fact label="Distancia" value={formatDistance(session.totalDistance)} />
        <Fact label="Vueltas" value={String(session.completedLaps ?? 0)} />
        <Fact label="Productividad" value={formatPercent(session.metrics?.effectiveTimePercent)} />
      </View>
      <View style={styles.operationsGrid}>
        <View style={styles.replayPanel}>
          <Suspense fallback={<MapFallback height={250} />}>
            <OperationsMap
              height={250}
              replayPath={replayPath}
              replayPosition={replayPosition}
              routeCoordinates={replayPath.map((position) => ({ latitude: position.latitude, longitude: position.longitude }))}
              variant="replay"
              vehicles={[]}
            />
          </Suspense>
          {hasPositions ? (
            <>
              <View style={styles.replayControls}>
                <QuickAction icon={replayPlaying ? 'pause' : 'play'} label={replayPlaying ? 'Pausar' : 'Reproducir'} onPress={() => onReplayPlayingChange(!replayPlaying)} />
                {replaySpeeds.map((speed) => (
                  <Pressable key={speed} onPress={() => onReplaySpeedChange(speed)} style={[styles.filterChip, replaySpeed === speed ? styles.filterChipActive : undefined]}>
                    <Text style={styles.filterChipText}>{speed}x</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.sliderTrack}>
                <View style={[styles.sliderFill, { width: `${maxIndex ? (replayIndex / maxIndex) * 100 : 0}%` }]} />
              </View>
              <View style={styles.replaySteps}>
                <Pressable onPress={() => onReplayIndexChange(Math.max(0, replayIndex - 1))} style={styles.secondaryButton}>
                  <Text style={styles.secondaryText}>Anterior</Text>
                </Pressable>
                <Pressable onPress={() => onReplayIndexChange(Math.min(maxIndex, replayIndex + 1))} style={styles.secondaryButton}>
                  <Text style={styles.secondaryText}>Siguiente</Text>
                </Pressable>
                {hasMorePositions ? (
                  <Pressable onPress={onLoadMorePositions} style={styles.secondaryButton}>
                    <Text style={styles.secondaryText}>{isPositionsLoading ? 'Cargando' : 'Cargar más posiciones'}</Text>
                  </Pressable>
                ) : null}
              </View>
              <View style={styles.metricGrid}>
                <Fact label="Hora" value={replayPosition ? formatDate(replayPosition.timestamp) : 'Sin posición'} />
                <Fact label="Velocidad" value={formatSpeed(replayPosition?.speed)} />
                <Fact label="Checkpoint" value={currentVisit ? `#${detail.visits.indexOf(currentVisit) + 1}` : 'Sin checkpoint'} />
                <Fact label="GPS" value={replayPosition?.gpsQuality || 'Sin calidad'} />
                <Fact label="Posiciones" value={`${detail.positions.length} / ${detail.positionsTotal || detail.positions.length}`} />
              </View>
            </>
          ) : (
            <View style={styles.replayEmptyNote}>
              <MaterialCommunityIcons name="information-outline" size={16} color={portalPalette.muted} />
              <Text style={styles.unitMeta}>La reproducción se activa cuando la jornada registra posiciones GPS. Los eventos siguen disponibles a un lado.</Text>
            </View>
          )}
        </View>

        <View style={styles.timelinePanel}>
          <Text style={styles.panelTitle}>Eventos del recorrido</Text>
          {detail.events.length ? (
            <View style={styles.timelineList}>
              {detail.events.map((event) => (
                <Pressable key={event.id} onPress={() => onEventSelect(event)} style={styles.timelineItem}>
                  <View style={styles.timelineDot}>
                    <MaterialCommunityIcons name={event.eventType === 'CHECKPOINT_REACHED' ? 'flag-checkered' : 'clock-outline'} size={14} color={portalPalette.text} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.timelineTitle}>{getEventLabel(event.eventType)}</Text>
                    <Text style={styles.unitMeta}>{formatDate(event.timestamp)}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ) : (
            <EmptyState icon="timeline-clock-outline" title="Sin eventos" description="La jornada no tiene eventos registrados." />
          )}
        </View>
      </View>
      <View style={styles.detailGrid}>
        <PortalSectionCard title="Checkpoints" subtitle={`${detail.visits.length} visitas persistidas`}>
          {detail.visits.length ? detail.visits.slice(0, 12).map((visit, index) => (
            <View key={visit.id} style={styles.compactRow}>
              <Text style={styles.compactTitle}>Checkpoint #{index + 1}</Text>
              <Text style={styles.unitMeta}>{formatDate(visit.timestamp)}</Text>
            </View>
          )) : <EmptyState icon="flag-outline" title="Sin checkpoints" description="No existen visitas registradas para esta jornada." />}
        </PortalSectionCard>
        <PortalSectionCard title="GPS" subtitle="Cobertura y precisión registradas">
          {hasPositions ? (
            <View style={styles.metricGrid}>
              <Fact label="Cobertura" value={formatPercent(detail.metrics?.metrics?.gpsCoveragePercent)} />
              <Fact label="Precision prom." value={detail.metrics?.averageGpsAccuracy ? `${detail.metrics.averageGpsAccuracy} m` : 'Sin dato'} />
              <Fact label="GOOD" value={formatPercent(detail.metrics?.metrics?.gpsQuality?.goodPercent)} />
              <Fact label="NORMAL" value={formatPercent(detail.metrics?.metrics?.gpsQuality?.normalPercent)} />
              <Fact label="BAD" value={formatPercent(detail.metrics?.metrics?.gpsQuality?.badPercent)} />
              <Fact label="Posiciones" value={String(detail.positions.length)} />
            </View>
          ) : (
            <EmptyState icon="satellite-variant" title="Sin datos de GPS" description="Esta jornada no registró posiciones GPS. No hay cobertura ni calidad para mostrar." />
          )}
        </PortalSectionCard>
      </View>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function QuickAction({ icon, label, onPress }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ hovered, pressed }: any) => [styles.quickAction, hovered ? styles.quickActionHover : undefined, pressed ? styles.controlPressed : undefined]}>
      <MaterialCommunityIcons name={icon} size={16} color={portalPalette.text} />
      <Text style={styles.quickActionText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  disabledButton: {
    opacity: 0.55,
  },
  actionButton: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    flexShrink: 0,
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 14,
  },
  actionText: {
    color: '#FFFFFF',
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '900',
  },
  alertRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  compactRow: {
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.xs,
    borderWidth: 1,
    gap: 2,
    padding: 10,
  },
  compactTitle: {
    color: portalPalette.text,
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '900',
  },
  assignedDriversPanel: {
    backgroundColor: portalPalette.surfaceSoft,
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    gap: 6,
    padding: 10,
  },
  detailGrid: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    minWidth: 0,
  },
  detailPanelCol: {
    flex: 0.8,
    flexBasis: 360,
    minWidth: 0,
  },
  detailHistoryCol: {
    flex: 1.8,
    flexBasis: 640,
    minWidth: 0,
  },
  disabledAction: {
    opacity: 0.55,
  },
  driverAvatar: {
    alignItems: 'center',
    backgroundColor: portalPalette.infoSoft,
    borderColor: portalPalette.info,
    borderRadius: 20,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  driverAvatarText: {
    color: portalPalette.text,
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '900',
  },
  driverName: {
    color: portalPalette.text,
    fontFamily: Typography.body,
    fontSize: 15,
    fontWeight: '900',
  },
  driverOption: {
    alignItems: 'center',
    backgroundColor: portalPalette.surface,
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.xs,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    minHeight: 38,
    paddingHorizontal: 10,
  },
  driverProfile: {
    alignItems: 'center',
    backgroundColor: portalPalette.surfaceSoft,
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    padding: 8,
  },
  driverRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    minWidth: 0,
  },
  driverRowText: {
    color: portalPalette.text,
    flex: 1,
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '900',
    minWidth: 0,
  },
  driverSelector: {
    gap: 8,
  },
  fact: {
    backgroundColor: portalPalette.surfaceSoft,
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.xs,
    borderWidth: 1,
    flex: 1,
    flexBasis: 108,
    gap: 2,
    minWidth: 0,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  factLabel: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '800',
  },
  factValue: {
    color: portalPalette.text,
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 18,
  },
  filterChip: {
    backgroundColor: portalPalette.surfaceSoft,
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.xs,
    borderWidth: 1,
    minHeight: 34,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  filterChipActive: {
    backgroundColor: portalPalette.infoSoft,
    borderColor: portalPalette.info,
  },
  filterChipText: {
    color: portalPalette.text,
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '900',
  },
  filterInput: {
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.xs,
    borderWidth: 1,
    color: portalPalette.text,
    flex: 1,
    flexBasis: 180,
    fontFamily: Typography.body,
    minHeight: 38,
    minWidth: 0,
    paddingHorizontal: 12,
  },
  filters: {
    gap: 6,
  },
  filterSeparator: {
    alignSelf: 'center',
    backgroundColor: portalPalette.line,
    height: 20,
    width: 1,
  },
  filterToggle: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 4,
    minHeight: 30,
  },
  filterToggleText: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '800',
  },
  flex: {
    flex: 1,
    minWidth: 0,
  },
  formRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    minWidth: 0,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: portalPalette.surface,
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.xs,
    borderWidth: 1,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  inlineHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    minWidth: 0,
  },
  historyCard: {
    backgroundColor: 'transparent',
    borderColor: portalPalette.line,
    borderBottomWidth: 1,
    gap: 3,
    minWidth: 0,
    paddingHorizontal: 4,
    paddingVertical: 9,
    width: '100%',
  },
  historyCardActive: {
    backgroundColor: portalPalette.surfaceSoft,
    borderColor: portalPalette.accent,
  },
  historyList: {
    gap: 0,
    minWidth: 0,
  },
  historyMeta: {
    color: portalPalette.text,
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
  },
  historyTitle: {
    color: portalPalette.text,
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '900',
  },
  loadingText: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 14,
  },
  mapFallback: {
    alignItems: 'center',
    backgroundColor: portalPalette.surfaceSoft,
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    justifyContent: 'center',
    padding: 18,
  },
  mapStage: {
    flex: 1,
    minWidth: 0,
    position: 'relative',
  },
  mapSurface: {
    backgroundColor: portalPalette.surface,
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flex: 1,
    overflow: 'hidden',
  },
  mapHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  mapModeButton: {
    alignItems: 'center', backgroundColor: portalPalette.surfaceSoft, borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.xs, borderWidth: 1, flexDirection: 'row', gap: 12, minHeight: 32, paddingHorizontal: 12,
  },
  mapModeControl: { position: 'relative', zIndex: 20 },
  mapModeMenu: {
    backgroundColor: 'rgba(8, 15, 29, 0.98)', borderColor: portalPalette.lineStrong, borderRadius: AppTheme.radius.sm,
    borderWidth: 1, boxShadow: '0 20px 48px rgba(0,0,0,.5)' as any, gap: 4, left: 0, padding: 6,
    position: 'absolute', top: 40, width: 270, zIndex: 30,
  },
  mapModeOption: { alignItems: 'center', borderRadius: AppTheme.radius.xs, flexDirection: 'row', gap: 9, minHeight: 54, paddingHorizontal: 10, paddingVertical: 7 },
  mapModeOptionActive: { backgroundColor: portalPalette.accentSoft },
  mapModeDescription: { color: portalPalette.muted, fontFamily: Typography.body, fontSize: 10, lineHeight: 14 },
  controlHover: { backgroundColor: 'rgba(255,255,255,.09)', borderColor: portalPalette.lineStrong },
  controlPressed: { opacity: 0.76, transform: [{ scale: 0.98 }] },
  mapModeText: { color: portalPalette.text, fontFamily: Typography.body, fontSize: 12, fontWeight: '900' },
  operationsFilters: {
    alignItems: 'center', flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', minWidth: 0,
  },
  operationsFilter: {
    alignItems: 'center', backgroundColor: 'rgba(8, 16, 32, 0.42)', borderColor: 'transparent', borderRadius: 18,
    borderWidth: 1, flexDirection: 'row', gap: 6, minHeight: 28, paddingHorizontal: 8,
  },
  operationsFilterActive: { backgroundColor: portalPalette.surfaceSoft, borderColor: portalPalette.line },
  operationsFilterText: { color: portalPalette.text, fontFamily: Typography.body, fontSize: 11, fontWeight: '900' },
  operationsFilterCount: { color: portalPalette.text, fontFamily: Typography.mono, fontSize: 11, fontWeight: '900', opacity: 0.8 },
  filterStatusDot: { backgroundColor: portalPalette.muted, borderRadius: 4, height: 7, width: 7 },
  filterStatusRunning: { backgroundColor: portalPalette.success },
  filterStatusStopped: { backgroundColor: portalPalette.danger },
  filterStatusOffRoute: { backgroundColor: portalPalette.warning },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    minWidth: 0,
  },
  notice: {
    alignItems: 'center',
    backgroundColor: portalPalette.warningSoft,
    borderColor: portalPalette.warning,
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    padding: 12,
  },
  noticeText: {
    color: portalPalette.text,
    flex: 1,
    fontFamily: Typography.body,
    fontSize: 13,
    minWidth: 0,
  },
  noticeInline: {
    color: portalPalette.warning,
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '800',
  },
  onboardingPrompt: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    minWidth: 0,
  },
  onboardingTitle: {
    color: portalPalette.text,
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '900',
    minWidth: 0,
  },
  operationsGrid: {
    alignItems: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    minWidth: 0,
  },
  mainOperationsGrid: {
    alignItems: 'stretch',
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 8,
    minWidth: 0,
  },
  operationsMapCol: {
    flex: 18,
    gap: 8,
    minWidth: 0,
  },
  operationsUnitsCol: {
    flex: 7,
    height: 'clamp(500px, calc(100vh - 164px), 880px)' as any,
    maxHeight: 'clamp(500px, calc(100vh - 164px), 880px)' as any,
    minHeight: 500,
    minWidth: 0,
    overflow: 'visible',
  },
  kpiRow: {
    backgroundColor: 'rgba(13, 23, 40, 0.9)', borderColor: portalPalette.line, borderRadius: AppTheme.radius.sm,
    borderWidth: 1, flexDirection: 'row', flexWrap: 'nowrap', minWidth: 0, overflow: 'hidden',
  },
  kpiCard: {
    backgroundColor: 'transparent', borderRightColor: portalPalette.line, borderRightWidth: 1, flex: 1, gap: 4, minHeight: 80,
    minWidth: 0, paddingHorizontal: 12, paddingVertical: 8,
    animation: 'operationsFadeIn 220ms ease-in-out both' as any,
  },
  kpiCardLast: { borderRightWidth: 0 },
  kpiTop: { alignItems: 'center', flexDirection: 'row', gap: 7, minWidth: 0 },
  kpiLabel: { color: portalPalette.muted, flexShrink: 1, fontFamily: Typography.body, fontSize: 11, fontWeight: '800' },
  kpiValue: { color: portalPalette.text, fontFamily: Typography.display, fontSize: 20, fontWeight: '900', lineHeight: 23 },
  kpiDetail: { color: portalPalette.muted, fontFamily: Typography.body, fontSize: 10, lineHeight: 14 },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    minWidth: 0,
  },
  panelTitle: {
    color: portalPalette.text,
    fontFamily: Typography.display,
    fontSize: 16,
    fontWeight: '900',
  },
  primaryButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: AppTheme.radius.sm,
    flexDirection: 'row',
    gap: 8,
    minHeight: 36,
    paddingHorizontal: 12,
  },
  primaryText: {
    color: '#FFFFFF',
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '900',
  },
  progressBlock: {
    gap: 4,
  },
  progressFill: {
    backgroundColor: portalPalette.accent,
    borderRadius: 999,
    height: '100%',
    transition: 'width 220ms ease-in-out' as any,
  },
  progressTrack: {
    backgroundColor: portalPalette.surfaceSoft,
    borderColor: portalPalette.line,
    borderRadius: 999,
    borderWidth: 1,
    height: 8,
    overflow: 'hidden',
  },
  progressValue: {
    color: portalPalette.text,
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '900',
  },
  quickAction: {
    alignItems: 'center',
    backgroundColor: portalPalette.surfaceSoft,
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.xs,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    minHeight: 32,
    paddingHorizontal: 8,
    transition: 'background-color 180ms ease-in-out, border-color 180ms ease-in-out, transform 180ms ease-in-out' as any,
  },
  quickActionHover: {
    backgroundColor: portalPalette.accentSoft,
    borderColor: portalPalette.lineStrong,
    transform: [{ translateY: -1 }],
  },
  quickActionText: {
    color: portalPalette.text,
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '900',
  },
  quickActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  sideActions: {
    gap: 4,
    marginTop: 'auto',
  },
  replayControls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  replayPanel: {
    flex: 1.2,
    flexBasis: 430,
    gap: 8,
    minWidth: 0,
  },
  replayEmptyNote: {
    alignItems: 'center',
    backgroundColor: portalPalette.surfaceSoft,
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.xs,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    padding: 10,
  },
  replaySteps: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  routeIcon: {
    alignItems: 'center',
    backgroundColor: portalPalette.accent,
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  routeSummaryLarge: {
    alignItems: 'flex-start',
    backgroundColor: portalPalette.surfaceSoft,
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    padding: 10,
  },
  routeTitle: {
    color: portalPalette.text,
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '900',
  },
  secondaryButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: portalPalette.surfaceSoft,
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.xs,
    borderWidth: 1,
    minHeight: 36,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  secondaryText: {
    color: portalPalette.text,
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '900',
  },
  sessionDetail: {
    gap: 10,
  },
  sideHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  sideMeta: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 12,
  },
  sidePanel: {
    flex: 1,
    gap: 4,
    animation: 'operationsFadeIn 200ms ease-in-out both' as any,
  },
  recentTimeline: {
    gap: 0,
  },
  recentTimelineDot: {
    backgroundColor: portalPalette.info,
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  recentTimelineItem: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: 8,
    minHeight: 36,
    transition: 'background-color 180ms ease-in-out, transform 180ms ease-in-out' as any,
  },
  recentTimelineRail: {
    alignItems: 'center',
    borderLeftColor: portalPalette.info,
    borderLeftWidth: 2,
    marginLeft: 5,
    paddingTop: 4,
    width: 12,
  },
  sideSectionTitle: {
    borderBottomColor: portalPalette.line,
    borderBottomWidth: 1,
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    paddingBottom: 4,
    textTransform: 'uppercase',
  },
  sideHighlightRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    minWidth: 0,
  },
  sideTitle: {
    color: portalPalette.text,
    fontFamily: Typography.display,
    fontSize: 18,
    fontWeight: '900',
  },
  sliderFill: {
    backgroundColor: portalPalette.accent,
    borderRadius: 999,
    height: '100%',
  },
  sliderTrack: {
    backgroundColor: portalPalette.surfaceSoft,
    borderRadius: 999,
    height: 8,
    overflow: 'hidden',
  },
  timelineDot: {
    alignItems: 'center',
    backgroundColor: portalPalette.info,
    borderRadius: 15,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  timelineItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  timelineList: {
    gap: 10,
  },
  timelinePanel: {
    flex: 1,
    flexBasis: 320,
    gap: 8,
    minWidth: 0,
  },
  timelineTitle: {
    color: portalPalette.text,
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '900',
  },
  unitCard: {
    backgroundColor: 'transparent',
    borderColor: portalPalette.line,
    borderBottomWidth: 1,
    minWidth: 0,
    paddingHorizontal: 4,
    paddingVertical: 4,
    transition: 'background-color 180ms ease-in-out, border-color 180ms ease-in-out, transform 180ms ease-in-out' as any,
  },
  unitCardActive: {
    backgroundColor: portalPalette.infoSoft,
    borderColor: portalPalette.accent,
  },
  unitCardHover: {
    backgroundColor: portalPalette.surfaceSoft,
    transform: [{ translateX: 2 }],
  },
  unitCode: {
    color: portalPalette.text,
    fontFamily: Typography.display,
    fontSize: 16,
    fontWeight: '900',
  },
  unitHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  unitSelectorOverlay: {
    backgroundColor: 'rgba(7, 14, 29, 0.78)',
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    bottom: 12,
    gap: 0,
    left: 12,
    backdropFilter: 'blur(16px)' as any,
    boxShadow: '0 16px 40px rgba(0,0,0,.32)' as any,
    maxHeight: 176,
    overflow: 'auto' as any,
    padding: 8,
    position: 'absolute',
    width: 240,
  },
  mapOverlayTitle: {
    color: portalPalette.text,
    fontFamily: Typography.display,
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 4,
  },
  unitMeta: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 12,
    lineHeight: 17,
  },
});
