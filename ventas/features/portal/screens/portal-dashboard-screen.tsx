import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { router, useLocalSearchParams } from '@/src/navigation/router';
import { EmptyState } from '@/src/components/ui/empty-state';
import { StatusBadge } from '@/src/components/ui/status-badge';
import {
  getRouteSessionCheckpointVisitsRequest,
  getRouteSessionEventsRequest,
  getRouteSessionHistoryRequest,
  getRouteSessionMetricsRequest,
  getRouteSessionPositionsRequest,
  getApiErrorMessage,
} from '@/src/api/client';
import { useAppStore } from '@/src/store/use-app-store';
import type { RouteEvent, RouteSession, User, Vehicle } from '@/src/types/app';
import { formatDate } from '@/src/utils/format';
import { formatPortalStatus, getPortalStatusTone, PortalSectionCard } from '../cards';
import { PortalLayout } from '../components/portal-layout';
import { PortalButton } from '../components/portal-button';
import { portalPalette } from '../portal-theme';
import type { SessionDetail, Filters, OperationsFilter } from '../dashboard/dashboard.types';
import { historyPageSize, replayPageSize, replaySpeeds } from '../dashboard/dashboard.constants';
import {
  applyOperationalSnapshot,
  downsamplePositions,
  formatDistance,
  formatPercent,
  getActiveDriver,
  getDriverName,
  getGpsState,
  getParam,
  getRouteGeometry,
  getRouteLabel,
  getSessionProductivity,
  getTimestamp,
  numberOrZero,
} from '../dashboard/dashboard.utils';
import { styles } from '../dashboard/dashboard.styles';
import { OperationalUnitCard } from '../dashboard/components/dashboard-operational-unit-card';
import { VehicleSidePanel } from '../dashboard/components/dashboard-vehicle-side-panel';
import { HistoryFilters } from '../dashboard/components/dashboard-history-filters';
import { SessionHistoryCard } from '../dashboard/components/dashboard-session-history-card';
import { SessionDetailView } from '../dashboard/components/dashboard-session-detail';

const OperationsMap = lazy(() => import('../components/operations-map').then((module) => ({ default: module.OperationsMap })));

function MapFallback({ height = 410 }: { height?: number }) {
  return (
    <View style={[styles.mapFallback, { minHeight: height }]}>
      <Text style={styles.loadingText}>Cargando mapa...</Text>
    </View>
  );
}

export function PortalDashboardScreen() {
  const params = useLocalSearchParams<{ sessionId?: string | string[]; vehicleId?: string | string[]; view?: string | string[] }>();
  const { width } = useWindowDimensions();
  // Movil (<768): la accion "Actualizar" pasa a icono para no comer alto vertical.
  const isMobile = width < 768;
  const {
    isSubmitting,
    lastRouteSessionUpdateId,
    loadUsers,
    loadVehicles,
    routeSessionVersion,
    updateUser,
    users,
    vehicles,
    operationalUnits,
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
      operationalUnits: state.operationalUnits,
    }))
  );
  const snapshotByVehicle = useMemo(
    () => new Map(operationalUnits.map((unit) => [unit.unitId, unit])),
    [operationalUnits]
  );
  const operationalVehicleData = useMemo(
    () => vehicles.map((vehicle) => applyOperationalSnapshot(vehicle, snapshotByVehicle.get(vehicle.id))),
    [snapshotByVehicle, vehicles]
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
  // En movil el panel "Unidades en mapa" arranca colapsado (item 4). En desktop
  // siempre expandido: `showUnitList` combina el ancho con este estado.
  const [unitListExpanded, setUnitListExpanded] = useState(false);
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

  const activeView = getParam(params.view) === 'history' ? 'history' : getParam(params.view) === 'detail' ? 'detail' : 'operations';
  const selectedVehicle = useMemo(
    () => operationalVehicleData.find((vehicle) => vehicle.id === selectedVehicleId) || (activeView === 'operations' ? null : operationalVehicleData[0] || null),
    [activeView, operationalVehicleData, selectedVehicleId]
  );
  const selectedVehicleSessions = selectedVehicle ? sessionsByVehicle.get(selectedVehicle.id) || [] : [];
  const activeSession = selectedVehicleSessions.find((session) => ['RUNNING', 'PAUSED'].includes(session.status)) || null;
  const latestSession = selectedVehicleSessions[0] || null;
  const selectedSession = history.find((session) => session.id === selectedSessionId) || latestSession || null;
  const operationsCounts = useMemo(() => {
    const running = operationalVehicleData.filter((vehicle) => sessionsByVehicle.get(vehicle.id)?.some((session) => session.status === 'RUNNING')).length;
    const stopped = operationalVehicleData.filter((vehicle) => {
      const session = sessionsByVehicle.get(vehicle.id)?.find((entry) => ['RUNNING', 'PAUSED'].includes(entry.status));
      return session?.status === 'PAUSED' || (Boolean(session) && Number(vehicle.speed) <= 0.8);
    }).length;
    const offRoute = operationalVehicleData.filter((vehicle) => Boolean(vehicle.activeRouteProgress?.isOffRoute)).length;
    return { ALL: operationalVehicleData.length, RUNNING: running, STOPPED: stopped, OFF_ROUTE: offRoute };
  }, [operationalVehicleData, sessionsByVehicle]);
  const operationalVehicles = useMemo(() => operationalVehicleData.filter((vehicle) => {
    const session = sessionsByVehicle.get(vehicle.id)?.find((entry) => ['RUNNING', 'PAUSED'].includes(entry.status));
    if (operationsFilter === 'RUNNING') return session?.status === 'RUNNING';
    if (operationsFilter === 'STOPPED') return session?.status === 'PAUSED' || (Boolean(session) && Number(vehicle.speed) <= 0.8);
    if (operationsFilter === 'OFF_ROUTE') return Boolean(vehicle.activeRouteProgress?.isOffRoute);
    return true;
  }), [operationalVehicleData, operationsFilter, sessionsByVehicle]);
  const toggleOperationsFilter = (filter: Exclude<OperationsFilter, 'ALL'>) => {
    setOperationsFilter((current) => current === filter ? 'ALL' : filter);
  };

  useEffect(() => {
    if (operationsFilter === 'ALL') return;
    const visibleVehicleIds = new Set(operationalVehicles.map((vehicle) => vehicle.id));
    if (selectedVehicleId && !visibleVehicleIds.has(selectedVehicleId)) setSelectedVehicleId('');
    if (routeFocusVehicleId && !visibleVehicleIds.has(routeFocusVehicleId)) setRouteFocusVehicleId(null);
  }, [operationalVehicles, operationsFilter, routeFocusVehicleId, selectedVehicleId]);
  const operationsKpis = useMemo(() => {
    const active = operationsCounts.RUNNING;
    const gpsLost = operationalVehicleData.filter((vehicle) => getGpsState(vehicle, sessionsByVehicle.get(vehicle.id)?.[0]).stale).length;
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
  }, [history, operationalVehicleData, operationsCounts, sessionsByVehicle]);
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
  const vehicleRoutes = useMemo(() => operationalVehicles.map((vehicle) => ({
    color: vehicle.routeColor || undefined,
    coordinates: getRouteGeometry(vehicle),
    vehicleId: vehicle.id,
  })).filter((entry) => entry.coordinates.length >= 2), [operationalVehicles]);
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
        <View nativeID="operations-header-action" style={styles.headerAction}>
          <PortalButton
            accessibilityLabel={activeView === 'operations' ? 'Actualizar' : 'Volver a operaciones'}
            icon={activeView === 'operations' ? 'refresh' : 'arrow-left'}
            loading={activeView === 'operations' && isLoading}
            onPress={activeView === 'operations' ? () => void loadHistory() : () => router.push('/portal' as never)}>
            {/* En movil el boton es de solo icono: sin children PortalButton lo
                renderiza cuadrado. Los datos siguen frescos por el socket en
                tiempo real y el icono mantiene un refresco manual disponible. */}
            {isMobile ? undefined : activeView === 'operations' ? (isLoading ? 'Actualizando' : 'Actualizar') : 'Volver a operaciones'}
          </PortalButton>
        </View>
      }>
      {message ? (
        <View nativeID="portal-notice" style={styles.notice}>
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
            <PortalButton icon="arrow-right" onPress={() => router.push('/portal/onboarding' as never)} size="sm">Ir a activación</PortalButton>
          </View>
        </PortalSectionCard>
      ) : null}

      {activeView === 'operations' ? (
      <View nativeID={selectedVehicle ? 'operations-workspace-selected' : 'operations-workspace'} style={[styles.mainOperationsGrid, selectedVehicle ? styles.mainOperationsGridSelected : undefined]}>
        <View nativeID="operations-map-column" style={styles.operationsMapCol}>
          <View nativeID="operations-map-surface" style={styles.mapSurface}>
            <View style={styles.mapStage}>
              <Suspense fallback={<MapFallback height={620} />}>
                <OperationsMap
                  checkpoints={routeCheckpoints}
                  height="100%"
                  mapMode="operational"
                  onVehiclePress={openVehicle}
                  routeCoordinates={routeCoordinates}
                  selectedVehicleId={selectedVehicle?.id}
                  showTraffic={false}
                  vehicleRoutes={vehicleRoutes}
                  vehicles={operationalVehicles}
                />
              </Suspense>
              {operationalVehicles.length ? (
                <View {...({ className: 'portal-scrollbar' } as any)} nativeID="operations-unit-selector" style={[styles.mapOverlaySurface, styles.unitSelectorOverlay, isMobile && !unitListExpanded ? styles.unitSelectorCollapsed : undefined]}>
                  <Pressable
                    accessibilityRole={isMobile ? 'button' : undefined}
                    accessibilityLabel={isMobile ? `Unidades en mapa (${operationalVehicles.length})` : undefined}
                    accessibilityState={isMobile ? { expanded: unitListExpanded } : undefined}
                    disabled={!isMobile}
                    onPress={() => setUnitListExpanded((current) => !current)}
                    style={styles.unitSelectorHeader}>
                    <Text style={styles.mapOverlayTitle}>Unidades en mapa</Text>
                    {isMobile ? (
                      <View style={styles.unitSelectorHeaderMeta}>
                        <Text style={styles.unitSelectorCount}>{operationalVehicles.length}</Text>
                        <MaterialCommunityIcons name={unitListExpanded ? 'chevron-down' : 'chevron-up'} size={18} color={portalPalette.muted} />
                      </View>
                    ) : null}
                  </Pressable>
                  {!isMobile || unitListExpanded ? operationalVehicles.map((vehicle) => (
                    <OperationalUnitCard
                      key={vehicle.id}
                      active={vehicle.id === selectedVehicle?.id}
                      activeSession={sessionsByVehicle.get(vehicle.id)?.find((session) => ['RUNNING', 'PAUSED'].includes(session.status)) || null}
                      latestSession={sessionsByVehicle.get(vehicle.id)?.[0] || null}
                      vehicle={vehicle}
                      onOpen={() => showRoute(vehicle)}
                    />
                  )) : null}
                </View>
              ) : null}
              {/* El carril no captura eventos: solo el chip es interactivo, para
                  no bloquear el arrastre del mapa a lo ancho de la franja. */}
              <View nativeID="operations-filters-lane" pointerEvents="box-none" style={styles.filtersOverlayLane}>
                <View style={[styles.mapOverlaySurface, styles.filtersOverlay]}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: operationsFilter === 'ALL' }}
                    onPress={() => setOperationsFilter('ALL')}
                    style={[styles.operationsFilter, operationsFilter === 'ALL' ? styles.operationsFilterActive : undefined]}>
                    <View style={styles.filterStatusDot} />
                    <Text style={styles.operationsFilterText}>Todas</Text>
                    <Text style={styles.operationsFilterCount}>{operationsCounts.ALL}</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </View>
          <View {...({ className: 'portal-scrollbar' } as any)} nativeID="operations-kpi-grid" style={styles.kpiRow}>
            <View style={styles.kpiTrack}>
              {operationsKpis.map((kpi, index) => {
                const filter = index === 0 ? 'RUNNING' : index === 1 ? 'STOPPED' : index === 2 ? 'OFF_ROUTE' : null;
                const Container = filter ? Pressable : View;
                return (
                <Container
                  key={kpi.label}
                  {...(filter ? {
                    accessibilityRole: 'button',
                    accessibilityState: { selected: operationsFilter === filter },
                    onPress: () => toggleOperationsFilter(filter),
                  } : {})}
                  style={[styles.kpiCard, filter && operationsFilter === filter ? styles.operationsFilterActive : undefined, index === operationsKpis.length - 1 ? styles.kpiCardLast : undefined]}>
                  <View style={styles.kpiTop}>
                    <MaterialCommunityIcons name={kpi.icon} size={18} color={portalPalette.accent} />
                    <Text style={styles.kpiLabel}>{kpi.label}</Text>
                  </View>
                  <Text style={styles.kpiValue}>{kpi.value}</Text>
                  <Text style={styles.kpiDetail}>{kpi.detail}</Text>
                </Container>
              );})}
            </View>
          </View>
        </View>

        {selectedVehicle ? <View nativeID="operations-detail-column" style={styles.operationsUnitsCol}>
          <View {...({ className: 'portal-scrollbar' } as any)} nativeID="operations-detail-surface" style={styles.operationsDetailSurface}>
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
          </View>
        </View> : null}
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
                  <PortalButton loading={isLoading} onPress={() => void loadHistory({ append: true })} size="sm" variant="secondary">{`Cargar más (${historyTotal - history.length})`}</PortalButton>
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
