import { Redirect, router, useLocalSearchParams } from '@/src/navigation/router';
import { StatusBar } from '@/src/native/status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, BackHandler, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { OperationalMenuDrawer } from '@/src/components/operational-menu-drawer';
import { ConfirmModal } from '@/src/components/ui/confirm-modal';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { useAppStore } from '@/src/store/use-app-store';
import { executeRouteSessionAction, type RouteSessionAction } from '@/src/services/route-session-actions';
import { getBackgroundLocationServiceStatusAsync } from '@/src/native/background-location';
import { requestBackgroundPermission } from './map/services/location-service';
import * as Location from '@/src/native/location';
import type { RouteShape, User, Vehicle } from '@/src/types/app';
import { getLocationStatus } from '@/src/utils/location-status';
import { normalizeAssignedRoute } from '@/src/utils/navigation-data';
import { BottomTrackingPanel } from './map/components/BottomTrackingPanel';
import { FloatingControls } from './map/components/FloatingControls';
import { MapCanvas } from './map/components/MapCanvas';
import { MapDataRecovery } from './map/components/MapDataRecovery';
import { SelectorRouteOverlay } from './map/components/SelectorRouteOverlay';
import { TrackingHud } from './map/components/TrackingHud';
import { useMapCamera } from './map/hooks/use-map-camera';
import { useMapSelector } from './map/hooks/use-map-selector';
import { useTrackingData } from './map/hooks/use-tracking-data';
import { mapStyles as styles } from './map/map-styles';
import type { MapSelectorParams } from './map/types';
import { isSelectorMode } from './map/utils/selector-route';
import { formatFreshness, type OperationalUnitSnapshot } from '@shared/operational-contract';

type MapGateState = {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  message: string;
  title: string;
};

function getSelectedVehicleRoutes(vehicle: Vehicle | null, routes: RouteShape[]) {
  if (!vehicle) return [];

  const assignedRoute = normalizeAssignedRoute(vehicle.assignedRoute);
  const routeId = String(vehicle.routeId || '').trim();

  const matchedRoute = routeId
    ? routes.find((route) => String(route.id).trim() === routeId)
    : null;

  if (matchedRoute) {
    return [matchedRoute];
  }

  if (routeId && vehicle.route?.id === routeId && vehicle.route.polyline?.length) {
    return [vehicle.route];
  }

  if (assignedRoute?.route?.polyline?.length) {
    return [
      {
        id: routeId || `assigned-route-${vehicle.id}`,
        name: assignedRoute.route.label || 'Ruta asignada',
        code: routeId || `assigned-${vehicle.id}`,
        color: vehicle.routeColor || '#1473E6',
        polyline: assignedRoute.route.polyline,
      },
    ];
  }

  return [];
}
function getMapGateState({
  hasCoordinates,
  liveVehicleCount,
  totalVehicleCount,
  user,
  userVehicle,
}: {
  hasCoordinates: boolean;
  liveVehicleCount: number;
  totalVehicleCount: number;
  user: User;
  userVehicle: Vehicle | null;
}): MapGateState | null {
  const hasOrganization = Boolean(String(user.organizationId || '').trim());
  const isDriver = user.role === 'driver';

  if (!hasOrganization) {
    return {
      icon: 'domain-off',
      title: 'No perteneces a una organización.',
      message: 'Tu cuenta necesita una organización activa antes de mostrar operación, unidades o seguimiento.',
    };
  }

  if (isDriver && !user.vehicleId && !hasCoordinates) {
    return {
      icon: 'bus-alert',
      title: 'No tienes una unidad asignada.',
      message: 'Contacta al administrador. Mientras tanto esperamos tu ubicación actual.',
    };
  }

  if ((totalVehicleCount === 0 && !hasCoordinates) || (isDriver && user.vehicleId && !userVehicle && !hasCoordinates)) {
    return {
      icon: 'bus-clock',
      title: 'No tienes una unidad asignada.',
      message: 'No hay unidades disponibles para tu cuenta en este momento.',
    };
  }

  if (isDriver && userVehicle && !userVehicle.assignedRoute && !hasCoordinates) {
    return {
      icon: 'routes',
      title: 'No tienes una ruta asignada.',
      message: 'El mapa operativo se habilitará cuando tu unidad tenga una ruta real.',
    };
  }

  if (!hasCoordinates && liveVehicleCount === 0) {
    return {
      icon: 'crosshairs-question',
      title: 'Esperando ubicación GPS.',
      message: 'Aún no hay una posición real para mostrar en el mapa.',
    };
  }

  return null;
}

function MapEmptyGate({
  icon,
  isRefreshing,
  message,
  onRefresh,
  title,
}: MapGateState & {
  isRefreshing: boolean;
  onRefresh: () => void;
}) {
  const { theme } = useAppTheme();

  return (
    <View style={[styles.safeArea, { backgroundColor: theme.colors.background }]}>
      <StatusBar style={theme.statusBar} />
      <View style={styles.recoveryRoot}>
        <View
          style={[
            styles.recoveryIcon,
            {
              backgroundColor: theme.colors.accentSoft,
              borderColor: theme.colors.line,
            },
          ]}>
          <MaterialCommunityIcons name={icon} size={30} color={theme.colors.accent} />
        </View>
        <Text style={[styles.recoveryTitle, { color: theme.colors.text }]}>{title}</Text>
        <Text style={[styles.recoveryMessage, { color: theme.colors.muted }]}>{message}</Text>
        <View style={styles.recoveryActions}>
          <Pressable
            onPress={onRefresh}
            disabled={isRefreshing}
            style={({ pressed }) => [
              styles.recoverySecondaryButton,
              { borderColor: theme.colors.line, backgroundColor: theme.colors.surface },
              pressed && !isRefreshing ? styles.recoveryPressed : undefined,
              isRefreshing ? styles.recoveryDisabled : undefined,
            ]}>
            <MaterialCommunityIcons name="sync" size={18} color={theme.colors.accent} />
            <Text style={[styles.recoverySecondaryText, { color: theme.colors.text }]}>
              {isRefreshing ? 'Sincronizando...' : 'Sincronizar'}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export function MapScreen() {
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<MapSelectorParams>();
  const {
    activeRouteSession,
    authContext,
    error,
    isRefreshing,
    isSigningOut,
    mapData,
    operationalUnits,
    lastSyncedAt,
    sessionHistory,
    refreshAll,
    deviceLocation,
    refreshDeviceLocation,
    signOut,
    user,
  } = useAppStore(
    useShallow((state) => ({
      activeRouteSession: state.activeRouteSession,
      authContext: state.authContext,
      error: state.error,
      isRefreshing: state.isRefreshing,
      isSigningOut: state.isSigningOut,
      mapData: state.mapData,
      operationalUnits: state.operationalUnits,
      lastSyncedAt: state.lastSyncedAt,
      sessionHistory: state.routeSessionHistory,
      refreshAll: state.refreshAll,
      deviceLocation: state.deviceLocation,
      refreshDeviceLocation: state.refreshDeviceLocation,
      signOut: state.signOut,
      user: state.user,
    }))
  );
  const {
    coordinates,
    issue: locationIssue,
    loading: locationLoading,
    permission,
    servicesEnabled,
  } = deviceLocation;
  const refresh = refreshDeviceLocation;

  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [followMode, setFollowMode] = useState(true);
  const [trafficEnabled, setTrafficEnabled] = useState(true);
  const [activeAlertIndex, setActiveAlertIndex] = useState(0);
  const [pendingJourneyAction, setPendingJourneyAction] = useState<RouteSessionAction | null>(null);
  const [isChangingJourney, setIsChangingJourney] = useState(false);
  const selectorFocusedVehicleIdRef = useRef<string | null>(null);

  useEffect(() => {
    const inspectBackgroundTracking = async () => {
      const status = await getBackgroundLocationServiceStatusAsync();
      const currentVehicleId = user?.vehicleId || null;
      if (status.active && status.vehicleId && status.vehicleId !== currentVehicleId) {
        console.warn('[mobile:gps] native service is reconciling a stale vehicle', {
          currentVehicleId,
          nativeVehicleId: status.vehicleId,
        });
      }
      if (status.reason === 'auth_failed') {
        Alert.alert(
          'Rastreo en segundo plano interrumpido',
          'La sesion del GPS expiro. Abre de nuevo tu jornada o inicia sesion otra vez; el rastreo en primer plano sigue disponible.'
        );
      }
    };
    inspectBackgroundTracking().catch(() => undefined);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') inspectBackgroundTracking().catch(() => undefined);
    });
    return () => subscription.remove();
  }, [user?.vehicleId]);

  // Reconciliacion de datos operativos: al montar la pantalla y al volver a
  // primer plano se re-sincroniza mapData (incluida la ruta asignada) por si el
  // evento socket `location:updated` se perdio mientras el usuario estaba
  // desconectado o en segundo plano. refreshAll es idempotente.
  useEffect(() => {
    refreshAll().catch(() => undefined);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshAll().catch(() => undefined);
    });
    return () => subscription.remove();
  }, [refreshAll]);

  const selectorMode = isSelectorMode(params.point);
  // While picking route points the map is a fresh (reset) module root, so the
  // hardware back button would otherwise fall through to the OS and exit the app.
  // Consume it and return to the route panel's saved-routes list instead. The
  // handler is only active in selector mode, so normal map back is untouched.
  useEffect(() => {
    if (Platform.OS !== 'android' || !selectorMode) {
      return undefined;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      router.replace({
        pathname: params.returnTo || '/checklist',
        params: {
          ...(params.vehicleId ? { vehicleId: params.vehicleId } : {}),
          ...(params.returnFilter ? { returnFilter: params.returnFilter } : {}),
          ...(params.historyScrollY ? { historyScrollY: params.historyScrollY } : {}),
          openLibrary: '1',
        },
      });
      return true;
    });

    return () => subscription.remove();
  }, [selectorMode, params.returnTo, params.vehicleId, params.returnFilter, params.historyScrollY]);

  const { fitRoute, focusMap, focusPoint, mapPadding, mapRef, routeFitPadding } = useMapCamera(insets);
  // Se levanta con el primer pan/zoom manual y bloquea los auto-encuadres
  // posteriores del selector, para no pisar el encuadre que eligio el usuario.
  const hasUserMovedMapRef = useRef(false);
  // `onRegionIsChanging` llega por frame mientras dura el gesto: el ref evita
  // un setState por frame y el stale closure de `followMode`.
  const followModeRef = useRef(followMode);
  followModeRef.current = followMode;
  const handleMapUserInteraction = useCallback(() => {
    hasUserMovedMapRef.current = true;

    // Seguir a la unidad re-centra en cada poll de GPS. Si el usuario paneo o
    // hizo zoom, deja de seguir; se reactiva con el boton de seguimiento.
    if (followModeRef.current) {
      followModeRef.current = false;
      setFollowMode(false);
    }
  }, []);
  const locationStatus = useMemo(
    () =>
      getLocationStatus({
        coordinatesReady: Boolean(coordinates),
        issue: locationIssue,
        loading: locationLoading,
        permission,
        servicesEnabled,
      }),
    [coordinates, locationIssue, locationLoading, permission, servicesEnabled]
  );
  const locationStatusColor =
    locationStatus.tone === 'ok'
      ? theme.colors.success
      : locationStatus.tone === 'error'
        ? theme.colors.danger
        : locationStatus.tone === 'warning'
          ? theme.colors.warning
        : theme.colors.muted;
  const ownOperationalUnit = user?.vehicleId
    ? operationalUnits.find((unit) => unit.unitId === user.vehicleId) || null
    : null;
  const serverSyncLabel = ownOperationalUnit ? formatFreshness(ownOperationalUnit.gps) : 'SIN DATOS';
  const serverSyncColor = ownOperationalUnit?.gps.freshness === 'fresh'
    ? theme.colors.success
    : ownOperationalUnit?.gps.freshness === 'stale'
      ? theme.colors.warning
      : theme.colors.muted;

  const {
    activeIncident,
    activeIncidentUnit,
    activeRouteCount,
    unknownStateCount,
    mappableUnits,
    prioritizedUnits,
    selectedJourney,
    selectedUnit,
    vehicleById,
    visibleIncidents,
  } = useTrackingData(operationalUnits, mapData, selectedUnitId, activeAlertIndex);

  // Atributos no operacionales (ocupacion, combustible, odometro) que aun no
  // forman parte del contrato. Todo lo operacional sale de `selectedUnit`.
  const selectedVehicle = selectedUnit ? vehicleById.get(selectedUnit.unitId) || null : null;

  const selector = useMapSelector({
    focusPoint,
    fitRoute,
    hasUserMovedMapRef,
    params,
    routeFitPadding,
    selectorMode,
  });

  const handleSelectTrackingUnit = useCallback((unit: OperationalUnitSnapshot) => {
    setSelectedUnitId(unit.unitId);
    setFollowMode(true);
    const vehicle = mapData?.vehicles.find((entry) => entry.id === unit.unitId) || null;
    const routes = getSelectedVehicleRoutes(vehicle, mapData?.routes || []);

    if (routes.length > 0 && routes[0].polyline.length > 1) {
      fitRoute({ coordinates: routes[0].polyline, edgePadding: routeFitPadding });
      return;
    }

    // Una unidad sin GPS puede seleccionarse: simplemente no hay a donde centrar.
    if (unit.gps.lat !== null && unit.gps.lng !== null) {
      focusPoint({ latitude: unit.gps.lat, longitude: unit.gps.lng });
    }
  }, [fitRoute, focusPoint, mapData?.routes, mapData?.vehicles, routeFitPadding]);

  const handleSelectIncidentUnit = useCallback((unit: OperationalUnitSnapshot) => {
    setSelectedUnitId(unit.unitId);
    setFollowMode(false);
    if (unit.gps.lat !== null && unit.gps.lng !== null) {
      focusMap(unit.gps.lat, unit.gps.lng, 'close');
    }
  }, [focusMap]);

  useEffect(() => {
    if (params.vehicleId) {
      setSelectedUnitId(params.vehicleId);
      if (params.follow === 'true') setFollowMode(true);
    }
  }, [params.vehicleId, params.follow]);

  useEffect(() => {
    const latitude = Number(params.focusLatitude);
    const longitude = Number(params.focusLongitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return;
    }

    setFollowMode(false);
    focusMap(latitude, longitude, 'close');
  }, [focusMap, params.focusLatitude, params.focusLongitude]);

  useEffect(() => {
    const hasExplicitFocus =
      Number.isFinite(Number(params.focusLatitude)) &&
      Number.isFinite(Number(params.focusLongitude));

    if (hasExplicitFocus) {
      return;
    }

    if (followMode && selectedUnit && selectedUnit.gps.lat !== null && selectedUnit.gps.lng !== null) {
      focusPoint({ latitude: selectedUnit.gps.lat, longitude: selectedUnit.gps.lng });
    }
  }, [focusPoint, followMode, params.focusLatitude, params.focusLongitude, selectedUnit]);

  useEffect(() => {
    if (!selectorMode) {
      selectorFocusedVehicleIdRef.current = null;
      return;
    }

    if (
      selectedUnit &&
      selectedUnit.gps.lat !== null &&
      selectedUnit.gps.lng !== null &&
      selectorFocusedVehicleIdRef.current !== selectedUnit.unitId
    ) {
      selectorFocusedVehicleIdRef.current = selectedUnit.unitId;
      setFollowMode(false);
      focusPoint({ latitude: selectedUnit.gps.lat, longitude: selectedUnit.gps.lng });
    }
  }, [focusPoint, selectorMode, selectedUnit]);

  const handleRefresh = async () => {
    await Promise.all([refreshAll(), refresh()]);
  };

  const handleResetSession = async () => {
    await signOut();
    router.replace('/login');
  };

  const focusNextAlert = () => {
    if (!visibleIncidents.length || !mapData) {
      router.push('/incidencias');
      return;
    }

    const nextIndex = activeAlertIndex + 1;
    const incident = visibleIncidents[nextIndex % visibleIncidents.length];
    const vehicle = vehicleById.get(incident.vehicleId || '');
    const point = incident.location || vehicle?.location;

    setActiveAlertIndex(nextIndex);

    if (vehicle) {
      setSelectedUnitId(vehicle.id);
    }

    if (point) {
      setFollowMode(false);
      focusMap(point.latitude, point.longitude, 'close');
    }
  };

  if (!user) {
    return <Redirect href="/login" />;
  }

  if (!mapData) {
    return (
      <MapDataRecovery
        authContext={authContext}
        error={error}
        isRefreshing={isRefreshing}
        isSigningOut={isSigningOut}
        onRefresh={handleRefresh}
        onResetSession={handleResetSession}
        user={user}
      />
    );
  }

  const driverVehicle = user.vehicleId ? vehicleById.get(user.vehicleId) || null : null;
  const mapGate = getMapGateState({
    hasCoordinates: Boolean(coordinates),
    liveVehicleCount: mappableUnits.length,
    totalVehicleCount: prioritizedUnits.length,
    user,
    userVehicle: driverVehicle,
  });

  if (mapGate) {
    return (
      <MapEmptyGate
        icon={mapGate.icon}
        isRefreshing={isRefreshing}
        message={mapGate.message}
        onRefresh={handleRefresh}
        title={mapGate.title}
      />
    );
  }

  const driverWithoutUnit = user.role === 'driver' && !driverVehicle;
  const driverWithoutRoute = user.role === 'driver' && driverVehicle && !driverVehicle.assignedRoute;
  const selectedVehicleRoutes = getSelectedVehicleRoutes(selectedVehicle, mapData.routes);
  const mapDataForDisplay = selectorMode
    ? {
        ...mapData,
        routes: [],
      }
    : driverWithoutUnit || driverWithoutRoute
      ? {
          ...mapData,
          routes: [],
          vehicles: driverWithoutUnit ? [] : mapData.vehicles,
          incidents: driverWithoutUnit ? [] : visibleIncidents,
        }
      : {
          ...mapData,
          routes: selectedVehicleRoutes,
        };
  const visibleMapUnits = driverWithoutUnit ? [] : mappableUnits;
  // Sin distincion por rol: el conductor ve el mismo inventario que el resto.
  const visiblePanelUnits = driverWithoutUnit ? [] : prioritizedUnits;
  const visibleMapIncidents = driverWithoutUnit ? [] : visibleIncidents;

  const driverJourney = user.role === 'driver' ? ownOperationalUnit?.journey || null : selectedJourney;
  const journeyStatus: 'none' | 'assigned' | 'ready' | 'running' | 'paused' = driverJourney
    ? driverJourney.status === 'ASSIGNED'
      ? 'assigned'
      : driverJourney.status === 'READY'
        ? 'ready'
        : driverJourney.status === 'PAUSED'
          ? 'paused'
          : 'running'
    : activeRouteSession?.status === 'PAUSED'
      ? 'paused'
      : activeRouteSession?.status === 'RUNNING'
        ? 'running'
        : 'none';
  const journeyVehicleId = driverJourney?.vehicleId || user.vehicleId || selectedUnit?.unitId || '';
  const handleJourneyAction = async () => {
    const action = pendingJourneyAction;
    const vehicle = vehicleById.get(journeyVehicleId);
    if (!action || !vehicle || isChangingJourney) return;
    setIsChangingJourney(true);
    try {
      const result = await executeRouteSessionAction({
        action,
        currentJourney: driverJourney,
        currentSession: activeRouteSession,
        organizationId: user.organizationId || '',
        routeId: driverJourney?.routeId || vehicle.routeId || '',
        userId: user.id,
        vehicleId: vehicle.id,
        driverId: driverJourney?.driverId || vehicle.driverId,
      });
      useAppStore.setState({ activeRouteSession: result.session });
      if (
        (action === 'start' || action === 'resume') &&
        result.session?.status === 'RUNNING'
      ) {
        const backgroundPermission = await requestBackgroundPermission();
        if (backgroundPermission.status !== Location.PermissionStatus.GRANTED) {
          Alert.alert(
            'Ubicacion en segundo plano desactivada',
            'ManeComb continuara rastreando mientras la app este visible. Habilita "Permitir siempre" en Ajustes para mantener el rastreo con la pantalla bloqueada.'
          );
        }
      }
      setPendingJourneyAction(null);
      if (!result.offline) await refreshAll();
    } catch {
      useAppStore.setState({ error: 'No fue posible actualizar la jornada.' });
    } finally {
      setIsChangingJourney(false);
    }
  };
  const handleConfirmJourney = () => setPendingJourneyAction('confirm');
  const handleStartJourney = () => setPendingJourneyAction('start');
  const handleFinishJourney = () => setPendingJourneyAction('finish');
  const handlePauseJourney = () => setPendingJourneyAction(journeyStatus === 'paused' ? 'resume' : 'pause');

  const journeyModalTitle = pendingJourneyAction === 'confirm'
    ? 'Confirmar jornada'
    : pendingJourneyAction === 'finish'
      ? 'Finalizar jornada'
      : pendingJourneyAction === 'pause'
        ? 'Pausar jornada'
        : pendingJourneyAction === 'resume'
          ? 'Reanudar jornada'
          : 'Iniciar jornada';
  const journeyModalLabel = pendingJourneyAction === 'confirm'
    ? 'Confirmar'
    : pendingJourneyAction === 'finish'
      ? 'Finalizar'
      : pendingJourneyAction === 'pause'
        ? 'Pausar'
        : pendingJourneyAction === 'resume'
          ? 'Reanudar'
          : 'Iniciar';
  const journeyModalDescription = pendingJourneyAction === 'confirm'
    ? 'Confirma que la unidad, la ruta y el horario asignados son correctos. La conducción todavía no iniciará.'
    : pendingJourneyAction === 'start'
      ? 'La jornada iniciará en el servidor y después se activará el rastreo GPS.'
      : 'El cambio se sincronizará con Control y quedará registrado en la Jornada.';

  return (
    <View style={[styles.safeArea, { backgroundColor: theme.colors.background }]}>
      <StatusBar style={theme.statusBar} />
      <View style={styles.root}>
        <MapCanvas
          coordinates={coordinates}
          mapData={mapDataForDisplay}
          mapPadding={mapPadding}
          mapRef={mapRef}
          mapUnits={visibleMapUnits}
          onMapSelectorPress={selector.handleSelectorPress}
          onSelectorDragStart={() => selector.setSelectorPlan(null)}
          onSelectorPointDragEnd={selector.updateSelectorPoint}
          onUnitPress={handleSelectTrackingUnit}
          onUserInteraction={handleMapUserInteraction}
          scaleBarPosition={{ left: 24, top: insets.top + 62 }}
          selectorMode={selectorMode}
          selectorPoints={selector.selectorPoints}
          selectorRoute={selector.selectorRoute}
          selectorStops={selector.selectorStops}
          selectedUnit={selectedUnit}
          trafficEnabled={trafficEnabled}
          visibleIncidents={visibleMapIncidents}
          vehicleById={vehicleById}
        />

        {selectorMode ? (
          <SelectorRouteOverlay
            bottom={insets.bottom + 24}
            copy={selector.copy}
            isPlanningSelectorRoute={selector.isPlanningSelectorRoute}
            onConfirmSelection={selector.handleConfirmSelection}
            onRemoveLastStop={selector.removeLastSelectorStop}
            onRemovePoint={selector.removeSelectorPoint}
            onResetRoute={selector.resetSelectorRoute}
            points={selector.selectorPoints}
            stops={selector.selectorStops}
            top={insets.top + 12}
          />
        ) : (
          <>
            <TrackingHud
              activeRouteCount={activeRouteCount}
              unknownStateCount={unknownStateCount}
              incidentCount={visibleIncidents.length}
              locationStatusColor={locationStatusColor}
              locationStatusLabel={locationStatus.hudLabel}
              serverSyncColor={serverSyncColor}
              serverSyncLabel={serverSyncLabel}
              onOpenMenu={() => setMenuOpen(true)}
              paddingTop={insets.top + 10}
              trafficEnabled={trafficEnabled}
            />
            <FloatingControls
              canRetryLocation={locationStatus.canRetry}
              followMode={followMode}
              incidentCount={visibleIncidents.length}
              isRefreshing={isRefreshing}
              journeyStatus={user.role === 'driver' ? journeyStatus : undefined}
              onConfirmJourney={user.role === 'driver' ? handleConfirmJourney : undefined}
              onFinishJourney={user.role === 'driver' ? handleFinishJourney : undefined}
              onFocusNextAlert={focusNextAlert}
              onPauseJourney={user.role === 'driver' ? handlePauseJourney : undefined}
              onRefresh={handleRefresh}
              onRetryLocation={refresh}
              onStartJourney={user.role === 'driver' ? handleStartJourney : undefined}
              onToggleFollow={() => setFollowMode((current) => !current)}
              onToggleTraffic={() => setTrafficEnabled((current) => !current)}
              top={insets.top + 118}
              trafficEnabled={trafficEnabled}
            />
            <BottomTrackingPanel
              activeIncident={driverWithoutUnit ? null : activeIncident}
              activeIncidentUnit={driverWithoutUnit ? null : activeIncidentUnit}
              bottomPadding={insets.bottom + 10}
              locationStatus={locationStatus}
              locationStatusColor={locationStatusColor}
              onRetryLocation={refresh}
              onSelectIncidentUnit={handleSelectIncidentUnit}
              onSelectTrackingUnit={handleSelectTrackingUnit}
              selectedUnit={selectedUnit}
              selectedVehicle={selectedVehicle}
              trackingUnits={visiblePanelUnits}
              userRole={user.role}
              activeSession={activeRouteSession}
              sessionHistory={sessionHistory}
              incidents={visibleIncidents}
              lastSyncedAt={lastSyncedAt}
            />
          </>
        )}

        <OperationalMenuDrawer visible={menuOpen && !selectorMode} onClose={() => setMenuOpen(false)} activeKey="mapa" />
        <ConfirmModal
          visible={Boolean(pendingJourneyAction)}
          title={journeyModalTitle}
          description={journeyModalDescription}
          confirmLabel={journeyModalLabel}
          danger={pendingJourneyAction === 'finish'}
          processing={isChangingJourney}
          onCancel={() => setPendingJourneyAction(null)}
          onConfirm={handleJourneyAction}
        />
      </View>
    </View>
  );
}
