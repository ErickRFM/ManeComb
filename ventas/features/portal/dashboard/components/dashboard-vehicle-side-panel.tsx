import { Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { StatusBadge } from '@/src/components/ui/status-badge';
import { formatPortalStatus, getPortalStatusTone } from '../../components/portal-cards';
import { PortalButton } from '../../components/portal-button';
import { PortalDataList, PortalDataRow } from '../../components/portal-data-list';
import { portalPalette } from '../../portal-theme';
import { styles } from '../dashboard.styles';
import { formatDate, formatDistanceFromMeters, formatDurationFromSeconds } from '@/src/utils/format';
import {
  formatSpeed,
  formatPercent,
  getActiveDriver,
  getAssignedDrivers,
  getRouteInfo,
  getJourneyState,
  getRouteProgressPercent,
  getOperationalAlerts,
  getEtaLabel,
  getLastGpsUpdate,
  getDriverName,
  getEventLabel,
  getDriverLicense,
  getDriverInitials,
  getTimestamp,
} from '../dashboard.utils';
import type { RouteSession, RouteEvent, User, Vehicle } from '@/src/types/app';
import { driverAvatarImageStyle } from '../dashboard.constants';

const formatDuration = formatDurationFromSeconds;
const formatDistance = formatDistanceFromMeters;

export function VehicleSidePanel({
  activeSession,
  driverChangeMessage,
  driverSelectorOpen,
  isChangingDriver,
  latestSession,
  onCenter,
  onChangeDriver,
  onCloseDriverSelector,
  onDriverSelectorOpen,
  onHistory,
  onOpenSession,
  onRoute,
  recentEvents,
  users,
  vehicle,
}: {
  activeSession: RouteSession | null;
  driverChangeMessage: string | null;
  driverSelectorOpen: boolean;
  isChangingDriver: boolean;
  latestSession: RouteSession | null;
  onCenter: () => void;
  onChangeDriver: (driver: User) => void;
  onCloseDriverSelector: () => void;
  onDriverSelectorOpen: () => void;
  onHistory: () => void;
  onOpenSession: (session: RouteSession) => void;
  onRoute: () => void;
  recentEvents: RouteEvent[];
  users: User[];
  vehicle: Vehicle;
}) {
  const session = activeSession || latestSession;
  const activeDriver = getActiveDriver(users, vehicle, activeSession);
  const assignedDrivers = getAssignedDrivers(users, vehicle, activeSession);
  const routeInfo = getRouteInfo(vehicle, session);
  const journeyState = getJourneyState(vehicle, session);
  const progress = getRouteProgressPercent(vehicle, session);
  const alerts = getOperationalAlerts(vehicle, session).filter((alert) => alert.label !== journeyState.label);
  return (
    <View style={styles.sidePanel}>
      <View style={styles.sideHeader}>
        <View style={styles.sideUnitIcon}>
          <MaterialCommunityIcons name="bus" size={22} color={portalPalette.text} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.sideEyebrow}>Unidad seleccionada</Text>
          <Text style={styles.sideTitle}>{vehicle.code}</Text>
          <Text style={styles.sideMeta}>Placas {vehicle.plate}</Text>
        </View>
        <StatusBadge label={journeyState.label} tone={journeyState.tone} />
      </View>
      {alerts.length ? (
        <View style={styles.alertRow}>
          {alerts.map((alert) => <StatusBadge key={alert.label} label={alert.label} tone={alert.tone} />)}
        </View>
      ) : null}
      <View style={styles.routeSummaryLarge}>
        <View style={styles.routeIcon}>
          <MaterialCommunityIcons name="map-marker-path" size={18} color={portalPalette.text} />
        </View>
        <View style={styles.flex}>
          <Text {...({ title: routeInfo.label } as any)} numberOfLines={2} style={styles.routeTitle}>{routeInfo.label}</Text>
          {routeInfo.direction ? <Text style={styles.unitMeta}>{routeInfo.direction}</Text> : null}
          {routeInfo.code ? <Text style={styles.unitMeta}>{routeInfo.code}</Text> : null}
        </View>
      </View>
      {session ? <ProgressBar value={progress} /> : null}
      <View style={styles.sideHighlightRow}>
        <Fact label="Velocidad" value={formatSpeed(vehicle.speed)} />
        <Fact label="ETA" value={getEtaLabel(vehicle)} />
        <Fact label="Ultimo GPS" value={getLastGpsUpdate(vehicle)} />
      </View>
      <DriverProfile driver={activeDriver} title="Chofer actual" />
      {assignedDrivers.length > 1 || driverSelectorOpen ? (
        <View style={styles.assignedDriversPanel}>
          <View style={styles.inlineHeader}>
            <Text style={styles.panelTitle}>Choferes asignados ({assignedDrivers.length})</Text>
            {driverSelectorOpen ? (
              <PortalButton accessibilityLabel="Cerrar selector de chofer" icon="close" onPress={onCloseDriverSelector} size="sm" variant="icon" />
            ) : null}
          </View>
          {driverSelectorOpen ? (
            <View style={styles.driverSelector}>
              {assignedDrivers.filter((driver) => driver.id !== activeDriver?.id).length ? (
                assignedDrivers.filter((driver) => driver.id !== activeDriver?.id).map((driver) => (
                  <Pressable
                    key={driver.id}
                    accessibilityRole="button"
                    disabled={isChangingDriver}
                    onPress={() => onChangeDriver(driver)}
                    style={[styles.driverOption, isChangingDriver ? styles.disabledAction : undefined]}>
                    <Text style={styles.driverRowText}>{driver.name}</Text>
                    <MaterialCommunityIcons name="check-circle-outline" size={16} color={portalPalette.accent} />
                  </Pressable>
                ))
              ) : (
                <Text style={styles.unitMeta}>No hay otro chofer asignado disponible para esta unidad.</Text>
              )}
            </View>
          ) : (
            <PortalDataList>{assignedDrivers.map((driver) => (
              <PortalDataRow key={driver.id} body={<Text style={styles.driverRowText} numberOfLines={1}>{driver.name}</Text>} meta={<StatusBadge label={driver.id === activeDriver?.id ? 'Activo' : driver.status || 'Asignado'} tone={driver.id === activeDriver?.id ? 'positive' : 'neutral'} />} />
            ))}</PortalDataList>
          )}
          {driverChangeMessage ? <Text style={styles.noticeInline}>{driverChangeMessage}</Text> : null}
        </View>
      ) : null}
      {driverChangeMessage && assignedDrivers.length <= 1 && !driverSelectorOpen ? (
        <Text style={styles.noticeInline}>{driverChangeMessage}</Text>
      ) : null}
      {session ? (
        <View style={[styles.metricGrid, styles.sideMetricGrid]}>
          <Fact label="Tiempo activo" value={activeSession ? formatDuration((Date.now() - getTimestamp(activeSession.startedAt)) / 1000) : 'Sin jornada activa'} />
          <Fact label="Distancia" value={formatDistance(session.totalDistance)} />
          <Fact label="Vueltas" value={String(session.completedLaps ?? 0)} />
          <Fact label="Checkpoints" value={String(session.completedCheckpoints ?? 0)} />
          <Fact label="Detenido" value={formatDuration(session.stoppedTime)} />
          <Fact label="Productividad" value={formatPercent(session.metrics?.effectiveTimePercent)} />
        </View>
      ) : null}
      <Text style={styles.sideSectionTitle}>Eventos recientes</Text>
      {recentEvents.length ? (
        <View style={styles.recentTimeline}>
          {recentEvents.slice(0, 3).map((event) => (
            <View key={event.id} style={styles.recentTimelineItem}>
              <View style={styles.recentTimelineRail}>
                <View style={styles.recentTimelineDot} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.timelineTitle}>{getEventLabel(event.eventType)}</Text>
                <Text style={styles.unitMeta}>{formatDate(event.timestamp)}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.unitMeta}>Sin eventos registrados para la jornada.</Text>
      )}
      <View style={styles.sideActions}>
        {session ? (
          <PortalButton icon="arrow-right" onPress={() => onOpenSession(session)} size="sm">Ver jornada</PortalButton>
        ) : null}
        <View style={styles.quickActions}>
          <QuickAction icon="routes" label="Ver ruta" onPress={onRoute} />
          <QuickAction icon="history" label="Historial" onPress={onHistory} />
          <QuickAction icon="account-switch-outline" label="Cambiar chofer" onPress={onDriverSelectorOpen} />
          <QuickAction icon="crosshairs-gps" label="Centrar unidad" onPress={onCenter} />
        </View>
      </View>
    </View>
  );
}

function DriverProfile({ driver, title }: { driver: User | null; title: string }) {
  const photo = driver?.avatarUrl || driver?.avatar || '';
  const license = getDriverLicense(driver);
  return (
    <View style={styles.driverProfile}>
      {photo ? (
        <img src={photo} alt={driver?.name || 'Chofer'} style={driverAvatarImageStyle} />
      ) : (
        <View style={styles.driverAvatar}>
          <Text style={styles.driverAvatarText}>{getDriverInitials(driver)}</Text>
        </View>
      )}
      <View style={styles.flex}>
        <Text style={styles.factLabel}>{title}</Text>
        <Text style={styles.driverName} numberOfLines={1}>{driver?.name || 'Sin chofer activo'}</Text>
        <Text style={styles.unitMeta}>{driver?.phone || 'Sin telefono'}</Text>
        <Text style={styles.unitMeta}>{driver?.status || driver?.userStatus || 'Sin estado'}{license ? ` / Lic. ${license}` : ''}{driver?.shift ? ` / Turno: ${driver.shift}` : ''}</Text>
      </View>
    </View>
  );
}

function ProgressBar({ value }: { value: number }) {
  const progress = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <View style={styles.progressBlock}>
      <View style={styles.inlineHeader}>
        <Text style={styles.factLabel}>Avance de ruta</Text>
        <Text style={styles.progressValue}>{progress}%</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress}%` }]} />
      </View>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function QuickAction({ icon, label, onPress }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; onPress: () => void }) {
  return <PortalButton icon={icon} onPress={onPress} size="sm" variant="ghost">{label}</PortalButton>;
}
