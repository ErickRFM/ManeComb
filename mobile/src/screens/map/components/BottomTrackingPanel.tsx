import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AccessibilityInfo,
  LayoutAnimation,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Text,
  UIManager,
  useWindowDimensions,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { StatusPill } from '@/src/components/status-pill';
import { buildOperationalUnitSnapshot } from '@/src/domain/operations/build-operational-unit-snapshot';
import type { OperationalUnitSnapshot } from '@/src/domain/operations/operational-unit-snapshot';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import type { Incident, RouteSession, User, Vehicle } from '@/src/types/app';
import type { LocationStatusSnapshot } from '../types';
import { mapStyles as styles } from '../map-styles';
import {
  getSessionDistanceMeters,
  getSessionDurationSeconds,
  isFiniteMetricNumber,
  selectVehicleActiveSession,
} from './bottom-tracking-panel-data';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const PANEL_ANIMATION_MS = 220;
const statusLabels: Record<string, string> = {
  available: 'Disponible',
  maintenance: 'Mantenimiento',
  offline: 'Sin conexion',
  online: 'Activa',
  'on-route': 'En ruta',
  patrolling: 'En seguimiento',
  paused: 'Pausada',
  ASSIGNED: 'Asignada',
  READY: 'Lista',
  RUNNING: 'En jornada',
  PAUSED: 'Pausada',
  FINISHED: 'Finalizada',
  CANCELLED: 'Cancelada',
};

function formatVehicleSpeed(snapshot: OperationalUnitSnapshot | null) {
  if (!snapshot?.location || !isFiniteMetricNumber(snapshot.location.speedMetersPerSecond)) return 'GPS pendiente';
  const speed = Math.max(0, Math.round(Number(snapshot.location.speedMetersPerSecond) * 3.6));
  return speed < 1 ? 'Detenida' : `${speed} km/h`;
}

function formatVehicleStatus(status?: string | null) {
  if (!status) return 'Sin estado';
  return statusLabels[status] || status.replace(/[-_]/g, ' ');
}

function formatRouteLabel(snapshot: OperationalUnitSnapshot | null) {
  if (!snapshot) return 'Sin unidad';
  return snapshot.route?.name || 'Ruta no asignada';
}

function formatCompactVehicleMeta(vehicle: Vehicle | null, routeLabel: string) {
  if (!vehicle) return 'No tienes una unidad asignada';
  return vehicle.plate ? `Placas ${vehicle.plate}` : routeLabel;
}

function formatLastUpdate(timestamp?: string | null) {
  if (!timestamp) return 'Sin registro';
  const time = new Date(timestamp).getTime();
  if (!Number.isFinite(time)) return 'Sin registro';
  const minutes = Math.max(0, Math.round((Date.now() - time) / 60000));
  if (minutes < 1) return 'Ahora';
  if (minutes === 1) return 'Hace 1 min';
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? 'Hace 1 h' : `Hace ${hours} h`;
}

function formatKilometers(meters?: number | null) {
  if (!isFiniteMetricNumber(meters)) return null;
  return `${(Math.max(0, Number(meters)) / 1000).toLocaleString('es-MX', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} km`;
}

function formatDuration(seconds?: number | null) {
  if (!isFiniteMetricNumber(seconds)) return null;
  const minutes = Math.max(0, Math.round(Number(seconds) / 60));
  if (minutes < 60) return `${minutes} min`;
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${Math.floor(minutes / 60)} h ${remainingMinutes} min` : `${Math.floor(minutes / 60)} h`;
}

function formatDateTime(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('es-MX') : null;
}

type BottomTrackingPanelProps = {
  activeIncident: Incident | null;
  activeIncidentVehicle: Vehicle | null;
  bottomPadding: number;
  locationStatus: LocationStatusSnapshot;
  locationStatusColor: string;
  onRetryLocation: () => void;
  onSelectIncidentVehicle: (vehicle: Vehicle) => void;
  onSelectTrackingVehicle: (vehicle: Vehicle) => void;
  selectedVehicle: Vehicle | null;
  trackingVehicles: Vehicle[];
  userRole: User['role'];
  activeSession: RouteSession | null;
  sessionHistory: RouteSession[];
  incidents: Incident[];
  lastSyncedAt: string | null;
};

export const BottomTrackingPanel = memo(function BottomTrackingPanelComponent({
  activeIncident,
  activeIncidentVehicle,
  bottomPadding,
  locationStatus,
  locationStatusColor,
  onRetryLocation,
  onSelectIncidentVehicle,
  onSelectTrackingVehicle,
  selectedVehicle,
  trackingVehicles,
  userRole,
  activeSession,
  sessionHistory,
  incidents,
  lastSyncedAt,
}: BottomTrackingPanelProps) {
  const { theme } = useAppTheme();
  const { height: screenHeight } = useWindowDimensions();
  const [isExpanded, setIsExpanded] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<RouteSession | null>(null);
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotionEnabled);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotionEnabled);
    return () => subscription.remove();
  }, []);

  const setPanelExpanded = useCallback((nextExpanded: boolean) => {
    if (!reduceMotionEnabled) {
      LayoutAnimation.configureNext({
        duration: PANEL_ANIMATION_MS,
        create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
        update: { type: LayoutAnimation.Types.easeInEaseOut },
        delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
      });
    }
    setIsExpanded(nextExpanded);
    if (!nextExpanded) {
      setDetailsOpen(false);
      setHistoryOpen(false);
      setSelectedSession(null);
    }
  }, [reduceMotionEnabled]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dy) > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dy < -24) setPanelExpanded(true);
          if (gesture.dy > 24) setPanelExpanded(false);
        },
      }),
    [setPanelExpanded]
  );

  useEffect(() => {
    setDetailsOpen(false);
    setHistoryOpen(false);
    setSelectedSession(null);
  }, [selectedVehicle?.id]);

  const vehicleSession = useMemo(
    () => selectVehicleActiveSession(selectedVehicle?.id, activeSession, sessionHistory),
    [activeSession, selectedVehicle?.id, sessionHistory]
  );
  const snapshot = useMemo(
    () => selectedVehicle ? buildOperationalUnitSnapshot({
      vehicle: selectedVehicle,
      sessions: [...sessionHistory, ...(activeSession ? [activeSession] : [])],
      incidents,
    }) : null,
    [activeSession, incidents, selectedVehicle, sessionHistory]
  );
  const routeLabel = useMemo(() => formatRouteLabel(snapshot), [snapshot]);
  const compactMeta = useMemo(
    () => formatCompactVehicleMeta(selectedVehicle, routeLabel),
    [routeLabel, selectedVehicle]
  );
  const statusLabel = snapshot ? formatVehicleStatus(snapshot.status.code) : 'Sin estado';
  const gpsLabel = snapshot
    ? snapshot.gps.state === 'fresh' ? 'GPS actualizado' : snapshot.gps.state === 'stale' ? 'GPS vencido' : 'Sin GPS'
    : locationStatus.hudLabel;
  const speedLabel = useMemo(() => formatVehicleSpeed(snapshot), [snapshot]);
  const kilometersLabel = useMemo(
    () => formatKilometers(getSessionDistanceMeters(vehicleSession)),
    [vehicleSession]
  );
  const activeTimeLabel = useMemo(
    () => formatDuration(getSessionDurationSeconds(vehicleSession)),
    [vehicleSession]
  );
  const lastUpdateLabel = useMemo(
    () => formatLastUpdate(snapshot?.lastUpdateAt || lastSyncedAt),
    [lastSyncedAt, snapshot?.lastUpdateAt]
  );
  const canViewVehicleDetails = userRole === 'admin' || userRole === 'supervisor';
  const statusTone = snapshot?.status.code === 'paused'
    ? 'warning'
    : selectedVehicle?.status === 'maintenance'
      ? 'danger'
      : selectedVehicle?.status === 'offline'
        ? 'neutral'
        : 'positive';
  const compactHeight = Math.min(170, Math.max(128, Math.round(screenHeight * 0.2)));
  const compactMaxHeight = Math.max(compactHeight, Math.round(screenHeight * 0.25));
  const expandedMaxHeight = Math.max(320, Math.round(screenHeight * 0.7));

  const detailRows = useMemo<Array<[string, string]>>(
    () => {
      if (!selectedVehicle) return [];
      const rows: Array<[string, string]> = [];
      if (canViewVehicleDetails) {
        rows.push(
          ['Unidad', selectedVehicle.code],
          ['Chofer', snapshot?.driver?.name || 'Sin chofer asignado'],
          ['Placas', snapshot?.plate || 'Sin placas']
        );
      }
      rows.push(
        ['Ruta', routeLabel],
        ['Estado', statusLabel],
        ['Velocidad', speedLabel],
        ['GPS', gpsLabel],
        ['Ultima actualizacion', lastUpdateLabel]
      );
      if (isFiniteMetricNumber(selectedVehicle.occupancy) && isFiniteMetricNumber(selectedVehicle.capacity)) {
        rows.push(['Ocupacion', `${selectedVehicle.occupancy} de ${selectedVehicle.capacity}`]);
      }
      if (isFiniteMetricNumber(selectedVehicle.fuel)) rows.push(['Combustible', `${Math.round(selectedVehicle.fuel)}%`]);
      if (isFiniteMetricNumber(selectedVehicle.currentKilometers)) rows.push(['Odometro', `${Math.round(Number(selectedVehicle.currentKilometers))} km`]);
      if (isFiniteMetricNumber(snapshot?.routeProgress?.remainingTimeSeconds)) rows.push(['ETA', `${Math.max(0, Math.round(Number(snapshot?.routeProgress?.remainingTimeSeconds) / 60))} min`]);
      if (isFiniteMetricNumber(selectedVehicle.delayMinutes)) rows.push(['Retraso', `${Math.max(0, Math.round(selectedVehicle.delayMinutes))} min`]);
      if (activeTimeLabel) rows.push(['Tiempo activo', activeTimeLabel]);
      if (kilometersLabel) rows.push(['Kilometros', kilometersLabel]);
      return rows;
    },
    [activeTimeLabel, gpsLabel, canViewVehicleDetails, kilometersLabel, lastUpdateLabel, routeLabel, selectedVehicle, snapshot, speedLabel, statusLabel]
  );
  const history = useMemo(
    () => sessionHistory.filter((session) => !selectedVehicle || session.vehicleId === selectedVehicle.id),
    [selectedVehicle, sessionHistory]
  );
  const historyRows = useMemo<Array<[string, string]>>(() => {
    if (!selectedSession) return [];
    const rows: Array<[string, string]> = [];
    const startedAt = new Date(selectedSession.startedAt).getTime();
    const endedAt = selectedSession.finishedAt ? new Date(selectedSession.finishedAt).getTime() : Date.now();
    const incidentCount = incidents.filter((incident) => {
      const createdAt = new Date(incident.createdAt).getTime();
      return incident.vehicleId === selectedSession.vehicleId && createdAt >= startedAt && createdAt <= endedAt;
    }).length;
    const startedLabel = formatDateTime(selectedSession.startedAt);
    const finishedLabel = formatDateTime(selectedSession.finishedAt);
    const durationLabel = formatDuration(getSessionDurationSeconds(selectedSession));
    const movingLabel = formatDuration(selectedSession.movingTime);
    const stoppedLabel = formatDuration(selectedSession.stoppedTime);
    const pausedLabel = formatDuration(selectedSession.metrics?.pausedTime);
    const distanceLabel = formatKilometers(getSessionDistanceMeters(selectedSession));
    if (selectedSession.processingStatus) {
      rows.push([
        'Estadisticas',
        selectedSession.statisticsReady || selectedSession.processingStatus === 'COMPLETED'
          ? 'Listas'
          : selectedSession.processingStatus === 'FAILED'
            ? 'No disponibles'
            : 'Procesando',
      ]);
    }
    if (selectedSession.processingError) rows.push(['Detalle de procesamiento', selectedSession.processingError]);
    if (startedLabel) rows.push(['Inicio', startedLabel]);
    rows.push(['Fin', finishedLabel || 'En curso']);
    if (durationLabel) rows.push(['Duracion', durationLabel]);
    if (movingLabel) rows.push(['Tiempo activo', movingLabel]);
    if (stoppedLabel) rows.push(['Tiempo detenido', stoppedLabel]);
    if (pausedLabel) rows.push(['Tiempo pausado', pausedLabel]);
    if (distanceLabel) rows.push(['Kilometros', distanceLabel]);
    if (isFiniteMetricNumber(selectedSession.averageSpeed)) rows.push(['Velocidad promedio', `${Math.round(Number(selectedSession.averageSpeed))} km/h`]);
    if (isFiniteMetricNumber(selectedSession.maxSpeed)) rows.push(['Velocidad maxima', `${Math.round(Number(selectedSession.maxSpeed))} km/h`]);
    if (isFiniteMetricNumber(selectedSession.stopEvents)) rows.push(['Paradas', String(selectedSession.stopEvents)]);
    if (isFiniteMetricNumber(selectedSession.completedCheckpoints)) rows.push(['Checkpoints', String(selectedSession.completedCheckpoints)]);
    if (isFiniteMetricNumber(selectedSession.completedLaps)) rows.push(['Vueltas', String(selectedSession.completedLaps)]);
    if (isFiniteMetricNumber(selectedSession.gpsLostTime)) rows.push(['Tiempo sin GPS', formatDuration(selectedSession.gpsLostTime) || '0 min']);
    if (isFiniteMetricNumber(selectedSession.offRouteTime)) rows.push(['Fuera de ruta', formatDuration(selectedSession.offRouteTime) || '0 min']);
    if (isFiniteMetricNumber(selectedSession.averageGpsAccuracy)) rows.push(['Precision GPS', `${Math.round(Number(selectedSession.averageGpsAccuracy))} m`]);
    if (isFiniteMetricNumber(selectedSession.gpsLostEvents)) rows.push(['Perdidas GPS', String(selectedSession.gpsLostEvents)]);
    if (isFiniteMetricNumber(selectedSession.offRouteEvents)) rows.push(['Desvios', String(selectedSession.offRouteEvents)]);
    if (isFiniteMetricNumber(selectedSession.startedOdometer)) rows.push(['Odometro inicial', `${Math.round(Number(selectedSession.startedOdometer))} km`]);
    if (isFiniteMetricNumber(selectedSession.finishedOdometer)) rows.push(['Odometro final', `${Math.round(Number(selectedSession.finishedOdometer))} km`]);
    if (isFiniteMetricNumber(selectedSession.startBattery)) rows.push(['Bateria inicial', `${Math.round(Number(selectedSession.startBattery))}%`]);
    if (isFiniteMetricNumber(selectedSession.endBattery)) rows.push(['Bateria final', `${Math.round(Number(selectedSession.endBattery))}%`]);
    if (selectedSession.finishReason) rows.push(['Motivo de cierre', selectedSession.finishReason]);
    rows.push(['Incidencias', String(incidentCount)]);
    if (isFiniteMetricNumber(selectedSession.metrics?.gpsCoveragePercent)) {
      rows.push(['Estado GPS', `${Math.round(Number(selectedSession.metrics?.gpsCoveragePercent))}% cobertura`]);
    }
    const syncedLabel = formatDateTime(lastSyncedAt || selectedSession.updatedAt);
    if (syncedLabel) rows.push(['Ultima sincronizacion', syncedLabel]);
    return rows;
  }, [incidents, lastSyncedAt, selectedSession]);

  const metricCards = useMemo(
    () => {
      const cards = [
        { label: 'Estado', value: statusLabel, icon: 'bus-clock' },
        { label: 'GPS', value: gpsLabel, icon: 'crosshairs-gps' },
        { label: 'Tiempo activo', value: activeTimeLabel || 'Sin registro', icon: 'timer-outline' },
        { label: 'Kilometros', value: kilometersLabel || 'Sin registro', icon: 'map-marker-distance' },
      ];
      if (selectedVehicle && isFiniteMetricNumber(selectedVehicle.capacity)) {
        cards.push({ label: 'Ocupacion', value: `${selectedVehicle.occupancy} / ${selectedVehicle.capacity}`, icon: 'account-group-outline' });
      }
      if (selectedVehicle && isFiniteMetricNumber(selectedVehicle.fuel)) {
        cards.push({ label: 'Combustible', value: `${Math.round(selectedVehicle.fuel)}%`, icon: 'fuel' });
      }
      return cards;
    },
    [activeTimeLabel, gpsLabel, kilometersLabel, selectedVehicle, statusLabel]
  );

  return (
    <View style={[styles.bottomOverlay, { paddingBottom: bottomPadding }]}>
      {locationStatus.canRetry && locationStatus.title ? (
        <View style={[styles.locationNotice, { backgroundColor: theme.colors.surface, borderColor: locationStatusColor }]}>
          <MaterialCommunityIcons name="crosshairs-gps" size={20} color={locationStatusColor} />
          <View style={styles.locationNoticeCopy}>
            <Text style={[styles.locationNoticeTitle, { color: theme.colors.text }]}>{locationStatus.title}</Text>
            {locationStatus.message ? <Text style={[styles.locationNoticeText, { color: theme.colors.muted }]}>{locationStatus.message}</Text> : null}
          </View>
          <Pressable
            onPress={onRetryLocation}
            style={({ pressed }) => [
              styles.locationRetry,
              { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.line },
              pressed ? styles.controlPressed : undefined,
            ]}
            accessibilityLabel="Reintentar ubicacion">
            <MaterialCommunityIcons name="refresh" size={18} color={theme.colors.text} />
          </Pressable>
        </View>
      ) : null}

      <View
        style={[
          styles.followCard,
          styles.trackingPanelCard,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.line },
          isExpanded
            ? { maxHeight: expandedMaxHeight }
            : { minHeight: compactHeight, maxHeight: compactMaxHeight },
        ]}>
        <View {...panResponder.panHandlers} style={styles.panelGestureArea}>
          <View style={[styles.panelHandle, { backgroundColor: theme.colors.line }]} />
        </View>
        <View style={styles.followHeader}>
          <View style={styles.followIdentity}>
            <Text style={[styles.followTitle, { color: theme.colors.text }]} numberOfLines={1}>
              {selectedVehicle?.code || 'Sin unidad'}
            </Text>
            <Text style={[styles.followMeta, { color: theme.colors.muted }]} numberOfLines={1}>
              {compactMeta}
            </Text>
          </View>
          <StatusPill label={selectedVehicle ? statusLabel : 'Sin unidad'} tone={selectedVehicle ? statusTone : 'neutral'} />
        </View>

        <View style={styles.compactStatusRow}>
          <View style={styles.compactGpsStatus}>
            <MaterialCommunityIcons name="crosshairs-gps" size={16} color={locationStatusColor} />
            <Text style={[styles.compactGpsText, { color: theme.colors.text }]} numberOfLines={1}>{gpsLabel}</Text>
          </View>
          <Pressable
            onPress={() => setPanelExpanded(!isExpanded)}
            style={({ pressed }) => [styles.expandButton, pressed ? styles.controlPressed : undefined]}
            accessibilityLabel={isExpanded ? 'Minimizar seguimiento' : 'Ver detalles de seguimiento'}>
            <Text style={[styles.detailsButtonText, { color: theme.colors.accent }]}>
              {isExpanded ? 'Minimizar' : 'Ver detalles'}
            </Text>
            <MaterialCommunityIcons name={isExpanded ? 'chevron-down' : 'chevron-up'} size={20} color={theme.colors.accent} />
          </Pressable>
        </View>

        {trackingVehicles.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trackList}>
            {trackingVehicles.map((vehicle) => {
              const isSelected = vehicle.id === selectedVehicle?.id;
              return (
                <Pressable
                  key={vehicle.id}
                  onPress={() => onSelectTrackingVehicle(vehicle)}
                  style={({ pressed }) => [
                    styles.trackChip,
                    { borderColor: isSelected ? theme.colors.accent : theme.colors.line },
                    isSelected ? { backgroundColor: theme.colors.accent } : undefined,
                    pressed ? styles.controlPressed : undefined,
                  ]}>
                  <Text style={[styles.trackChipTitle, isSelected ? styles.trackChipTitleSelected : { color: theme.colors.text }]}>{vehicle.code}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {isExpanded ? (
          <ScrollView
            style={styles.expandedPanelScroll}
            contentContainerStyle={styles.expandedPanelContent}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}>
            {selectedVehicle ? (
              <View style={styles.metricGrid}>
                {metricCards.map(({ label, value, icon }) => (
                  <View key={label} style={[styles.metricCard, { backgroundColor: theme.colors.surfaceAlt }]}>
                    <MaterialCommunityIcons name={icon as keyof typeof MaterialCommunityIcons.glyphMap} size={16} color={theme.colors.accent} />
                    <Text style={[styles.metricLabel, { color: theme.colors.muted }]}>{label}</Text>
                    <Text style={[styles.metricValue, { color: theme.colors.text }]} numberOfLines={1}>{value}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {selectedVehicle ? (
              <View style={styles.panelActionRow}>
                <Pressable
                  onPress={() => {
                    setDetailsOpen((current) => !current);
                    setHistoryOpen(false);
                    setSelectedSession(null);
                  }}
                  style={[styles.detailsButton, styles.panelActionButton, { borderColor: theme.colors.line }]}
                  accessibilityLabel="Ver detalles de unidad">
                  <MaterialCommunityIcons name="information-outline" size={18} color={theme.colors.text} />
                  <Text style={[styles.detailsButtonText, { color: theme.colors.text }]}>Detalles</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setHistoryOpen((current) => !current);
                    setDetailsOpen(false);
                    setSelectedSession(null);
                  }}
                  style={[styles.detailsButton, styles.panelActionButton, { borderColor: theme.colors.line }]}
                  accessibilityLabel="Abrir historial de jornadas">
                  <MaterialCommunityIcons name="history" size={18} color={theme.colors.text} />
                  <Text style={[styles.detailsButtonText, { color: theme.colors.text }]}>Historial</Text>
                </Pressable>
              </View>
            ) : null}

            {detailsOpen ? (
              <View style={[styles.detailsPanel, { borderColor: theme.colors.line }]}>
                {detailRows.map(([label, value]) => (
                  <View key={label} style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: theme.colors.muted }]}>{label}</Text>
                    <Text style={[styles.detailValue, { color: theme.colors.text }]}>{value}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {historyOpen ? (
              <View style={[styles.inlineHistory, { borderColor: theme.colors.line }]}>
                {selectedSession ? (
                  <>
                    <Pressable onPress={() => setSelectedSession(null)} style={styles.historyBack}>
                      <MaterialCommunityIcons name="chevron-left" size={20} color={theme.colors.accent} />
                      <Text style={[styles.detailsButtonText, { color: theme.colors.accent }]}>Jornadas</Text>
                    </Pressable>
                    {historyRows.map(([label, value]) => (
                      <View key={label} style={styles.detailRow}>
                        <Text style={[styles.detailLabel, { color: theme.colors.muted }]}>{label}</Text>
                        <Text style={[styles.detailValue, { color: theme.colors.text }]}>{value}</Text>
                      </View>
                    ))}
                  </>
                ) : history.length ? (
                  history.map((session) => {
                    const startedLabel = formatDateTime(session.startedAt) || 'Sin fecha';
                    const durationLabel = formatDuration(getSessionDurationSeconds(session));
                    return (
                      <View key={session.id} style={[styles.historyItem, { borderColor: theme.colors.line }]}>
                        <View style={styles.followIdentity}>
                          <Text style={[styles.detailValue, styles.historyItemTitle, { color: theme.colors.text }]}>{startedLabel}</Text>
                          <Text style={[styles.detailLabel, { color: theme.colors.muted }]}>
                            {[durationLabel, formatVehicleStatus(session.status)].filter(Boolean).join(' · ')}
                          </Text>
                        </View>
                        <Pressable
                          onPress={() => setSelectedSession(session)}
                          style={[styles.historyDetailsButton, { borderColor: theme.colors.line }]}
                          accessibilityLabel="Ver detalles de jornada">
                          <Text style={[styles.detailsButtonText, { color: theme.colors.text }]}>Detalles</Text>
                        </Pressable>
                      </View>
                    );
                  })
                ) : (
                  <Text style={[styles.emptyTrackText, { color: theme.colors.muted }]}>Sin jornadas registradas</Text>
                )}
              </View>
            ) : null}

            {activeIncident && activeIncidentVehicle ? (
              <Pressable
                onPress={() => onSelectIncidentVehicle(activeIncidentVehicle)}
                style={({ pressed }) => [
                  styles.alertStrip,
                  { backgroundColor: theme.colors.danger, borderColor: theme.colors.danger },
                  pressed ? styles.controlPressed : undefined,
                ]}>
                <MaterialCommunityIcons name="alert-decagram" size={18} color="#FFF" />
                <View style={styles.alertCopy}>
                  <Text style={styles.alertTitle}>{activeIncident.title}</Text>
                  <Text style={styles.alertMeta}>{activeIncidentVehicle.code} - {activeIncident.status}</Text>
                </View>
              </Pressable>
            ) : null}

            {trackingVehicles.length <= 1 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trackList}>
              {trackingVehicles.map((vehicle) => {
                const isSelected = vehicle.id === selectedVehicle?.id;
                return (
                  <Pressable
                    key={vehicle.id}
                    onPress={() => onSelectTrackingVehicle(vehicle)}
                    style={({ pressed }) => [
                      styles.trackChip,
                      { borderColor: isSelected ? theme.colors.accent : theme.colors.line },
                      isSelected ? { backgroundColor: theme.colors.accent } : undefined,
                      pressed ? styles.controlPressed : undefined,
                    ]}>
                    <Text style={[styles.trackChipTitle, isSelected ? styles.trackChipTitleSelected : { color: theme.colors.text }]}>{vehicle.code}</Text>
                  </Pressable>
                );
              })}
              {!trackingVehicles.length && !selectedVehicle ? (
                <View style={styles.emptyTrackState}>
                  <MaterialCommunityIcons name="bus-clock" size={18} color={theme.colors.muted} />
                  <Text style={[styles.emptyTrackText, { color: theme.colors.muted }]}>Sin unidades disponibles</Text>
                </View>
              ) : null}
            </ScrollView> : null}
          </ScrollView>
        ) : null}
      </View>
    </View>
  );
});
