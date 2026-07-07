import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { router, useLocalSearchParams } from '@/src/navigation/router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { Typography } from '@/constants/theme';
import { AppCard } from '@/src/components/app-card';
import { AppMap, AppMapMarker, AppMapPolyline, type AppMapRef } from '@/src/components/app-map';
import { AppShell } from '@/src/components/app-shell';
import { StatusPill } from '@/src/components/status-pill';
import { assignVehicleRouteRequest, clearAssignedVehicleRouteRequest } from '@/src/api/client';
import { usePointToPointTracker } from '@/src/hooks/use-point-to-point-tracker';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { useUserLocation } from '@/src/hooks/use-user-location';
import { useAppStore } from '@/src/store/use-app-store';
import type {
  FleetControlLog,
  GeoPoint,
  NavigationPlan,
  NavigationPlaceResult,
  NavigationRouteOption,
  NavigationStop,
  Vehicle,
} from '@/src/types/app';
import { formatTime } from '@/src/utils/format';

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
  finishedAt: string;
  originLabel: string;
  destinationLabel: string;
  stopCount: number;
  vehicleId: string;
} | null;

const ACTIVE_VEHICLE_STATUSES = new Set(['online', 'patrolling', 'on-route', 'active']);

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
    return '--';
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

function getVehicleOperationalStatus(vehicle: Vehicle, manualLog: FleetControlLog | null): OperationalStatus {
  if (manualLog?.status === 'completed') {
    return 'completed';
  }

  if (manualLog?.status === 'delayed') {
    return 'delayed';
  }

  if (manualLog?.status === 'active') {
    return vehicle.delayMinutes > 0 ? 'delayed' : 'active';
  }

  if (ACTIVE_VEHICLE_STATUSES.has(String(vehicle.status || '').toLowerCase())) {
    return vehicle.delayMinutes > 0 ? 'delayed' : 'active';
  }

  return 'available';
}

function buildOperationalRecord(vehicle: Vehicle, manualLogs: FleetControlLog[]): OperationalRecord {
  const latestLog = getLatestLog(manualLogs, vehicle.id);
  const activeLog = getActiveLog(manualLogs, vehicle.id);
  const status = getVehicleOperationalStatus(vehicle, activeLog || latestLog);
  const departureAt =
    activeLog?.departureAt ||
    latestLog?.departureAt ||
    (status === 'available' ? null : vehicle.updatedAt);

  return {
    id: latestLog?.id || `vehicle-record-${vehicle.id}`,
    vehicleId: vehicle.id,
    vehicleCode: vehicle.code,
    driverName: vehicle.driverName || 'Operador sin asignar',
    routeName: vehicle.routeName || vehicle.routeCode || 'Ruta sin asignar',
    departureAt,
    arrivalAt: latestLog?.arrivalAt || null,
    etaAt: getEtaAt(vehicle),
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
  const assignedRoute = vehicle.assignedRoute;
  const route = assignedRoute?.route;
  const routeOrigin = assignedRoute?.origin || route?.polyline?.[0] || null;

  if (!assignedRoute || !route || !routeOrigin || !assignedRoute.destination || route.polyline.length < 2) {
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
    () => (sourcePoints.length ? sourcePoints : [fallbackPoint]),
    [fallbackPoint, sourcePoints]
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
      mapRef.current?.fitToCoordinates(mapPoints, {
        animated: false,
        edgePadding: { top: 28, right: 28, bottom: 28, left: 28 },
      });
    }
  }, [mapPoints]);

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
          <AppMapPolyline
            id="route-preview"
            coordinates={sourcePoints}
            strokeColor={theme.colors.info}
            strokeWidth={4}
          />
        ) : null}
        {points.map((point, index) => {
          const isDestination = point.type === 'destination';
          const isOrigin = point.type === 'origin';

          return (
            <AppMapMarker key={point.id} id={`preview-${point.id}`} coordinate={point.location}>
              <View style={[styles.miniMapMarker, isDestination ? styles.miniMapMarkerDestination : undefined]}>
                <Text style={styles.miniMapMarkerText}>{isOrigin ? 'S' : isDestination ? 'F' : index}</Text>
              </View>
            </AppMapMarker>
          );
        })}
        {vehicle ? (
          <AppMapMarker id="preview-vehicle" coordinate={vehicle.location}>
            <View style={styles.miniMapVehicleMarker}>
              <MaterialCommunityIcons name="bus" size={15} color={theme.colors.text} />
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
      minWidth: 76,
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
    modalHandle: {
      width: 38,
      height: 4,
      borderRadius: 999,
      backgroundColor: theme.colors.line,
      alignSelf: 'center',
      marginBottom: 2,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    modalTitle: {
      color: theme.colors.text,
      fontFamily: Typography.display,
      fontSize: 21,
      fontWeight: '900',
    },
    modalSubtitle: {
      color: theme.colors.muted,
      fontSize: 13,
      lineHeight: 18,
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
    routePreview: {
      height: 230,
      borderRadius: 22,
      overflow: 'hidden',
      backgroundColor: theme.mode === 'light' ? '#F2F6FB' : '#101A27',
      borderWidth: 1,
      borderColor: theme.colors.line,
    },
    miniMapMarker: {
      width: 28,
      height: 28,
      borderRadius: 999,
      backgroundColor: theme.colors.info,
      borderWidth: 2,
      borderColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
    },
    miniMapMarkerDestination: {
      backgroundColor: theme.colors.accent,
    },
    miniMapMarkerText: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '900',
    },
    miniMapVehicleMarker: {
      width: 34,
      height: 34,
      borderRadius: 13,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.line,
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
    primaryWideText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '900',
    },
  });
}

export function ChecklistScreen() {
  const { theme } = useAppTheme();
  const { width } = useWindowDimensions();
  const isCompact = width < 1120;
  const isPhone = width < 640;
  const { coordinates } = useUserLocation();
  const { mapData, refreshAll, user } = useAppStore(
    useShallow((state) => ({
      mapData: state.mapData,
      refreshAll: state.refreshAll,
      user: state.user,
    }))
  );
  const [manualLogs, setManualLogs] = useState<FleetControlLog[]>([]);
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [routeModalOpen, setRouteModalOpen] = useState(false);
  const [isSavingAssignedRoute, setIsSavingAssignedRoute] = useState(false);
  const [finalizedRouteSummary, setFinalizedRouteSummary] = useState<FinalizedRouteSummary>(null);
  const styles = useMemo(() => createStyles(theme, isCompact, isPhone), [theme, isCompact, isPhone]);

  const vehicles = useMemo(
    () => [...(mapData?.vehicles || [])].sort((left, right) => left.code.localeCompare(right.code)),
    [mapData?.vehicles]
  );
  const selectedVehicle =
    vehicles.find((vehicle) => vehicle.id === selectedVehicleId) || vehicles[0] || null;
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

  useEffect(() => {
    trackerRef.current = tracker;
  }, [tracker]);

  useEffect(() => {
    if (!routeModalOpen || !selectedVehicle) {
      return;
    }

    const assignedAt = selectedVehicle.assignedRoute?.assignedAt || 'empty';
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

  const routeOption = tracker.pointPlan?.routes[0] || selectedVehicle?.assignedRoute?.route || null;
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
    destination: selectedVehicle?.assignedRoute?.destination,
    distanceMeters: selectedVehicle?.assignedRoute?.route.distanceMeters,
    origin: selectedVehicle?.assignedRoute?.origin,
    polyline: selectedVehicle?.assignedRoute?.route.polyline,
    stops: selectedVehicle?.assignedRoute?.stops || [],
  });
  const isCalculatedRouteSaved = Boolean(
    tracker.pointPlan &&
    selectedVehicle?.assignedRoute &&
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
          : '--'
      : routeDurationSeconds
        ? formatDuration(routeDurationSeconds)
        : '--';
  const checkpointProgressLabel = tracker.routeProgress
    ? `${tracker.routeProgress.currentCheckpointIndex} / ${tracker.routeProgress.checkpointCount}`
    : 'Pendiente';
  const originLabel = getPlaceLabel(tracker.pointSelection.origin, 'Punto inicial');
  const destinationLabel = getPlaceLabel(tracker.pointSelection.destination, 'Punto final');
  const routeHeaderSubtitle =
    routeUiState === 'empty'
      ? 'Sin ruta creada'
      : routeUiState === 'finalized'
        ? 'Resumen de la ultima ruta'
        : `${originLabel} - ${destinationLabel}`;

  const records = useMemo(
    () => vehicles.map((vehicle) => buildOperationalRecord(vehicle, manualLogs)),
    [manualLogs, vehicles]
  );
  const filteredRecords = useMemo(
    () =>
      records.filter((record) => {
        const matchesFilter =
          filterMode === 'all' ||
          (filterMode === 'active' && ['active', 'delayed'].includes(record.status)) ||
          (filterMode === 'completed' && record.status === 'completed') ||
          (filterMode === 'routes' && Boolean(record.routeName || record.vehicle.assignedRoute));

        return matchesFilter;
      }),
    [filterMode, records]
  );

  const finishTrip = async (vehicle: Vehicle) => {
    const activeLog = getActiveLog(manualLogs, vehicle.id);
    const summary: NonNullable<FinalizedRouteSummary> = {
      destinationLabel,
      distanceLabel: formatDistance(routeDistanceMeters),
      durationLabel: routeDurationSeconds ? formatDuration(routeDurationSeconds) : '--',
      finishedAt: new Date().toISOString(),
      originLabel,
      stopCount: waypointCount,
      vehicleId: vehicle.id,
    };

    if (activeLog) {
      setManualLogs((current) =>
        current.map((log) =>
          log.id === activeLog.id
            ? { ...log, status: 'completed', arrivalAt: new Date().toISOString() }
            : log
        )
      );
    } else {
      setManualLogs((current) => [
        {
          id: `fleet-log-${Date.now()}`,
          vehicleId: vehicle.id,
          vehicleCode: vehicle.code,
          driverName: vehicle.driverName || 'Operador sin asignar',
          departureAt: vehicle.updatedAt || new Date().toISOString(),
          arrivalAt: new Date().toISOString(),
          status: 'completed',
        },
        ...current,
      ]);
    }

    if (!vehicle.assignedRoute) {
      if (selectedVehicle?.id === vehicle.id) {
        tracker.resetPointToPointSession();
        setFinalizedRouteSummary(summary);
      }
      return;
    }

    try {
      await clearAssignedVehicleRouteRequest(vehicle.id);
      await refreshAll();

      if (selectedVehicle?.id === vehicle.id) {
        syncedVehicleRouteRef.current = `${vehicle.id}:empty`;
        tracker.resetPointToPointSession();
        setFinalizedRouteSummary(summary);
      }
    } catch {
      tracker.setPointMessage('No fue posible limpiar la ruta asignada.');
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
    const hasSavedRoute = Boolean(selectedVehicle?.assignedRoute);
    const hasActiveTracking = trackerState.trackerStatus !== 'off';

    if (!hasSavedRoute && !hasActiveTracking) {
      trackerState.resetPointToPointSession();
      syncedVehicleRouteRef.current = selectedVehicle ? `${selectedVehicle.id}:empty` : null;
    }

    setRouteModalOpen(false);
  };

  const cancelRouteDraft = () => {
    const trackerState = trackerRef.current;

    if (trackerState.trackerStatus !== 'off' || isCalculatedRouteSaved) {
      return;
    }

    pendingStopPersistRef.current = false;
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

  const saveAssignedRoute = useCallback(async () => {
    const trackerState = trackerRef.current;
    const origin = trackerState.pointSelection.origin;
    const destination = trackerState.pointSelection.destination;
    const route = trackerState.pointPlan?.routes[0] || null;

    if (!selectedVehicle?.id || !origin || !destination || !trackerState.pointPlan || !route) {
      trackerState.setPointMessage('Calcula la ruta antes de guardarla.');
      return;
    }

    if (isCalculatedRouteSaved) {
      trackerState.setPointMessage('La ruta ya esta guardada para esta unidad.');
      return;
    }

    setIsSavingAssignedRoute(true);
    setFinalizedRouteSummary(null);

    try {
      await assignVehicleRouteRequest({
        vehicleId: selectedVehicle.id,
        origin: origin.location,
        destination: destination.location,
        originLabel: origin.label,
        destinationLabel: destination.label,
        provider: trackerState.pointPlan.provider,
        route,
        alternatives: trackerState.pointPlan.routes.slice(1),
        stops: trackerState.pointStops,
      });
      await refreshAll();
      trackerState.setPointMessage('Ruta guardada para la unidad.');
    } catch {
      trackerState.setPointMessage('No fue posible guardar la ruta.');
    } finally {
      setIsSavingAssignedRoute(false);
    }
  }, [isCalculatedRouteSaved, refreshAll, selectedVehicle?.id]);

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
                label: 'Ruta recomendada',
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
    saveAssignedRoute();
  }, [
    activeRouteSignature,
    isCalculatedRouteSaved,
    isSavingAssignedRoute,
    routeModalOpen,
    saveAssignedRoute,
    selectedVehicle,
    tracker.pointPlan,
  ]);

  const deleteAssignedRoute = useCallback(async () => {
    if (!selectedVehicle?.id) {
      return;
    }

    pendingStopPersistRef.current = false;
    setFinalizedRouteSummary(null);

    try {
      await clearAssignedVehicleRouteRequest(selectedVehicle.id);
      await refreshAll();
      syncedVehicleRouteRef.current = `${selectedVehicle.id}:empty`;
      tracker.resetPointToPointSession();
    } catch {
      tracker.setPointMessage('No fue posible eliminar la ruta.');
    }
  }, [refreshAll, selectedVehicle?.id, tracker]);

  const editAssignedRoute = useCallback(async () => {
    if (!selectedVehicle?.id) {
      return;
    }

    setFinalizedRouteSummary(null);

    try {
      await clearAssignedVehicleRouteRequest(selectedVehicle.id);
      await refreshAll();
      syncedVehicleRouteRef.current = `${selectedVehicle.id}:empty`;
    } catch {
      tracker.setPointMessage('No fue posible desbloquear la ruta.');
    }
  }, [refreshAll, selectedVehicle?.id, tracker]);

  if (!user || !mapData) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator color={theme.colors.accent} size="large" />
      </View>
    );
  }

  return (
    <AppShell
      sectionKey="checklist"
      mobileTitle="Checklist"
      header={
        <View style={styles.header}>
          <Text style={styles.eyebrow}>SISTEMA DE CONTROL</Text>
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
          <Text style={styles.sectionTitle}>Registros operativos</Text>
          <Text style={styles.sectionLink}>{filteredRecords.length} registros</Text>
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
                      <View>
                        <Text style={styles.recordTitle}>{record.vehicleCode}</Text>
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
                      <Text style={styles.timeValue}>
                        {record.departureAt ? formatTime(record.departureAt) : '--:--'}
                      </Text>
                    </View>
                    <View style={styles.timeBlock}>
                      <Text style={styles.timeLabel}>{etaLabel}</Text>
                      <Text style={styles.timeValue}>
                        {record.arrivalAt
                          ? formatTime(record.arrivalAt)
                          : record.etaAt
                            ? formatTime(record.etaAt)
                            : '--:--'}
                      </Text>
                    </View>
                    <View style={styles.timeBlock}>
                      <Text style={styles.timeLabel}>RUTA</Text>
                      <Text style={styles.timeValue} numberOfLines={1}>
                        {record.vehicle.routeCode || record.routeName}
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
              <Text style={styles.emptyTitle}>Sin registros filtrados</Text>
              <Text style={styles.emptyBody}>
                Ajusta la busqueda o cambia el filtro para encontrar salidas y llegadas.
              </Text>
            </View>
          )}
        </View>
      </AppCard>

      <Modal visible={routeModalOpen} transparent animationType="fade" onRequestClose={closeRouteModal}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>{selectedVehicle?.code || 'Ruta punto a punto'}</Text>
                <Text style={styles.modalSubtitle}>{routeHeaderSubtitle}</Text>
              </View>
              <Pressable style={styles.modalClose} onPress={closeRouteModal}>
                <MaterialCommunityIcons name="close" size={22} color={theme.colors.text} />
              </Pressable>
            </View>

            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} showsVerticalScrollIndicator={false}>
              {routeUiState === 'empty' ? (
                <>
                  <RoutePreview
                    points={[]}
                    route={null}
                    vehicle={selectedVehicle}
                    onPress={() => selectedVehicle && openMapForVehicle(selectedVehicle, 'origin')}
                  />
                  <View style={styles.configCard}>
                    <View style={styles.configTitleRow}>
                      <Text style={styles.configTitle}>Sin ruta creada</Text>
                      <StatusPill label={routeStateLabel} tone="neutral" />
                    </View>
                    <Text style={styles.messageText}>
                      Esta unidad no tiene una ruta punto a punto activa.
                    </Text>
                    <Pressable
                      style={styles.primaryWide}
                      onPress={() => selectedVehicle && openMapForVehicle(selectedVehicle, 'origin')}>
                      <MaterialCommunityIcons name="map-plus" size={18} color="#FFFFFF" />
                      <Text style={styles.primaryWideText}>Crear ruta</Text>
                    </Pressable>
                  </View>
                </>
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
                          ? saveAssignedRoute
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
                        <Text style={styles.secondaryWideText}>Editar</Text>
                      </Pressable>
                      <Pressable style={styles.secondaryWide} onPress={deleteAssignedRoute}>
                        <MaterialCommunityIcons name="trash-can-outline" size={18} color={theme.colors.text} />
                        <Text style={styles.secondaryWideText}>Eliminar</Text>
                      </Pressable>
                    </View>
                    <Pressable style={styles.primaryWide} onPress={tracker.toggleTracker}>
                      <MaterialCommunityIcons name="navigation" size={18} color="#FFFFFF" />
                      <Text style={styles.primaryWideText}>Iniciar ruta</Text>
                    </Pressable>
                  </View>
                </>
              ) : null}

              {routeUiState === 'navigation' || routeUiState === 'paused' ? (
                <>
                  <RoutePreview
                    points={routeStops}
                    route={routeOption}
                    vehicle={selectedVehicle}
                    onPress={() => undefined}
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
                      <View>
                        <Text style={styles.recordTitle}>{selectedVehicle?.code || 'Unidad'}</Text>
                        <Text style={styles.recordDriver} numberOfLines={1}>
                          {selectedVehicle?.driverName || 'Operador sin asignar'}
                        </Text>
                      </View>
                      <StatusPill label={routeStateLabel} tone={routeUiState === 'paused' || isRouteOffRoute ? 'warning' : 'info'} />
                    </View>
                    <View style={styles.routeActionRow}>
                      <Pressable style={styles.secondaryWide} onPress={tracker.toggleTracker}>
                        <MaterialCommunityIcons
                          name={routeUiState === 'paused' ? 'play' : 'pause'}
                          size={18}
                          color={theme.colors.text}
                        />
                        <Text style={styles.secondaryWideText}>
                          {routeUiState === 'paused' ? 'Continuar' : 'Pausar'}
                        </Text>
                      </Pressable>
                      <Pressable
                        style={styles.primaryWide}
                        onPress={() => selectedVehicle && finishTrip(selectedVehicle)}>
                        <MaterialCommunityIcons name="flag-checkered" size={18} color="#FFFFFF" />
                        <Text style={styles.primaryWideText}>Finalizar</Text>
                      </Pressable>
                    </View>
                    {routeUiState === 'paused' ? (
                      <Pressable style={styles.secondaryWide} onPress={deleteAssignedRoute}>
                        <MaterialCommunityIcons name="close-circle-outline" size={18} color={theme.colors.text} />
                        <Text style={styles.secondaryWideText}>Cancelar</Text>
                      </Pressable>
                    ) : null}
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
                      <Text style={styles.summaryLabel}>Paradas</Text>
                      <Text style={styles.summaryValue}>{finalizedRouteSummary.stopCount}</Text>
                    </View>
                    <View style={styles.routeSummaryItem}>
                      <Text style={styles.summaryLabel}>Estimado</Text>
                      <Text style={styles.summaryValue}>{finalizedRouteSummary.durationLabel}</Text>
                    </View>
                  </View>
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
          </View>
        </View>
      </Modal>
    </AppShell>
  );
}
