import { Redirect, router, useLocalSearchParams } from '@/src/navigation/router';
import { StatusBar } from '@/src/native/status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { OperationalMenuDrawer } from '@/src/components/operational-menu-drawer';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { useAppStore } from '@/src/store/use-app-store';
import { getLocationStatus } from '@/src/utils/location-status';
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
    if (followMode && selectedVehicle) {
      focusPoint(selectedVehicle.location);
    }
  }, [focusPoint, followMode, selectedVehicle]);

  useEffect(() => {
    if (!selectorMode) {
      selectorFocusedVehicleIdRef.current = null;
      return;
    }

    if (selectedVehicle && selectorFocusedVehicleIdRef.current !== selectedVehicle.id) {
      selectorFocusedVehicleIdRef.current = selectedVehicle.id;
      setFollowMode(false);
      focusPoint(selectedVehicle.location);
    }
  }, [focusPoint, selectorMode, selectedVehicle]);

  useLocationSync({
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

    setActiveAlertIndex(nextIndex);

    if (vehicle) {
      setSelectedVehicleId(vehicle.id);
      setFollowMode(false);
      focusMap(vehicle.location.latitude, vehicle.location.longitude, 'close');
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

  return (
    <View style={[styles.safeArea, { backgroundColor: theme.colors.background }]}>
      <StatusBar style={theme.statusBar} />
      <View style={styles.root}>
        <MapCanvas
          compassPosition={{ right: 66, top: insets.top + 10 }}
          coordinates={coordinates}
          mapData={mapData}
          mapPadding={mapPadding}
          mapRef={mapRef}
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
          visibleIncidents={visibleIncidents}
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
              activeIncident={activeIncident}
              activeIncidentVehicle={activeIncidentVehicle}
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
              trackingVehicles={trackingVehicles}
            />
          </>
        )}

        <OperationalMenuDrawer visible={menuOpen && !selectorMode} onClose={() => setMenuOpen(false)} activeKey="mapa" />
      </View>
    </View>
  );
}
