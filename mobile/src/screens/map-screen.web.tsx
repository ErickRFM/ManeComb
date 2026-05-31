import { MaterialCommunityIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { Typography } from '@/constants/theme';
import { updateVehicleLocationRequest } from '@/src/api/client';
import { OperationalMenuDrawer } from '@/src/components/operational-menu-drawer';
import { StatusPill } from '@/src/components/status-pill';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { useUserLocation } from '@/src/hooks/use-user-location';
import { useAppStore } from '@/src/store/use-app-store';
import type { GeoPoint } from '@/src/types/app';

const lightGoogleMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#f4f5f7' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6d7280' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#dfe4ec' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#dfeafe' }] },
];

const darkGoogleMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#0f1722' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8c97ab' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1c2735' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#112031' }] },
];

const ACTIVE_TRACKING_STATUSES = new Set(['online', 'patrolling', 'on-route']);
const LOCATION_SYNC_INTERVAL_MS = 10000;
const LOCATION_SYNC_DISTANCE_METERS = 15;
const GOOGLE_MAPS_SCRIPT_ID = 'manecomb-google-maps-js';
const GOOGLE_MAPS_ZOOM = {
  close: 16,
  overview: 12,
  vehicle: 14,
};

let googleMapsScriptPromise: Promise<any> | null = null;

function distanceInMeters(left: GeoPoint, right: GeoPoint) {
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

function toGooglePoint(point: GeoPoint) {
  return {
    lat: point.latitude,
    lng: point.longitude,
  };
}

function readGoogleMapsApiKey() {
  const envValue = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();

  if (envValue) {
    return envValue;
  }

  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const extraValue = extra?.googleMapsApiKey ?? extra?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

  return typeof extraValue === 'string' ? extraValue.trim() : '';
}

function loadGoogleMaps(apiKey: string) {
  if (typeof window === 'undefined' || !apiKey) {
    return Promise.resolve(null);
  }

  const globalWindow = window as any;

  if (globalWindow.google?.maps) {
    return Promise.resolve(globalWindow.google.maps);
  }

  if (googleMapsScriptPromise) {
    return googleMapsScriptPromise;
  }

  googleMapsScriptPromise = new Promise((resolve, reject) => {
    const finish = () => {
      if (globalWindow.google?.maps) {
        resolve(globalWindow.google.maps);
      } else {
        reject(new Error('Google Maps JS API did not expose google.maps.'));
      }
    };

    const existingScript = document.getElementById(GOOGLE_MAPS_SCRIPT_ID);

    if (existingScript) {
      existingScript.addEventListener('load', finish, { once: true });
      existingScript.addEventListener('error', reject, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
    script.onload = finish;
    script.onerror = () => reject(new Error('Google Maps JS API failed to load.'));
    document.head.appendChild(script);
  });

  return googleMapsScriptPromise;
}

function clearMapObjects(objects: any[]) {
  objects.forEach((entry) => {
    if (entry?.setMap) {
      entry.setMap(null);
    }
  });
}

export function MapScreen() {
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ vehicleId?: string; follow?: string }>();
  const { coordinates, refresh, permission } = useUserLocation();
  const mapHostRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const markerRefs = useRef<any[]>([]);
  const routeRefs = useRef<any[]>([]);
  const trafficLayerRef = useRef<any>(null);
  const lastLocationSyncRef = useRef(0);
  const lastSyncedLocationRef = useRef<GeoPoint | null>(null);

  const {
    connectionMode,
    isRefreshing,
    mapData,
    refreshAll,
    user,
  } = useAppStore(
    useShallow((state) => ({
      connectionMode: state.connectionMode,
      isRefreshing: state.isRefreshing,
      mapData: state.mapData,
      refreshAll: state.refreshAll,
      user: state.user,
    }))
  );

  const [googleMaps, setGoogleMaps] = useState<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapLoadError, setMapLoadError] = useState<'missing-key' | 'load-failed' | null>(null);
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

  const selectedVehicle = useMemo(
    () =>
      prioritizedVehicles.find((vehicle) => vehicle.id === selectedVehicleId) ||
      prioritizedVehicles[0] ||
      null,
    [prioritizedVehicles, selectedVehicleId]
  );

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

  const focusMap = useCallback((latitude: number, longitude: number, zoom: keyof typeof GOOGLE_MAPS_ZOOM = 'vehicle') => {
    if (!mapRef.current) {
      return;
    }

    mapRef.current.panTo({ lat: latitude, lng: longitude });
    mapRef.current.setZoom(GOOGLE_MAPS_ZOOM[zoom]);
  }, []);

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
    let cancelled = false;
    const apiKey = readGoogleMapsApiKey();

    if (!apiKey) {
      setMapLoadError('missing-key');
      return;
    }

    setMapLoadError(null);
    loadGoogleMaps(apiKey)
      .then((maps) => {
        if (!cancelled && maps) {
          setGoogleMaps(maps);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMapLoadError('load-failed');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!googleMaps || !mapHostRef.current || !mapData || mapRef.current) {
      return;
    }

    const initialCenter = selectedVehicle?.location || mapData.center;
    mapRef.current = new googleMaps.Map(mapHostRef.current, {
      center: toGooglePoint(initialCenter),
      clickableIcons: false,
      controlSize: 30,
      disableDefaultUI: true,
      fullscreenControl: false,
      gestureHandling: 'greedy',
      mapTypeControl: false,
      mapTypeId: 'roadmap',
      scaleControl: true,
      streetViewControl: false,
      styles: theme.mode === 'light' ? lightGoogleMapStyle : darkGoogleMapStyle,
      zoom: GOOGLE_MAPS_ZOOM.overview,
      zoomControl: true,
    });
    trafficLayerRef.current = new googleMaps.TrafficLayer();
    setMapReady(true);
  }, [googleMaps, mapData, selectedVehicle?.location, theme.mode]);

  useEffect(() => {
    return () => {
      clearMapObjects(markerRefs.current);
      clearMapObjects(routeRefs.current);
      trafficLayerRef.current?.setMap(null);
      markerRefs.current = [];
      routeRefs.current = [];
      trafficLayerRef.current = null;
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) {
      return;
    }

    mapRef.current.setOptions({
      mapTypeId: 'roadmap',
      styles: theme.mode === 'light' ? lightGoogleMapStyle : darkGoogleMapStyle,
    });
  }, [mapReady, theme.mode]);

  useEffect(() => {
    if (!mapRef.current || !trafficLayerRef.current) {
      return;
    }

    trafficLayerRef.current.setMap(trafficEnabled ? mapRef.current : null);
  }, [mapReady, trafficEnabled]);

  useEffect(() => {
    if (!googleMaps || !mapData || !mapRef.current) {
      return;
    }

    clearMapObjects(markerRefs.current);
    clearMapObjects(routeRefs.current);

    routeRefs.current = mapData.routes.map(
      (route) =>
        new googleMaps.Polyline({
          geodesic: true,
          map: mapRef.current,
          path: route.polyline.map(toGooglePoint),
          strokeColor: route.color,
          strokeOpacity: 0.72,
          strokeWeight: 4,
        })
    );

    const nextMarkers: any[] = [];

    mapData.vehicles.forEach((vehicle) => {
      const isSelected = vehicle.id === selectedVehicle?.id;
      const marker = new googleMaps.Marker({
        icon: {
          fillColor: vehicle.status === 'maintenance' ? theme.colors.danger : theme.colors.accent,
          fillOpacity: 1,
          path: googleMaps.SymbolPath.CIRCLE,
          scale: isSelected ? 9 : 7,
          strokeColor: '#FFF',
          strokeWeight: 3,
        },
        map: mapRef.current,
        optimized: true,
        position: toGooglePoint(vehicle.location),
        title: `${vehicle.code} - ${vehicle.driverName}`,
        zIndex: isSelected ? 40 : 20,
      });

      marker.addListener('click', () => {
        setSelectedVehicleId(vehicle.id);
        setFollowMode(true);
      });
      nextMarkers.push(marker);
    });

    mapData.incidents.forEach((incident) => {
      const vehicle = mapData.vehicles.find((entry) => entry.id === incident.vehicleId);

      if (!vehicle) {
        return;
      }

      nextMarkers.push(
        new googleMaps.Marker({
          icon: {
            fillColor: incident.severity === 'critical' ? theme.colors.danger : theme.colors.warning,
            fillOpacity: 1,
            path: googleMaps.SymbolPath.CIRCLE,
            scale: 10,
            strokeColor: '#FFF',
            strokeWeight: 2,
          },
          label: {
            color: '#FFF',
            fontSize: '12px',
            fontWeight: '800',
            text: '!',
          },
          map: mapRef.current,
          optimized: true,
          position: toGooglePoint(vehicle.location),
          title: incident.title,
          zIndex: 60,
        })
      );
    });

    if (coordinates) {
      nextMarkers.push(
        new googleMaps.Marker({
          icon: {
            fillColor: theme.colors.info,
            fillOpacity: 1,
            path: googleMaps.SymbolPath.CIRCLE,
            scale: 7,
            strokeColor: '#FFF',
            strokeWeight: 3,
          },
          map: mapRef.current,
          optimized: true,
          position: toGooglePoint(coordinates),
          title: 'Mi ubicacion',
          zIndex: 70,
        })
      );
    }

    markerRefs.current = nextMarkers;
  }, [
    coordinates,
    googleMaps,
    mapData,
    mapReady,
    selectedVehicle?.id,
    theme.colors.accent,
    theme.colors.danger,
    theme.colors.info,
    theme.colors.warning,
  ]);

  useEffect(() => {
    if (followMode && selectedVehicle) {
      focusMap(selectedVehicle.location.latitude, selectedVehicle.location.longitude);
    }
  }, [focusMap, followMode, selectedVehicle]);

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
    void updateVehicleLocationRequest({
      vehicleId: user.vehicleId,
      coordinates,
      speed: coordinates.speed,
    }).catch(() => undefined);
  }, [connectionMode, coordinates, user?.vehicleId]);

  const handleRefresh = async () => {
    await Promise.all([refreshAll(), refresh()]);
  };

  if (!mapData || !user) {
    return (
      <View style={[styles.safeArea, styles.centered, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator color={theme.colors.accent} size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.safeArea, { backgroundColor: theme.colors.background }]}>
      <StatusBar style={theme.statusBar} />
      <View style={styles.root}>
        <View ref={mapHostRef} style={[styles.mapSurface, { backgroundColor: theme.colors.mapBackground }]} />

        {(!mapReady || mapLoadError) && (
          <View style={[styles.mapLoading, { backgroundColor: theme.colors.mapBackground }]}>
            {mapLoadError ? (
              <View style={[styles.mapNotice, { backgroundColor: theme.colors.surface, borderColor: theme.colors.line }]}>
                <MaterialCommunityIcons name="google-maps" size={26} color={theme.colors.accent} />
                <View style={styles.mapNoticeCopy}>
                  <Text style={[styles.mapNoticeTitle, { color: theme.colors.text }]}>
                    Google Maps web no esta configurado
                  </Text>
                  <Text style={[styles.mapNoticeText, { color: theme.colors.muted }]}>
                    Define EXPO_PUBLIC_GOOGLE_MAPS_API_KEY para que web use el mismo proveedor que movil.
                  </Text>
                </View>
              </View>
            ) : (
              <ActivityIndicator color={theme.colors.accent} size="large" />
            )}
          </View>
        )}

        <View style={[styles.topOverlay, { paddingTop: insets.top + 10 }]}>
          <View style={styles.topBar}>
            <Pressable
              onPress={() => router.push('/incidencias')}
              style={[styles.iconButton, { backgroundColor: theme.colors.headerGlass, borderColor: theme.colors.line }]}>
              <MaterialCommunityIcons name="alert-outline" size={24} color={theme.colors.accent} />
            </Pressable>

            <View style={[styles.hud, { backgroundColor: theme.colors.headerGlass, borderColor: theme.colors.line }]}>
              <HUDItem value={`${mapData.vehicles.filter((vehicle) => vehicle.status === 'on-route').length}`} icon="bus" color={theme.colors.info} />
              <HUDItem value={`${mapData.incidents.length}`} icon="alert" color={theme.colors.danger} />
              <HUDItem value={permission === 'granted' ? 'OK' : 'OFF'} icon="crosshairs-gps" color={theme.colors.success} />
              <HUDItem value={trafficEnabled ? 'ON' : 'OFF'} icon="traffic-light" color={trafficEnabled ? theme.colors.warning : theme.colors.muted} />
            </View>

            <Pressable
              onPress={() => setMenuOpen(true)}
              style={[styles.iconButton, { backgroundColor: theme.colors.headerGlass, borderColor: theme.colors.line }]}>
              <MaterialCommunityIcons name="menu" size={24} color={theme.colors.text} />
            </Pressable>
          </View>
        </View>

        <View style={[styles.sideActions, { top: insets.top + 80 }]}>
          <Pressable
            onPress={handleRefresh}
            style={[styles.fab, { backgroundColor: theme.colors.headerGlass, borderColor: theme.colors.line }]}>
            <MaterialCommunityIcons name={isRefreshing ? 'sync' : 'refresh'} size={22} color={theme.colors.text} />
          </Pressable>
          <Pressable
            onPress={() => setFollowMode((current) => !current)}
            style={[styles.fab, { backgroundColor: followMode ? theme.colors.accent : theme.colors.headerGlass, borderColor: theme.colors.line }]}>
            <MaterialCommunityIcons name={followMode ? 'navigation' : 'map-search'} size={22} color={followMode ? '#FFF' : theme.colors.text} />
          </Pressable>
          <Pressable
            onPress={() => setTrafficEnabled((current) => !current)}
            style={[styles.fab, { backgroundColor: trafficEnabled ? theme.colors.warning : theme.colors.headerGlass, borderColor: theme.colors.line }]}>
            <MaterialCommunityIcons name="traffic-light" size={22} color={trafficEnabled ? '#FFF' : theme.colors.text} />
          </Pressable>
          <Pressable
            onPress={focusNextAlert}
            style={[styles.fab, { backgroundColor: visibleIncidents.length ? theme.colors.danger : theme.colors.headerGlass, borderColor: theme.colors.line }]}>
            <MaterialCommunityIcons name="alert-decagram" size={22} color={visibleIncidents.length ? '#FFF' : theme.colors.text} />
          </Pressable>
          {permission !== 'granted' && (
            <Pressable
              onPress={refresh}
              style={[styles.fab, { backgroundColor: theme.colors.warning, borderColor: theme.colors.line }]}>
              <MaterialCommunityIcons name="location-exit" size={22} color="#FFF" />
            </Pressable>
          )}
        </View>

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
                  <Text style={styles.alertMeta}>
                    {activeIncidentVehicle.code} - {activeIncident.status}
                  </Text>
                </View>
              </Pressable>
            ) : null}

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trackList}>
              {trackingVehicles.map((vehicle) => (
                <Pressable
                  key={vehicle.id}
                  onPress={() => {
                    setSelectedVehicleId(vehicle.id);
                    setFollowMode(true);
                  }}
                  style={[
                    styles.trackChip,
                    { borderColor: theme.colors.line },
                    vehicle.id === selectedVehicle?.id && {
                      backgroundColor: theme.colors.accent,
                      borderColor: theme.colors.accent,
                    },
                  ]}>
                  <Text style={[styles.trackChipTitle, { color: vehicle.id === selectedVehicle?.id ? '#FFF' : theme.colors.text }]}>
                    {vehicle.code}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>

        <OperationalMenuDrawer visible={menuOpen} onClose={() => setMenuOpen(false)} activeKey="mapa" />
      </View>
    </View>
  );
}

function HUDItem({
  color,
  icon,
  value,
}: {
  color: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  value: string;
}) {
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
  centered: { alignItems: 'center', justifyContent: 'center' },
  root: { flex: 1, overflow: 'hidden' },
  mapSurface: { ...StyleSheet.absoluteFillObject },
  mapLoading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  mapNotice: {
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginHorizontal: 16,
    maxWidth: 440,
    padding: 18,
  },
  mapNoticeCopy: { flex: 1, gap: 4 },
  mapNoticeTitle: { fontFamily: Typography.body, fontSize: 15, fontWeight: '800' },
  mapNoticeText: { fontFamily: Typography.body, fontSize: 12, lineHeight: 17 },
  topOverlay: { left: 0, paddingHorizontal: 16, position: 'absolute', right: 0, top: 0, zIndex: 10 },
  topBar: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between', minWidth: 0 },
  iconButton: { alignItems: 'center', borderRadius: 16, borderWidth: 1, height: 52, justifyContent: 'center', width: 52 },
  hud: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    height: 52,
    justifyContent: 'space-around',
    maxWidth: 520,
    minWidth: 0,
    paddingHorizontal: 12,
  },
  hudItem: { alignItems: 'center', flexDirection: 'row', flexShrink: 1, gap: 6, minWidth: 0 },
  hudValue: { flexShrink: 1, fontFamily: Typography.mono, fontSize: 15, fontWeight: '800', minWidth: 0 },
  sideActions: { gap: 12, position: 'absolute', right: 16, zIndex: 10 },
  fab: { alignItems: 'center', borderRadius: 16, borderWidth: 1, height: 48, justifyContent: 'center', width: 48 },
  bottomOverlay: { alignItems: 'center', bottom: 0, left: 0, paddingHorizontal: 16, position: 'absolute', right: 0, zIndex: 10 },
  followCard: {
    borderRadius: 24,
    borderWidth: 1,
    elevation: 8,
    gap: 12,
    maxWidth: 440,
    padding: 16,
    shadowOpacity: 0.15,
    shadowRadius: 10,
    width: '100%',
  },
  followHeader: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', minWidth: 0 },
  followTitle: { flexShrink: 1, fontFamily: Typography.display, fontSize: 22, fontWeight: '800', minWidth: 0 },
  followMeta: { fontFamily: Typography.body, fontSize: 13, minWidth: 0 },
  alertStrip: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  alertCopy: { flex: 1, gap: 2, minWidth: 0 },
  alertTitle: { color: '#FFF', flexShrink: 1, fontFamily: Typography.body, fontSize: 13, fontWeight: '800', minWidth: 0 },
  alertMeta: { color: 'rgba(255,255,255,0.78)', fontFamily: Typography.body, fontSize: 11 },
  trackList: { gap: 10 },
  trackChip: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 10 },
  trackChipTitle: { fontFamily: Typography.body, fontSize: 14, fontWeight: '700' },
});
