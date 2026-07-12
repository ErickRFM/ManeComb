import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { router, useLocalSearchParams } from '@/src/navigation/router';
import { useEffect, useMemo, useRef, useState } from 'react';
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
const replaySpeeds = [1, 2, 4] as const;

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

function getRouteLabel(vehicle?: Vehicle | null, session?: RouteSession | null) {
  return (
    vehicle?.assignedRoute?.route?.label ||
    vehicle?.assignedRoute?.destinationLabel ||
    session?.routeId ||
    'Sin ruta asignada'
  );
}

function getLastUpdate(vehicle: Vehicle) {
  return vehicle.updatedAt ? formatDate(vehicle.updatedAt, { fallback: 'Sin actualizacion' }) : 'Sin actualizacion';
}

function getTimestamp(value?: string | null) {
  const timestamp = value ? new Date(value).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getSessionProductivity(session?: RouteSession | null) {
  return Number(session?.metrics?.effectiveTimePercent ?? 0);
}

function getPointFromVehicle(vehicle: Vehicle) {
  const location = (vehicle as Vehicle & { location?: { latitude?: number; longitude?: number } | null }).location;
  if (Number.isFinite(Number(location?.latitude)) && Number.isFinite(Number(location?.longitude))) {
    return { latitude: Number(location?.latitude), longitude: Number(location?.longitude) };
  }
  if (vehicle.assignedRoute?.origin) return vehicle.assignedRoute.origin;
  if (vehicle.assignedRoute?.destination) return vehicle.assignedRoute.destination;
  return null;
}

function normalizeMapPoints(vehicles: Vehicle[]) {
  const points = vehicles.map((vehicle) => ({ vehicle, point: getPointFromVehicle(vehicle) })).filter((entry) => entry.point);
  const latitudes = points.map((entry) => Number(entry.point?.latitude));
  const longitudes = points.map((entry) => Number(entry.point?.longitude));
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  const latRange = Math.max(0.001, maxLat - minLat);
  const lngRange = Math.max(0.001, maxLng - minLng);

  return points.map(({ vehicle, point }) => ({
    vehicle,
    x: 8 + ((Number(point?.longitude) - minLng) / lngRange) * 84,
    y: 8 + (1 - (Number(point?.latitude) - minLat) / latRange) * 84,
  }));
}

function getTodaySessions(sessions: RouteSession[]) {
  const today = new Date().toISOString().slice(0, 10);
  return sessions.filter((session) => String(session.startedAt || '').slice(0, 10) === today);
}

export function PortalDashboardScreen() {
  const params = useLocalSearchParams<{ vehicleId?: string | string[]; sessionId?: string | string[] }>();
  const {
    loadUsers,
    loadVehicles,
    users,
    vehicles,
  } = useAppStore(
    useShallow((state) => ({
      loadUsers: state.loadUsers,
      loadVehicles: state.loadVehicles,
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
  const [selectedVehicleId, setSelectedVehicleId] = useState(getParam(params.vehicleId) || '');
  const [selectedSessionId, setSelectedSessionId] = useState(getParam(params.sessionId) || '');
  const [sessionDetail, setSessionDetail] = useState<SessionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [replayIndex, setReplayIndex] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState<(typeof replaySpeeds)[number]>(1);
  const detailCache = useRef(new Map<string, SessionDetail>());

  useEffect(() => {
    void loadUsers();
    void loadVehicles();
  }, [loadUsers, loadVehicles]);

  const loadHistory = async () => {
    setIsLoading(true);
    setMessage(null);
    try {
      const sessions = await getRouteSessionHistoryRequest({ limit: 500 });
      setHistory(sessions);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible cargar jornadas.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadHistory();
  }, []);

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

  const mapPoints = useMemo(() => normalizeMapPoints(vehicles), [vehicles]);
  const replayPosition = sessionDetail?.positions[replayIndex] || null;

  const openVehicle = (vehicle: Vehicle) => {
    setSelectedVehicleId(vehicle.id);
    setFilters((current) => ({ ...current, vehicleId: vehicle.id }));
    const session = sessionsByVehicle.get(vehicle.id)?.[0];
    if (session) {
      void openSession(session);
    }
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
      const [metrics, events, visits, positions] = await Promise.all([
        getRouteSessionMetricsRequest(session.id),
        getRouteSessionEventsRequest(session.id, { limit: 5000 }),
        getRouteSessionCheckpointVisitsRequest(session.id, 5000),
        getRouteSessionPositionsRequest(session.id, 50000),
      ]);
      const detail = { metrics, events, visits, positions };
      detailCache.current.set(session.id, detail);
      setSessionDetail(detail);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible cargar el detalle de jornada.');
      setSessionDetail(null);
    } finally {
      setIsDetailLoading(false);
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
          <View style={styles.mapBox}>
            <View style={styles.mapGrid} pointerEvents="none" />
            {selectedVehicle?.assignedRoute?.origin && selectedVehicle.assignedRoute.destination ? <View style={styles.routeLine} /> : null}
            {mapPoints.length ? (
              mapPoints.map(({ vehicle, x, y }) => {
                const active = vehicle.id === selectedVehicle?.id;
                return (
                  <Pressable
                    key={vehicle.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Seleccionar unidad ${vehicle.code}`}
                    onPress={() => openVehicle(vehicle)}
                    style={[styles.mapPin, active ? styles.mapPinActive : undefined, { left: `${x}%`, top: `${y}%` }]}>
                    <MaterialCommunityIcons name="bus" size={16} color="#FFFFFF" />
                    <Text style={styles.mapPinText}>{vehicle.code}</Text>
                  </Pressable>
                );
              })
            ) : (
              <EmptyState icon="map-marker-off-outline" title="Sin ubicaciones reales" description="Las unidades apareceran cuando reporten ubicacion o tengan ruta asignada." />
            )}
          </View>
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
                  onRoute={() => router.push('/portal/rutas' as never)}
                  onDriver={() => router.push('/portal/usuarios' as never)}
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
              onOpenSession={(session) => void openSession(session)}
            />
          ) : (
            <EmptyState icon="bus-clock" title="Selecciona una unidad" description="El panel mostrara estado, ruta, metricas y jornada activa." />
          )}
        </PortalSectionCard>

        <PortalSectionCard title="Historial de jornadas" subtitle="Ordenado y filtrado con metricas persistidas.">
          <HistoryFilters filters={filters} sessions={history} users={users} vehicles={vehicles} onChange={setFilter} />
          {filteredSessions.length ? (
            <View style={styles.historyList}>
              {filteredSessions.slice(0, 40).map((session) => (
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
            replayIndex={replayIndex}
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
  return (
    <View style={[styles.unitCard, active ? styles.unitCardActive : undefined]}>
      <View style={styles.unitHeader}>
        <View>
          <Text style={styles.unitCode}>{vehicle.code}</Text>
          <Text style={styles.unitMeta}>Placas {vehicle.plate}</Text>
        </View>
        <StatusBadge label={status.label} tone={status.tone} />
      </View>
      <View style={styles.unitFacts}>
        <Fact label="Chofer" value={getDriverName(users, vehicle.driverId, vehicle.driverName)} />
        <Fact label="Ruta" value={getRouteLabel(vehicle, latestSession)} />
        <Fact label="Tiempo activo" value={activeSession ? formatDuration((Date.now() - getTimestamp(activeSession.startedAt)) / 1000) : 'Sin jornada'} />
        <Fact label="Actualizacion" value={getLastUpdate(vehicle)} />
        <Fact label="Velocidad" value={formatSpeed((vehicle as Vehicle & { speed?: number }).speed)} />
        <Fact label="GPS" value={(vehicle as Vehicle & { location?: unknown }).location ? 'Con posicion' : 'Sin posicion'} />
        <Fact label="Jornada" value={activeSession?.status || latestSession?.status || 'Sin historial'} />
      </View>
      <View style={styles.quickActions}>
        <QuickAction icon="routes" label="Ver ruta" onPress={onRoute} />
        <QuickAction icon="history" label="Historial" onPress={onHistory} />
        <QuickAction icon="account-switch-outline" label="Chofer" onPress={onDriver} />
        <QuickAction icon="crosshairs-gps" label="Centrar" onPress={onCenter} />
      </View>
    </View>
  );
}

function VehicleSidePanel({
  activeSession,
  latestSession,
  onOpenSession,
  users,
  vehicle,
}: {
  activeSession: RouteSession | null;
  latestSession: RouteSession | null;
  onOpenSession: (session: RouteSession) => void;
  users: User[];
  vehicle: Vehicle;
}) {
  const session = activeSession || latestSession;
  return (
    <View style={styles.sidePanel}>
      <View style={styles.sideHeader}>
        <MaterialCommunityIcons name="bus" size={24} color={portalPalette.accent} />
        <View style={styles.flex}>
          <Text style={styles.sideTitle}>{vehicle.code}</Text>
          <Text style={styles.sideMeta}>{getDriverName(users, vehicle.driverId, vehicle.driverName)}</Text>
        </View>
        <StatusBadge label={getVehicleStatus(vehicle, activeSession).label} tone={getVehicleStatus(vehicle, activeSession).tone} />
      </View>
      <View style={styles.metricGrid}>
        <Fact label="Ruta" value={getRouteLabel(vehicle, session)} />
        <Fact label="Tiempo activo" value={activeSession ? formatDuration((Date.now() - getTimestamp(activeSession.startedAt)) / 1000) : 'Sin jornada activa'} />
        <Fact label="Distancia" value={formatDistance(session?.totalDistance)} />
        <Fact label="Velocidad" value={formatSpeed((vehicle as Vehicle & { speed?: number }).speed)} />
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
  onEventSelect,
  onReplayIndexChange,
  onReplayPlayingChange,
  onReplaySpeedChange,
  replayIndex,
  replayPlaying,
  replayPosition,
  replaySpeed,
  session,
}: {
  detail: SessionDetail | null;
  isLoading: boolean;
  onEventSelect: (event: RouteEvent) => void;
  onReplayIndexChange: (index: number) => void;
  onReplayPlayingChange: (playing: boolean) => void;
  onReplaySpeedChange: (speed: (typeof replaySpeeds)[number]) => void;
  replayIndex: number;
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
          <View style={styles.replayMap}>
            <View style={styles.mapGrid} pointerEvents="none" />
            {replayPosition ? (
              <View style={[styles.replayMarker, { left: `${Math.min(92, Math.max(8, 8 + (replayIndex / Math.max(1, maxIndex)) * 84))}%`, top: '48%' }]}>
                <MaterialCommunityIcons name="bus" size={18} color="#FFFFFF" />
              </View>
            ) : null}
          </View>
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
          </View>
          <View style={styles.metricGrid}>
            <Fact label="Hora" value={replayPosition ? formatDate(replayPosition.timestamp) : 'Sin posicion'} />
            <Fact label="Velocidad" value={formatSpeed(replayPosition?.speed)} />
            <Fact label="Checkpoint" value={currentVisit?.checkpointId || 'Sin checkpoint'} />
            <Fact label="GPS" value={replayPosition?.gpsQuality || 'Sin calidad'} />
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
  detailGrid: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppTheme.spacing.md,
    minWidth: 0,
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
  mapBox: {
    backgroundColor: portalPalette.surfaceSoft,
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    minHeight: 410,
    overflow: 'hidden',
    position: 'relative',
  },
  mapGrid: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: portalPalette.surfaceSoft,
    opacity: 0.96,
  },
  mapPin: {
    alignItems: 'center',
    backgroundColor: portalPalette.info,
    borderColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 2,
    flexDirection: 'row',
    gap: 4,
    minHeight: 32,
    paddingHorizontal: 8,
    position: 'absolute',
  },
  mapPinActive: {
    backgroundColor: portalPalette.accent,
    transform: [{ scale: 1.05 }],
  },
  mapPinText: {
    color: '#FFFFFF',
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '900',
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
  replayMap: {
    backgroundColor: portalPalette.surfaceSoft,
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    minHeight: 250,
    overflow: 'hidden',
    position: 'relative',
  },
  replayMarker: {
    alignItems: 'center',
    backgroundColor: portalPalette.accent,
    borderColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 2,
    height: 36,
    justifyContent: 'center',
    position: 'absolute',
    width: 36,
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
  routeLine: {
    backgroundColor: portalPalette.accent,
    height: 3,
    left: '14%',
    opacity: 0.75,
    position: 'absolute',
    top: '52%',
    transform: [{ rotate: '-12deg' }],
    width: '68%',
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
  unitBody: {
    flex: 1,
    minWidth: 0,
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
