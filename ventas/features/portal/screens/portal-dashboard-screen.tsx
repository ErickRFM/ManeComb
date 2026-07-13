import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { useLocalSearchParams } from '@/src/navigation/router';
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
import { formatDate } from '@/src/utils/format';
import { AccountSummaryCard, PortalSectionCard } from '../components/portal-cards';
import { PortalLayout } from '../components/portal-layout';
import { portalButtonGradient, portalPalette } from '../portal-theme';

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

const statusFilters = ['ALL', 'RUNNING', 'PAUSED', 'FINISHED', 'CANCELLED'] as const;
const historyPageSize = 50;
const replayPageSize = 800;
const maxRenderedReplayPoints = 900;
const replaySpeeds = [1, 2, 4] as const;
const OperationsMap = lazy(() => import('../components/operations-map').then((module) => ({ default: module.OperationsMap })));
const driverAvatarImageStyle: CSSProperties = {
  borderRadius: 24,
  height: 48,
  objectFit: 'cover',
  width: 48,
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function numberOrZero(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatDuration(seconds?: number | null) {
  const value = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  if (hours > 0) return `${hours} h ${minutes} min`;
  return `${minutes} min`;
}

function formatDistance(meters?: number | null) {
  const value = Number(meters);
  if (!Number.isFinite(value) || value <= 0) return '0 km';
  return `${(value / 1000).toLocaleString('es-MX', { maximumFractionDigits: 1 })} km`;
}

function formatSpeed(speed?: number | null) {
  const value = Number(speed);
  if (!Number.isFinite(value) || value < 0) return 'Sin dato';
  const kmh = value > 45 ? value : value * 3.6;
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

function getRouteInfo(vehicle?: Vehicle | null, session?: RouteSession | null): RouteInfo {
  const assignedRoute = vehicle?.assignedRoute || null;
  const route = assignedRoute?.route || null;
  const routeCode = vehicle?.routeCode || vehicle?.routeId || session?.routeId || '';
  const rawLabel = route?.label || vehicle?.routeName || assignedRoute?.destinationLabel || routeCode || 'Sin ruta asignada';
  const label = /^sin ruta/i.test(String(rawLabel).trim()) ? 'Sin ruta asignada' : String(rawLabel);
  const origin = assignedRoute?.originLabel || '';
  const destination = assignedRoute?.destinationLabel || '';
  const direction = origin && destination ? `${origin} -> ${destination}` : destination || origin || 'Sin sentido registrado';
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
    code: routeCode ? `Codigo ${routeCode}` : 'Sin codigo',
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
  const ageMs = Date.now() - getTimestamp(vehicle.locationTimestamp);
  if (Number.isFinite(ageMs) && ageMs > 120000 && session?.status !== 'FINISHED') {
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
  if (session.status === 'RUNNING') return { label: 'En ruta', tone: 'positive' };
  if (session.status === 'PAUSED') return { label: 'Pausado', tone: 'warning' };
  if (session.status === 'FINISHED') return { label: 'Finalizado', tone: 'info' };
  return { label: session.status, tone: session.status === 'CANCELLED' ? 'danger' : 'neutral' };
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

function getOperationalAlerts(vehicle: Vehicle, session?: RouteSession | null) {
  const alerts: { label: string; tone: StatusBadgeTone }[] = [];
  const gps = getGpsState(vehicle, session);
  if (vehicle.activeRouteProgress?.isOffRoute) alerts.push({ label: 'Fuera de ruta', tone: 'danger' });
  if (gps.stale) alerts.push({ label: gps.label, tone: 'warning' });
  if (session?.status === 'PAUSED') alerts.push({ label: 'Pausado', tone: 'warning' });
  if (session && session.status !== 'FINISHED' && Number(vehicle.speed) <= 0.8 && Number(session.stoppedTime) > 300) {
    alerts.push({ label: 'Detenido demasiado tiempo', tone: 'warning' });
  }
  return alerts;
}

function getTodaySessions(sessions: RouteSession[]) {
  const today = new Date().toISOString().slice(0, 10);
  return sessions.filter((session) => String(session.startedAt || '').slice(0, 10) === today);
}

export function PortalDashboardScreen() {
  const params = useLocalSearchParams<{ vehicleId?: string | string[]; sessionId?: string | string[] }>();
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

  useEffect(() => {
    void loadUsers();
    void loadVehicles();
  }, [loadUsers, loadVehicles]);

  const loadHistory = async ({ append = false } = {}) => {
    setIsLoading(true);
    setMessage(null);
    try {
      const offset = append ? history.length : 0;
      const result = await getRouteSessionHistoryRequest({
        driverId: filters.driverId || undefined,
        limit: historyPageSize,
        offset,
        routeId: filters.routeId || undefined,
        status: filters.status !== 'ALL' ? filters.status as RouteSession['status'] : undefined,
        vehicleId: filters.vehicleId || undefined,
      });
      setHistory((current) => (append ? [...current, ...result.items] : result.items));
      setHistoryLimit(result.limit);
      setHistoryTotal(result.total);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible cargar jornadas.');
    } finally {
      setIsLoading(false);
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
  const todaySessions = getTodaySessions(history);

  const summary = useMemo(() => {
    const activeVehicleIds = new Set(history.filter((session) => ['RUNNING', 'PAUSED'].includes(session.status)).map((session) => session.vehicleId));
    const stoppedUnits = vehicles.filter((vehicle) => {
      const speed = Number((vehicle as Vehicle & { speed?: number }).speed);
      return activeVehicleIds.has(vehicle.id) && Number.isFinite(speed) && speed <= 0.8;
    }).length;
    const completedToday = todaySessions.filter((session) => session.status === 'FINISHED');
    const productivityValues = completedToday.map(getSessionProductivity).filter((value) => value > 0);
    return {
      activeUnits: activeVehicleIds.size,
      distanceToday: completedToday.reduce((sum, session) => sum + numberOrZero(session.totalDistance), 0),
      gpsLost: completedToday.reduce((sum, session) => sum + numberOrZero(session.gpsLostEvents), 0),
      lapsToday: completedToday.reduce((sum, session) => sum + numberOrZero(session.completedLaps), 0),
      offRoute: completedToday.reduce((sum, session) => sum + numberOrZero(session.offRouteEvents), 0),
      productivity:
        productivityValues.length > 0
          ? productivityValues.reduce((sum, value) => sum + value, 0) / productivityValues.length
          : 0,
      stoppedTime: completedToday.reduce((sum, session) => sum + numberOrZero(session.stoppedTime), 0),
      stoppedUnits,
    };
  }, [history, todaySessions, vehicles]);

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
      setSessionDetail(detail);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible cargar el detalle de jornada.');
      setSessionDetail(null);
    } finally {
      setIsDetailLoading(false);
    }
  };

  const loadMorePositions = async () => {
    if (!selectedSession || !sessionDetail || sessionDetail.positionsOffset >= sessionDetail.positionsTotal || isPositionsLoading) return;
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
      setMessage(error instanceof Error ? error.message : 'No fue posible cargar mas posiciones.');
    } finally {
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
      title="Centro de operaciones"
      subtitle="Supervision de flota, jornadas historicas, timeline y replay usando metricas persistidas."
      actions={
        <Pressable accessibilityRole="button" onPress={() => void loadHistory()} style={[styles.actionButton, portalButtonGradient()]}>
          <MaterialCommunityIcons name="refresh" size={18} color="#FFFFFF" />
          <Text style={styles.actionText}>{isLoading ? 'Actualizando' : 'Actualizar'}</Text>
        </Pressable>
      }>
      {message ? (
        <View style={styles.notice}>
          <MaterialCommunityIcons name="alert-circle-outline" size={18} color={portalPalette.warning} />
          <Text style={styles.noticeText}>{message}</Text>
        </View>
      ) : null}

      <View style={styles.summaryGrid}>
        <AccountSummaryCard icon="bus-clock" label="Activas" value={String(summary.activeUnits)} detail="Unidades en jornada" tone="positive" />
        <AccountSummaryCard icon="pause-circle-outline" label="Detenidas" value={String(summary.stoppedUnits)} detail="Velocidad actual baja" tone={summary.stoppedUnits > 0 ? 'warning' : 'neutral'} />
        <AccountSummaryCard icon="map-marker-off-outline" label="Fuera de ruta" value={String(summary.offRoute)} detail="Eventos finalizados hoy" tone={summary.offRoute > 0 ? 'danger' : 'neutral'} />
        <AccountSummaryCard icon="satellite-variant" label="GPS perdido" value={String(summary.gpsLost)} detail="Eventos finalizados hoy" tone={summary.gpsLost > 0 ? 'warning' : 'neutral'} />
        <AccountSummaryCard icon="speedometer" label="Productividad" value={formatPercent(summary.productivity)} detail="Promedio de jornadas de hoy" tone="info" />
        <AccountSummaryCard icon="map-marker-distance" label="Distancia hoy" value={formatDistance(summary.distanceToday)} detail={`${summary.lapsToday} vueltas registradas`} tone="info" />
      </View>

      <View style={styles.operationsGrid}>
        <PortalSectionCard title="Mapa operativo" subtitle="Posicion real disponible por unidad y ruta asignada.">
          <Suspense fallback={<MapFallback />}>
            <OperationsMap
              checkpoints={routeCheckpoints}
              onVehiclePress={openVehicle}
              routeCoordinates={routeCoordinates}
              selectedVehicleId={selectedVehicle?.id}
              vehicles={vehicles}
            />
          </Suspense>
        </PortalSectionCard>

        <PortalSectionCard title="Unidades" subtitle={`${vehicles.length} unidades registradas`}>
          {vehicles.length ? (
            <View style={styles.unitList}>
              {vehicles.map((vehicle) => (
                <OperationalUnitCard
                  key={vehicle.id}
                  active={vehicle.id === selectedVehicle?.id}
                  activeSession={sessionsByVehicle.get(vehicle.id)?.find((session) => ['RUNNING', 'PAUSED'].includes(session.status)) || null}
                  latestSession={sessionsByVehicle.get(vehicle.id)?.[0] || null}
                  users={users}
                  vehicle={vehicle}
                  onCenter={() => openVehicle(vehicle)}
                  onHistory={() => {
                    setSelectedVehicleId(vehicle.id);
                    setFilter('vehicleId', vehicle.id);
                  }}
                  onRoute={() => showRoute(vehicle)}
                  onDriver={() => {
                    setSelectedVehicleId(vehicle.id);
                    setDriverSelectorVehicleId(vehicle.id);
                  }}
                />
              ))}
            </View>
          ) : (
            <EmptyState icon="bus-alert" title="Sin unidades" description="Registra unidades reales para iniciar la operacion." />
          )}
        </PortalSectionCard>
      </View>

      <View style={styles.detailGrid}>
        <PortalSectionCard title="Panel lateral de unidad" subtitle={selectedVehicle ? selectedVehicle.code : 'Sin unidad seleccionada'}>
          {selectedVehicle ? (
            <VehicleSidePanel
              activeSession={activeSession}
              latestSession={latestSession}
              users={users}
              vehicle={selectedVehicle}
              driverChangeMessage={driverChangeMessage}
              driverSelectorOpen={driverSelectorVehicleId === selectedVehicle.id}
              isChangingDriver={isSubmitting}
              onChangeDriver={(driver) => void changeDriver(selectedVehicle, driver)}
              onCloseDriverSelector={() => setDriverSelectorVehicleId(null)}
              onDriverSelectorOpen={() => setDriverSelectorVehicleId(selectedVehicle.id)}
              onHistory={() => setFilter('vehicleId', selectedVehicle.id)}
              onOpenSession={(session) => void openSession(session)}
              onRoute={() => showRoute(selectedVehicle)}
              onCenter={() => openVehicle(selectedVehicle)}
            />
          ) : (
            <EmptyState icon="bus-clock" title="Selecciona una unidad" description="El panel mostrara estado, ruta, metricas y jornada activa." />
          )}
        </PortalSectionCard>

        <PortalSectionCard title="Historial de jornadas" subtitle="Ordenado y filtrado con metricas persistidas.">
          <HistoryFilters filters={filters} sessions={history} users={users} vehicles={vehicles} onChange={setFilter} />
          <Text style={styles.unitMeta}>
            Mostrando {history.length} de {historyTotal || history.length} jornadas. Pagina de {historyLimit}.
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
                  vehicleCode={vehicles.find((vehicle) => vehicle.id === session.vehicleId)?.code || session.vehicleId}
                  onOpen={() => void openSession(session)}
                />
              ))}
              {history.length < historyTotal ? (
                <Pressable accessibilityRole="button" onPress={() => void loadHistory({ append: true })} style={styles.secondaryButton}>
                  <Text style={styles.secondaryText}>{isLoading ? 'Cargando' : `Cargar mas (${historyTotal - history.length})`}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <EmptyState icon="history" title="Sin jornadas" description="Ajusta filtros o espera a que existan jornadas finalizadas." />
          )}
        </PortalSectionCard>
      </View>

      <PortalSectionCard
        title="Detalle de jornada"
        subtitle={selectedSession ? `${selectedSession.vehicleId} / ${formatDate(selectedSession.startedAt)}` : 'Selecciona una jornada'}
        right={selectedSession ? <StatusBadge label={selectedSession.status} tone={selectedSession.status === 'FINISHED' ? 'positive' : 'info'} /> : null}>
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
          <EmptyState icon="clipboard-text-clock-outline" title="Sin jornada seleccionada" description="Abre una jornada del historial para consultar metricas, eventos y replay." />
        )}
      </PortalSectionCard>
    </PortalLayout>
  );
}

function OperationalUnitCard({
  active,
  activeSession,
  latestSession,
  onCenter,
  onDriver,
  onHistory,
  onRoute,
  users,
  vehicle,
}: {
  active: boolean;
  activeSession: RouteSession | null;
  latestSession: RouteSession | null;
  onCenter: () => void;
  onDriver: () => void;
  onHistory: () => void;
  onRoute: () => void;
  users: User[];
  vehicle: Vehicle;
}) {
  const status = getVehicleStatus(vehicle, activeSession);
  const routeInfo = getRouteInfo(vehicle, activeSession || latestSession);
  const journeyState = getJourneyState(vehicle, activeSession || latestSession);
  const assignedDrivers = getAssignedDrivers(users, vehicle, activeSession);
  const activeDriver = getActiveDriver(users, vehicle, activeSession);
  const progress = getRouteProgressPercent(vehicle, activeSession || latestSession);
  const alerts = getOperationalAlerts(vehicle, activeSession || latestSession);
  return (
    <View style={[styles.unitCard, active ? styles.unitCardActive : undefined]}>
      <View style={styles.unitHeader}>
        <View>
          <Text style={styles.unitCode}>{vehicle.code}</Text>
          <Text style={styles.unitMeta}>Placas {vehicle.plate}</Text>
        </View>
        <StatusBadge label={status.label} tone={status.tone} />
      </View>
      {alerts.length ? (
        <View style={styles.alertRow}>
          {alerts.map((alert) => <StatusBadge key={alert.label} label={alert.label} tone={alert.tone} />)}
        </View>
      ) : null}
      <View style={styles.routeSummary}>
        <View style={styles.routeIcon}>
          <MaterialCommunityIcons name="routes" size={18} color="#FFFFFF" />
        </View>
        <View style={styles.flex}>
          <Text style={styles.routeTitle} numberOfLines={1}>{routeInfo.label}</Text>
          <Text style={styles.unitMeta} numberOfLines={1}>{routeInfo.direction}</Text>
          <Text style={styles.unitMeta}>{routeInfo.code} / {routeInfo.status}</Text>
        </View>
      </View>
      <ProgressBar value={progress} />
      <View style={styles.unitFacts}>
        <Fact label="Chofer activo" value={activeDriver?.name || vehicle.driverName || 'Sin chofer'} />
        <Fact label="Choferes" value={assignedDrivers.length > 1 ? `${assignedDrivers.length} asignados` : assignedDrivers[0]?.name || 'Sin asignacion'} />
        <Fact label="Tiempo activo" value={activeSession ? formatDuration((Date.now() - getTimestamp(activeSession.startedAt)) / 1000) : 'Sin jornada'} />
        <Fact label="Velocidad" value={formatSpeed(vehicle.speed)} />
        <Fact label="Avance" value={`${progress}%`} />
        <Fact label="Jornada" value={journeyState.label} />
        <Fact label="GPS" value={vehicle.location ? getLastGpsUpdate(vehicle) : 'Sin posicion'} />
      </View>
      <View style={styles.quickActions}>
        <QuickAction icon="routes" label="Ver ruta" onPress={onRoute} />
        <QuickAction icon="history" label="Historial" onPress={onHistory} />
        <QuickAction icon="account-switch-outline" label="Cambiar chofer" onPress={onDriver} />
        <QuickAction icon="crosshairs-gps" label="Centrar unidad" onPress={onCenter} />
      </View>
    </View>
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
  users: User[];
  vehicle: Vehicle;
}) {
  const session = activeSession || latestSession;
  const activeDriver = getActiveDriver(users, vehicle, activeSession);
  const assignedDrivers = getAssignedDrivers(users, vehicle, activeSession);
  const routeInfo = getRouteInfo(vehicle, session);
  const journeyState = getJourneyState(vehicle, session);
  const progress = getRouteProgressPercent(vehicle, session);
  const alerts = getOperationalAlerts(vehicle, session);
  return (
    <View style={styles.sidePanel}>
      <View style={styles.sideHeader}>
        <MaterialCommunityIcons name="bus" size={24} color={portalPalette.accent} />
        <View style={styles.flex}>
          <Text style={styles.sideTitle}>{vehicle.code}</Text>
          <Text style={styles.sideMeta}>{routeInfo.label} / {vehicle.plate}</Text>
        </View>
        <StatusBadge label={journeyState.label} tone={journeyState.tone} />
      </View>
      {alerts.length ? (
        <View style={styles.alertRow}>
          {alerts.map((alert) => <StatusBadge key={alert.label} label={alert.label} tone={alert.tone} />)}
        </View>
      ) : null}
      <View style={styles.routeSummaryLarge}>
        <View style={styles.routeIcon}>
          <MaterialCommunityIcons name="map-marker-path" size={18} color="#FFFFFF" />
        </View>
        <View style={styles.flex}>
          <Text style={styles.routeTitle}>{routeInfo.label}</Text>
          <Text style={styles.unitMeta}>{routeInfo.code}</Text>
          <Text style={styles.unitMeta}>{routeInfo.direction}</Text>
          <Text style={styles.unitMeta}>{routeInfo.status}</Text>
        </View>
      </View>
      <ProgressBar value={progress} />
      <View style={styles.sideHighlightRow}>
        <Fact label="Velocidad" value={formatSpeed(vehicle.speed)} />
        <Fact label="Avance" value={`${progress}%`} />
        <Fact label="ETA" value={getEtaLabel(vehicle)} />
      </View>
      <DriverProfile driver={activeDriver} title="Chofer actual" />
      <View style={styles.assignedDriversPanel}>
        <View style={styles.inlineHeader}>
          <Text style={styles.panelTitle}>Choferes asignados ({assignedDrivers.length})</Text>
          {driverSelectorOpen ? (
            <Pressable accessibilityRole="button" onPress={onCloseDriverSelector} style={styles.iconButton}>
              <MaterialCommunityIcons name="close" size={16} color={portalPalette.text} />
            </Pressable>
          ) : null}
        </View>
        {assignedDrivers.length ? assignedDrivers.map((driver) => (
          <View key={driver.id} style={styles.driverRow}>
            <Text style={styles.driverRowText} numberOfLines={1}>
              {driver.name}{driver.id === activeDriver?.id ? ' - Activo' : ''}
            </Text>
            <StatusBadge label={driver.id === activeDriver?.id ? 'Activo' : driver.status || 'Asignado'} tone={driver.id === activeDriver?.id ? 'positive' : 'neutral'} />
          </View>
        )) : (
          <Text style={styles.unitMeta}>No hay choferes asignados a esta unidad.</Text>
        )}
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
        ) : null}
        {driverChangeMessage ? <Text style={styles.noticeInline}>{driverChangeMessage}</Text> : null}
      </View>
      <View style={styles.metricGrid}>
        <Fact label="Tiempo activo" value={activeSession ? formatDuration((Date.now() - getTimestamp(activeSession.startedAt)) / 1000) : 'Sin jornada activa'} />
        <Fact label="Distancia" value={formatDistance(session?.totalDistance)} />
        <Fact label="Ultimo GPS" value={getLastGpsUpdate(vehicle)} />
        <Fact label="Checkpoints" value={String(session?.completedCheckpoints ?? 0)} />
        <Fact label="Vueltas" value={String(session?.completedLaps ?? 0)} />
        <Fact label="Detenido" value={formatDuration(session?.stoppedTime)} />
        <Fact label="Fuera de ruta" value={formatDuration(session?.offRouteTime)} />
        <Fact label="Cobertura GPS" value={formatPercent(session?.metrics?.gpsCoveragePercent)} />
        <Fact label="Productividad" value={formatPercent(session?.metrics?.effectiveTimePercent)} />
      </View>
      {session ? (
        <Pressable accessibilityRole="button" onPress={() => onOpenSession(session)} style={[styles.primaryButton, portalButtonGradient()]}>
          <Text style={styles.primaryText}>Ver jornada</Text>
          <MaterialCommunityIcons name="arrow-right" size={17} color="#FFFFFF" />
        </Pressable>
      ) : null}
      <View style={styles.quickActions}>
        <QuickAction icon="routes" label="Ver ruta" onPress={onRoute} />
        <QuickAction icon="history" label="Historial" onPress={onHistory} />
        <QuickAction icon="account-switch-outline" label="Cambiar chofer" onPress={onDriverSelectorOpen} />
        <QuickAction icon="crosshairs-gps" label="Centrar unidad" onPress={onCenter} />
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
        <Text style={styles.unitMeta}>{driver?.status || driver?.userStatus || 'Sin estado'}{license ? ` / Lic. ${license}` : ''}</Text>
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
  const routes = Array.from(new Set(sessions.map((session) => session.routeId).filter(Boolean)));
  return (
    <View style={styles.filters}>
      <SelectPill label="Unidad" value={filters.vehicleId || 'Todas'} onClear={() => onChange('vehicleId', '')} />
      <View style={styles.optionRow}>
        {vehicles.slice(0, 8).map((vehicle) => (
          <Pressable key={vehicle.id} onPress={() => onChange('vehicleId', vehicle.id)} style={[styles.filterChip, filters.vehicleId === vehicle.id ? styles.filterChipActive : undefined]}>
            <Text style={styles.filterChipText}>{vehicle.code}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.optionRow}>
        {statusFilters.map((status) => (
          <Pressable key={status} onPress={() => onChange('status', status)} style={[styles.filterChip, filters.status === status ? styles.filterChipActive : undefined]}>
            <Text style={styles.filterChipText}>{status === 'ALL' ? 'Todos' : status}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.optionRow}>
        {users.filter((user) => user.role === 'driver').slice(0, 6).map((driver) => (
          <Pressable key={driver.id} onPress={() => onChange('driverId', driver.id)} style={[styles.filterChip, filters.driverId === driver.id ? styles.filterChipActive : undefined]}>
            <Text style={styles.filterChipText}>{driver.name}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.optionRow}>
        {routes.slice(0, 6).map((routeId) => (
          <Pressable key={routeId} onPress={() => onChange('routeId', routeId)} style={[styles.filterChip, filters.routeId === routeId ? styles.filterChipActive : undefined]}>
            <Text style={styles.filterChipText}>{routeId}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.formRow}>
        <TextInput
          value={filters.productivity}
          onChangeText={(value) => onChange('productivity', value.replace(/[^0-9.]/g, ''))}
          placeholder="Productividad minima"
          placeholderTextColor={portalPalette.muted}
          style={styles.filterInput}
        />
        {(['time', 'distance', 'laps'] as const).map((sortBy) => (
          <Pressable key={sortBy} onPress={() => onChange('sortBy', sortBy)} style={[styles.filterChip, filters.sortBy === sortBy ? styles.filterChipActive : undefined]}>
            <Text style={styles.filterChipText}>{sortBy === 'time' ? 'Tiempo' : sortBy === 'distance' ? 'Distancia' : 'Vueltas'}</Text>
          </Pressable>
        ))}
      </View>
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
  return (
    <View style={[styles.historyCard, active ? styles.historyCardActive : undefined]}>
      <View style={styles.unitHeader}>
        <View style={styles.flex}>
          <Text style={styles.historyTitle}>{vehicleCode} / {formatDate(session.startedAt)}</Text>
          <Text style={styles.unitMeta}>{driverName} / {routeLabel}</Text>
        </View>
        <StatusBadge label={session.status} tone={session.status === 'FINISHED' ? 'positive' : session.status === 'CANCELLED' ? 'danger' : 'info'} />
      </View>
      <View style={styles.unitFacts}>
        <Fact label="Duracion" value={formatDuration(session.totalDuration)} />
        <Fact label="Distancia" value={formatDistance(session.totalDistance)} />
        <Fact label="Vueltas" value={String(session.completedLaps ?? 0)} />
        <Fact label="Productividad" value={formatPercent(session.metrics?.effectiveTimePercent)} />
      </View>
      <Pressable accessibilityRole="button" onPress={onOpen} style={styles.secondaryButton}>
        <Text style={styles.secondaryText}>Abrir detalle</Text>
      </Pressable>
    </View>
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
    return <EmptyState icon="database-search-outline" title="Detalle no cargado" description="Abre el detalle para consultar eventos y posiciones persistidas." />;
  }
  const maxIndex = Math.max(0, detail.positions.length - 1);
  const currentVisit = detail.visits.find((visit) => getTimestamp(visit.timestamp) <= getTimestamp(replayPosition?.timestamp));
  const hasMorePositions = detail.positionsOffset < detail.positionsTotal;
  return (
    <View style={styles.sessionDetail}>
      <View style={styles.summaryGrid}>
        <AccountSummaryCard icon="clock-outline" label="Duracion" value={formatDuration(session.totalDuration)} detail="Persistida en jornada" tone="info" />
        <AccountSummaryCard icon="map-marker-distance" label="Distancia" value={formatDistance(session.totalDistance)} detail="Persistida en jornada" tone="info" />
        <AccountSummaryCard icon="flag-checkered" label="Vueltas" value={String(session.completedLaps ?? 0)} detail={`${session.completedCheckpoints ?? 0} checkpoints`} tone="positive" />
        <AccountSummaryCard icon="chart-timeline-variant" label="Productividad" value={formatPercent(session.metrics?.effectiveTimePercent)} detail="Tiempo efectivo / duracion" tone="positive" />
      </View>
      <View style={styles.operationsGrid}>
        <View style={styles.replayPanel}>
          <Suspense fallback={<MapFallback height={250} />}>
            <OperationsMap
              height={250}
              replayPath={replayPath}
              replayPosition={replayPosition}
              routeCoordinates={replayPath.map((position) => ({ latitude: position.latitude, longitude: position.longitude }))}
              vehicles={[]}
            />
          </Suspense>
          <View style={styles.replayControls}>
            <QuickAction icon={replayPlaying ? 'pause' : 'play'} label={replayPlaying ? 'Pause' : 'Play'} onPress={() => onReplayPlayingChange(!replayPlaying)} />
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
                <Text style={styles.secondaryText}>{isPositionsLoading ? 'Cargando' : 'Cargar mas posiciones'}</Text>
              </Pressable>
            ) : null}
          </View>
          <View style={styles.metricGrid}>
            <Fact label="Hora" value={replayPosition ? formatDate(replayPosition.timestamp) : 'Sin posicion'} />
            <Fact label="Velocidad" value={formatSpeed(replayPosition?.speed)} />
            <Fact label="Checkpoint" value={currentVisit?.checkpointId || 'Sin checkpoint'} />
            <Fact label="GPS" value={replayPosition?.gpsQuality || 'Sin calidad'} />
            <Fact label="Posiciones" value={`${detail.positions.length} / ${detail.positionsTotal || detail.positions.length}`} />
          </View>
        </View>

        <View style={styles.timelinePanel}>
          <Text style={styles.panelTitle}>Timeline</Text>
          {detail.events.length ? (
            <View style={styles.timelineList}>
              {detail.events.map((event) => (
                <Pressable key={event.id} onPress={() => onEventSelect(event)} style={styles.timelineItem}>
                  <View style={styles.timelineDot}>
                    <MaterialCommunityIcons name={event.eventType === 'CHECKPOINT_REACHED' ? 'flag-checkered' : 'clock-outline'} size={14} color="#FFFFFF" />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.timelineTitle}>{getEventLabel(event.eventType)}</Text>
                    <Text style={styles.unitMeta}>{formatDate(event.timestamp)}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ) : (
            <EmptyState icon="timeline-clock-outline" title="Sin eventos" description="La jornada no tiene eventos persistidos." />
          )}
        </View>
      </View>
      <View style={styles.detailGrid}>
        <PortalSectionCard title="Checkpoints" subtitle={`${detail.visits.length} visitas persistidas`}>
          {detail.visits.length ? detail.visits.slice(0, 12).map((visit) => (
            <View key={visit.id} style={styles.compactRow}>
              <Text style={styles.compactTitle}>{visit.checkpointId}</Text>
              <Text style={styles.unitMeta}>{formatDate(visit.timestamp)}</Text>
            </View>
          )) : <EmptyState icon="flag-outline" title="Sin checkpoints" description="No existen visitas registradas para esta jornada." />}
        </PortalSectionCard>
        <PortalSectionCard title="GPS" subtitle="Cobertura y precision persistidas">
          <View style={styles.metricGrid}>
            <Fact label="Cobertura" value={formatPercent(detail.metrics?.metrics?.gpsCoveragePercent)} />
            <Fact label="Precision prom." value={detail.metrics?.averageGpsAccuracy ? `${detail.metrics.averageGpsAccuracy} m` : 'Sin dato'} />
            <Fact label="GOOD" value={formatPercent(detail.metrics?.metrics?.gpsQuality?.goodPercent)} />
            <Fact label="NORMAL" value={formatPercent(detail.metrics?.metrics?.gpsQuality?.normalPercent)} />
            <Fact label="BAD" value={formatPercent(detail.metrics?.metrics?.gpsQuality?.badPercent)} />
            <Fact label="Posiciones" value={String(detail.positions.length)} />
          </View>
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
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.quickAction}>
      <MaterialCommunityIcons name={icon} size={16} color={portalPalette.text} />
      <Text style={styles.quickActionText}>{label}</Text>
    </Pressable>
  );
}

function SelectPill({ label, onClear, value }: { label: string; onClear: () => void; value: string }) {
  return (
    <View style={styles.selectPill}>
      <Text style={styles.selectPillText}>{label}: {value}</Text>
      {value !== 'Todas' ? (
        <Pressable accessibilityRole="button" onPress={onClear}>
          <MaterialCommunityIcons name="close" size={14} color={portalPalette.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
    gap: 8,
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
    gap: 8,
    padding: 12,
  },
  detailGrid: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppTheme.spacing.md,
    minWidth: 0,
  },
  disabledAction: {
    opacity: 0.55,
  },
  driverAvatar: {
    alignItems: 'center',
    backgroundColor: portalPalette.infoSoft,
    borderColor: portalPalette.info,
    borderRadius: 24,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
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
    gap: 12,
    padding: 12,
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
    flexBasis: 130,
    gap: 3,
    minWidth: 0,
    padding: 10,
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
    gap: 10,
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
    backgroundColor: portalPalette.surface,
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  historyCardActive: {
    borderColor: portalPalette.accent,
  },
  historyList: {
    gap: 10,
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
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
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
  operationsGrid: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppTheme.spacing.md,
    minWidth: 0,
  },
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
    minHeight: 42,
    paddingHorizontal: 14,
  },
  primaryText: {
    color: '#FFFFFF',
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '900',
  },
  progressBlock: {
    gap: 6,
  },
  progressFill: {
    backgroundColor: portalPalette.accent,
    borderRadius: 999,
    height: '100%',
  },
  progressTrack: {
    backgroundColor: portalPalette.surfaceSoft,
    borderColor: portalPalette.line,
    borderRadius: 999,
    borderWidth: 1,
    height: 10,
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
    minHeight: 34,
    paddingHorizontal: 9,
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
    gap: 8,
  },
  replayControls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  replayPanel: {
    flex: 1.2,
    flexBasis: 430,
    gap: 12,
    minWidth: 0,
  },
  replaySteps: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  routeIcon: {
    alignItems: 'center',
    backgroundColor: portalPalette.accent,
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  routeSummary: {
    alignItems: 'center',
    backgroundColor: portalPalette.surfaceSoft,
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 10,
  },
  routeSummaryLarge: {
    alignItems: 'flex-start',
    backgroundColor: portalPalette.surfaceSoft,
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 12,
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
  selectPill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: portalPalette.surfaceSoft,
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.xs,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 34,
    paddingHorizontal: 10,
  },
  selectPillText: {
    color: portalPalette.text,
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '900',
  },
  sessionDetail: {
    gap: AppTheme.spacing.md,
  },
  sideHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  sideMeta: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 12,
  },
  sidePanel: {
    gap: 12,
  },
  sideHighlightRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    minWidth: 0,
  },
  sideTitle: {
    color: portalPalette.text,
    fontFamily: Typography.display,
    fontSize: 20,
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
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppTheme.spacing.md,
    minWidth: 0,
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
    gap: 12,
    minWidth: 0,
  },
  timelineTitle: {
    color: portalPalette.text,
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '900',
  },
  unitCard: {
    backgroundColor: portalPalette.surface,
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  unitCardActive: {
    borderColor: portalPalette.accent,
  },
  unitCode: {
    color: portalPalette.text,
    fontFamily: Typography.display,
    fontSize: 18,
    fontWeight: '900',
  },
  unitFacts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    minWidth: 0,
  },
  unitHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  unitList: {
    gap: 10,
  },
  unitMeta: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 12,
    lineHeight: 17,
  },
});
