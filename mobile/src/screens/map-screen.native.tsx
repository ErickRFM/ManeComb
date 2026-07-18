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
import {
  getBackgroundLocationServiceStatusAsync,
  startBackgroundLocationServiceAsync,
  stopBackgroundLocationServiceAsync,
} from '@/src/native/background-location';
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
import { hasVehicleLiveLocation } from './map/utils/tracking';

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
    mapData,
    lastSyncedAt,
    sessionHistory,
    refreshAll,
    deviceLocation,
    refreshDeviceLocation,
    signOut,
    apiUrl,
    token,
    refreshToken,
    syncBackgroundLocationCredentials,
    user,
  } = useAppStore(
    useShallow((state) => ({
      activeRouteSession: state.activeRouteSession,
      authContext: state.authContext,
      error: state.error,
      isRefreshing: state.isRefreshing,
      mapData: state.mapData,
      lastSyncedAt: state.lastSyncedAt,
      sessionHistory: state.routeSessionHistory,
      refreshAll: state.refreshAll,
      deviceLocation: state.deviceLocation,
      refreshDeviceLocation: state.refreshDeviceLocation,
      signOut: state.signOut,
      apiUrl: state.apiUrl,
      token: state.token,
      refreshToken: state.refreshToken,
      syncBackgroundLocationCredentials: state.syncBackgroundLocationCredentials,
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
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [followMode, setFollowMode] = useState(true);
  const [trafficEnabled, setTrafficEnabled] = useState(true);
  const [activeAlertIndex, setActiveAlertIndex] = useState(0);
  const [pendingJourneyAction, setPendingJourneyAction] = useState<RouteSessionAction | null>(null);
  const [isChangingJourney, setIsChangingJourney] = useState(false);
  const selectorFocusedVehicleIdRef = useRef<string | null>(null);

  useEffect(() => {
    const inspectBackgroundTracking = async () => {
      const status = await getBackgroundLocationServiceStatusAsync();
      if (status.token && status.refreshToken && (status.token !== token || status.refreshToken !== refreshToken)) {
        await syncBackgroundLocationCredentials(status.token, status.refreshToken);
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
  }, [refreshToken, syncBackgroundLocationCredentials, token]);

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

  const {
    activeIncident,
    activeIncidentVehicle,
    activeRouteCount,
    liveVehicles,
    prioritizedVehicles,
    selectedVehicle,
    trackingVehicles,
    vehicleById,
    visibleIncidents,
  } = useTrackingData(mapData, selectedVehicleId, activeAlertIndex);

  const selector = useMapSelector({
    focusPoint,
    fitRoute,
    params,
    routeFitPadding,
    selectorMode,
  });

  const handleSelectTrackingVehicle = useCallback((vehicle: Vehicle) => {
    setSelectedVehicleId(vehicle.id);
    setFollowMode(true);
    const routes = getSelectedVehicleRoutes(vehicle, mapData?.routes || []);

    if (routes.length > 0 && routes[0].polyline.length > 1) {
      fitRoute({ coordinates: routes[0].polyline, edgePadding: routeFitPadding });
      return;
    }

    if (vehicle.locationTimestamp) focusPoint(vehicle.location);
  }, [fitRoute, focusPoint, mapData?.routes, routeFitPadding]);

  const handleSelectIncidentVehicle = useCallback((vehicle: Vehicle) => {
    setSelectedVehicleId(vehicle.id);
    setFollowMode(false);
    focusMap(vehicle.location.latitude, vehicle.location.longitude, 'close');
  }, [focusMap]);

  useEffect(() => {
    if (params.vehicleId) {
      setSelectedVehicleId(params.vehicleId);
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

    if (followMode && selectedVehicle && hasVehicleLiveLocation(selectedVehicle)) {
      focusPoint(selectedVehicle.location);
    }
  }, [focusPoint, followMode, params.focusLatitude, params.focusLongitude, selectedVehicle]);

  useEffect(() => {
    if (!selectorMode) {
      selectorFocusedVehicleIdRef.current = null;
      return;
    }

    if (
      selectedVehicle &&
      hasVehicleLiveLocation(selectedVehicle) &&
      selectorFocusedVehicleIdRef.current !== selectedVehicle.id
    ) {
      selectorFocusedVehicleIdRef.current = selectedVehicle.id;
      setFollowMode(false);
      focusPoint(selectedVehicle.location);
    }
  }, [focusPoint, selectorMode, selectedVehicle]);

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
      setSelectedVehicleId(vehicle.id);
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
        onRefresh={handleRefresh}
        onResetSession={handleResetSession}
        user={user}
      />
    );
  }

  const driverVehicle = user.vehicleId ? vehicleById.get(user.vehicleId) || null : null;
  const mapGate = getMapGateState({
    hasCoordinates: Boolean(coordinates),
    liveVehicleCount: liveVehicles.length,
    totalVehicleCount: prioritizedVehicles.length,
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
  const visibleMapVehicles = driverWithoutUnit ? [] : liveVehicles;
  const visiblePanelVehicles = driverWithoutUnit ? [] : user.role === 'driver' ? trackingVehicles : prioritizedVehicles;
  const visibleMapIncidents = driverWithoutUnit ? [] : visibleIncidents;

  const journeyStatus: 'none' | 'running' | 'paused' = !activeRouteSession ? 'none' : activeRouteSession.status === 'RUNNING' ? 'running' : activeRouteSession.status === 'PAUSED' ? 'paused' : 'none';
  const journeyVehicleId = user.vehicleId || selectedVehicle?.id || '';
  const handleJourneyAction = async () => {
    const action = pendingJourneyAction;
    const vehicle = vehicleById.get(journeyVehicleId);
    if (!action || !vehicle || isChangingJourney) return;
    setIsChangingJourney(true);
    try {
      const result = await executeRouteSessionAction({
        action,
        currentSession: activeRouteSession,
        organizationId: user.organizationId || '',
        routeId: vehicle.routeId || '',
        userId: user.id,
        vehicleId: vehicle.id,
        driverId: vehicle.driverId,
      });
      useAppStore.setState({ activeRouteSession: result.session });
      if (action === 'finish') {
        await stopBackgroundLocationServiceAsync().catch(() => undefined);
      } else if (action === 'start' || action === 'resume') {
        const backgroundPermission = await requestBackgroundPermission();
        if (backgroundPermission.status !== Location.PermissionStatus.GRANTED) {
          Alert.alert(
            'Ubicacion en segundo plano desactivada',
            'ManeComb continuara rastreando mientras la app este visible. Habilita "Permitir siempre" en Ajustes para mantener el rastreo con la pantalla bloqueada.'
          );
        } else if (!token || !refreshToken) {
          Alert.alert('No se pudo activar el rastreo', 'Faltan credenciales de sesion. Inicia sesion nuevamente.');
        } else {
          const started = await startBackgroundLocationServiceAsync({
            apiUrl,
            refreshToken,
            schedule: user.operationalSchedule,
            sessionId: result.session?.id || '',
            token,
            vehicleId: vehicle.id,
          }).catch(() => false);
          if (!started) {
            Alert.alert(
              'Rastreo en segundo plano no disponible',
              'La jornada inicio, pero el GPS en segundo plano no pudo activarse. El rastreo en primer plano continuara.'
            );
          }
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
  const handleStartJourney = () => setPendingJourneyAction('start');
  const handleFinishJourney = () => setPendingJourneyAction('finish');
  const handlePauseJourney = () => setPendingJourneyAction(journeyStatus === 'paused' ? 'resume' : 'pause');

  return (
    <View style={[styles.safeArea, { backgroundColor: theme.colors.background }]}>
      <StatusBar style={theme.statusBar} />
      <View style={styles.root}>
        <MapCanvas
          coordinates={coordinates}
          mapData={mapDataForDisplay}
          mapPadding={mapPadding}
          mapRef={mapRef}
          mapVehicles={visibleMapVehicles}
          onMapSelectorPress={selector.handleSelectorPress}
          onSelectorDragStart={() => selector.setSelectorPlan(null)}
          onSelectorPointDragEnd={selector.updateSelectorPoint}
          onVehiclePress={handleSelectTrackingVehicle}
          scaleBarPosition={{ left: 24, top: insets.top + 62 }}
          selectorMode={selectorMode}
          selectorPoints={selector.selectorPoints}
          selectorRoute={selector.selectorRoute}
          selectorStops={selector.selectorStops}
          selectedVehicle={selectedVehicle}
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
              incidentCount={visibleIncidents.length}
              locationStatusColor={locationStatusColor}
              locationStatusLabel={locationStatus.hudLabel}
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
              activeIncidentVehicle={driverWithoutUnit ? null : activeIncidentVehicle}
              bottomPadding={insets.bottom + 10}
              locationStatus={locationStatus}
              locationStatusColor={locationStatusColor}
              onRetryLocation={refresh}
              onSelectIncidentVehicle={handleSelectIncidentVehicle}
              onSelectTrackingVehicle={handleSelectTrackingVehicle}
              selectedVehicle={selectedVehicle}
              trackingVehicles={visiblePanelVehicles}
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
          title={pendingJourneyAction === 'finish' ? 'Finalizar jornada' : pendingJourneyAction === 'pause' ? 'Pausar jornada' : pendingJourneyAction === 'resume' ? 'Reanudar jornada' : 'Iniciar jornada'}
          description="La unidad permanecera en Seguimiento y el cambio se sincronizara con Control."
          confirmLabel={pendingJourneyAction === 'finish' ? 'Finalizar' : pendingJourneyAction === 'pause' ? 'Pausar' : pendingJourneyAction === 'resume' ? 'Reanudar' : 'Iniciar'}
          danger={pendingJourneyAction === 'finish'}
          processing={isChangingJourney}
          onCancel={() => setPendingJourneyAction(null)}
          onConfirm={handleJourneyAction}
        />
      </View>
    </View>
  );
}
