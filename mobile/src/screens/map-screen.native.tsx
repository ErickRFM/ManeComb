import { Redirect, router, useLocalSearchParams } from '@/src/navigation/router';
import { StatusBar } from '@/src/native/status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { OperationalMenuDrawer } from '@/src/components/operational-menu-drawer';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { useAppStore } from '@/src/store/use-app-store';
import type { RouteShape, User, Vehicle } from '@/src/types/app';
import { getLocationStatus } from '@/src/utils/location-status';
import { normalizeAssignedRoute } from '@/src/utils/navigation-data';
import { BottomTrackingPanel } from './map/components/BottomTrackingPanel';
import { FloatingControls } from './map/components/FloatingControls';
import { MapCanvas } from './map/components/MapCanvas';
import { MapDataRecovery } from './map/components/MapDataRecovery';
import { SelectorRouteOverlay } from './map/components/SelectorRouteOverlay';
import { TrackingHud } from './map/components/TrackingHud';
import { useLocationEngine } from './map/hooks/use-location-engine';
import { useLocationSync } from './map/hooks/use-location-sync';
import { useMapCamera } from './map/hooks/use-map-camera';
import { useMapSelector } from './map/hooks/use-map-selector';
import { useScheduleTick } from './map/hooks/use-schedule-tick';
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
  const matchedRoute = routeId ? routes.find((route) => route.id === routeId) : null;

  if (matchedRoute) return [matchedRoute];

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
    coordinates,
    issue: locationIssue,
    lastUpdatedAt,
    loading: locationLoading,
    permission,
    refresh,
    servicesEnabled,
  } = useLocationEngine();
  const {
    connectionMode,
    activeRouteSession,
    authContext,
    error,
    isRefreshing,
    mapData,
    refreshAll,
    sendVehicleLocation,
    signOut,
    user,
  } = useAppStore(
    useShallow((state) => ({
      connectionMode: state.connectionMode,
      activeRouteSession: state.activeRouteSession,
      authContext: state.authContext,
      error: state.error,
      isRefreshing: state.isRefreshing,
      mapData: state.mapData,
      refreshAll: state.refreshAll,
      sendVehicleLocation: state.sendVehicleLocation,
      signOut: state.signOut,
      user: state.user,
    }))
  );

  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [followMode, setFollowMode] = useState(true);
  const [trafficEnabled, setTrafficEnabled] = useState(true);
  const [activeAlertIndex, setActiveAlertIndex] = useState(0);
  const selectorFocusedVehicleIdRef = useRef<string | null>(null);

  const selectorMode = isSelectorMode(params.point);
  const { fitRoute, focusMap, focusPoint, mapPadding, mapRef, routeFitPadding } = useMapCamera(insets);
  const operationalScheduleState = useScheduleTick(user?.operationalSchedule);
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

  useLocationSync({
    enabled: user?.role !== 'driver' || activeRouteSession?.status === 'RUNNING',
    connectionMode,
    coordinates,
    isWithinSchedule: operationalScheduleState.isWithinSchedule,
    lastUpdatedAt,
    sendVehicleLocation,
    vehicleId: user?.vehicleId,
  });

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
  const mapDataForDisplay =
    driverWithoutUnit || driverWithoutRoute
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

  return (
    <View style={[styles.safeArea, { backgroundColor: theme.colors.background }]}>
      <StatusBar style={theme.statusBar} />
      <View style={styles.root}>
        <MapCanvas
          compassPosition={{ right: 66, top: insets.top + 10 }}
          coordinates={coordinates}
          mapData={mapDataForDisplay}
          mapPadding={mapPadding}
          mapRef={mapRef}
          mapVehicles={visibleMapVehicles}
          onMapSelectorPress={selector.handleSelectorPress}
          onSelectorDragStart={() => selector.setSelectorPlan(null)}
          onSelectorPointDragEnd={selector.updateSelectorPoint}
          onVehiclePress={(vehicle) => {
            setSelectedVehicleId(vehicle.id);
            setFollowMode(true);
          }}
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
            top={insets.top + 80}
          />
        ) : (
          <>
            <TrackingHud
              activeRouteCount={activeRouteCount}
              compassReserved
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
              onFocusNextAlert={focusNextAlert}
              onRefresh={handleRefresh}
              onRetryLocation={refresh}
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
              onSelectIncidentVehicle={(vehicle) => {
                setSelectedVehicleId(vehicle.id);
                setFollowMode(false);
                focusMap(vehicle.location.latitude, vehicle.location.longitude, 'close');
              }}
              onSelectTrackingVehicle={(vehicle) => {
                setSelectedVehicleId(vehicle.id);
                setFollowMode(true);
              }}
              selectedVehicle={selectedVehicle}
              trackingVehicles={visiblePanelVehicles}
            />
          </>
        )}

        <OperationalMenuDrawer visible={menuOpen && !selectorMode} onClose={() => setMenuOpen(false)} activeKey="mapa" />
      </View>
    </View>
  );
}
