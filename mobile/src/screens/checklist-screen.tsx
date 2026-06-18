import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { router } from '@/src/navigation/router';
import { useMemo, useState } from 'react';
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
import { usePointToPointTracker } from '@/src/hooks/use-point-to-point-tracker';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { useUserLocation } from '@/src/hooks/use-user-location';
import { useAppStore } from '@/src/store/use-app-store';
import { getLocationStatus } from '@/src/utils/location-status';
import type {
  FleetControlLog,
  GeoPoint,
  NavigationPlaceResult,
  NavigationRouteOption,
  Vehicle,
} from '@/src/types/app';
import { formatTime } from '@/src/utils/format';

type FilterMode = 'all' | 'active' | 'routes' | 'completed';
type OperationalStatus = 'available' | 'active' | 'completed' | 'delayed';
type PointRole = 'origin' | 'destination';
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

function buildRouteStops(
  origin: NavigationPlaceResult | null,
  destination: NavigationPlaceResult | null,
  route: NavigationRouteOption | null
) {
  const stops: {
    id: string;
    label: string;
    address: string;
    location: GeoPoint;
    type: 'origin' | 'stop' | 'destination';
  }[] = [];

  if (origin) {
    stops.push({
      id: 'origin',
      label: origin.label,
      address: origin.address,
      location: origin.location,
      type: 'origin',
    });
  }

  const polyline = route?.polyline || [];
  const candidates = polyline.slice(1, Math.max(1, polyline.length - 1));
  const stopCount = Math.min(3, candidates.length);

  for (let index = 0; index < stopCount; index += 1) {
    const pointIndex = Math.floor(((index + 1) * candidates.length) / (stopCount + 1));
    const location = candidates[Math.min(pointIndex, candidates.length - 1)];

    if (location) {
      stops.push({
        id: `stop-${index + 1}`,
        label: `Parada ${index + 1}`,
        address: 'Punto intermedio calculado',
        location,
        type: 'stop',
      });
    }
  }

  if (destination) {
    stops.push({
      id: 'destination',
      label: destination.label,
      address: destination.address,
      location: destination.location,
      type: 'destination',
    });
  }

  return stops;
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
  const { mapData, user } = useAppStore(
    useShallow((state) => ({
      mapData: state.mapData,
      user: state.user,
    }))
  );
  const [manualLogs, setManualLogs] = useState<FleetControlLog[]>([]);
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [routeModalOpen, setRouteModalOpen] = useState(false);
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

  const routeOption = tracker.pointPlan?.routes[0] || selectedVehicle?.assignedRoute?.route || null;
  const routeStops = useMemo(
    () => buildRouteStops(tracker.pointSelection.origin, tracker.pointSelection.destination, routeOption),
    [routeOption, tracker.pointSelection.destination, tracker.pointSelection.origin]
  );
  const routeDistanceMeters = routeOption?.distanceMeters || 0;
  const routeDurationSeconds =
    routeOption?.durationInTrafficSeconds || routeOption?.durationSeconds || 0;
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

  const finishTrip = (vehicle: Vehicle) => {
    const activeLog = getActiveLog(manualLogs, vehicle.id);

    if (activeLog) {
      setManualLogs((current) =>
        current.map((log) =>
          log.id === activeLog.id
            ? { ...log, status: 'completed', arrivalAt: new Date().toISOString() }
            : log
        )
      );
      return;
    }

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
  };

  const openRouteModal = (vehicle: Vehicle) => {
    setSelectedVehicleId(vehicle.id);
    setRouteModalOpen(true);
  };

  const openMapForVehicle = (vehicle: Vehicle) => {
    router.push({ pathname: '/mapa', params: { vehicleId: vehicle.id, follow: 'true' } });
  };

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
                  <Pressable style={styles.utilityButton} onPress={() => selectedVehicle && openMapForVehicle(selectedVehicle)}>
                    <MaterialCommunityIcons name="map-outline" size={16} color={theme.colors.text} />
                    <Text style={styles.utilityText}>Seleccionar en mapa</Text>
                  </Pressable>
                  <Pressable style={styles.utilityButton} onPress={() => refresh()}>
                    <MaterialCommunityIcons name="refresh" size={16} color={theme.colors.text} />
                    <Text style={styles.utilityText}>{permission === 'granted' ? 'Actualizar GPS' : 'Pedir GPS'}</Text>
                  </Pressable>
                </View>

                {tracker.pointMessage ? <Text style={styles.messageText}>{tracker.pointMessage}</Text> : null}

                <Pressable
                  style={styles.primaryWide}
                  onPress={tracker.pointPlan ? tracker.toggleTracker : tracker.planPointToPointRoute}
                  disabled={tracker.isPlanningPointRoute}>
                  {tracker.isPlanningPointRoute ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryWideText}>
                      {tracker.pointPlan
                        ? tracker.trackerStatus === 'off'
                          ? 'Iniciar ruta'
                          : 'Detener seguimiento'
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
                      <MaterialCommunityIcons
                        name={index < visitedStops ? 'check-circle' : 'circle-outline'}
                        size={20}
                        color={index < visitedStops ? theme.colors.success : theme.colors.muted}
                      />
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
