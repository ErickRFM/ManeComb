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
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { Typography } from '@/constants/theme';
import { AppCard } from '@/src/components/app-card';
import { AppShell } from '@/src/components/app-shell';
import { StatusPill } from '@/src/components/status-pill';
import { assignVehicleRouteRequest, clearAssignedVehicleRouteRequest } from '@/src/api/client';
import { usePointToPointTracker } from '@/src/hooks/use-point-to-point-tracker';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { useUserLocation } from '@/src/hooks/use-user-location';
import { useAppStore } from '@/src/store/use-app-store';
import { getLocationStatus } from '@/src/utils/location-status';
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

function buildCurrentLocationPoint(coordinates: GeoPoint): NavigationPlaceResult {
  return {
    id: `gps-${Date.now()}`,
    label: 'Ubicacion actual',
    address: 'GPS del dispositivo',
    location: coordinates,
  };
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
    routeStops.push({
      id: 'origin',
      label: origin.label,
      address: origin.address,
      location: origin.location,
      type: 'origin',
    });
  }

  routeStopEntries.forEach((stop, index) => {
    const location = { latitude: stop.latitude, longitude: stop.longitude };

    if (Number.isFinite(location.latitude) && Number.isFinite(location.longitude)) {
      routeStops.push({
        id: stop.id,
        label: stop.address || `Parada ${index + 1}`,
        address: stop.address || 'Parada agregada',
        location,
        type: 'stop',
      });
    }
  });

  if (destination) {
    routeStops.push({
      id: 'destination',
      label: destination.label,
      address: destination.address,
      location: destination.location,
      type: 'destination',
    });
  }

  return routeStops;
}

function getRouteProgressPercent(args: {
  currentDistanceToDestination: number | null;
  routeDistanceMeters: number;
  trackerStatus: string;
}) {
  const { currentDistanceToDestination, routeDistanceMeters, trackerStatus } = args;

  if (trackerStatus === 'off') {
    return 0;
  }

  if (!currentDistanceToDestination || !routeDistanceMeters) {
    return trackerStatus === 'in_progress' ? 35 : 0;
  }

  const progress = ((routeDistanceMeters - currentDistanceToDestination) / routeDistanceMeters) * 100;
  return Math.max(0, Math.min(100, Math.round(progress)));
}

function ChecklistMetric({
  icon,
  label,
  tone,
  value,
}: {
  icon: string;
  label: string;
  tone: 'info' | 'positive' | 'warning';
  value: number;
}) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme, false, false), [theme]);
  const color =
    tone === 'positive'
      ? theme.colors.success
      : tone === 'warning'
        ? theme.colors.warning
        : theme.colors.info;

  return (
    <View style={styles.metricCard}>
      <View style={[styles.metricIcon, { backgroundColor: `${color}18` }]}>
        <MaterialCommunityIcons name={icon as any} size={20} color={color} />
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function RoutePreview({
  points,
  route,
  vehicle,
}: {
  points: ReturnType<typeof buildRouteStops>;
  route: NavigationRouteOption | null;
  vehicle: Vehicle | null;
}) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme, false, false), [theme]);
  const sourcePoints =
    route?.polyline?.length
      ? route.polyline
      : points.map((point) => point.location);

  const allPoints = [...sourcePoints, ...(vehicle ? [vehicle.location] : [])];
  const latitudes = allPoints.map((point) => point.latitude);
  const longitudes = allPoints.map((point) => point.longitude);
  const minLatitude = Math.min(...latitudes, 0);
  const maxLatitude = Math.max(...latitudes, 1);
  const minLongitude = Math.min(...longitudes, 0);
  const maxLongitude = Math.max(...longitudes, 1);
  const latitudeSpan = Math.max(0.0001, maxLatitude - minLatitude);
  const longitudeSpan = Math.max(0.0001, maxLongitude - minLongitude);

  const toCanvasPoint = (point: GeoPoint) => ({
    x: 10 + ((point.longitude - minLongitude) / longitudeSpan) * 80,
    y: 88 - ((point.latitude - minLatitude) / latitudeSpan) * 76,
  });

  const canvasPoints = sourcePoints.map(toCanvasPoint);

  return (
    <View style={styles.routePreview}>
      <View style={styles.routeGridLineOne} />
      <View style={styles.routeGridLineTwo} />
      {canvasPoints.slice(0, -1).map((point, index) => {
        const next = canvasPoints[index + 1];
        const deltaX = next.x - point.x;
        const deltaY = next.y - point.y;
        const length = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        const angle = `${Math.atan2(deltaY, deltaX)}rad`;

        return (
          <View
            key={`segment-${index}`}
            style={[
              styles.routeSegment,
              {
                left: `${point.x}%` as any,
                top: `${point.y}%` as any,
                width: `${length}%` as any,
                transform: [{ rotate: angle }],
              },
            ]}
          />
        );
      })}

      {points.map((point, index) => {
        const canvasPoint = toCanvasPoint(point.location);
        const isDestination = point.type === 'destination';
        const isOrigin = point.type === 'origin';

        return (
          <View
            key={point.id}
            style={[
              styles.routeMarker,
              isDestination ? styles.routeMarkerDestination : undefined,
              {
                left: `${canvasPoint.x}%` as any,
                top: `${canvasPoint.y}%` as any,
              },
            ]}>
            <Text style={styles.routeMarkerText}>{isOrigin ? 'S' : isDestination ? 'F' : index}</Text>
          </View>
        );
      })}

      {vehicle ? (
        <View
          style={[
            styles.vehicleMarker,
            {
              left: `${toCanvasPoint(vehicle.location).x}%` as any,
              top: `${toCanvasPoint(vehicle.location).y}%` as any,
            },
          ]}>
          <MaterialCommunityIcons name="bus" size={18} color={theme.colors.text} />
        </View>
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
    subtitle: {
      color: theme.colors.muted,
      fontSize: 15,
      lineHeight: 22,
      maxWidth: 680,
    },
    metricsRow: {
      flexDirection: 'row',
      gap: 10,
    },
    metricCard: {
      flex: 1,
      minHeight: 112,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surface,
      padding: 14,
      justifyContent: 'space-between',
    },
    metricIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    metricValue: {
      color: theme.colors.text,
      fontFamily: Typography.display,
      fontSize: 26,
      fontWeight: '900',
      lineHeight: 30,
    },
    metricLabel: {
      color: theme.colors.muted,
      fontSize: 13,
      fontWeight: '700',
    },
    controls: {
      gap: 12,
    },
    searchRow: {
      flexDirection: 'row',
      gap: 10,
      alignItems: 'center',
    },
    searchBar: {
      flex: 1,
      minHeight: 54,
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      gap: 10,
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.line,
    },
    searchInput: {
      flex: 1,
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: '700',
      paddingVertical: 0,
    },
    filterIconButton: {
      width: 54,
      height: 54,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterScroll: {
      flexGrow: 0,
    },
    filterRow: {
      flexDirection: 'row',
      gap: 8,
      paddingRight: 4,
    },
    filterChip: {
      minHeight: 42,
      minWidth: 104,
      paddingHorizontal: 14,
      borderRadius: 15,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterChipActive: {
      borderColor: theme.colors.accent,
      backgroundColor: theme.colors.accentSoft,
    },
    filterChipText: {
      color: theme.colors.muted,
      fontSize: 13,
      fontWeight: '800',
    },
    filterChipTextActive: {
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
    quickList: {
      gap: 12,
      paddingRight: 6,
    },
    unitCard: {
      width: isPhone ? 142 : 154,
      minHeight: 172,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surface,
      padding: 14,
      gap: 10,
      justifyContent: 'space-between',
    },
    unitTop: {
      gap: 8,
    },
    unitIconRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    unitIcon: {
      width: 34,
      height: 34,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceAlt,
    },
    availabilityRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    statusDot: {
      width: 9,
      height: 9,
      borderRadius: 999,
    },
    unitCode: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: '900',
    },
    unitStatus: {
      color: theme.colors.muted,
      fontSize: 13,
      fontWeight: '700',
    },
    unitPrimaryButton: {
      minHeight: 38,
      borderRadius: 12,
      backgroundColor: theme.colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    unitPrimaryText: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '900',
    },
    unitSecondaryButton: {
      minHeight: 36,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.line,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 10,
      backgroundColor: theme.colors.surfaceAlt,
    },
    unitSecondaryText: {
      color: theme.colors.text,
      fontSize: 12,
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
    routePreview: {
      height: 230,
      borderRadius: 22,
      overflow: 'hidden',
      backgroundColor: theme.mode === 'light' ? '#F2F6FB' : '#101A27',
      borderWidth: 1,
      borderColor: theme.colors.line,
    },
    routeGridLineOne: {
      position: 'absolute',
      top: 52,
      left: 0,
      right: 0,
      height: 1,
      backgroundColor: theme.mode === 'light' ? '#E4EAF2' : 'rgba(255,255,255,0.08)',
    },
    routeGridLineTwo: {
      position: 'absolute',
      top: 146,
      left: 0,
      right: 0,
      height: 1,
      backgroundColor: theme.mode === 'light' ? '#E4EAF2' : 'rgba(255,255,255,0.08)',
    },
    routeSegment: {
      position: 'absolute',
      height: 5,
      borderRadius: 999,
      backgroundColor: theme.colors.info,
      transformOrigin: 'left center' as any,
    },
    routeMarker: {
      position: 'absolute',
      width: 30,
      height: 30,
      marginLeft: -15,
      marginTop: -15,
      borderRadius: 999,
      backgroundColor: theme.colors.info,
      borderWidth: 2,
      borderColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
    },
    routeMarkerDestination: {
      backgroundColor: theme.colors.accent,
    },
    routeMarkerText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '900',
    },
    vehicleMarker: {
      position: 'absolute',
      width: 42,
      height: 42,
      marginLeft: -21,
      marginTop: -21,
      borderRadius: 15,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.line,
      alignItems: 'center',
      justifyContent: 'center',
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
    pointInputRow: {
      flexDirection: 'row',
      gap: 8,
      alignItems: 'center',
    },
    pointInput: {
      flex: 1,
      minHeight: 46,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surfaceAlt,
      paddingHorizontal: 12,
      color: theme.colors.text,
      fontSize: 14,
      fontWeight: '700',
    },
    iconSquare: {
      width: 46,
      height: 46,
      borderRadius: 14,
      backgroundColor: theme.colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pointResult: {
      minHeight: 44,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surfaceAlt,
      paddingHorizontal: 12,
      paddingVertical: 8,
      gap: 2,
    },
    resultTitle: {
      color: theme.colors.text,
      fontSize: 13,
      fontWeight: '900',
    },
    resultAddress: {
      color: theme.colors.muted,
      fontSize: 12,
      lineHeight: 17,
    },
    utilityRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    utilityButton: {
      minHeight: 38,
      borderRadius: 13,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surfaceAlt,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
    },
    utilityText: {
      color: theme.colors.text,
      fontSize: 12,
      fontWeight: '800',
    },
    stopsCard: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surface,
      padding: 14,
      gap: 12,
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
    primaryWide: {
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
  const {
    coordinates,
    issue: locationIssue,
    loading: locationLoading,
    permission,
    refresh,
    servicesEnabled,
  } = useUserLocation();
  const { mapData, refreshAll, user } = useAppStore(
    useShallow((state) => ({
      mapData: state.mapData,
      refreshAll: state.refreshAll,
      user: state.user,
    }))
  );
  const [manualLogs, setManualLogs] = useState<FleetControlLog[]>([]);
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [routeModalOpen, setRouteModalOpen] = useState(false);
  const [isSavingAssignedRoute, setIsSavingAssignedRoute] = useState(false);
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

  const tracker = usePointToPointTracker({
    searchAnchor: selectedVehicle?.location || coordinates || null,
    selectedVehicle,
    trackedLocation,
  });
  const trackerRef = useRef(tracker);
  const syncedVehicleRouteRef = useRef<string | null>(null);
  const pendingStopPersistRef = useRef(false);

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
  const routeProgress = getRouteProgressPercent({
    currentDistanceToDestination: tracker.currentDistanceToDestination,
    routeDistanceMeters,
    trackerStatus: tracker.trackerStatus,
  });
  const visitedStops = routeProgress >= 100 ? routeStops.length : Math.floor((routeProgress / 100) * routeStops.length);

  const records = useMemo(
    () => vehicles.map((vehicle) => buildOperationalRecord(vehicle, manualLogs)),
    [manualLogs, vehicles]
  );
  const normalizedSearch = search.trim().toLowerCase();
  const filteredRecords = useMemo(
    () =>
      records.filter((record) => {
        const searchable = [
          record.vehicleCode,
          record.driverName,
          record.routeName,
          record.vehicle.plate,
        ]
          .join(' ')
          .toLowerCase();
        const matchesSearch = !normalizedSearch || searchable.includes(normalizedSearch);
        const matchesFilter =
          filterMode === 'all' ||
          (filterMode === 'active' && ['active', 'delayed'].includes(record.status)) ||
          (filterMode === 'completed' && record.status === 'completed') ||
          (filterMode === 'routes' && Boolean(record.routeName || record.vehicle.assignedRoute));

        return matchesSearch && matchesFilter;
      }),
    [filterMode, normalizedSearch, records]
  );
  const visibleVehicles = useMemo(
    () =>
      vehicles.filter((vehicle) =>
        filteredRecords.some((record) => record.vehicleId === vehicle.id)
      ),
    [filteredRecords, vehicles]
  );
  const metrics = useMemo(
    () => ({
      active: records.filter((record) => ['active', 'delayed'].includes(record.status)).length,
      completed: records.filter((record) => record.status === 'completed').length,
      delayed: records.filter((record) => record.status === 'delayed').length,
    }),
    [records]
  );

  const startTrip = (vehicle: Vehicle) => {
    const activeLog = getActiveLog(manualLogs, vehicle.id);

    if (activeLog) {
      return;
    }

    setManualLogs((current) => [
      {
        id: `fleet-log-${Date.now()}`,
        vehicleId: vehicle.id,
        vehicleCode: vehicle.code,
        driverName: vehicle.driverName || 'Operador sin asignar',
        departureAt: new Date().toISOString(),
        status: vehicle.delayMinutes > 0 ? 'delayed' : 'active',
      },
      ...current,
    ]);
  };

  const finishTrip = async (vehicle: Vehicle) => {
    const activeLog = getActiveLog(manualLogs, vehicle.id);

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
      }
      return;
    }

    try {
      await clearAssignedVehicleRouteRequest(vehicle.id);
      await refreshAll();

      if (selectedVehicle?.id === vehicle.id) {
        syncedVehicleRouteRef.current = `${vehicle.id}:empty`;
        tracker.resetPointToPointSession();
      }
    } catch {
      tracker.setPointMessage('No fue posible limpiar la ruta asignada.');
    }
  };

  const openRouteModal = (vehicle: Vehicle) => {
    setSelectedVehicleId(vehicle.id);
    setRouteModalOpen(true);
  };

  function openMapForVehicle(vehicle: Vehicle, point: MapPointRole) {
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

  const handleUseCurrentLocation = (role: PointRole) => {
    if (!coordinates) {
      tracker.setPointMessage(
        locationStatus.message ||
          'GPS no disponible. Puedes usar la unidad seleccionada o actualizar ubicacion.'
      );
      return;
    }

    tracker.selectPoint(role, buildCurrentLocationPoint(coordinates));
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
    let nextOrigin: NavigationPlaceResult | null = null;
    let nextDestination: NavigationPlaceResult | null = null;

    try {
      const oLat = navParams.originLatitude ? Number(navParams.originLatitude) : NaN;
      const oLon = navParams.originLongitude ? Number(navParams.originLongitude) : NaN;

      if (Number.isFinite(oLat) && Number.isFinite(oLon)) {
        nextOrigin = {
          id: `map-origin-${oLat}-${oLon}`,
          label: navParams.originLabel || navParams.originAddress || 'Punto seleccionado',
          address: navParams.originAddress || '',
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
        nextDestination = {
          id: `map-destination-${dLat}-${dLon}`,
          label: navParams.destinationLabel || navParams.destinationAddress || 'Punto seleccionado',
          address: navParams.destinationAddress || '',
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
        applyPointToPointSelection(nextOrigin, nextDestination, plan, nextStops);
      }

      return;
    }

    if (nextOrigin && (originLatCurrent !== nextOrigin.location.latitude || originLonCurrent !== nextOrigin.location.longitude)) {
      selectPoint('origin', nextOrigin);
    }

    if (
      nextDestination &&
      (destLatCurrent !== nextDestination.location.latitude || destLonCurrent !== nextDestination.location.longitude)
    ) {
      selectPoint('destination', nextDestination);
    }

    if (tracker.pointSelection.origin && tracker.pointSelection.destination && !hasPointPlan) {
      planPointToPointRoute();
    }
  }, [
    // navigation inputs
    navParams.originLatitude,
    navParams.originLongitude,
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

  const handleRemoveRouteStop = (stopId: string) => {
    pendingStopPersistRef.current = true;
    tracker.removeStop(stopId);
  };

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
      mobileSubtitle="Controla salidas, llegadas y rutas en tiempo real."
      mobileBadges={[
        { label: `${metrics.active} en ruta`, tone: 'info' },
        { label: `${metrics.delayed} retrasos`, tone: metrics.delayed ? 'warning' : 'positive' },
      ]}
      header={
        <View style={styles.header}>
          <Text style={styles.eyebrow}>SISTEMA DE CONTROL</Text>
          <Text style={styles.title}>Checklist</Text>
          <Text style={styles.subtitle}>
            Controla salidas, llegadas y rutas en tiempo real.
          </Text>
        </View>
      }>
      <View style={styles.metricsRow}>
        <ChecklistMetric icon="route" label="En ruta" tone="info" value={metrics.active} />
        <ChecklistMetric icon="check-circle-outline" label="Finalizados" tone="positive" value={metrics.completed} />
        <ChecklistMetric icon="clock-alert-outline" label="Retrasos" tone="warning" value={metrics.delayed} />
      </View>

      <AppCard style={styles.controls}>
        <View style={styles.searchRow}>
          <View style={styles.searchBar}>
            <MaterialCommunityIcons name="magnify" size={22} color={theme.colors.muted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Buscar unidad, operador o ruta..."
              placeholderTextColor={theme.colors.muted}
              style={styles.searchInput}
            />
          </View>
          <Pressable
            onPress={() => setFilterMode((current) => (current === 'all' ? 'active' : 'all'))}
            style={styles.filterIconButton}
            accessibilityLabel="Alternar filtros">
            <MaterialCommunityIcons name="filter-variant" size={24} color={theme.colors.text} />
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
          {[
            { id: 'all', label: 'Historial' },
            { id: 'active', label: 'En ruta' },
            { id: 'routes', label: 'Rutas' },
            { id: 'completed', label: 'Finalizados' },
          ].map((option) => {
            const isActive = filterMode === option.id;

            return (
              <Pressable
                key={option.id}
                onPress={() => setFilterMode(option.id as FilterMode)}
                style={[styles.filterChip, isActive ? styles.filterChipActive : undefined]}>
                <Text style={[styles.filterChipText, isActive ? styles.filterChipTextActive : undefined]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </AppCard>

      {filterMode !== 'completed' ? (
        <AppCard style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleWrap}>
              <MaterialCommunityIcons name="lightning-bolt" size={20} color={theme.colors.text} />
              <Text style={styles.sectionTitle}>Despacho rapido</Text>
            </View>
            <Text style={styles.sectionLink}>{visibleVehicles.length} unidades</Text>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickList}>
            {visibleVehicles.map((vehicle) => {
              const record = records.find((entry) => entry.vehicleId === vehicle.id);
              const status = record?.status || 'available';
              const statusColor = getStatusColor(theme, status);
              const primaryLabel =
                status === 'available'
                  ? 'Salida'
                  : status === 'completed'
                    ? 'Historial'
                    : 'Ver ruta';

              return (
                <View key={vehicle.id} style={styles.unitCard}>
                  <View style={styles.unitTop}>
                    <View style={styles.unitIconRow}>
                      <View style={styles.unitIcon}>
                        <MaterialCommunityIcons name="bus" size={22} color={theme.colors.text} />
                      </View>
                      <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                    </View>
                    <Text style={styles.unitCode}>{vehicle.code}</Text>
                    <View style={styles.availabilityRow}>
                      <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                      <Text style={styles.unitStatus}>{getStatusLabel(status)}</Text>
                    </View>
                  </View>

                  <Pressable
                    style={styles.unitPrimaryButton}
                    onPress={() => {
                      if (status === 'available') {
                        startTrip(vehicle);
                        return;
                      }

                      openRouteModal(vehicle);
                    }}>
                    <Text style={styles.unitPrimaryText}>{primaryLabel}</Text>
                  </Pressable>

                  <Pressable style={styles.unitSecondaryButton} onPress={() => openRouteModal(vehicle)}>
                    <Text style={styles.unitSecondaryText}>Punto a punto</Text>
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>
        </AppCard>
      ) : null}

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
                    {['active', 'delayed'].includes(record.status) ? (
                      <>
                        <Pressable style={styles.miniAction} onPress={() => router.push('/incidencias')}>
                          <MaterialCommunityIcons name="alert-outline" size={16} color={theme.colors.text} />
                          <Text style={styles.miniActionText}>Incidencia</Text>
                        </Pressable>
                        <Pressable style={styles.miniAction} onPress={() => finishTrip(record.vehicle)}>
                          <MaterialCommunityIcons name="flag-checkered" size={16} color={theme.colors.text} />
                          <Text style={styles.miniActionText}>Finalizar</Text>
                        </Pressable>
                      </>
                    ) : null}
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

      <Modal visible={routeModalOpen} transparent animationType="fade" onRequestClose={() => setRouteModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>{selectedVehicle?.code || 'Ruta punto a punto'}</Text>
                <Text style={styles.modalSubtitle}>
                  {selectedVehicle?.routeName || 'Configura inicio, destino y seguimiento GPS.'}
                </Text>
              </View>
              <Pressable style={styles.modalClose} onPress={() => setRouteModalOpen(false)}>
                <MaterialCommunityIcons name="close" size={22} color={theme.colors.text} />
              </Pressable>
            </View>

            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              <RoutePreview points={routeStops} route={routeOption} vehicle={selectedVehicle} />

              <View style={styles.routeSummary}>
                <View style={styles.routeSummaryItem}>
                  <Text style={styles.summaryLabel}>Distancia</Text>
                  <Text style={styles.summaryValue}>{formatDistance(routeDistanceMeters)}</Text>
                </View>
                <View style={styles.routeSummaryItem}>
                  <Text style={styles.summaryLabel}>Paradas</Text>
                  <Text style={styles.summaryValue}>{routeStops.length}</Text>
                </View>
                <View style={styles.routeSummaryItem}>
                  <Text style={styles.summaryLabel}>Estimado</Text>
                  <Text style={styles.summaryValue}>{routeDurationSeconds ? formatDuration(routeDurationSeconds) : '--'}</Text>
                </View>
              </View>

              <View style={styles.progressCard}>
                <View style={styles.progressTop}>
                  <Text style={styles.progressTitle}>Progreso de ruta</Text>
                  <Text style={styles.progressValue}>
                    {visitedStops} / {routeStops.length || 0} paradas
                  </Text>
                </View>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${routeProgress}%` as any }]} />
                </View>
                <Text style={styles.progressValue}>{routeProgress}%</Text>
              </View>

              <View style={styles.configCard}>
                <View style={styles.configTitleRow}>
                  <Text style={styles.configTitle}>Ruta punto a punto</Text>
                  <StatusPill label={tracker.trackerStatusLabel} tone={tracker.trackerStatusTone} />
                </View>

                {(['origin', 'destination'] as PointRole[]).map((role) => {
                  const isOrigin = role === 'origin';
                  const selection = tracker.pointSelection[role];

                  return (
                    <View key={role} style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>{isOrigin ? 'Punto inicial' : 'Punto final'}</Text>
                      <View style={styles.pointInputRow}>
                        <TextInput
                          value={tracker.pointQueries[role]}
                          onChangeText={(value) => tracker.updateQuery(role, value)}
                          placeholder={isOrigin ? 'Buscar origen...' : 'Buscar destino...'}
                          placeholderTextColor={theme.colors.muted}
                          style={styles.pointInput}
                        />
                        <Pressable
                          style={styles.iconSquare}
                          onPress={() => tracker.searchPoint(role)}
                          disabled={tracker.isSearchingPoint[role]}>
                          {tracker.isSearchingPoint[role] ? (
                            <ActivityIndicator color="#FFFFFF" />
                          ) : (
                            <MaterialCommunityIcons name="magnify" size={20} color="#FFFFFF" />
                          )}
                        </Pressable>
                      </View>

                      {selection ? (
                        <View style={styles.pointResult}>
                          <Text style={styles.resultTitle}>{selection.label}</Text>
                          <Text style={styles.resultAddress}>{selection.address}</Text>
                        </View>
                      ) : null}

                      {tracker.pointResults[role].map((result) => (
                        <Pressable
                          key={result.id}
                          style={styles.pointResult}
                          onPress={() => tracker.selectPoint(role, result)}>
                          <Text style={styles.resultTitle}>{result.label}</Text>
                          <Text style={styles.resultAddress}>{result.address}</Text>
                        </Pressable>
                      ))}
                    </View>
                  );
                })}

                <View style={styles.utilityRow}>
                  <Pressable style={styles.utilityButton} onPress={tracker.useSelectedVehicleAsOrigin}>
                    <MaterialCommunityIcons name="bus-marker" size={16} color={theme.colors.text} />
                    <Text style={styles.utilityText}>Usar unidad</Text>
                  </Pressable>
                  <Pressable style={styles.utilityButton} onPress={() => handleUseCurrentLocation('origin')}>
                    <MaterialCommunityIcons name="crosshairs-gps" size={16} color={theme.colors.text} />
                    <Text style={styles.utilityText}>GPS inicial</Text>
                  </Pressable>
                  <Pressable style={styles.utilityButton} onPress={() => handleUseCurrentLocation('destination')}>
                    <MaterialCommunityIcons name="map-marker-check-outline" size={16} color={theme.colors.text} />
                    <Text style={styles.utilityText}>GPS final</Text>
                  </Pressable>
                  <Pressable style={styles.utilityButton} onPress={() => selectedVehicle && openMapForVehicle(selectedVehicle, 'origin')}>
                    <MaterialCommunityIcons name="map-marker" size={16} color={theme.colors.text} />
                    <Text style={styles.utilityText}>Elegir origen</Text>
                  </Pressable>
                  <Pressable style={styles.utilityButton} onPress={() => selectedVehicle && openMapForVehicle(selectedVehicle, 'destination')}>
                    <MaterialCommunityIcons name="map-marker-check-outline" size={16} color={theme.colors.text} />
                    <Text style={styles.utilityText}>Elegir destino</Text>
                  </Pressable>
                  <Pressable style={styles.utilityButton} onPress={() => selectedVehicle && openMapForVehicle(selectedVehicle, 'stop')}>
                    <MaterialCommunityIcons name="map-marker-plus-outline" size={16} color={theme.colors.text} />
                    <Text style={styles.utilityText}>Agregar parada</Text>
                  </Pressable>
                  <Pressable style={styles.utilityButton} onPress={() => refresh()}>
                    <MaterialCommunityIcons name="refresh" size={16} color={theme.colors.text} />
                    <Text style={styles.utilityText}>{permission === 'granted' ? 'Actualizar GPS' : 'Pedir GPS'}</Text>
                  </Pressable>
                </View>

                {tracker.pointMessage ? <Text style={styles.messageText}>{tracker.pointMessage}</Text> : null}

                <Pressable
                  style={styles.primaryWide}
                  onPress={
                    tracker.pointPlan
                      ? isCalculatedRouteSaved
                        ? tracker.toggleTracker
                        : saveAssignedRoute
                      : tracker.planPointToPointRoute
                  }
                  disabled={tracker.isPlanningPointRoute || isSavingAssignedRoute}>
                  {tracker.isPlanningPointRoute || isSavingAssignedRoute ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryWideText}>
                      {tracker.pointPlan
                        ? isCalculatedRouteSaved
                          ? tracker.trackerStatus === 'off'
                            ? 'Iniciar ruta'
                            : 'Detener seguimiento'
                          : 'Guardar ruta'
                        : 'Calcular ruta'}
                    </Text>
                  )}
                </Pressable>
              </View>

              <View style={styles.stopsCard}>
                <View style={styles.configTitleRow}>
                  <Text style={styles.configTitle}>Paradas de la ruta</Text>
                  <Text style={styles.progressValue}>{Math.max(0, routeStops.length - 2)} intermedias</Text>
                </View>
                {routeStops.length ? (
                  routeStops.map((stop, index) => (
                    <View key={stop.id} style={styles.stopRow}>
                      <View
                        style={[
                          styles.stopNumber,
                          stop.type === 'destination' ? styles.stopNumberDestination : undefined,
                        ]}>
                        <Text style={styles.stopNumberText}>{index + 1}</Text>
                      </View>
                      <View style={styles.stopCopy}>
                        <Text style={styles.stopTitle} numberOfLines={1}>{stop.label}</Text>
                        <Text style={styles.stopMeta} numberOfLines={1}>
                          {index < visitedStops ? 'Registrada' : stop.type === 'origin' ? 'Inicio' : 'Pendiente'}
                        </Text>
                      </View>
                      {stop.type === 'stop' ? (
                        <Pressable style={styles.stopRemoveButton} onPress={() => handleRemoveRouteStop(stop.id)}>
                          <MaterialCommunityIcons name="trash-can-outline" size={18} color={theme.colors.danger} />
                        </Pressable>
                      ) : (
                        <MaterialCommunityIcons
                          name={index < visitedStops ? 'check-circle' : 'circle-outline'}
                          size={20}
                          color={index < visitedStops ? theme.colors.success : theme.colors.muted}
                        />
                      )}
                    </View>
                  ))
                ) : (
                  <Text style={styles.messageText}>
                    Busca un punto inicial y final para calcular paradas intermedias.
                  </Text>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </AppShell>
  );
}
