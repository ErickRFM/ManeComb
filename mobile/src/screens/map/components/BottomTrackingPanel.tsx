import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  LayoutAnimation,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  useWindowDimensions,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { StatusPill } from '@/src/components/status-pill';
import type { OperationalUnitSnapshot } from '@shared/operational-contract';
import { formatEta, formatFreshness, formatSpeed, routeLabel as formatRoute, stateLabel } from '@shared/operational-contract';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import type { Incident, RouteSession, Vehicle } from '@/src/types/app';
import type { LocationStatusSnapshot } from '../types';
import { mapStyles as styles } from '../map-styles';
import {
  getSessionDistanceMeters,
  getSessionDurationSeconds,
  isFiniteMetricNumber,
  selectVehicleActiveSession,
} from './bottom-tracking-panel-data';
import {
  cancelPanelReveal,
  consumePanelReveal,
  requestPanelReveal,
  type PanelRevealTarget,
} from './bottom-tracking-panel-scroll-state';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const PANEL_ANIMATION_MS = 220;
const PANEL_DRAG_LIMIT = 96;
const PANEL_DRAG_TRIGGER = 28;
const PANEL_FLING_VELOCITY = 0.35;
const NARROW_PANEL_BREAKPOINT = 390;
const SECTION_REVEAL_MARGIN = 8;

/** Etiquetas de estado de jornada. El estado operacional usa `stateLabel`. */
const sessionStatusLabels: Record<string, string> = {
  ASSIGNED: 'Asignada',
  READY: 'Lista',
  RUNNING: 'En jornada',
  PAUSED: 'Pausada',
  FINISHED: 'Finalizada',
  CANCELLED: 'Cancelada',
};

function formatSessionStatus(status?: string | null) {
  if (!status) return 'Sin estado';
  return sessionStatusLabels[status] || status.replace(/[-_]/g, ' ');
}

function formatCompactUnitMeta(unit: OperationalUnitSnapshot | null) {
  if (!unit) return 'No tienes una unidad asignada';
  return unit.plates ? `Placas ${unit.plates}` : formatRoute(unit.route);
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
  activeIncidentUnit: OperationalUnitSnapshot | null;
  bottomPadding: number;
  locationStatus: LocationStatusSnapshot;
  locationStatusColor: string;
  onRetryLocation: () => void;
  onSelectIncidentUnit: (unit: OperationalUnitSnapshot) => void;
  onSelectTrackingUnit: (unit: OperationalUnitSnapshot) => void;
  selectedUnit: OperationalUnitSnapshot | null;
  /**
   * Atributos del vehiculo que no forman parte del contrato operacional
   * (ocupacion, combustible, odometro, retraso). Todo lo operacional
   * —identidad, estado, GPS, ruta, conductor y ETA— sale de `selectedUnit`.
   */
  selectedVehicle: Vehicle | null;
  trackingUnits: OperationalUnitSnapshot[];
  canViewVehicleDetails: boolean;
  activeSession: RouteSession | null;
  sessionHistory: RouteSession[];
  incidents: Incident[];
  lastSyncedAt: string | null;
};

export const BottomTrackingPanel = memo(function BottomTrackingPanelComponent({
  activeIncident,
  activeIncidentUnit,
  bottomPadding,
  locationStatus,
  locationStatusColor,
  onRetryLocation,
  onSelectIncidentUnit,
  onSelectTrackingUnit,
  selectedUnit,
  selectedVehicle,
  trackingUnits,
  canViewVehicleDetails,
  activeSession,
  sessionHistory,
  incidents,
  lastSyncedAt,
}: BottomTrackingPanelProps) {
  const { theme } = useAppTheme();
  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  const isNarrow = screenWidth < NARROW_PANEL_BREAKPOINT;
  const [isExpanded, setIsExpanded] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<RouteSession | null>(null);
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);
  const expandedScrollRef = useRef<ScrollView | null>(null);
  const pendingRevealRef = useRef<PanelRevealTarget>(null);
  const panelDragY = useRef(new Animated.Value(0)).current;

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
      pendingRevealRef.current = cancelPanelReveal();
      expandedScrollRef.current?.scrollTo({ y: 0, animated: false });
      setDetailsOpen(false);
      setHistoryOpen(false);
      setSelectedSession(null);
    }
  }, [reduceMotionEnabled]);

  const settlePanelDrag = useCallback(() => {
    panelDragY.stopAnimation();
    if (reduceMotionEnabled) {
      panelDragY.setValue(0);
      return;
    }
    Animated.spring(panelDragY, {
      toValue: 0,
      damping: 18,
      stiffness: 220,
      mass: 0.75,
      useNativeDriver: true,
    }).start();
  }, [panelDragY, reduceMotionEnabled]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dy) > 4 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderGrant: () => {
          panelDragY.stopAnimation();
        },
        onPanResponderMove: (_, gesture) => {
          if (reduceMotionEnabled) return;
          const oppositeResistance = PANEL_DRAG_LIMIT * 0.18;
          const minDrag = isExpanded ? -oppositeResistance : -PANEL_DRAG_LIMIT;
          const maxDrag = isExpanded ? PANEL_DRAG_LIMIT : oppositeResistance;
          panelDragY.setValue(Math.max(minDrag, Math.min(maxDrag, gesture.dy)));
        },
        onPanResponderRelease: (_, gesture) => {
          const shouldExpand = !isExpanded
            && (gesture.dy < -PANEL_DRAG_TRIGGER || gesture.vy < -PANEL_FLING_VELOCITY);
          const shouldCollapse = isExpanded
            && (gesture.dy > PANEL_DRAG_TRIGGER || gesture.vy > PANEL_FLING_VELOCITY);
          if (shouldExpand) setPanelExpanded(true);
          if (shouldCollapse) setPanelExpanded(false);
          settlePanelDrag();
        },
        onPanResponderTerminate: settlePanelDrag,
      }),
    [isExpanded, panelDragY, reduceMotionEnabled, setPanelExpanded, settlePanelDrag]
  );

  useEffect(() => {
    setDetailsOpen(false);
    setHistoryOpen(false);
    setSelectedSession(null);
    pendingRevealRef.current = cancelPanelReveal();
    expandedScrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [selectedUnit?.unitId]);

  const handleToggleDetails = useCallback(() => {
    setDetailsOpen((current) => {
      pendingRevealRef.current = requestPanelReveal(pendingRevealRef.current, 'details', current);
      return !current;
    });
    setHistoryOpen(false);
    setSelectedSession(null);
  }, []);

  const handleToggleHistory = useCallback(() => {
    setHistoryOpen((current) => {
      pendingRevealRef.current = requestPanelReveal(pendingRevealRef.current, 'history', current);
      return !current;
    });
    setDetailsOpen(false);
    setSelectedSession(null);
  }, []);

  const handleSectionLayout = useCallback((target: Exclude<PanelRevealTarget, null>, y: number) => {
    const reveal = consumePanelReveal(pendingRevealRef.current, target);
    pendingRevealRef.current = reveal.pending;
    if (!reveal.shouldScroll) return;
    expandedScrollRef.current?.scrollTo({
      y: Math.max(0, y - SECTION_REVEAL_MARGIN),
      animated: !reduceMotionEnabled,
    });
  }, [reduceMotionEnabled]);

  // Geometria del selector de unidades. Se guarda en refs para que medir no provoque re-render.
  const trackScrollRef = useRef<ScrollView | null>(null);
  const trackViewportWidthRef = useRef(0);
  const trackChipLayoutRef = useRef<Record<string, { x: number; width: number }>>({});

  const handleTrackChipLayout = useCallback((unitId: string, x: number, width: number) => {
    trackChipLayoutRef.current[unitId] = { x, width };
  }, []);

  // Centra la pestana seleccionada para que nunca quede fuera del viewport.
  const selectedUnitId = selectedUnit?.unitId;
  useEffect(() => {
    if (!selectedUnitId) return;
    const chip = trackChipLayoutRef.current[selectedUnitId];
    const viewportWidth = trackViewportWidthRef.current;
    if (!chip || viewportWidth <= 0) return;
    const target = Math.max(0, chip.x + chip.width / 2 - viewportWidth / 2);
    trackScrollRef.current?.scrollTo({ x: target, animated: !reduceMotionEnabled });
  }, [reduceMotionEnabled, selectedUnitId]);

  const vehicleSession = useMemo(
    () => selectVehicleActiveSession(selectedUnit?.unitId, activeSession, sessionHistory),
    [activeSession, selectedUnit?.unitId, sessionHistory]
  );
  // Estado, GPS, ruta, conductor y ETA vienen resueltos del backend.
  // Este componente solo los formatea.
  const routeLabel = useMemo(() => formatRoute(selectedUnit?.route ?? null), [selectedUnit?.route]);
  const compactMeta = useMemo(() => formatCompactUnitMeta(selectedUnit), [selectedUnit]);
  const statusLabel = selectedUnit ? stateLabel(selectedUnit.operationalState) : 'Sin estado';
  const gpsLabel = selectedUnit ? formatFreshness(selectedUnit.gps) : locationStatus.hudLabel;
  const speedLabel = selectedUnit ? formatSpeed(selectedUnit.gps) : 'GPS pendiente';
  const kilometersLabel = useMemo(
    () => formatKilometers(getSessionDistanceMeters(vehicleSession)),
    [vehicleSession]
  );
  const activeTimeLabel = useMemo(
    () => formatDuration(getSessionDurationSeconds(vehicleSession)),
    [vehicleSession]
  );
  const lastUpdateLabel = useMemo(
    () => formatLastUpdate(selectedUnit?.lastEventAt || lastSyncedAt),
    [lastSyncedAt, selectedUnit?.lastEventAt]
  );
  const statusTone = selectedUnit?.operationalState === 'stopped'
    ? 'warning'
    : selectedUnit?.status === 'maintenance'
      ? 'danger'
      : selectedUnit?.status === 'offline'
        ? 'neutral'
        : 'positive';
  const compactHeight = Math.min(
    isNarrow ? 150 : 170,
    Math.max(isNarrow ? 120 : 128, Math.round(screenHeight * (isNarrow ? 0.18 : 0.2)))
  );
  const compactMaxHeight = Math.max(compactHeight, Math.round(screenHeight * (isNarrow ? 0.22 : 0.25)));
  const availableExpandedHeight = Math.max(280, screenHeight - bottomPadding - 116);
  const expandedMaxHeight = Math.min(
    availableExpandedHeight,
    Math.max(300, Math.round(screenHeight * (isNarrow ? 0.64 : 0.7)))
  );

  const detailRows = useMemo<Array<[string, string]>>(
    () => {
      if (!selectedUnit) return [];
      const rows: Array<[string, string]> = [];
      if (canViewVehicleDetails) {
        rows.push(
          ['Unidad', selectedUnit.label],
          ['Chofer', selectedUnit.driver?.name || 'Sin chofer asignado'],
          ['Placas', selectedUnit.plates || 'Sin placas']
        );
      }
      rows.push(
        ['Ruta', routeLabel],
        ['Estado', statusLabel],
        ['Velocidad', speedLabel],
        ['GPS', gpsLabel],
        ['Ultima actualizacion', lastUpdateLabel]
      );
      // Atributos que no pertenecen al contrato operacional.
      if (selectedVehicle) {
        if (isFiniteMetricNumber(selectedVehicle.occupancy) && isFiniteMetricNumber(selectedVehicle.capacity)) {
          rows.push(['Ocupacion', `${selectedVehicle.occupancy} de ${selectedVehicle.capacity}`]);
        }
        if (isFiniteMetricNumber(selectedVehicle.fuel)) rows.push(['Combustible', `${Math.round(selectedVehicle.fuel)}%`]);
        if (isFiniteMetricNumber(selectedVehicle.currentKilometers)) rows.push(['Odometro', `${Math.round(Number(selectedVehicle.currentKilometers))} km`]);
      }
      // Hora de llegada tal como la calculo el backend. Nunca `ahora + minutos`.
      if (selectedUnit.route?.etaAt) rows.push(['ETA', formatEta(selectedUnit.route)]);
      if (selectedVehicle && isFiniteMetricNumber(selectedVehicle.delayMinutes)) {
        rows.push(['Retraso', `${Math.max(0, Math.round(selectedVehicle.delayMinutes))} min`]);
      }
      if (activeTimeLabel) rows.push(['Tiempo activo', activeTimeLabel]);
      if (kilometersLabel) rows.push(['Kilometros', kilometersLabel]);
      return rows;
    },
    [activeTimeLabel, gpsLabel, canViewVehicleDetails, kilometersLabel, lastUpdateLabel, routeLabel, selectedUnit, selectedVehicle, speedLabel, statusLabel]
  );
  const history = useMemo(
    () => sessionHistory.filter((session) => !selectedUnit || session.vehicleId === selectedUnit.unitId),
    [selectedUnit, sessionHistory]
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

  const renderDetailRow = ([label, value]: [string, string]) => (
    <View key={label} style={[styles.detailRow, isNarrow ? responsiveStyles.detailRowNarrow : undefined]}>
      <Text style={[styles.detailLabel, isNarrow ? responsiveStyles.detailLabelNarrow : undefined, { color: theme.colors.muted }]}>
        {label}
      </Text>
      <Text style={[styles.detailValue, isNarrow ? responsiveStyles.detailValueNarrow : undefined, { color: theme.colors.text }]}>
        {value}
      </Text>
    </View>
  );

  return (
    <View style={[styles.bottomOverlay, { paddingBottom: bottomPadding }]}>
      {locationStatus.canRetry && locationStatus.title ? (
        <View
          style={[
            styles.locationNotice,
            isNarrow ? responsiveStyles.locationNoticeNarrow : undefined,
            { backgroundColor: theme.colors.surface, borderColor: locationStatusColor },
          ]}>
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

      <Animated.View
        style={[
          styles.followCard,
          styles.trackingPanelCard,
          isNarrow ? responsiveStyles.cardNarrow : undefined,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.line },
          isExpanded
            ? { maxHeight: expandedMaxHeight }
            : { minHeight: compactHeight, maxHeight: compactMaxHeight },
          { transform: [{ translateY: panelDragY }] },
        ]}>
        <View {...panResponder.panHandlers} style={[styles.panelGestureArea, responsiveStyles.panelGestureAreaComfortable]}>
          <View style={[styles.panelHandle, { backgroundColor: theme.colors.line }]} />
        </View>
        <View style={styles.followHeader}>
          <View style={styles.followIdentity}>
            <Text style={[styles.followTitle, { color: theme.colors.text }]} numberOfLines={1}>
              {selectedUnit?.label || 'Sin unidad'}
            </Text>
            <Text style={[styles.followMeta, { color: theme.colors.muted }]} numberOfLines={1}>
              {compactMeta}
            </Text>
          </View>
          <StatusPill label={selectedUnit ? statusLabel : 'Sin unidad'} tone={selectedUnit ? statusTone : 'neutral'} />
        </View>

        <View style={[styles.compactStatusRow, isNarrow ? responsiveStyles.compactStatusRowNarrow : undefined]}>
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

        {trackingUnits.length > 1 ? (
          <ScrollView
            ref={trackScrollRef}
            horizontal
            alwaysBounceHorizontal={false}
            bounces={false}
            overScrollMode="never"
            showsHorizontalScrollIndicator={false}
            style={[
              styles.trackScroller,
              responsiveStyles.trackScrollerStable,
              isNarrow ? responsiveStyles.trackScrollerNarrow : undefined,
            ]}
            onLayout={(event) => {
              trackViewportWidthRef.current = event.nativeEvent.layout.width;
            }}
            contentContainerStyle={[
              styles.trackList,
              responsiveStyles.trackListStable,
              isNarrow ? responsiveStyles.trackListNarrow : undefined,
            ]}>
            {trackingUnits.map((unit) => {
              const isSelected = unit.unitId === selectedUnit?.unitId;
              return (
                <Pressable
                  key={unit.unitId}
                  onPress={() => onSelectTrackingUnit(unit)}
                  onLayout={(event) => handleTrackChipLayout(unit.unitId, event.nativeEvent.layout.x, event.nativeEvent.layout.width)}
                  style={({ pressed }) => [
                    styles.trackChip,
                    { borderColor: isSelected ? theme.colors.accent : theme.colors.line },
                    isSelected ? { backgroundColor: theme.colors.accent } : undefined,
                    pressed ? styles.controlPressed : undefined,
                  ]}>
                  <Text style={[styles.trackChipTitle, isSelected ? styles.trackChipTitleSelected : { color: theme.colors.text }]}>{unit.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {isExpanded ? (
          <>
            <ScrollView
              ref={expandedScrollRef}
              style={styles.expandedPanelScroll}
              contentContainerStyle={styles.expandedPanelContent}
              alwaysBounceVertical={false}
              bounces={false}
              nestedScrollEnabled
              overScrollMode="never"
              showsVerticalScrollIndicator={false}>
            {selectedUnit ? (
              <View style={styles.metricGrid}>
                {metricCards.map(({ label, value, icon }) => (
                  <View
                    key={label}
                    style={[
                      styles.metricCard,
                      isNarrow ? responsiveStyles.metricCardNarrow : undefined,
                      { backgroundColor: theme.colors.surfaceAlt },
                    ]}>
                    <MaterialCommunityIcons name={icon as keyof typeof MaterialCommunityIcons.glyphMap} size={16} color={theme.colors.accent} />
                    <Text style={[styles.metricLabel, { color: theme.colors.muted }]}>{label}</Text>
                    <Text
                      style={[styles.metricValue, { color: theme.colors.text }]}
                      numberOfLines={isNarrow ? 2 : 1}>
                      {value}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {detailsOpen ? (
              <View
                onLayout={(event) => handleSectionLayout('details', event.nativeEvent.layout.y)}
                style={[styles.detailsPanel, { borderColor: theme.colors.line }]}>
                {detailRows.map(renderDetailRow)}
              </View>
            ) : null}

            {historyOpen ? (
              <View
                onLayout={(event) => handleSectionLayout('history', event.nativeEvent.layout.y)}
                style={[styles.inlineHistory, { borderColor: theme.colors.line }]}>
                {selectedSession ? (
                  <>
                    <Pressable onPress={() => setSelectedSession(null)} style={styles.historyBack}>
                      <MaterialCommunityIcons name="chevron-left" size={20} color={theme.colors.accent} />
                      <Text style={[styles.detailsButtonText, { color: theme.colors.accent }]}>Jornadas</Text>
                    </Pressable>
                    {historyRows.map(renderDetailRow)}
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
                            {[durationLabel, formatSessionStatus(session.status)].filter(Boolean).join(' · ')}
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

            {activeIncident && activeIncidentUnit ? (
              <Pressable
                onPress={() => onSelectIncidentUnit(activeIncidentUnit)}
                style={({ pressed }) => [
                  styles.alertStrip,
                  { backgroundColor: theme.colors.danger, borderColor: theme.colors.danger },
                  pressed ? styles.controlPressed : undefined,
                ]}>
                <MaterialCommunityIcons name="alert-decagram" size={18} color="#FFF" />
                <View style={styles.alertCopy}>
                  <Text style={styles.alertTitle}>{activeIncident.title}</Text>
                  <Text style={styles.alertMeta}>{activeIncidentUnit.label} - {activeIncident.status}</Text>
                </View>
              </Pressable>
            ) : null}

            {trackingUnits.length <= 1 ? <View style={[styles.trackList, styles.singleTrackList]}>
              {trackingUnits.map((unit) => {
                const isSelected = unit.unitId === selectedUnit?.unitId;
                return (
                  <Pressable
                    key={unit.unitId}
                    onPress={() => onSelectTrackingUnit(unit)}
                    style={({ pressed }) => [
                      styles.trackChip,
                      { borderColor: isSelected ? theme.colors.accent : theme.colors.line },
                      isSelected ? { backgroundColor: theme.colors.accent } : undefined,
                      pressed ? styles.controlPressed : undefined,
                    ]}>
                    <Text style={[styles.trackChipTitle, isSelected ? styles.trackChipTitleSelected : { color: theme.colors.text }]}>{unit.label}</Text>
                  </Pressable>
                );
              })}
              {!trackingUnits.length && !selectedUnit ? (
                <View style={styles.emptyTrackState}>
                  <MaterialCommunityIcons name="bus-clock" size={18} color={theme.colors.muted} />
                  <Text style={[styles.emptyTrackText, { color: theme.colors.muted }]}>Sin unidades disponibles</Text>
                </View>
              ) : null}
            </View> : null}
            </ScrollView>

            {selectedUnit ? (
              <View style={[styles.panelActionRow, isNarrow ? responsiveStyles.panelActionRowNarrow : undefined]}>
                <Pressable
                  onPress={handleToggleDetails}
                  style={({ pressed }) => [
                    styles.detailsButton,
                    styles.panelActionButton,
                    { borderColor: detailsOpen ? theme.colors.accent : theme.colors.line },
                    detailsOpen ? { backgroundColor: theme.colors.surfaceAlt } : undefined,
                    pressed ? styles.controlPressed : undefined,
                  ]}
                  accessibilityLabel="Ver detalles de unidad"
                  accessibilityState={{ expanded: detailsOpen, selected: detailsOpen }}>
                  <MaterialCommunityIcons name="information-outline" size={18} color={detailsOpen ? theme.colors.accent : theme.colors.text} />
                  <Text style={[styles.detailsButtonText, { color: detailsOpen ? theme.colors.accent : theme.colors.text }]}>Detalles</Text>
                </Pressable>
                <Pressable
                  onPress={handleToggleHistory}
                  style={({ pressed }) => [
                    styles.detailsButton,
                    styles.panelActionButton,
                    { borderColor: historyOpen ? theme.colors.accent : theme.colors.line },
                    historyOpen ? { backgroundColor: theme.colors.surfaceAlt } : undefined,
                    pressed ? styles.controlPressed : undefined,
                  ]}
                  accessibilityLabel="Abrir historial de jornadas"
                  accessibilityState={{ expanded: historyOpen, selected: historyOpen }}>
                  <MaterialCommunityIcons name="history" size={18} color={historyOpen ? theme.colors.accent : theme.colors.text} />
                  <Text style={[styles.detailsButtonText, { color: historyOpen ? theme.colors.accent : theme.colors.text }]}>Historial</Text>
                </Pressable>
              </View>
            ) : null}
          </>
        ) : null}
      </Animated.View>
    </View>
  );
});

const responsiveStyles = StyleSheet.create({
  cardNarrow: {
    paddingHorizontal: 10,
  },
  compactStatusRowNarrow: {
    gap: 6,
  },
  locationNoticeNarrow: {
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  metricCardNarrow: {
    minHeight: 60,
    width: '100%',
  },
  panelActionRowNarrow: {
    flexWrap: 'wrap',
  },
  panelGestureAreaComfortable: {
    minHeight: 24,
    marginBottom: -4,
  },
  trackScrollerStable: {
    flexShrink: 0,
    minHeight: 42,
  },
  trackScrollerNarrow: {
    marginHorizontal: -10,
  },
  trackListStable: {
    alignItems: 'center',
    minHeight: 42,
    paddingVertical: 2,
  },
  trackListNarrow: {
    paddingHorizontal: 10,
  },
  detailRowNarrow: {
    alignItems: 'flex-start',
    flexDirection: 'column',
    gap: 3,
  },
  detailLabelNarrow: {
    flex: 0,
    width: '100%',
  },
  detailValueNarrow: {
    flex: 0,
    textAlign: 'left',
    width: '100%',
  },
});
