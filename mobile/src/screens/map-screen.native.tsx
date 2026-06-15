import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { Redirect, router, useLocalSearchParams } from '@/src/navigation/router';
import { StatusBar } from '@/src/native/status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Marker, Polyline, type MapStyleElement } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { Typography } from '@/constants/theme';
import {
  updateVehicleLocationRequest,
} from '@/src/api/client';
import { OperationalMenuDrawer } from '@/src/components/operational-menu-drawer';
import { StatusPill } from '@/src/components/status-pill';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { useUserLocation } from '@/src/hooks/use-user-location';
import { useAppStore } from '@/src/store/use-app-store';

const lightMapStyle: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#f4f5f7' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6d7280' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#dfe4ec' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#dfeafe' }] },
];

const darkMapStyle: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#0f1722' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8c97ab' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1c2735' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#112031' }] },
];

const ACTIVE_TRACKING_STATUSES = new Set(['online', 'patrolling', 'on-route']);
const LOCATION_SYNC_INTERVAL_MS = 10000;
const LOCATION_SYNC_DISTANCE_METERS = 15;

function distanceInMeters(left: { latitude: number; longitude: number }, right: { latitude: number; longitude: number }) {
  const radius = 6371000;
  const dLat = ((right.latitude - left.latitude) * Math.PI) / 180;
  const dLon = ((right.longitude - left.longitude) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((left.latitude * Math.PI) / 180) *
      Math.cos((right.latitude * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function MapScreen() {
  const { theme } = useAppTheme();
  const mapRef = useRef<MapView | null>(null);
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ vehicleId?: string; follow?: string }>();
  const { coordinates, refresh, permission } = useUserLocation();
  const lastLocationSyncRef = useRef(0);
  const lastSyncedLocationRef = useRef<{ latitude: number; longitude: number } | null>(null);

  const {
    connectionMode,
    error,
    isRefreshing,
    mapData,
    refreshAll,
    signOut,
    user,
  } = useAppStore(
    useShallow((state) => ({
      connectionMode: state.connectionMode,
      error: state.error,
      isRefreshing: state.isRefreshing,
      mapData: state.mapData,
      refreshAll: state.refreshAll,
      signOut: state.signOut,
      user: state.user,
    }))
  );

  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [followMode, setFollowMode] = useState(true);
  const [trafficEnabled, setTrafficEnabled] = useState(true);
  const [activeAlertIndex, setActiveAlertIndex] = useState(0);

  useEffect(() => {
    if (params.vehicleId) {
      setSelectedVehicleId(params.vehicleId);
      if (params.follow === 'true') setFollowMode(true);
    }
  }, [params.vehicleId, params.follow]);

  const prioritizedVehicles = useMemo(() => {
    return [...(mapData?.vehicles || [])].sort((left, right) => {
      return right.delayMinutes - left.delayMinutes || left.code.localeCompare(right.code);
    });
  }, [mapData?.vehicles]);

  const selectedVehicle = useMemo(() =>
    prioritizedVehicles.find((vehicle) => vehicle.id === selectedVehicleId) || prioritizedVehicles[0] || null,
  [prioritizedVehicles, selectedVehicleId]);

  const trackingVehicles = useMemo(() => {
    return prioritizedVehicles.filter((vehicle) => ACTIVE_TRACKING_STATUSES.has(vehicle.status));
  }, [prioritizedVehicles]);

  const visibleIncidents = useMemo(() => {
    if (!mapData) {
      return [];
    }

    return mapData.incidents.filter((incident) =>
      mapData.vehicles.some((vehicle) => vehicle.id === incident.vehicleId)
    );
  }, [mapData]);

  const activeIncident = visibleIncidents.length
    ? visibleIncidents[activeAlertIndex % visibleIncidents.length]
    : null;

  const activeIncidentVehicle = activeIncident
    ? mapData?.vehicles.find((vehicle) => vehicle.id === activeIncident.vehicleId) || null
    : null;

  const focusMap = (latitude: number, longitude: number, zoom: 'close' | 'vehicle' | 'overview' = 'vehicle') => {
    const latitudeDelta = zoom === 'close' ? 0.015 : zoom === 'overview' ? 0.08 : 0.03;
    mapRef.current?.animateToRegion({
      latitude,
      longitude,
      latitudeDelta,
      longitudeDelta: latitudeDelta,
    }, 400);
  };

  const focusNextAlert = () => {
    if (!visibleIncidents.length || !mapData) {
      router.push('/incidencias');
      return;
    }

    const nextIndex = activeAlertIndex + 1;
    const incident = visibleIncidents[nextIndex % visibleIncidents.length];
    const vehicle = mapData.vehicles.find((entry) => entry.id === incident.vehicleId);

    setActiveAlertIndex(nextIndex);

    if (vehicle) {
      setSelectedVehicleId(vehicle.id);
      setFollowMode(false);
      focusMap(vehicle.location.latitude, vehicle.location.longitude, 'close');
    }
  };

  useEffect(() => {
    if (followMode && selectedVehicle) {
      focusMap(selectedVehicle.location.latitude, selectedVehicle.location.longitude);
    }
  }, [selectedVehicle?.location, followMode, selectedVehicle]);

  useEffect(() => {
    if (!coordinates || !user?.vehicleId || connectionMode !== 'online') {
      return;
    }

    const now = Date.now();
    if (now - lastLocationSyncRef.current < LOCATION_SYNC_INTERVAL_MS) {
      return;
    }

    if (
      lastSyncedLocationRef.current &&
      distanceInMeters(lastSyncedLocationRef.current, coordinates) < LOCATION_SYNC_DISTANCE_METERS
    ) {
      return;
    }

    lastLocationSyncRef.current = now;
    lastSyncedLocationRef.current = coordinates;
    updateVehicleLocationRequest({
      vehicleId: user.vehicleId,
      coordinates,
      speed: coordinates.speed,
    }).catch(() => undefined);
  }, [connectionMode, coordinates, user?.vehicleId]);

  const handleRefresh = async () => {
    await Promise.all([refreshAll(), refresh()]);
  };

  const handleResetSession = async () => {
    await signOut();
    router.replace('/login');
  };

  if (!user) {
    return <Redirect href="/login" />;
  }

  if (!mapData) {
    const canOpenPortal = user.accountType === 'company_owner' ||
      ['owner', 'admin', 'billing_manager', 'support', 'viewer'].includes(String(user.role || ''));

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
            <MaterialCommunityIcons name="map-marker-off-outline" size={30} color={theme.colors.accent} />
          </View>
          <Text style={[styles.recoveryTitle, { color: theme.colors.text }]}>
            Panel operativo no disponible
          </Text>
          <Text style={[styles.recoveryMessage, { color: theme.colors.muted }]}>
            {error ||
              'No pudimos cargar el centro de control. Revisa tu plan o intenta sincronizar de nuevo.'}
          </Text>
          <View style={styles.recoveryActions}>
            {canOpenPortal ? (
              <Pressable
                onPress={() => router.replace('/portal/plan')}
                style={({ pressed }) => [
                  styles.recoveryPrimaryButton,
                  { backgroundColor: theme.colors.accent },
                  pressed ? styles.recoveryPressed : undefined,
                ]}>
                <Text style={styles.recoveryPrimaryText}>Ver plan</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => {
                handleRefresh();
              }}
              disabled={isRefreshing}
              style={({ pressed }) => [
                styles.recoverySecondaryButton,
                { borderColor: theme.colors.line, backgroundColor: theme.colors.surface },
                pressed && !isRefreshing ? styles.recoveryPressed : undefined,
                isRefreshing ? styles.recoveryDisabled : undefined,
              ]}>
              {isRefreshing ? (
                <MaterialCommunityIcons name="sync" size={18} color={theme.colors.accent} />
              ) : null}
              <Text style={[styles.recoverySecondaryText, { color: theme.colors.text }]}>
                {isRefreshing ? 'Sincronizando...' : 'Reintentar'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                handleResetSession();
              }}
              style={({ pressed }) => [
                styles.recoveryGhostButton,
                pressed ? styles.recoveryPressed : undefined,
              ]}>
              <Text style={[styles.recoveryGhostText, { color: theme.colors.muted }]}>
                Reiniciar sesion
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.safeArea, { backgroundColor: theme.colors.background }]}>
      <StatusBar style={theme.statusBar} />
      <View style={styles.root}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={{
            latitude: selectedVehicle?.location.latitude || mapData.center.latitude,
            longitude: selectedVehicle?.location.longitude || mapData.center.longitude,
            latitudeDelta: 0.08,
            longitudeDelta: 0.08,
          }}
          mapPadding={{
            top: insets.top + 110,
            right: 72,
            bottom: insets.bottom + 210,
            left: 12,
          }}
          showsBuildings
          showsCompass
          showsScale
          showsTraffic={trafficEnabled}
          customMapStyle={theme.mode === 'light' ? lightMapStyle : darkMapStyle}>
          {mapData.routes.map((route) => (
            <Polyline key={route.id} coordinates={route.polyline} strokeColor={route.color} strokeWidth={3} />
          ))}

          {mapData.vehicles.map((vehicle) => {
            const vehicleMarkerStyle = {
              backgroundColor: vehicle.status === 'maintenance' ? theme.colors.danger : theme.colors.accent,
            };

            return (
              <Marker
                key={vehicle.id}
                coordinate={vehicle.location}
                onPress={() => {
                  setSelectedVehicleId(vehicle.id);
                  setFollowMode(true);
                }}>
                <View style={[styles.vehicleMarker, vehicleMarkerStyle]}>
                   <View style={styles.vehicleMarkerInner} />
                </View>
              </Marker>
            );
          })}

          {mapData.incidents.map((incident) => {
            const v = mapData.vehicles.find(veh => veh.id === incident.vehicleId);
            if (!v) return null;
            return (
              <Marker key={incident.id} coordinate={v.location}>
                <View style={[styles.incidentMarker, { backgroundColor: incident.severity === 'critical' ? theme.colors.danger : theme.colors.warning }]}>
                  <MaterialCommunityIcons name="alert-decagram" size={14} color="#FFF" />
                </View>
              </Marker>
            );
          })}

          {coordinates && (
            <Marker coordinate={coordinates}>
               <View style={[styles.userMarker, { backgroundColor: theme.colors.info }]} />
            </Marker>
          )}
        </MapView>

        {/* HUD Overlay */}
        <View style={[styles.topOverlay, { paddingTop: insets.top + 10 }]}>
           <View style={styles.topBar}>
              <Pressable onPress={() => router.push('/incidencias')} style={[styles.iconButton, { backgroundColor: theme.colors.headerGlass, borderColor: theme.colors.line }]}>
                <MaterialCommunityIcons name="alert-outline" size={24} color={theme.colors.accent} />
              </Pressable>

              <View style={[styles.hud, { backgroundColor: theme.colors.headerGlass, borderColor: theme.colors.line }]}>
                <HUDItem value={`${mapData.vehicles.filter(v => v.status === 'on-route').length}`} icon="bus" color={theme.colors.info} />
                <HUDItem value={`${mapData.incidents.length}`} icon="alert" color={theme.colors.danger} />
                <HUDItem value={permission === 'granted' ? 'OK' : 'OFF'} icon="crosshairs-gps" color={theme.colors.success} />
                <HUDItem value={trafficEnabled ? 'ON' : 'OFF'} icon="traffic-light" color={trafficEnabled ? theme.colors.warning : theme.colors.muted} />
              </View>

              <Pressable onPress={() => setMenuOpen(true)} style={[styles.iconButton, { backgroundColor: theme.colors.headerGlass, borderColor: theme.colors.line }]}>
                <MaterialCommunityIcons name="menu" size={24} color={theme.colors.text} />
              </Pressable>
           </View>
        </View>

        {/* Side Controls */}
        <View style={[styles.sideActions, { top: insets.top + 80 }]}>
          <Pressable onPress={handleRefresh} style={[styles.fab, { backgroundColor: theme.colors.headerGlass, borderColor: theme.colors.line }]}>
            <MaterialCommunityIcons name={isRefreshing ? "sync" : "refresh"} size={22} color={theme.colors.text} />
          </Pressable>
          <Pressable onPress={() => setFollowMode(!followMode)} style={[styles.fab, { backgroundColor: followMode ? theme.colors.accent : theme.colors.headerGlass, borderColor: theme.colors.line }]}>
            <MaterialCommunityIcons name={followMode ? "navigation" : "map-search"} size={22} color={followMode ? "#FFF" : theme.colors.text} />
          </Pressable>
          <Pressable onPress={() => setTrafficEnabled((current) => !current)} style={[styles.fab, { backgroundColor: trafficEnabled ? theme.colors.warning : theme.colors.headerGlass, borderColor: theme.colors.line }]}>
            <MaterialCommunityIcons name="traffic-light" size={22} color={trafficEnabled ? "#FFF" : theme.colors.text} />
          </Pressable>
          <Pressable onPress={focusNextAlert} style={[styles.fab, { backgroundColor: visibleIncidents.length ? theme.colors.danger : theme.colors.headerGlass, borderColor: theme.colors.line }]}>
            <MaterialCommunityIcons name="alert-decagram" size={22} color={visibleIncidents.length ? "#FFF" : theme.colors.text} />
          </Pressable>
          {permission !== 'granted' && (
            <Pressable onPress={refresh} style={[styles.fab, { backgroundColor: theme.colors.warning, borderColor: theme.colors.line }]}>
              <MaterialCommunityIcons name="location-exit" size={22} color="#FFF" />
            </Pressable>
          )}
        </View>

        {/* Bottom HUD */}
        <View style={[styles.bottomOverlay, { paddingBottom: insets.bottom + 10 }]}>
          <View style={[styles.followCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.line }]}>
             <View style={styles.followHeader}>
                <View>
                  <Text style={[styles.followTitle, { color: theme.colors.text }]}>{selectedVehicle?.code || 'Flota'}</Text>
                  <Text style={[styles.followMeta, { color: theme.colors.muted }]}>{selectedVehicle?.driverName || 'En monitoreo'}</Text>
                </View>
                <StatusPill label={`${selectedVehicle?.speed || 0} km/h`} tone="info" />
             </View>

             {activeIncident && activeIncidentVehicle ? (
               <Pressable
                 onPress={() => {
                   setSelectedVehicleId(activeIncidentVehicle.id);
                   setFollowMode(false);
                   focusMap(activeIncidentVehicle.location.latitude, activeIncidentVehicle.location.longitude, 'close');
                 }}
                 style={[styles.alertStrip, { backgroundColor: theme.colors.danger, borderColor: theme.colors.danger }]}>
                 <MaterialCommunityIcons name="alert-decagram" size={18} color="#FFF" />
                 <View style={styles.alertCopy}>
                   <Text style={styles.alertTitle}>{activeIncident.title}</Text>
                   <Text style={styles.alertMeta}>{activeIncidentVehicle.code} - {activeIncident.status}</Text>
                 </View>
               </Pressable>
             ) : null}

             <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trackList}>
                {trackingVehicles.map((v) => {
                  const isSelected = v.id === selectedVehicle?.id;
                  const selectedTrackChipStyle = {
                    backgroundColor: theme.colors.accent,
                    borderColor: theme.colors.accent,
                  };
                  const trackChipTitleStyle = isSelected ? styles.trackChipTitleSelected : { color: theme.colors.text };

                  return (
                    <Pressable
                      key={v.id}
                      onPress={() => {
                        setSelectedVehicleId(v.id);
                        setFollowMode(true);
                      }}
                      style={[styles.trackChip, isSelected ? selectedTrackChipStyle : undefined]}>
                      <Text style={[styles.trackChipTitle, trackChipTitleStyle]}>{v.code}</Text>
                    </Pressable>
                  );
                })}
             </ScrollView>
          </View>
        </View>

        <OperationalMenuDrawer visible={menuOpen} onClose={() => setMenuOpen(false)} activeKey="mapa" />
      </View>
    </View>
  );
}

function HUDItem({ value, icon, color }: { value: string, icon: keyof typeof MaterialCommunityIcons.glyphMap, color: string }) {
  const { theme } = useAppTheme();
  return (
    <View style={styles.hudItem}>
      <MaterialCommunityIcons name={icon} size={14} color={color} />
      <Text style={[styles.hudValue, { color: theme.colors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  root: { flex: 1 },
  topOverlay: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 16, zIndex: 10 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minWidth: 0 },
  iconButton: { width: 52, height: 52, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  hud: { flex: 1, height: 52, borderRadius: 16, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', minWidth: 0, paddingHorizontal: 12 },
  hudItem: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, gap: 6, minWidth: 0 },
  hudValue: { flexShrink: 1, fontSize: 15, fontWeight: '800', fontFamily: Typography.mono, minWidth: 0 },
  sideActions: { position: 'absolute', right: 16, gap: 12, zIndex: 10 },
  fab: { width: 48, height: 48, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  bottomOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 16, zIndex: 10 },
  followCard: { borderRadius: 24, borderWidth: 1, padding: 16, gap: 12, elevation: 8, shadowOpacity: 0.15, shadowRadius: 10 },
  followHeader: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', alignItems: 'center', minWidth: 0 },
  followTitle: { flexShrink: 1, fontSize: 22, fontWeight: '800', fontFamily: Typography.display, minWidth: 0 },
  followMeta: { fontSize: 13, fontFamily: Typography.body, minWidth: 0 },
  alertStrip: {
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  alertCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  alertTitle: {
    color: '#FFF',
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '800',
    fontFamily: Typography.body,
    minWidth: 0,
  },
  alertMeta: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 11,
    fontFamily: Typography.body,
  },
  trackList: { gap: 10 },
  trackChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  trackChipTitle: { fontSize: 14, fontWeight: '700', fontFamily: Typography.body },
  trackChipTitleSelected: { color: '#FFF' },
  vehicleMarker: { width: 22, height: 22, borderRadius: 11, borderWidth: 3, borderColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  vehicleMarkerInner: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFF' },
  incidentMarker: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  userMarker: { width: 20, height: 20, borderRadius: 10, borderWidth: 3, borderColor: '#FFF' },
  recoveryRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingHorizontal: 28,
  },
  recoveryIcon: {
    width: 62,
    height: 62,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recoveryTitle: {
    fontFamily: Typography.display,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  recoveryMessage: {
    maxWidth: 420,
    fontFamily: Typography.body,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  recoveryActions: {
    width: '100%',
    maxWidth: 320,
    gap: 10,
    marginTop: 8,
  },
  recoveryPrimaryButton: {
    minHeight: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  recoveryPrimaryText: {
    color: '#FFF',
    fontFamily: Typography.body,
    fontSize: 15,
    fontWeight: '800',
  },
  recoverySecondaryButton: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  recoverySecondaryText: {
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '700',
  },
  recoveryGhostButton: {
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  recoveryGhostText: {
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '700',
  },
  recoveryPressed: {
    opacity: 0.86,
  },
  recoveryDisabled: {
    opacity: 0.64,
  },
});
