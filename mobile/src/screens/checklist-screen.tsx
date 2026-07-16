import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import * as Haptics from '@/src/native/haptics';
import { router, useLocalSearchParams } from '@/src/navigation/router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { Typography } from '@/constants/theme';
import { AppCard } from '@/src/components/app-card';
import { AppMap, AppMapMarker, AppMapPolyline, type AppMapRef } from '@/src/components/app-map';
import { AppShell } from '@/src/components/app-shell';
import { StatusPill } from '@/src/components/status-pill';
import { ConfirmModal } from '@/src/components/ui/confirm-modal';
import { assignVehicleRouteRequest, createNavigationRouteRequest, deleteNavigationRouteRequest, getActiveRouteSessionRequest, getRouteSessionCheckpointVisitsRequest, getRouteSessionEventsRequest, getRouteSessionHistoryRequest, getRouteSessionMetricsRequest, updateNavigationRouteRequest } from '@/src/api/client';
import { usePointToPointTracker } from '@/src/hooks/use-point-to-point-tracker';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { useAppStore } from '@/src/store/use-app-store';
import { executeRouteSessionAction } from '@/src/services/route-session-actions';
import type {
  AssignedRoute,
  FleetControlLog,
  GeoPoint,
  NavigationPlan,
  NavigationPlaceResult,
  NavigationRouteOption,
  NavigationStop,
  RouteShape,
  RouteSession,
  Vehicle,
} from '@/src/types/app';
import { formatTime } from '@/src/utils/format';
import { buildActiveRouteSnapshot, getAssignedRouteLabel } from '@/src/utils/active-route';
import { normalizeAssignedRoute } from '@/src/utils/navigation-data';

type FilterMode = 'all' | 'active' | 'routes' | 'completed';
type OperationalStatus = 'available' | 'active' | 'completed' | 'delayed';
type PointRole = 'origin' | 'destination';
type MapPointRole = PointRole | 'stop';
type RouteUiState = 'empty' | 'editing' | 'ready' | 'navigation' | 'paused' | 'finalized';
type OperationalRecord = {
  id: string;
  vehicleId: string;
  vehicleCode: string;
  driverName: string;
  routeName: string;
  departureAt: string | null;
  arrivalAt: string | null;
  etaAt: string | null;
  delayMinutes: number;
  status: OperationalStatus;
  vehicle: Vehicle;
};
type FinalizedRouteSummary = {
  distanceLabel: string;
  durationLabel: string;
  movingTimeLabel: string;
  stoppedTimeLabel: string;
  finishedAt: string;
  originLabel: string;
  destinationLabel: string;
  stopCount: number;
  lapCount: number;
  eventCount: number;
  incidentCount: number;
  vehicleId: string;
} | null;

const ACTIVE_VEHICLE_STATUSES = new Set(['online', 'patrolling', 'on-route', 'active']);
const MANECOMB_ROUTE_COLOR = '#E31E24';

function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);

  if (hours) {
    return `${hours} h ${minutes} min`;
  }

  return `${Math.max(1, minutes)} min`;
}

function formatDistance(meters: number) {
  if (!Number.isFinite(meters) || meters <= 0) {
    return 'Sin datos';
  }

  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }

  return `${(meters / 1000).toFixed(1)} km`;
}

function getEtaAt(vehicle: Vehicle) {
  if (typeof vehicle.etaMinutes !== 'number') {
    return null;
  }

  return new Date(Date.now() + vehicle.etaMinutes * 60 * 1000).toISOString();
}

function getLatestLog(logs: FleetControlLog[], vehicleId: string) {
  return logs
    .filter((log) => log.vehicleId === vehicleId)
    .sort(
      (left, right) =>
        new Date(right.arrivalAt || right.departureAt).getTime() -
        new Date(left.arrivalAt || left.departureAt).getTime()
    )[0] || null;
}

function getActiveLog(logs: FleetControlLog[], vehicleId: string) {
  return logs.find((log) => log.vehicleId === vehicleId && log.status !== 'completed') || null;
}

function getVehicleOperationalStatus(vehicle: Vehicle, sessionLog: FleetControlLog | null): OperationalStatus {
  if (sessionLog?.status === 'completed') {
    return 'completed';
  }

  if (sessionLog?.status === 'delayed') {
    return 'delayed';
  }

  if (sessionLog?.status === 'active') {
    return vehicle.delayMinutes > 0 ? 'delayed' : 'active';
  }

  if (ACTIVE_VEHICLE_STATUSES.has(String(vehicle.status || '').toLowerCase())) {
    return vehicle.delayMinutes > 0 ? 'delayed' : 'active';
  }

  return 'available';
}

function buildOperationalRecord(vehicle: Vehicle, sessionLogs: FleetControlLog[]): OperationalRecord {
  const latestLog = getLatestLog(sessionLogs, vehicle.id);
  const activeLog = getActiveLog(sessionLogs, vehicle.id);
  const status = getVehicleOperationalStatus(vehicle, activeLog || latestLog);
  const activeRoute = buildActiveRouteSnapshot({ vehicle });
  const departureAt = activeLog?.departureAt || latestLog?.departureAt || null;
  const etaAt =
    activeRoute?.progress?.etaAt ||
    (status === 'active' || status === 'delayed' ? getEtaAt(vehicle) : null);

  return {
    id: latestLog?.id || `vehicle-record-${vehicle.id}`,
    vehicleId: vehicle.id,
    vehicleCode: vehicle.code,
    driverName: vehicle.driverName || 'Operador sin asignar',
    routeName: activeRoute?.name || getAssignedRouteLabel(normalizeAssignedRoute(vehicle.assignedRoute)) || 'Ruta sin asignar',
    departureAt,
    arrivalAt: latestLog?.arrivalAt || null,
    etaAt,
    delayMinutes: vehicle.delayMinutes || 0,
    status,
    vehicle,
  };
}

function getStatusLabel(status: OperationalStatus) {
  if (status === 'active') return 'En ruta';
  if (status === 'completed') return 'Finalizado';
  if (status === 'delayed') return 'Retraso';
  return 'Disponible';
}

function getStatusTone(status: OperationalStatus): 'info' | 'positive' | 'warning' | 'neutral' {
  if (status === 'active') return 'info';
  if (status === 'completed') return 'positive';
  if (status === 'delayed') return 'warning';
  return 'neutral';
}

function getStatusColor(theme: ReturnType<typeof useAppTheme>['theme'], status: OperationalStatus) {
  if (status === 'active') return theme.colors.info;
  if (status === 'completed') return theme.colors.success;
  if (status === 'delayed') return theme.colors.warning;
  return theme.colors.muted;
}

function parseRoutePolylineParam(value?: string): GeoPoint[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((point) => ({
        latitude: Number(point?.latitude),
        longitude: Number(point?.longitude),
      }))
      .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
  } catch {
    return [];
  }
}

function parseStopsParam(value?: string): NavigationStop[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((stop, index) => ({
        id: String(stop?.id || `stop-${index + 1}`),
        latitude: Number(stop?.latitude),
        longitude: Number(stop?.longitude),
        address: String(stop?.address || ''),
        order: Math.max(0, Number(stop?.order) || index),
      }))
      .filter((stop) => Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude))
      .sort((left, right) => left.order - right.order)
      .map((stop, index) => ({ ...stop, order: index }));
  } catch {
    return [];
  }
}

function getPointSignature(point: GeoPoint | null | undefined) {
  if (!point) {
    return '';
  }

  return `${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`;
}

function looksLikeCoordinates(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  return /^-?\d{1,3}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?$/.test(value.trim());
}

function getPlaceLabel(place: NavigationPlaceResult | null | undefined, fallback: string) {
  const label = place?.label?.trim();
  const address = place?.address?.trim();

  if (label && !looksLikeCoordinates(label)) {
    return label;
  }

  if (address && !looksLikeCoordinates(address)) {
    return address;
  }

  return fallback;
}

function getSafeLabel(value: string | null | undefined, fallback: string) {
  const label = value?.trim();
  return label && !looksLikeCoordinates(label) ? label : fallback;
}

function getStopLabel(stop: NavigationStop, index: number) {
  const address = stop.address?.trim();

  if (address && !looksLikeCoordinates(address)) {
    return address;
  }

  return `Parada ${index + 1}`;
}

function getStopsSignature(stops: NavigationStop[] | null | undefined) {
  return (stops || [])
    .map((stop, index) => `${index}:${getPointSignature(stop)}`)
    .join(',');
}

function getRouteSignature(args: {
  destination: GeoPoint | null | undefined;
  distanceMeters?: number;
  origin: GeoPoint | null | undefined;
  polyline?: GeoPoint[];
  stops?: NavigationStop[];
}) {
  const polyline = args.polyline || [];
  const first = polyline[0] || args.origin || null;
  const last = polyline[polyline.length - 1] || args.destination || null;

  return [
    getPointSignature(args.origin),
    getPointSignature(args.destination),
    Math.round(Number(args.distanceMeters || 0)),
    getPointSignature(first),
    getPointSignature(last),
    getStopsSignature(args.stops),
    polyline.length,
  ].join('|');
}

function buildAssignedRouteSelection(vehicle: Vehicle): {
  destination: NavigationPlaceResult;
  origin: NavigationPlaceResult;
  plan: NavigationPlan;
} | null {
  const assignedRoute = normalizeAssignedRoute(vehicle.assignedRoute);
  const route = assignedRoute?.route || null;
  const routeOrigin = assignedRoute?.origin || route?.polyline[0] || null;

  if (!assignedRoute || !route || !routeOrigin || !assignedRoute.destination) {
    return null;
  }

  const originLabel = assignedRoute.originLabel || 'Punto inicial';
  const destinationLabel = assignedRoute.destinationLabel || 'Punto final';

  return {
    origin: {
      id: `assigned-origin-${vehicle.id}`,
      label: originLabel,
      address: originLabel,
      location: routeOrigin,
    },
    destination: {
      id: `assigned-destination-${vehicle.id}`,
      label: destinationLabel,
      address: destinationLabel,
      location: assignedRoute.destination,
    },
    plan: {
      provider: assignedRoute.provider,
      origin: routeOrigin,
      destination: assignedRoute.destination,
      stops: assignedRoute.stops || [],
      routes: [route, ...(assignedRoute.alternatives || [])],
      updatedAt: assignedRoute.assignedAt,
    },
  };
}

function buildRouteStops(
  origin: NavigationPlaceResult | null,
  destination: NavigationPlaceResult | null,
  route: NavigationRouteOption | null,
  routeStopEntries: NavigationStop[] = []
) {
  const routeStops: {
    id: string;
    label: string;
    address: string;
    location: GeoPoint;
    type: 'origin' | 'stop' | 'destination';
  }[] = [];

  if (origin) {
    const label = getPlaceLabel(origin, 'Punto inicial');
    routeStops.push({
      id: 'origin',
      label,
      address: label,
      location: origin.location,
      type: 'origin',
    });
  }

  routeStopEntries.forEach((stop, index) => {
    const location = { latitude: stop.latitude, longitude: stop.longitude };
    const label = getStopLabel(stop, index);

    if (Number.isFinite(location.latitude) && Number.isFinite(location.longitude)) {
      routeStops.push({
        id: stop.id,
        label,
        address: label,
        location,
        type: 'stop',
      });
    }
  });

  if (destination) {
    const label = getPlaceLabel(destination, 'Punto final');
    routeStops.push({
      id: 'destination',
      label,
      address: label,
      location: destination.location,
      type: 'destination',
    });
  }

  return routeStops;
}

function RoutePreview({
  onPress,
  points,
  route,
  vehicle,
}: {
  onPress?: () => void;
  points: ReturnType<typeof buildRouteStops>;
  route: NavigationRouteOption | null;
  vehicle: Vehicle | null;
}) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme, false, false), [theme]);
  const mapRef = useRef<AppMapRef>(null);
  const routeFade = useRef(new Animated.Value(0)).current;
  const sourcePoints = useMemo(
    () =>
      route?.polyline?.length
        ? route.polyline
        : points.map((point) => point.location),
    [points, route]
  );
  const fallbackPoint = useMemo(
    () =>
      vehicle?.location || points[0]?.location || {
        latitude: 19.4326,
        longitude: -99.1332,
      },
    [points, vehicle?.location]
  );
  const mapPoints = useMemo(
    () => {
      const pointsToFit = sourcePoints.length ? [...sourcePoints] : [fallbackPoint];

      if (vehicle?.location) {
        pointsToFit.push(vehicle.location);
      }

      return pointsToFit;
    },
    [fallbackPoint, sourcePoints, vehicle?.location]
  );
  const initialRegion = useMemo(
    () => ({
      ...fallbackPoint,
      latitudeDelta: sourcePoints.length ? 0.04 : 0.025,
      longitudeDelta: sourcePoints.length ? 0.04 : 0.025,
    }),
    [fallbackPoint, sourcePoints.length]
  );

  useEffect(() => {
    if (mapPoints.length) {
      routeFade.setValue(0);
      Animated.timing(routeFade, {
        duration: 240,
        toValue: 1,
        useNativeDriver: true,
      }).start();
      mapRef.current?.fitToCoordinates(mapPoints, {
        animated: true,
        edgePadding: { top: 48, right: 38, bottom: 50, left: 38 },
      });
    }
  }, [mapPoints, routeFade]);

  const vehicleHeadingStyle = useMemo(
    () => ({
      transform: [{ rotate: `${vehicle?.heading || 0}deg` }],
    }),
    [vehicle?.heading]
  );

  return (
    <View style={styles.routePreview}>
      <AppMap
        ref={mapRef}
        compassEnabled={false}
        initialRegion={initialRegion}
        onPress={() => onPress?.()}
        scaleEnabled={false}
        style={StyleSheet.absoluteFill}
        themeMode={theme.mode}>
        {sourcePoints.length >= 2 ? (
          <>
            <AppMapPolyline
              id="route-preview-base"
              coordinates={sourcePoints}
              lineBlur={1.2}
              strokeColor={theme.mode === 'light' ? 'rgba(15,23,42,0.34)' : 'rgba(255,255,255,0.42)'}
              strokeOpacity={1}
              strokeWidth={8}
            />
            <AppMapPolyline
              id="route-preview-main"
              coordinates={sourcePoints}
              strokeColor={MANECOMB_ROUTE_COLOR}
              strokeOpacity={0.96}
              strokeWidth={4}
            />
          </>
        ) : null}
        {points.map((point, index) => {
          const isDestination = point.type === 'destination';
          const isOrigin = point.type === 'origin';
          const stopNumber = Math.max(1, index);

          return (
            <AppMapMarker key={point.id} id={`preview-${point.id}`} coordinate={point.location}>
              <Animated.View
                style={[
                  styles.miniMapMarkerShell,
                  { opacity: routeFade },
                  isOrigin ? styles.miniMapMarkerShellOrigin : undefined,
                  isDestination ? styles.miniMapMarkerShellDestination : undefined,
                ]}>
                <View
                  style={[
                    styles.miniMapMarker,
                    isOrigin ? styles.miniMapMarkerOrigin : undefined,
                    isDestination ? styles.miniMapMarkerDestination : undefined,
                  ]}>
                  {isOrigin ? (
                    <MaterialCommunityIcons name="record-circle-outline" size={16} color="#FFFFFF" />
                  ) : isDestination ? (
                    <MaterialCommunityIcons name="flag-checkered" size={15} color="#FFFFFF" />
                  ) : (
                    <Text style={styles.miniMapMarkerText}>{stopNumber}</Text>
                  )}
                </View>
              </Animated.View>
            </AppMapMarker>
          );
        })}
        {vehicle ? (
          <AppMapMarker id="preview-vehicle" coordinate={vehicle.location}>
            <View style={styles.miniMapVehicleWrap}>
              <View style={styles.miniMapAccuracyHalo} />
              <View style={styles.miniMapVehicleMarker}>
                <View style={[styles.miniMapVehicleHeading, vehicleHeadingStyle]}>
                  <MaterialCommunityIcons name="navigation" size={18} color="#FFFFFF" />
                </View>
              </View>
            </View>
          </AppMapMarker>
        ) : null}
      </AppMap>
      {!points.length ? (
        <Pressable style={styles.routePreviewEmpty} onPress={onPress}>
          <MaterialCommunityIcons name="map-search-outline" size={28} color={theme.colors.muted} />
          <Text style={styles.routePreviewEmptyTitle}>Selecciona origen y destino</Text>
          <Text style={styles.routePreviewEmptyText}>Toca el mapa para elegir o buscar un punto.</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function createStyles(
  theme: ReturnType<typeof useAppTheme>['theme'],
  isCompact: boolean,
  isPhone: boolean
) {
  return StyleSheet.create({
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
    centeredText: {
      color: theme.colors.muted,
      fontSize: 14,
    },
    header: {
      paddingTop: 4,
      gap: 8,
    },
    eyebrow: {
      color: theme.colors.accent,
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 2,
    },
    title: {
      color: theme.colors.text,
      fontFamily: Typography.display,
      fontSize: isPhone ? 32 : 36,
      fontWeight: '900',
      lineHeight: isPhone ? 38 : 42,
    },
    filterFrame: {
      minHeight: 62,
      borderRadius: 28,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surface,
      flexDirection: 'row',
      alignItems: 'center',
      padding: 6,
      gap: 6,
    },
    filterSegment: {
      flex: 1,
      minHeight: 48,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 10,
    },
    filterSegmentActive: {
      borderWidth: 1,
      borderColor: theme.colors.accent,
      backgroundColor: theme.colors.accentSoft,
    },
    filterSegmentText: {
      color: theme.colors.muted,
      fontSize: 14,
      fontWeight: '900',
    },
    filterSegmentTextActive: {
      color: theme.colors.accent,
    },
    section: {
      gap: 14,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    sectionTitleWrap: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    sectionTitle: {
      color: theme.colors.text,
      fontFamily: Typography.display,
      fontSize: 20,
      fontWeight: '900',
    },
    sectionLink: {
      color: theme.colors.muted,
      fontSize: 13,
      fontWeight: '800',
    },
    recordsList: {
      gap: 12,
    },
    recordCard: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surface,
      padding: 14,
      gap: 12,
    },
    recordMain: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
    },
    recordLead: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    recordIcon: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    recordTitle: {
      color: theme.colors.text,
      fontSize: 17,
      fontWeight: '900',
    },
    recordDriver: {
      color: theme.colors.muted,
      fontSize: 13,
      lineHeight: 18,
      flexShrink: 1,
    },
    recordTimeline: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      borderTopWidth: 1,
      borderTopColor: theme.colors.line,
      paddingTop: 10,
    },
    timeBlock: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    timeLabel: {
      color: theme.colors.muted,
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 0.7,
    },
    timeValue: {
      color: theme.colors.text,
      fontFamily: Typography.mono,
      fontSize: 13,
      fontWeight: '900',
    },
    recordActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    miniAction: {
      minHeight: 36,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surfaceAlt,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    miniActionText: {
      color: theme.colors.text,
      fontSize: 12,
      fontWeight: '800',
    },
    emptyState: {
      minHeight: 170,
      borderRadius: 18,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: theme.colors.line,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      padding: 22,
    },
    emptyTitle: {
      color: theme.colors.text,
      fontSize: 17,
      fontWeight: '900',
      fontFamily: Typography.display,
    },
    emptyBody: {
      color: theme.colors.muted,
      fontSize: 13,
      lineHeight: 20,
      textAlign: 'center',
      maxWidth: 360,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(7, 11, 19, 0.34)',
      justifyContent: 'flex-end',
    },
    modalCard: {
      maxHeight: '92%',
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      backgroundColor: theme.colors.background,
      paddingHorizontal: isPhone ? 14 : 18,
      paddingTop: 10,
      paddingBottom: 18,
      gap: 14,
    },
    modalKeyboard: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    modalHeaderCopy: {
      flex: 1,
      minWidth: 0,
    },
    modalTitle: {
      color: theme.colors.text,
      fontFamily: Typography.display,
      fontSize: 21,
      fontWeight: '900',
      flexShrink: 1,
    },
    modalSubtitle: {
      color: theme.colors.muted,
      fontSize: 13,
      lineHeight: 18,
      flexShrink: 1,
    },
    modalClose: {
      width: 42,
      height: 42,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalScroll: {
      flexGrow: 0,
    },
    modalScrollContent: {
      gap: 12,
      paddingBottom: 8,
    },
    routeNamePrompt: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surface,
      gap: 12,
      padding: 14,
    },
    routeNameInput: {
      minHeight: 46,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surfaceAlt,
      color: theme.colors.text,
      fontFamily: Typography.body,
      fontSize: 15,
      fontWeight: '800',
      paddingHorizontal: 12,
    },
    routePreview: {
      height: isPhone ? 170 : 230,
      borderRadius: 22,
      overflow: 'hidden',
      backgroundColor: theme.mode === 'light' ? '#F2F6FB' : '#101A27',
      borderWidth: 1,
      borderColor: theme.colors.line,
    },
    miniMapMarker: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: MANECOMB_ROUTE_COLOR,
      borderWidth: 2,
      borderColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    recordCopy: {
      flex: 1,
      minWidth: 0,
    },
    miniMapMarkerShell: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.mode === 'light' ? 'rgba(255,255,255,0.92)' : 'rgba(15,23,42,0.92)',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.18,
      shadowRadius: 6,
      elevation: 4,
    },
    miniMapMarkerShellOrigin: {
      backgroundColor: theme.mode === 'light' ? 'rgba(16,185,129,0.14)' : 'rgba(16,185,129,0.24)',
    },
    miniMapMarkerShellDestination: {
      backgroundColor: theme.mode === 'light' ? 'rgba(227,30,36,0.14)' : 'rgba(227,30,36,0.24)',
    },
    miniMapMarkerOrigin: {
      backgroundColor: theme.colors.success,
    },
    miniMapMarkerDestination: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: MANECOMB_ROUTE_COLOR,
    },
    miniMapMarkerText: {
      color: '#FFFFFF',
      fontFamily: Typography.body,
      fontSize: 11,
      fontWeight: '900',
      lineHeight: 14,
      textAlign: 'center',
    },
    miniMapVehicleWrap: {
      width: 54,
      height: 54,
      alignItems: 'center',
      justifyContent: 'center',
    },
    miniMapAccuracyHalo: {
      position: 'absolute',
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: theme.mode === 'light' ? 'rgba(37,99,235,0.14)' : 'rgba(96,165,250,0.20)',
      borderWidth: 1,
      borderColor: theme.mode === 'light' ? 'rgba(37,99,235,0.18)' : 'rgba(147,197,253,0.24)',
    },
    miniMapVehicleMarker: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: theme.colors.info,
      borderWidth: 3,
      borderColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.22,
      shadowRadius: 7,
      elevation: 5,
    },
    miniMapVehicleHeading: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    routePreviewEmpty: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 2,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 28,
      gap: 6,
      backgroundColor: theme.mode === 'light' ? 'rgba(242,246,251,0.82)' : 'rgba(16,26,39,0.82)',
    },
    routePreviewEmptyTitle: {
      color: theme.colors.text,
      fontSize: 14,
      fontWeight: '900',
      textAlign: 'center',
    },
    routePreviewEmptyText: {
      color: theme.colors.muted,
      fontSize: 12,
      lineHeight: 17,
      textAlign: 'center',
    },
    routeSummary: {
      flexDirection: 'row',
      gap: 10,
    },
    routeSummaryItem: {
      flex: 1,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surface,
      padding: 12,
      gap: 4,
    },
    summaryLabel: {
      color: theme.colors.muted,
      fontSize: 11,
      fontWeight: '800',
    },
    summaryValue: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: '900',
      flexShrink: 1,
    },
    progressCard: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surface,
      padding: 14,
      gap: 10,
    },
    progressTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    progressTitle: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: '900',
    },
    progressValue: {
      color: theme.colors.info,
      fontSize: 13,
      fontWeight: '900',
    },
    progressTrack: {
      height: 8,
      borderRadius: 999,
      backgroundColor: theme.colors.line,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      borderRadius: 999,
      backgroundColor: theme.colors.info,
    },
    routeAlert: {
      minHeight: 42,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.danger,
      backgroundColor: theme.colors.dangerSoft,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    routeAlertText: {
      flex: 1,
      color: theme.colors.danger,
      fontSize: 12,
      fontWeight: '800',
      lineHeight: 17,
    },
    configCard: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surface,
      padding: 14,
      gap: 12,
    },
    configTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    configTitle: {
      color: theme.colors.text,
      fontFamily: Typography.display,
      fontSize: 18,
      fontWeight: '900',
    },
    fieldGroup: {
      gap: 8,
    },
    fieldLabel: {
      color: theme.colors.muted,
      fontSize: 11,
      fontWeight: '900',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    routeEndpoints: {
      gap: 6,
    },
    savedRoutesList: {
      gap: 8,
    },
    savedRouteRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    savedRouteButton: {
      flex: 1,
      minHeight: 42,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surfaceAlt,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
    },
    savedRouteDelete: {
      width: 42,
      height: 42,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.danger,
      backgroundColor: theme.colors.dangerSoft,
    },
    savedRouteName: {
      flex: 1,
      color: theme.colors.text,
      fontSize: 13,
      fontWeight: '900',
    },
    endpointText: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: '900',
      lineHeight: 20,
    },
    routeActionRow: {
      flexDirection: 'row',
      gap: 10,
    },
    secondaryWide: {
      flex: 1,
      minHeight: 48,
      borderRadius: 15,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 12,
    },
    secondaryWideText: {
      color: theme.colors.text,
      fontSize: 14,
      fontWeight: '900',
    },
    stopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    stopNumber: {
      width: 28,
      height: 28,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.info,
    },
    stopNumberDestination: {
      backgroundColor: theme.colors.accent,
    },
    waypointNumber: {
      width: 28,
      height: 28,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.warning,
    },
    stopNumberText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '900',
    },
    stopCopy: {
      flex: 1,
      minWidth: 0,
    },
    stopRemoveButton: {
      width: 32,
      height: 32,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.dangerSoft,
    },
    stopMoveGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    stopMoveButton: {
      width: 28,
      height: 28,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.line,
    },
    stopMoveButtonDisabled: {
      opacity: 0.36,
    },
    compactStopsList: {
      gap: 10,
      borderTopWidth: 1,
      borderTopColor: theme.colors.line,
      paddingTop: 10,
    },
    stopTitle: {
      color: theme.colors.text,
      fontSize: 14,
      fontWeight: '800',
    },
    stopMeta: {
      color: theme.colors.muted,
      fontSize: 12,
      lineHeight: 17,
    },
    messageText: {
      color: theme.colors.muted,
      fontSize: 12,
      lineHeight: 18,
    },
    unitRouteCard: {
      minHeight: 54,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surfaceAlt,
      padding: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    primaryWide: {
      flex: 1,
      minHeight: 48,
      borderRadius: 15,
      backgroundColor: theme.colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    primaryWideInline: {
      flex: 1,
      minHeight: 48,
      borderRadius: 15,
      backgroundColor: theme.colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 16,
    },
    primaryWideText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '900',
      flexShrink: 1,
      textAlign: 'center',
    },
  });
}

export function ChecklistScreen() {
  const { theme } = useAppTheme();
  const { width } = useWindowDimensions();
  const isCompact = width < 1120;
  const isPhone = width < 640;
  const { activeRouteSession: syncedActiveSession, coordinates, incidents, mapData, refreshAll, sessionHistory, user } = useAppStore(
    useShallow((state) => ({
      mapData: state.mapData,
      activeRouteSession: state.activeRouteSession,
      coordinates: state.deviceLocation.coordinates,
      incidents: state.incidents,
      refreshAll: state.refreshAll,
      sessionHistory: state.routeSessionHistory,
      user: state.user,
    }))
  );
  const params = useLocalSearchParams();
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [routeModalOpen, setRouteModalOpen] = useState(false);
  const [isSavingAssignedRoute, setIsSavingAssignedRoute] = useState(false);
  const [routeNameDraft, setRouteNameDraft] = useState('');
  const [routeNamePromptOpen, setRouteNamePromptOpen] = useState(false);
  const [routePendingDelete, setRoutePendingDelete] = useState<RouteShape | null>(null);
  const [isDeletingRoute, setIsDeletingRoute] = useState(false);
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null);
  const [finalizedRouteSummary, setFinalizedRouteSummary] = useState<FinalizedRouteSummary>(null);
  const [activeSession, setActiveSession] = useState<RouteSession | null>(null);
  const [isChangingSession, setIsChangingSession] = useState(false);
  const [isSessionLoaded, setIsSessionLoaded] = useState(false);
  const styles = useMemo(() => createStyles(theme, isCompact, isPhone), [theme, isCompact, isPhone]);

  const vehicles = useMemo(
    () => [...(mapData?.vehicles || [])]
      .filter((vehicle) => user?.role !== 'driver' || vehicle.id === user.vehicleId)
      .sort((left, right) => left.code.localeCompare(right.code)),
    [mapData?.vehicles, user?.role, user?.vehicleId]
  );
  const savedRoutes = useMemo(
    () => [...(mapData?.routes || [])].sort((left, right) => left.name.localeCompare(right.name)),
    [mapData?.routes]
  );
  const persistentLogs = useMemo<FleetControlLog[]>(
    () => sessionHistory.map((session) => {
      const vehicle = vehicles.find((entry) => entry.id === session.vehicleId);
      return {
        id: session.id,
        vehicleId: session.vehicleId,
        vehicleCode: vehicle?.code || session.vehicleId,
        driverName: vehicle?.driverName || 'Operador sin asignar',
        departureAt: session.startedAt,
        arrivalAt: session.finishedAt,
        status: session.status === 'FINISHED' || session.status === 'CANCELLED' ? 'completed' : 'active',
      };
    }),
    [sessionHistory, vehicles]
  );
  const loadSessionHistory = useCallback(async () => {
    try {
      useAppStore.setState({ routeSessionHistory: await getRouteSessionHistoryRequest({ limit: 500 }) });
    } catch {
      // Never replace persisted history with volatile records when the API is unavailable.
    }
  }, []);

  useEffect(() => {
    if (user) loadSessionHistory();
  }, [loadSessionHistory, user]);
  const selectedVehicle =
    vehicles.find((vehicle) => vehicle.id === selectedVehicleId) || vehicles[0] || null;
  const selectedAssignedRoute = useMemo<AssignedRoute | null>(
    () => normalizeAssignedRoute(selectedVehicle?.assignedRoute),
    [selectedVehicle?.assignedRoute]
  );
  const trackedLocation =
    user?.vehicleId && selectedVehicle?.id === user.vehicleId && coordinates
      ? coordinates
      : selectedVehicle?.location || coordinates || null;
  const tracker = usePointToPointTracker({
    searchAnchor: selectedVehicle?.location || coordinates || null,
    selectedVehicle,
    trackedLocation,
  });
  const trackerRef = useRef(tracker);
  const syncedVehicleRouteRef = useRef<string | null>(null);
  const pendingStopPersistRef = useRef(false);
  const processedMapSelectionRef = useRef<string | null>(null);
  const restoredSessionIdRef = useRef<string | null>(null);
  const processedActionRef = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedVehicle?.id) { setActiveSession(null); setIsSessionLoaded(true); return; }
    restoredSessionIdRef.current = null;
    setIsSessionLoaded(false);
    getActiveRouteSessionRequest(selectedVehicle.id).then((session) => { setActiveSession(session); setIsSessionLoaded(true); }).catch(() => { setActiveSession(null); setIsSessionLoaded(true); });
  }, [selectedVehicle?.id]);

  useEffect(() => {
    if (syncedActiveSession?.vehicleId === selectedVehicle?.id) setActiveSession(syncedActiveSession);
  }, [selectedVehicle?.id, syncedActiveSession]);

  useEffect(() => {
    if (!activeSession || !selectedAssignedRoute || restoredSessionIdRef.current === activeSession.id) return;
    restoredSessionIdRef.current = activeSession.id;
    tracker.restoreTrackerSession({
      startedAt: activeSession.startedAt,
      status: activeSession.status === 'PAUSED' ? 'PAUSED' : 'RUNNING',
      vehicleId: activeSession.vehicleId,
    });
  }, [activeSession, selectedAssignedRoute, tracker, tracker.restoreTrackerSession]);

  useEffect(() => {
    trackerRef.current = tracker;
  }, [tracker]);

  useEffect(() => {
    if (!routeModalOpen || !selectedVehicle) {
      return;
    }

    const assignedRoute = normalizeAssignedRoute(selectedVehicle.assignedRoute);
    const assignedAt = assignedRoute?.assignedAt || 'empty';
    const syncKey = `${selectedVehicle.id}:${assignedAt}`;

    if (syncedVehicleRouteRef.current === syncKey) {
      return;
    }

    syncedVehicleRouteRef.current = syncKey;
    const assignedSelection = buildAssignedRouteSelection(selectedVehicle);

    if (assignedSelection) {
      trackerRef.current.applyPointToPointSelection(
        assignedSelection.origin,
        assignedSelection.destination,
        assignedSelection.plan,
        assignedSelection.plan.stops || []
      );
      return;
    }

    trackerRef.current.resetPointToPointSession();
  }, [routeModalOpen, selectedVehicle]);

  useEffect(() => {
    const requestedVehicleId = String(params.vehicleId || '').trim();
    if (requestedVehicleId && vehicles.some((vehicle) => vehicle.id === requestedVehicleId)) {
      setSelectedVehicleId(requestedVehicleId);
    }
  }, [params.vehicleId, vehicles]);

  useEffect(() => {
    if (user?.role === 'driver' && !String(params.action || '').trim()) {
      router.replace('/mapa');
    }
  }, [params.action, user?.role]);

  useEffect(() => {
    const actionValue = String(params.action || '').trim();
    const returnToMap = String(params.returnToMap || '').trim();
    if (!actionValue || !selectedVehicle || routeModalOpen) return;
    if (params.vehicleId && String(params.vehicleId) !== selectedVehicle.id) return;

    const actionKey = `${actionValue}:${selectedVehicle.id}`;
    if (processedActionRef.current === actionKey) return;
    if (actionValue !== 'start' && !isSessionLoaded) return;

    processedActionRef.current = actionKey;

    if (user?.role !== 'driver') {
      if (returnToMap === 'true') router.back();
      return;
    }

    (async () => {
      try {
        if (actionValue === 'start') await startTrip();
        else if (actionValue === 'finish') await finishTrip(selectedVehicle);
        else if (actionValue === 'pause') await toggleSessionPause();
      } finally {
        if (returnToMap === 'true') router.back();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.action, params.returnToMap, selectedVehicle, routeModalOpen, isSessionLoaded, user?.role]);

  const routeOption = tracker.pointPlan?.routes[0] || selectedAssignedRoute?.route || null;
  const routeStops = useMemo(
    () => buildRouteStops(tracker.pointSelection.origin, tracker.pointSelection.destination, routeOption, tracker.pointStops),
    [routeOption, tracker.pointSelection.destination, tracker.pointSelection.origin, tracker.pointStops]
  );
  const routeDistanceMeters = routeOption?.distanceMeters || 0;
  const routeDurationSeconds =
    routeOption?.durationInTrafficSeconds || routeOption?.durationSeconds || 0;
  const activeRouteSignature = getRouteSignature({
    destination: tracker.pointSelection.destination?.location,
    distanceMeters: tracker.pointPlan?.routes[0]?.distanceMeters,
    origin: tracker.pointSelection.origin?.location,
    polyline: tracker.pointPlan?.routes[0]?.polyline,
    stops: tracker.pointStops,
  });
  const savedRouteSignature = getRouteSignature({
    destination: selectedAssignedRoute?.destination,
    distanceMeters: selectedAssignedRoute?.route.distanceMeters,
    origin: selectedAssignedRoute?.origin,
    polyline: selectedAssignedRoute?.route.polyline,
    stops: selectedAssignedRoute?.stops || [],
  });
  const isCalculatedRouteSaved = Boolean(
    tracker.pointPlan &&
    selectedAssignedRoute &&
    activeRouteSignature === savedRouteSignature
  );
  const routeProgress = tracker.routeProgress?.progressPercent || 0;
  const waypointCount = tracker.pointStops.length;
  const isRoutePaused = tracker.trackerStatus === 'paused';
  const isRouteOffRoute = tracker.trackerStatus === 'off_route' || Boolean(tracker.routeProgress?.isOffRoute);
  const isRouteRunning =
    tracker.trackerStatus === 'waiting_start' ||
    tracker.trackerStatus === 'in_progress' ||
    tracker.trackerStatus === 'off_route';
  const hasDraftRoute = Boolean(tracker.pointSelection.origin || tracker.pointSelection.destination || tracker.pointPlan || waypointCount);
  const routeUiState: RouteUiState = finalizedRouteSummary?.vehicleId === selectedVehicle?.id
    ? 'finalized'
    : isRouteRunning
    ? 'navigation'
    : isRoutePaused
      ? 'paused'
      : editingRouteId
        ? 'editing'
      : isCalculatedRouteSaved
        ? 'ready'
        : hasDraftRoute
          ? 'editing'
          : 'empty';
  const routeStateLabel =
    routeUiState === 'finalized'
      ? 'Finalizada'
      : isRouteOffRoute
        ? 'Fuera de ruta'
      : routeUiState === 'navigation'
      ? 'Ruta activa'
      : routeUiState === 'paused'
        ? 'Ruta pausada'
        : routeUiState === 'ready'
          ? 'Ruta lista'
          : routeUiState === 'editing'
            ? 'Editando ruta'
            : 'Sin ruta';
  const progressLabel =
    routeUiState === 'navigation' || routeUiState === 'paused'
      ? `${routeProgress}%`
      : routeUiState === 'ready'
        ? 'Preparada'
        : routeUiState === 'editing'
          ? 'Esperando guardado'
          : 'Pendiente';
  const remainingDistanceLabel =
    routeUiState === 'navigation' || routeUiState === 'paused'
      ? formatDistance(tracker.routeProgress?.distanceRemaining || routeDistanceMeters)
      : formatDistance(routeDistanceMeters);
  const dynamicEtaLabel =
    routeUiState === 'navigation' || routeUiState === 'paused'
      ? tracker.routeProgress?.timeRemainingSeconds
        ? formatDuration(tracker.routeProgress.timeRemainingSeconds)
        : routeDurationSeconds
          ? formatDuration(routeDurationSeconds)
          : 'No disponible'
      : routeDurationSeconds
        ? formatDuration(routeDurationSeconds)
        : 'No disponible';
  const checkpointProgressLabel = tracker.routeProgress
    ? `${tracker.routeProgress.currentCheckpointIndex} / ${tracker.routeProgress.checkpointCount}`
    : 'Pendiente';
  const originLabel = getPlaceLabel(tracker.pointSelection.origin, 'Punto inicial');
  const destinationLabel = getPlaceLabel(tracker.pointSelection.destination, 'Punto final');
  const routeHeaderSubtitle =
    routeUiState === 'empty'
      ? 'Gestion de rutas'
      : routeUiState === 'finalized'
        ? 'Resumen de la ultima ruta'
        : `${originLabel} - ${destinationLabel}`;

  const records = useMemo(
    () => vehicles.map((vehicle) => buildOperationalRecord(vehicle, persistentLogs)),
    [persistentLogs, vehicles]
  );
  const filteredRecords = useMemo(
    () =>
      records.filter((record) => {
        const matchesFilter =
          filterMode === 'all' ||
          (filterMode === 'active' && ['active', 'delayed'].includes(record.status)) ||
          (filterMode === 'completed' && record.status === 'completed') ||
          (filterMode === 'routes' && Boolean(normalizeAssignedRoute(record.vehicle.assignedRoute)));

        return matchesFilter;
      }),
    [filterMode, records]
  );

  const finishTrip = async (vehicle: Vehicle) => {
    if (!activeSession || !normalizeAssignedRoute(vehicle.assignedRoute)) return;

    try {
      const result = await executeRouteSessionAction({
        action: 'finish',
        currentSession: activeSession,
        organizationId: user?.organizationId || '',
        routeId: vehicle.routeId || '',
        userId: user?.id || '',
        vehicleId: vehicle.id,
        driverId: vehicle.driverId,
      });
      if (result.offline || !result.record) {
        setActiveSession(null);
        useAppStore.setState({ activeRouteSession: null });
        tracker.resetPointToPointSession();
        tracker.setPointMessage('Finalizacion guardada. Se confirmara al recuperar conexion.');
        return;
      }
      const finishedSession = result.record;
      const [metrics, events, checkpoints] = await Promise.all([
        getRouteSessionMetricsRequest(finishedSession.id),
        getRouteSessionEventsRequest(finishedSession.id, { limit: 2000 }),
        getRouteSessionCheckpointVisitsRequest(finishedSession.id, 2000),
      ]);
      const finishedAt = finishedSession.finishedAt || new Date().toISOString();
      const incidentCount = incidents.filter((incident) =>
        incident.vehicleId === vehicle.id &&
        new Date(incident.createdAt).getTime() >= new Date(finishedSession.startedAt).getTime() &&
        new Date(incident.createdAt).getTime() <= new Date(finishedAt).getTime()
      ).length;
      const summary: NonNullable<FinalizedRouteSummary> = {
        destinationLabel,
        distanceLabel: formatDistance(metrics.totalDistance || 0),
        durationLabel: typeof metrics.totalDuration === 'number' ? formatDuration(metrics.totalDuration) : 'Sin datos',
        movingTimeLabel: typeof metrics.movingTime === 'number' ? formatDuration(metrics.movingTime) : 'Sin datos',
        stoppedTimeLabel: typeof metrics.stoppedTime === 'number' ? formatDuration(metrics.stoppedTime) : 'Sin datos',
        finishedAt,
        originLabel,
        stopCount: metrics.stopEvents ?? checkpoints.length,
        lapCount: metrics.completedLaps || 0,
        eventCount: events.length,
        incidentCount,
        vehicleId: vehicle.id,
      };
      setActiveSession(null);
      useAppStore.setState({ activeRouteSession: null });
      await Promise.all([refreshAll(), loadSessionHistory()]);

      if (selectedVehicle?.id === vehicle.id) {
        tracker.resetPointToPointSession();
        setFinalizedRouteSummary(summary);
      }
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch {
      tracker.setPointMessage('No fue posible finalizar la jornada.');
    }
  };

  const startTrip = async () => {
    if (!selectedVehicle || activeSession || isChangingSession) return;
    setIsChangingSession(true);
    try {
      const result = await executeRouteSessionAction({
        action: 'start',
        currentSession: null,
        organizationId: user?.organizationId || '',
        routeId: selectedVehicle.routeId || '',
        userId: user?.id || '',
        vehicleId: selectedVehicle.id,
        driverId: selectedVehicle.driverId,
      });
      const session = result.session;
      if (!session) throw new Error('No fue posible iniciar la jornada');
      setActiveSession(session);
      useAppStore.setState({ activeRouteSession: session });
      restoredSessionIdRef.current = session.id;
      tracker.restoreTrackerSession({ startedAt: session.startedAt, status: 'RUNNING', vehicleId: session.vehicleId });
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      tracker.setPointMessage('No fue posible iniciar la jornada.');
    } finally {
      setIsChangingSession(false);
    }
  };

  const toggleSessionPause = async () => {
    if (!selectedVehicle || !activeSession || isChangingSession) return;
    setIsChangingSession(true);
    try {
      const action = activeSession.status === 'PAUSED' ? 'resume' : 'pause';
      const result = await executeRouteSessionAction({
        action,
        currentSession: activeSession,
        organizationId: user?.organizationId || '',
        routeId: selectedVehicle.routeId || '',
        userId: user?.id || '',
        vehicleId: selectedVehicle.id,
        driverId: selectedVehicle.driverId,
      });
      const updatedSession = result.session;
      if (!updatedSession) throw new Error('No fue posible cambiar el estado de la jornada');
      const nextStatus = updatedSession.status;
      setActiveSession(updatedSession);
      useAppStore.setState({ activeRouteSession: updatedSession });
      tracker.toggleTracker();
      await Haptics.impactAsync(
        nextStatus === 'PAUSED' ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium
      );
    } catch {
      tracker.setPointMessage('No fue posible cambiar el estado de la jornada.');
    } finally {
      setIsChangingSession(false);
    }
  };

  const openRouteModal = (vehicle: Vehicle) => {
    setSelectedVehicleId(vehicle.id);
    if (finalizedRouteSummary?.vehicleId !== vehicle.id) {
      setFinalizedRouteSummary(null);
    }
    setRouteModalOpen(true);
  };

  const closeRouteModal = () => {
    const trackerState = trackerRef.current;
    const hasSavedRoute = Boolean(selectedAssignedRoute);
    const hasActiveTracking = trackerState.trackerStatus !== 'off';

    if (!hasSavedRoute && !hasActiveTracking) {
      trackerState.resetPointToPointSession();
      syncedVehicleRouteRef.current = selectedVehicle ? `${selectedVehicle.id}:empty` : null;
    }

    setRouteModalOpen(false);
    setRouteNamePromptOpen(false);
    setRouteNameDraft('');
  };

  const cancelRouteDraft = () => {
    const trackerState = trackerRef.current;

    if (trackerState.trackerStatus !== 'off' || isCalculatedRouteSaved) {
      return;
    }

    pendingStopPersistRef.current = false;
    setRouteNamePromptOpen(false);
    setRouteNameDraft('');
    setEditingRouteId(null);
    setFinalizedRouteSummary(null);
    trackerState.resetPointToPointSession();
    syncedVehicleRouteRef.current = selectedVehicle ? `${selectedVehicle.id}:empty` : null;
  };

  function openMapForVehicle(vehicle: Vehicle, point: MapPointRole) {
    processedMapSelectionRef.current = null;
    setFinalizedRouteSummary(null);
    const routeParams: Record<string, string> = {
      vehicleId: vehicle.id,
      follow: 'true',
      point,
      returnTo: '/checklist',
    };
    const origin = tracker.pointSelection.origin;
    const destination = tracker.pointSelection.destination;

    if (origin) {
      routeParams.originLatitude = String(origin.location.latitude);
      routeParams.originLongitude = String(origin.location.longitude);
      routeParams.originAddress = origin.address;
      routeParams.originLabel = origin.label;
    }

    if (destination) {
      routeParams.destinationLatitude = String(destination.location.latitude);
      routeParams.destinationLongitude = String(destination.location.longitude);
      routeParams.destinationAddress = destination.address;
      routeParams.destinationLabel = destination.label;
    }

    routeParams.stops = JSON.stringify(tracker.pointStops);

    router.push({
      pathname: '/mapa',
      params: routeParams,
    });
  }

  const handleRemoveRouteStop = (stopId: string) => {
    pendingStopPersistRef.current = true;
    setFinalizedRouteSummary(null);
    tracker.removeStop(stopId);
  };

  const openRouteNamePrompt = useCallback(() => {
    const trackerState = trackerRef.current;
    const origin = trackerState.pointSelection.origin;
    const destination = trackerState.pointSelection.destination;
    const route = trackerState.pointPlan?.routes[0] || null;

    if (!selectedVehicle?.id || !origin || !destination || !trackerState.pointPlan || !route) {
      trackerState.setPointMessage('Calcula la ruta antes de guardarla.');
      return;
    }

    if (isCalculatedRouteSaved && !editingRouteId) {
      trackerState.setPointMessage('La ruta ya esta guardada para esta unidad.');
      return;
    }

    const savedRoute = editingRouteId ? savedRoutes.find((entry) => entry.id === editingRouteId) : null;
    setRouteNameDraft(savedRoute?.name || (route.label && route.label !== 'Ruta recomendada' ? route.label : ''));
    setRouteNamePromptOpen(true);
  }, [editingRouteId, isCalculatedRouteSaved, savedRoutes, selectedVehicle?.id]);

  const saveAssignedRoute = useCallback(async () => {
    const trackerState = trackerRef.current;
    const origin = trackerState.pointSelection.origin;
    const destination = trackerState.pointSelection.destination;
    const route = trackerState.pointPlan?.routes[0] || null;
    const routeName = routeNameDraft.trim();

    if (!selectedVehicle?.id || !origin || !destination || !trackerState.pointPlan || !route) {
      trackerState.setPointMessage('Calcula la ruta antes de guardarla.');
      return;
    }

    if (!routeName) {
      trackerState.setPointMessage('Escribe el nombre de la ruta.');
      return;
    }

    setIsSavingAssignedRoute(true);
    setFinalizedRouteSummary(null);

    try {
      const payload = {
        name: routeName,
        origin: origin.location,
        destination: destination.location,
        route,
        stops: trackerState.pointStops,
      };
      const savedRoute = editingRouteId
        ? await updateNavigationRouteRequest(editingRouteId, payload)
        : await createNavigationRouteRequest(payload);
      await assignVehicleRouteRequest({
        vehicleId: selectedVehicle.id,
        routeId: savedRoute.id,
      });
      await refreshAll();
      setRouteNamePromptOpen(false);
      setRouteNameDraft('');
      setEditingRouteId(null);
      trackerState.setPointMessage(editingRouteId ? 'Ruta actualizada y asignada a la unidad.' : 'Ruta guardada y asignada a la unidad.');
    } catch {
      trackerState.setPointMessage('No fue posible guardar la ruta.');
    } finally {
      setIsSavingAssignedRoute(false);
    }
  }, [editingRouteId, refreshAll, routeNameDraft, selectedVehicle?.id]);

  const assignSavedRoute = useCallback(async (route: RouteShape) => {
    if (!selectedVehicle?.id) {
      return;
    }

    setIsSavingAssignedRoute(true);
    setFinalizedRouteSummary(null);

    try {
      await assignVehicleRouteRequest({
        vehicleId: selectedVehicle.id,
        routeId: route.id,
      });
      await refreshAll();
      trackerRef.current.setPointMessage(`Ruta ${route.name} asignada a la unidad.`);
    } catch {
      trackerRef.current.setPointMessage('No fue posible asignar la ruta.');
    } finally {
      setIsSavingAssignedRoute(false);
    }
  }, [refreshAll, selectedVehicle?.id]);

  const deleteSavedRoute = useCallback((route: RouteShape) => {
    setRoutePendingDelete(route);
  }, []);

  const confirmDeleteSavedRoute = useCallback(async () => {
    const route = routePendingDelete;
    if (!route || isDeletingRoute) return;

    setIsDeletingRoute(true);
    try {
      await deleteNavigationRouteRequest(route.id);
      useAppStore.setState((state) => ({
        mapData: state.mapData
          ? {
              ...state.mapData,
              routes: state.mapData.routes.filter((entry) => entry.id !== route.id),
              vehicles: state.mapData.vehicles.map((vehicle) =>
                vehicle.routeId === route.id
                  ? { ...vehicle, routeId: null, route: null, assignedRoute: null, routeName: undefined, routeCode: undefined }
                  : vehicle
              ),
            }
          : state.mapData,
      }));
      setRoutePendingDelete(null);
      trackerRef.current.setPointMessage(`Ruta ${route.name} eliminada.`);
    } catch {
      trackerRef.current.setPointMessage('No fue posible eliminar la ruta.');
    } finally {
      setIsDeletingRoute(false);
    }
  }, [isDeletingRoute, routePendingDelete]);

  const navParams = useLocalSearchParams<{
    vehicleId?: string;
    originLatitude?: string;
    originLongitude?: string;
    originAddress?: string;
    originLabel?: string;
    destinationLatitude?: string;
    destinationLongitude?: string;
    destinationAddress?: string;
    destinationLabel?: string;
    routeDistanceMeters?: string;
    routeDurationSeconds?: string;
    routeDurationInTrafficSeconds?: string;
    routePolyline?: string;
    routeProvider?: string;
    routeTrafficLevel?: string;
    stops?: string;
  }>();

  const { applyPointToPointSelection, selectPoint, planPointToPointRoute } = tracker;

  const originLatCurrent = tracker.pointSelection.origin?.location?.latitude ?? null;
  const originLonCurrent = tracker.pointSelection.origin?.location?.longitude ?? null;
  const destLatCurrent = tracker.pointSelection.destination?.location?.latitude ?? null;
  const destLonCurrent = tracker.pointSelection.destination?.location?.longitude ?? null;
  const hasPointPlan = Boolean(tracker.pointPlan);

  // Handle return values from MapScreen: create NavigationPlaceResult and delegate to tracker
  useEffect(() => {
    if (!routeModalOpen || !selectedVehicle) {
      return;
    }

    if (navParams.vehicleId && navParams.vehicleId !== selectedVehicle.id) {
      return;
    }

    const incomingSelectionKey = [
      navParams.vehicleId || selectedVehicle.id,
      navParams.originLatitude,
      navParams.originLongitude,
      navParams.destinationLatitude,
      navParams.destinationLongitude,
      navParams.routeDistanceMeters,
      navParams.routeDurationInTrafficSeconds,
      navParams.routePolyline,
      navParams.stops,
    ].join('|');

    if (processedMapSelectionRef.current === incomingSelectionKey) {
      return;
    }

    let nextOrigin: NavigationPlaceResult | null = null;
    let nextDestination: NavigationPlaceResult | null = null;

    try {
      const oLat = navParams.originLatitude ? Number(navParams.originLatitude) : NaN;
      const oLon = navParams.originLongitude ? Number(navParams.originLongitude) : NaN;

      if (Number.isFinite(oLat) && Number.isFinite(oLon)) {
        const label = getSafeLabel(navParams.originLabel || navParams.originAddress, 'Punto inicial');
        nextOrigin = {
          id: `map-origin-${oLat}-${oLon}`,
          label,
          address: getSafeLabel(navParams.originAddress || label, label),
          location: { latitude: oLat, longitude: oLon },
        };
      }
    } catch {
      // ignore malformed params
    }

    try {
      const dLat = navParams.destinationLatitude ? Number(navParams.destinationLatitude) : NaN;
      const dLon = navParams.destinationLongitude ? Number(navParams.destinationLongitude) : NaN;

      if (Number.isFinite(dLat) && Number.isFinite(dLon)) {
        const label = getSafeLabel(navParams.destinationLabel || navParams.destinationAddress, 'Punto final');
        nextDestination = {
          id: `map-destination-${dLat}-${dLon}`,
          label,
          address: getSafeLabel(navParams.destinationAddress || label, label),
          location: { latitude: dLat, longitude: dLon },
        };
      }
    } catch {
      // ignore malformed params
    }

    if (nextOrigin && nextDestination) {
      const polyline = parseRoutePolylineParam(navParams.routePolyline);
      const distanceMeters = Number(navParams.routeDistanceMeters);
      const durationSeconds = Number(navParams.routeDurationSeconds);
      const durationInTrafficSeconds = Number(navParams.routeDurationInTrafficSeconds);
      const trafficLevel =
        navParams.routeTrafficLevel === 'medium' || navParams.routeTrafficLevel === 'high'
          ? navParams.routeTrafficLevel
          : 'low';
      const hasRoute =
        polyline.length >= 2 &&
        Number.isFinite(distanceMeters) &&
        Number.isFinite(durationSeconds) &&
        Number.isFinite(durationInTrafficSeconds);
      const nextStops = parseStopsParam(navParams.stops);
      const plan: NavigationPlan | null = hasRoute
        ? {
            provider: (navParams.routeProvider || 'system') as NavigationPlan['provider'],
            origin: nextOrigin.location,
            destination: nextDestination.location,
            stops: nextStops,
            routes: [
              {
                label: 'Ruta preparada',
                distanceMeters,
                durationSeconds,
                durationInTrafficSeconds,
                trafficLevel,
                polyline,
              },
            ],
            updatedAt: new Date().toISOString(),
          }
        : null;

      const sameOrigin = originLatCurrent === nextOrigin.location.latitude && originLonCurrent === nextOrigin.location.longitude;
      const sameDestination =
        destLatCurrent === nextDestination.location.latitude && destLonCurrent === nextDestination.location.longitude;
      const sameStops = getStopsSignature(tracker.pointStops) === getStopsSignature(nextStops);

      if (!sameOrigin || !sameDestination || !sameStops || (plan && !hasPointPlan)) {
        if (!sameStops) {
          pendingStopPersistRef.current = true;
        }
        setFinalizedRouteSummary(null);
        applyPointToPointSelection(nextOrigin, nextDestination, plan, nextStops);
      }

      processedMapSelectionRef.current = incomingSelectionKey;
      return;
    }

    if (nextOrigin && (originLatCurrent !== nextOrigin.location.latitude || originLonCurrent !== nextOrigin.location.longitude)) {
      setFinalizedRouteSummary(null);
      selectPoint('origin', nextOrigin);
      processedMapSelectionRef.current = incomingSelectionKey;
    }

    if (
      nextDestination &&
      (destLatCurrent !== nextDestination.location.latitude || destLonCurrent !== nextDestination.location.longitude)
    ) {
      setFinalizedRouteSummary(null);
      selectPoint('destination', nextDestination);
      processedMapSelectionRef.current = incomingSelectionKey;
    }

    if (tracker.pointSelection.origin && tracker.pointSelection.destination && !hasPointPlan) {
      planPointToPointRoute();
    }
  }, [
    // navigation inputs
    navParams.originLatitude,
    navParams.originLongitude,
    navParams.vehicleId,
    navParams.originAddress,
    navParams.originLabel,
    navParams.destinationLatitude,
    navParams.destinationLongitude,
    navParams.destinationAddress,
    navParams.destinationLabel,
    navParams.routeDistanceMeters,
    navParams.routeDurationInTrafficSeconds,
    navParams.routeDurationSeconds,
    navParams.routePolyline,
    navParams.routeProvider,
    navParams.routeTrafficLevel,
    navParams.stops,
    routeModalOpen,
    selectedVehicle,
    // tracker pieces we need to compare
    originLatCurrent,
    originLonCurrent,
    destLatCurrent,
    destLonCurrent,
    hasPointPlan,
    tracker.pointSelection.destination,
    tracker.pointSelection.origin,
    tracker.pointStops,
    // functions
    applyPointToPointSelection,
    selectPoint,
    planPointToPointRoute,
  ]);

  useEffect(() => {
    if (
      !pendingStopPersistRef.current ||
      !routeModalOpen ||
      !selectedVehicle ||
      !tracker.pointPlan ||
      isSavingAssignedRoute ||
      isCalculatedRouteSaved
    ) {
      return;
    }

    pendingStopPersistRef.current = false;
    tracker.setPointMessage('Asigna un nombre y guarda la ruta.');
  }, [
    activeRouteSignature,
    isCalculatedRouteSaved,
    isSavingAssignedRoute,
    routeModalOpen,
    selectedVehicle,
    tracker,
    tracker.pointPlan,
  ]);

  const editAssignedRoute = useCallback(() => {
    if (!selectedVehicle?.id || !selectedVehicle.routeId) {
      return;
    }

    setFinalizedRouteSummary(null);
    setEditingRouteId(selectedVehicle.routeId);
    tracker.setPointMessage('Edita la ruta y guarda los cambios sobre la misma ruta.');
  }, [selectedVehicle?.id, selectedVehicle?.routeId, tracker]);

  if (!user || !mapData) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator color={theme.colors.accent} size="large" />
      </View>
    );
  }

  if (user.role === 'driver') {
    return (
      <View style={[styles.centered, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator color={theme.colors.accent} size="large" />
        <Text style={styles.centeredText}>Actualizando jornada...</Text>
      </View>
    );
  }

  return (
    <AppShell
      sectionKey="checklist"
      mobileTitle="Checklist"
      header={
        <View style={styles.header}>
          <Text style={styles.title}>Checklist</Text>
        </View>
      }>
      <View style={styles.filterFrame}>
        {[
          { id: 'all', label: 'Historial' },
          { id: 'active', label: 'En ruta' },
          { id: 'routes', label: 'Rutas' },
        ].map((option) => {
          const isActive = filterMode === option.id;

          return (
            <Pressable
              key={option.id}
              onPress={() => setFilterMode(option.id as FilterMode)}
              style={[styles.filterSegment, isActive ? styles.filterSegmentActive : undefined]}>
              <Text style={[styles.filterSegmentText, isActive ? styles.filterSegmentTextActive : undefined]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <AppCard style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle} numberOfLines={2}>Registros operativos</Text>
          <Text style={styles.sectionLink} numberOfLines={1}>{filteredRecords.length} registros</Text>
        </View>

        <View style={styles.recordsList}>
          {filteredRecords.length ? (
            filteredRecords.map((record) => {
              const statusColor = getStatusColor(theme, record.status);
              const etaLabel =
                record.status === 'completed'
                  ? 'LLE'
                  : record.delayMinutes > 0
                    ? `ETA +${record.delayMinutes}`
                    : 'ETA';

              return (
                <View key={`${record.id}-${record.vehicleId}`} style={styles.recordCard}>
                  <View style={styles.recordMain}>
                    <View style={styles.recordLead}>
                      <View style={[styles.recordIcon, { backgroundColor: `${statusColor}18` }]}>
                        <MaterialCommunityIcons
                          name={
                            record.status === 'completed'
                              ? 'check-circle-outline'
                              : record.status === 'delayed'
                                ? 'clock-alert-outline'
                                : record.status === 'active'
                                  ? 'arrow-right-circle-outline'
                                  : 'bus'
                          }
                          size={24}
                          color={statusColor}
                        />
                      </View>
                      <View style={styles.recordCopy}>
                        <Text style={styles.recordTitle} numberOfLines={1} ellipsizeMode="tail">{record.vehicleCode}</Text>
                        <Text style={styles.recordDriver} numberOfLines={1}>
                          {record.driverName}
                        </Text>
                      </View>
                    </View>
                    <StatusPill label={getStatusLabel(record.status)} tone={getStatusTone(record.status)} />
                  </View>

                  <View style={styles.recordTimeline}>
                    <View style={styles.timeBlock}>
                      <Text style={styles.timeLabel}>SAL</Text>
                      <Text style={styles.timeValue} numberOfLines={1} ellipsizeMode="tail">
                        {record.departureAt ? formatTime(record.departureAt) : 'Sin salida'}
                      </Text>
                    </View>
                    <View style={styles.timeBlock}>
                      <Text style={styles.timeLabel}>{etaLabel}</Text>
                      <Text style={styles.timeValue} numberOfLines={1} ellipsizeMode="tail">
                        {record.arrivalAt
                          ? formatTime(record.arrivalAt)
                          : record.etaAt
                            ? formatTime(record.etaAt)
                            : 'Pendiente'}
                      </Text>
                    </View>
                    <View style={styles.timeBlock}>
                      <Text style={styles.timeLabel}>RUTA</Text>
                      <Text style={styles.timeValue} numberOfLines={1}>
                        {record.routeName}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.recordActions}>
                    <Pressable style={styles.miniAction} onPress={() => openRouteModal(record.vehicle)}>
                      <MaterialCommunityIcons name="map-marker-path" size={16} color={theme.colors.text} />
                      <Text style={styles.miniActionText}>Ruta</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })
          ) : (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="clipboard-check-outline" size={28} color={theme.colors.muted} />
              <Text style={styles.emptyTitle}>Sin registros</Text>
            </View>
          )}
        </View>
      </AppCard>

      <Modal visible={routeModalOpen} transparent animationType="fade" onRequestClose={closeRouteModal}>
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
            style={styles.modalKeyboard}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderCopy}>
                <Text style={styles.modalTitle} numberOfLines={1} ellipsizeMode="tail">{selectedVehicle?.code || 'Ruta punto a punto'}</Text>
                <Text style={styles.modalSubtitle} numberOfLines={2} ellipsizeMode="tail">{routeHeaderSubtitle}</Text>
              </View>
              <Pressable style={styles.modalClose} onPress={closeRouteModal}>
                <MaterialCommunityIcons name="close" size={22} color={theme.colors.text} />
              </Pressable>
            </View>

            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} showsVerticalScrollIndicator={false}>
              {routeUiState === 'empty' ? (
                <View style={styles.configCard}>
                    {savedRoutes.length ? (
                      <View style={styles.savedRoutesList}>
                        <Text style={styles.fieldLabel}>Rutas guardadas</Text>
                        {savedRoutes.map((route) => (
                          <View key={route.id} style={styles.savedRouteRow}>
                            <Pressable
                              style={styles.savedRouteButton}
                              onPress={() => assignSavedRoute(route)}
                              disabled={isSavingAssignedRoute}>
                              <MaterialCommunityIcons name="routes" size={17} color={theme.colors.text} />
                              <Text style={styles.savedRouteName} numberOfLines={1}>{route.name}</Text>
                            </Pressable>
                            <Pressable
                              style={styles.savedRouteDelete}
                              onPress={() => deleteSavedRoute(route)}
                              disabled={isSavingAssignedRoute}
                              accessibilityLabel={`Eliminar ruta ${route.name}`}>
                              <MaterialCommunityIcons name="trash-can-outline" size={18} color={theme.colors.danger} />
                            </Pressable>
                          </View>
                        ))}
                      </View>
                    ) : null}
                    <Pressable
                      style={styles.primaryWide}
                      onPress={() => selectedVehicle && openMapForVehicle(selectedVehicle, 'origin')}>
                      <MaterialCommunityIcons name="map-plus" size={18} color="#FFFFFF" />
                      <Text style={styles.primaryWideText}>Crear ruta</Text>
                    </Pressable>
                </View>
              ) : null}

              {routeUiState === 'editing' ? (
                <>
                  <RoutePreview
                    points={routeStops}
                    route={routeOption}
                    vehicle={selectedVehicle}
                    onPress={() => selectedVehicle && openMapForVehicle(selectedVehicle, 'origin')}
                  />
                  {routeOption ? (
                    <View style={styles.routeSummary}>
                      <View style={styles.routeSummaryItem}>
                        <Text style={styles.summaryLabel}>Distancia</Text>
                        <Text style={styles.summaryValue} numberOfLines={2}>{formatDistance(routeDistanceMeters)}</Text>
                      </View>
                      <View style={styles.routeSummaryItem}>
                        <Text style={styles.summaryLabel}>Paradas</Text>
                        <Text style={styles.summaryValue}>{waypointCount}</Text>
                      </View>
                      <View style={styles.routeSummaryItem}>
                        <Text style={styles.summaryLabel}>Estimado</Text>
                        <Text style={styles.summaryValue} numberOfLines={2}>{dynamicEtaLabel}</Text>
                      </View>
                    </View>
                  ) : null}
                  <View style={styles.configCard}>
                    <View style={styles.configTitleRow}>
                      <Text style={styles.configTitle}>Editando ruta</Text>
                      <StatusPill label={routeStateLabel} tone="neutral" />
                    </View>
                    <View style={styles.routeEndpoints}>
                      <Text style={styles.fieldLabel}>Origen</Text>
                      <Text style={styles.endpointText} numberOfLines={1}>{originLabel}</Text>
                      <MaterialCommunityIcons name="arrow-down" size={18} color={theme.colors.muted} />
                      <Text style={styles.fieldLabel}>Destino</Text>
                      <Text style={styles.endpointText} numberOfLines={1}>{destinationLabel}</Text>
                    </View>
                    {waypointCount ? (
                      <View style={styles.compactStopsList}>
                        {tracker.pointStops.map((stop, index) => (
                          <View key={stop.id} style={styles.stopRow}>
                            <View style={styles.waypointNumber}>
                              <Text style={styles.stopNumberText}>{index + 1}</Text>
                            </View>
                            <View style={styles.stopCopy}>
                              <Text style={styles.stopTitle} numberOfLines={1}>
                                {getStopLabel(stop, index)}
                              </Text>
                            </View>
                            <View style={styles.stopMoveGroup}>
                              <Pressable
                                style={[styles.stopMoveButton, index === 0 ? styles.stopMoveButtonDisabled : undefined]}
                                disabled={index === 0}
                                onPress={() => tracker.moveStop(stop.id, -1)}>
                                <MaterialCommunityIcons name="chevron-up" size={16} color={theme.colors.text} />
                              </Pressable>
                              <Pressable
                                style={[
                                  styles.stopMoveButton,
                                  index === waypointCount - 1 ? styles.stopMoveButtonDisabled : undefined,
                                ]}
                                disabled={index === waypointCount - 1}
                                onPress={() => tracker.moveStop(stop.id, 1)}>
                                <MaterialCommunityIcons name="chevron-down" size={16} color={theme.colors.text} />
                              </Pressable>
                              <Pressable style={styles.stopRemoveButton} onPress={() => handleRemoveRouteStop(stop.id)}>
                                <MaterialCommunityIcons name="trash-can-outline" size={18} color={theme.colors.danger} />
                              </Pressable>
                            </View>
                          </View>
                        ))}
                      </View>
                    ) : null}
                    {tracker.pointMessage ? <Text style={styles.messageText}>{tracker.pointMessage}</Text> : null}
                    <View style={styles.routeActionRow}>
                      <Pressable style={styles.secondaryWide} onPress={cancelRouteDraft}>
                        <MaterialCommunityIcons name="close" size={18} color={theme.colors.text} />
                        <Text style={styles.secondaryWideText}>Cancelar</Text>
                      </Pressable>
                      <Pressable
                        style={styles.secondaryWide}
                        onPress={() => selectedVehicle && openMapForVehicle(selectedVehicle, 'stop')}>
                        <MaterialCommunityIcons name="map-marker-plus-outline" size={18} color={theme.colors.text} />
                        <Text style={styles.secondaryWideText}>Abrir mapa</Text>
                      </Pressable>
                    </View>
                    <Pressable
                      style={styles.primaryWide}
                      onPress={
                        tracker.pointPlan
                          ? openRouteNamePrompt
                          : () => selectedVehicle && openMapForVehicle(selectedVehicle, 'origin')
                      }
                      disabled={tracker.isPlanningPointRoute || isSavingAssignedRoute}>
                      {tracker.isPlanningPointRoute || isSavingAssignedRoute ? (
                        <ActivityIndicator color="#FFFFFF" />
                      ) : (
                        <>
                          <MaterialCommunityIcons name="content-save-check-outline" size={18} color="#FFFFFF" />
                          <Text style={styles.primaryWideText}>
                            {tracker.pointPlan
                              ? 'Guardar ruta'
                              : 'Abrir mapa'}
                          </Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                </>
              ) : null}

              {routeUiState === 'ready' ? (
                <>
                  <RoutePreview
                    points={routeStops}
                    route={routeOption}
                    vehicle={selectedVehicle}
                    onPress={() => selectedVehicle && openMapForVehicle(selectedVehicle, 'origin')}
                  />
                  <View style={styles.routeSummary}>
                    <View style={styles.routeSummaryItem}>
                      <Text style={styles.summaryLabel}>Distancia</Text>
                      <Text style={styles.summaryValue}>{formatDistance(routeDistanceMeters)}</Text>
                    </View>
                    <View style={styles.routeSummaryItem}>
                      <Text style={styles.summaryLabel}>Paradas</Text>
                      <Text style={styles.summaryValue}>{waypointCount}</Text>
                    </View>
                    <View style={styles.routeSummaryItem}>
                      <Text style={styles.summaryLabel}>Estimado</Text>
                      <Text style={styles.summaryValue}>{dynamicEtaLabel}</Text>
                    </View>
                  </View>
                  <View style={styles.configCard}>
                    <View style={styles.configTitleRow}>
                      <Text style={styles.configTitle}>Ruta lista</Text>
                      <StatusPill label={progressLabel} tone="positive" />
                    </View>
                    <View style={styles.routeEndpoints}>
                      <Text style={styles.fieldLabel}>Origen</Text>
                      <Text style={styles.endpointText} numberOfLines={1}>{originLabel}</Text>
                      <MaterialCommunityIcons name="arrow-down" size={18} color={theme.colors.muted} />
                      <Text style={styles.fieldLabel}>Destino</Text>
                      <Text style={styles.endpointText} numberOfLines={1}>{destinationLabel}</Text>
                    </View>
                    <View style={styles.routeActionRow}>
                      <Pressable style={styles.secondaryWide} onPress={editAssignedRoute}>
                        <MaterialCommunityIcons name="pencil-outline" size={18} color={theme.colors.text} />
                        <Text style={styles.secondaryWideText}>Cambiar ruta</Text>
                      </Pressable>
                    </View>
                  </View>
                </>
              ) : null}

              {routeUiState === 'navigation' || routeUiState === 'paused' ? (
                <>
                  <RoutePreview
                    points={routeStops}
                    route={routeOption}
                    vehicle={selectedVehicle}
                  />
                  <View style={styles.progressCard}>
                    <View style={styles.progressTop}>
                      <Text style={styles.progressTitle}>{routeUiState === 'paused' ? 'Ruta pausada' : 'En navegación'}</Text>
                      <Text style={styles.progressValue}>{progressLabel}</Text>
                    </View>
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${routeProgress}%` as any }]} />
                    </View>
                    <View style={styles.routeSummary}>
                      <View style={styles.routeSummaryItem}>
                        <Text style={styles.summaryLabel}>Restante</Text>
                        <Text style={styles.summaryValue}>{remainingDistanceLabel}</Text>
                      </View>
                      <View style={styles.routeSummaryItem}>
                        <Text style={styles.summaryLabel}>ETA</Text>
                        <Text style={styles.summaryValue}>{dynamicEtaLabel}</Text>
                      </View>
                      <View style={styles.routeSummaryItem}>
                        <Text style={styles.summaryLabel}>Checkpoints</Text>
                        <Text style={styles.summaryValue}>{checkpointProgressLabel}</Text>
                      </View>
                    </View>
                    {isRouteOffRoute ? (
                      <View style={styles.routeAlert}>
                        <MaterialCommunityIcons name="alert-outline" size={18} color={theme.colors.danger} />
                        <Text style={styles.routeAlertText}>
                          Desviacion detectada a {formatDistance(tracker.routeProgress?.distanceFromRoute || 0)} de la ruta.
                        </Text>
                      </View>
                    ) : null}
                    <Pressable
                      style={styles.primaryWide}
                      onPress={() => {
                        const labels = tracker.pointStops.map((stop, index) => getStopLabel(stop, index));
                        tracker.setPointMessage(labels.length ? labels.join(' · ') : 'Sin paradas manuales.');
                      }}>
                      <MaterialCommunityIcons name="flag-variant-outline" size={18} color="#FFFFFF" />
                      <Text style={styles.primaryWideText}>Ver paradas</Text>
                    </Pressable>
                    {tracker.pointMessage ? <Text style={styles.messageText}>{tracker.pointMessage}</Text> : null}
                  </View>
                  <View style={styles.configCard}>
                    <View style={styles.unitRouteCard}>
                      <View style={styles.recordCopy}>
                        <Text style={styles.recordTitle} numberOfLines={1} ellipsizeMode="tail">{selectedVehicle?.code || 'Unidad'}</Text>
                        <Text style={styles.recordDriver} numberOfLines={1}>
                          {selectedVehicle?.driverName || 'Operador sin asignar'}
                        </Text>
                      </View>
                      <StatusPill label={routeStateLabel} tone={routeUiState === 'paused' || isRouteOffRoute ? 'warning' : 'info'} />
                    </View>
                  </View>
                </>
              ) : null}

              {routeUiState === 'finalized' && finalizedRouteSummary ? (
                <View style={styles.configCard}>
                  <View style={styles.configTitleRow}>
                    <Text style={styles.configTitle}>Ruta finalizada</Text>
                    <StatusPill label={formatTime(finalizedRouteSummary.finishedAt)} tone="positive" />
                  </View>
                  <View style={styles.routeSummary}>
                    <View style={styles.routeSummaryItem}>
                      <Text style={styles.summaryLabel}>Distancia</Text>
                      <Text style={styles.summaryValue}>{finalizedRouteSummary.distanceLabel}</Text>
                    </View>
                    <View style={styles.routeSummaryItem}>
                      <Text style={styles.summaryLabel}>Vueltas</Text>
                      <Text style={styles.summaryValue}>{finalizedRouteSummary.lapCount}</Text>
                    </View>
                    <View style={styles.routeSummaryItem}>
                      <Text style={styles.summaryLabel}>Duracion real</Text>
                      <Text style={styles.summaryValue}>{finalizedRouteSummary.durationLabel}</Text>
                    </View>
                  </View>
                  <Text style={styles.messageText}>
                    {`Movimiento ${finalizedRouteSummary.movingTimeLabel} · Detenido ${finalizedRouteSummary.stoppedTimeLabel} · Paradas ${finalizedRouteSummary.stopCount} · Eventos ${finalizedRouteSummary.eventCount} · Incidencias ${finalizedRouteSummary.incidentCount}`}
                  </Text>
                  <View style={styles.routeEndpoints}>
                    <Text style={styles.fieldLabel}>Origen</Text>
                    <Text style={styles.endpointText} numberOfLines={1}>{finalizedRouteSummary.originLabel}</Text>
                    <MaterialCommunityIcons name="arrow-down" size={18} color={theme.colors.muted} />
                    <Text style={styles.fieldLabel}>Destino</Text>
                    <Text style={styles.endpointText} numberOfLines={1}>{finalizedRouteSummary.destinationLabel}</Text>
                  </View>
                  <Pressable
                    style={styles.primaryWide}
                    onPress={() => {
                      setFinalizedRouteSummary(null);
                      selectedVehicle && openMapForVehicle(selectedVehicle, 'origin');
                    }}>
                    <MaterialCommunityIcons name="map-plus" size={18} color="#FFFFFF" />
                    <Text style={styles.primaryWideText}>Nueva ruta</Text>
                  </Pressable>
                </View>
              ) : null}
            </ScrollView>
            {routeNamePromptOpen ? (
              <View style={styles.routeNamePrompt}>
                <Text style={styles.configTitle}>Nombre de la ruta</Text>
                <TextInput
                  value={routeNameDraft}
                  onChangeText={setRouteNameDraft}
                  placeholder="Ruta Centro"
                  placeholderTextColor={theme.colors.muted}
                  style={styles.routeNameInput}
                  autoCapitalize="words"
                  returnKeyType="done"
                />
                <View style={styles.routeActionRow}>
                  <Pressable
                    style={styles.secondaryWide}
                    onPress={() => {
                      setRouteNamePromptOpen(false);
                      setRouteNameDraft('');
                    }}
                    disabled={isSavingAssignedRoute}>
                    <MaterialCommunityIcons name="close" size={18} color={theme.colors.text} />
                    <Text style={styles.secondaryWideText}>Cancelar</Text>
                  </Pressable>
                  <Pressable style={styles.primaryWideInline} onPress={saveAssignedRoute} disabled={isSavingAssignedRoute}>
                    {isSavingAssignedRoute ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <>
                        <MaterialCommunityIcons name="content-save-check-outline" size={18} color="#FFFFFF" />
                        <Text style={styles.primaryWideText}>Guardar</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
      <ConfirmModal
        visible={Boolean(routePendingDelete)}
        title="Eliminar ruta"
        description={routePendingDelete ? `Se eliminara ${routePendingDelete.name} y se limpiara de las unidades asignadas.` : undefined}
        confirmLabel="Eliminar"
        danger
        processing={isDeletingRoute}
        onCancel={() => setRoutePendingDelete(null)}
        onConfirm={confirmDeleteSavedRoute}
      />
    </AppShell>
  );
}
