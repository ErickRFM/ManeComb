import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { StatusPill } from '@/src/components/status-pill';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import type { Incident, RouteSession, User, Vehicle } from '@/src/types/app';
import { getAssignedRouteLabel } from '@/src/utils/active-route';
import { normalizeAssignedRoute } from '@/src/utils/navigation-data';
import type { LocationStatusSnapshot } from '../types';
import { mapStyles as styles } from '../map-styles';

const statusLabels: Record<string, string> = {
  available: 'Disponible',
  maintenance: 'Mantenimiento',
  offline: 'Sin conexion',
  online: 'Activa',
  'on-route': 'En ruta',
  patrolling: 'En seguimiento',
  paused: 'Pausada',
};

function formatVehicleSpeed(vehicle: Vehicle | null) {
  if (!vehicle?.locationTimestamp || !Number.isFinite(Number(vehicle.speed))) {
    return 'GPS pendiente';
  }

  const speed = Math.max(0, Math.round(Number(vehicle.speed)));
  return speed < 1 ? 'Detenida' : `${speed} km/h`;
}

function formatVehicleStatus(status?: string | null) {
  if (!status) return 'Sin estado';
  return statusLabels[status] || status.replace(/[-_]/g, ' ');
}

function formatRouteLabel(vehicle: Vehicle | null) {
  if (!vehicle) return 'Sin unidad';
  const assignedRoute = normalizeAssignedRoute(vehicle.assignedRoute);
  if (assignedRoute) return getAssignedRouteLabel(assignedRoute) || 'Ruta asignada';
  return 'Ruta no asignada';
}

function formatLastUpdate(timestamp?: string | null) {
  if (!timestamp) return 'Sin GPS';
  const time = new Date(timestamp).getTime();
  if (!Number.isFinite(time)) return 'Sin GPS';
  const minutes = Math.max(0, Math.round((Date.now() - time) / 60000));
  if (minutes < 1) return 'Ahora';
  if (minutes === 1) return 'Hace 1 min';
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? 'Hace 1 h' : `Hace ${hours} h`;
}

function formatKilometers(value?: number) {
  if (!Number.isFinite(Number(value))) return null;
  return `${Math.max(0, Math.round(Number(value))).toLocaleString('es-MX')} km`;
}

function formatDuration(seconds?: number | null) {
  if (!Number.isFinite(Number(seconds))) return 'No disponible';
  const minutes = Math.max(0, Math.round(Number(seconds) / 60));
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
}

function getSessionDuration(session: RouteSession | null) {
  if (!session) return null;
  if (Number.isFinite(Number(session.totalDuration))) return Number(session.totalDuration);
  const start = new Date(session.startedAt).getTime();
  const end = session.finishedAt ? new Date(session.finishedAt).getTime() : Date.now();
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, (end - start) / 1000) : null;
}

function formatDateTime(value?: string | null) {
  if (!value) return 'No disponible';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('es-MX') : 'No disponible';
}

function getGpsLabel(vehicle: Vehicle | null) {
  if (!vehicle?.locationTimestamp) return 'Sin GPS';
  const time = new Date(vehicle.locationTimestamp).getTime();
  if (!Number.isFinite(time)) return 'Sin GPS';
  return Date.now() - time > 2 * 60 * 1000 ? 'GPS vencido' : 'GPS actualizado';
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

export function BottomTrackingPanel({
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
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<RouteSession | null>(null);
  const speedLabel = formatVehicleSpeed(selectedVehicle);
  const routeLabel = formatRouteLabel(selectedVehicle);
  const gpsLabel = getGpsLabel(selectedVehicle);
  const vehicleSession = activeSession?.vehicleId === selectedVehicle?.id ? activeSession : null;
  const statusLabel = vehicleSession?.status === 'PAUSED'
    ? 'Pausada'
    : vehicleSession?.status === 'RUNNING'
      ? 'En jornada'
      : formatVehicleStatus(selectedVehicle?.status);
  const kilometersLabel = vehicleSession?.totalDistance == null ? null : formatKilometers(vehicleSession.totalDistance / 1000);
  const activeTimeLabel = formatDuration(vehicleSession?.movingTime ?? getSessionDuration(vehicleSession));
  const isAdmin = userRole === 'admin';
  const detailRows = useMemo(
    () =>
      selectedVehicle
        ? [
            ...(isAdmin ? [
              ['Unidad', selectedVehicle.code],
              ['Chofer', selectedVehicle.driver?.name || selectedVehicle.driverName || 'Sin chofer asignado'],
              ['Placas', selectedVehicle.plate || 'Sin placas'],
            ] : []),
            ['Ruta', routeLabel],
            ['Estado', statusLabel],
            ['Velocidad', speedLabel],
            ['GPS', gpsLabel],
            ['Ultima actualizacion', formatLastUpdate(selectedVehicle.locationTimestamp)],
            ...(kilometersLabel ? [['Kilometros', kilometersLabel]] : []),
          ]
        : [],
    [gpsLabel, isAdmin, kilometersLabel, routeLabel, selectedVehicle, speedLabel, statusLabel]
  );
  const history = useMemo(
    () => sessionHistory.filter((session) => !selectedVehicle || session.vehicleId === selectedVehicle.id),
    [selectedVehicle, sessionHistory]
  );
  const historyRows = useMemo(() => {
    if (!selectedSession) return [];
    const startedAt = new Date(selectedSession.startedAt).getTime();
    const endedAt = selectedSession.finishedAt ? new Date(selectedSession.finishedAt).getTime() : Date.now();
    const incidentCount = incidents.filter((incident) => {
      const createdAt = new Date(incident.createdAt).getTime();
      return incident.vehicleId === selectedSession.vehicleId && createdAt >= startedAt && createdAt <= endedAt;
    }).length;
    const metrics = selectedSession.metrics;
    return [
      ['Inicio', formatDateTime(selectedSession.startedAt)],
      ['Fin', formatDateTime(selectedSession.finishedAt)],
      ['Duracion', formatDuration(selectedSession.totalDuration ?? metrics?.totalDuration ?? getSessionDuration(selectedSession))],
      ['Tiempo activo', formatDuration(selectedSession.movingTime)],
      ['Tiempo detenido', formatDuration(selectedSession.stoppedTime)],
      ['Tiempo pausado', formatDuration(metrics?.pausedTime)],
      ['Kilometros', selectedSession.totalDistance == null ? 'No disponible' : `${(selectedSession.totalDistance / 1000).toFixed(1)} km`],
      ['Velocidad promedio', selectedSession.averageSpeed == null ? 'No disponible' : `${Math.round(selectedSession.averageSpeed)} km/h`],
      ['Velocidad maxima', selectedSession.maxSpeed == null ? 'No disponible' : `${Math.round(selectedSession.maxSpeed)} km/h`],
      ['Paradas', selectedSession.stopEvents == null ? 'No disponible' : String(selectedSession.stopEvents)],
      ['Incidencias', String(incidentCount)],
      ['SOS', 'No disponible en Trip Logs'],
      ['Estado GPS', metrics?.gpsCoveragePercent == null ? 'No disponible' : `${Math.round(metrics.gpsCoveragePercent)}% cobertura`],
      ['Estado Radio', 'No disponible en Trip Logs'],
      ['Ultima sincronizacion', formatDateTime(lastSyncedAt || selectedSession.updatedAt)],
    ];
  }, [incidents, lastSyncedAt, selectedSession]);

  return (
    <View style={[styles.bottomOverlay, { paddingBottom: bottomPadding }]}>
      {locationStatus.canRetry && locationStatus.title ? (
        <View style={[styles.locationNotice, { backgroundColor: theme.colors.surface, borderColor: locationStatusColor }]}>
          <MaterialCommunityIcons name="crosshairs-gps" size={20} color={locationStatusColor} />
          <View style={styles.locationNoticeCopy}>
            <Text style={[styles.locationNoticeTitle, { color: theme.colors.text }]}>
              {locationStatus.title}
            </Text>
            {locationStatus.message ? (
              <Text style={[styles.locationNoticeText, { color: theme.colors.muted }]}>
                {locationStatus.message}
              </Text>
            ) : null}
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
      <View style={[styles.followCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.line }]}>
        <View style={styles.followHeader}>
          <View style={styles.followIdentity}>
            <Text style={[styles.followTitle, { color: theme.colors.text }]}>
              {selectedVehicle?.code || 'Tu ubicacion actual'}
            </Text>
            <Text style={[styles.followMeta, { color: theme.colors.muted }]}>
              {selectedVehicle
                ? `Placas ${selectedVehicle.plate || 'Sin placas'} · ${routeLabel}`
                : 'No tienes una unidad asignada. Contacta al administrador.'}
            </Text>
          </View>
          {selectedVehicle ? <StatusPill label={statusLabel} tone={selectedVehicle.status === 'maintenance' ? 'danger' : 'positive'} /> : null}
        </View>

        {selectedVehicle ? <View style={styles.metricGrid}>
          {[
            ['Estado', statusLabel, 'bus-clock'],
            ['GPS', gpsLabel, 'crosshairs-gps'],
            ['Tiempo activo', activeTimeLabel, 'timer-outline'],
            ['Kilometros', kilometersLabel || 'No disponible', 'map-marker-distance'],
          ].map(([label, value, icon]) => <View key={label} style={[styles.metricCard, { backgroundColor: theme.colors.surfaceAlt }]}>
            <MaterialCommunityIcons name={icon as keyof typeof MaterialCommunityIcons.glyphMap} size={16} color={theme.colors.accent} />
            <Text style={[styles.metricLabel, { color: theme.colors.muted }]}>{label}</Text>
            <Text style={[styles.metricValue, { color: theme.colors.text }]} numberOfLines={1}>{value}</Text>
          </View>)}
        </View> : null}

        {selectedVehicle ? (
          <>
            <Pressable
              onPress={() => setDetailsOpen((current) => !current)}
              style={({ pressed }) => [
                styles.detailsButton,
                { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.line },
                pressed ? styles.controlPressed : undefined,
              ]}
              accessibilityLabel={detailsOpen ? 'Ocultar detalles de unidad' : 'Ver detalles de unidad'}>
              <MaterialCommunityIcons
                name={detailsOpen ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={theme.colors.text}
              />
              <Text style={[styles.detailsButtonText, { color: theme.colors.text }]}>
                {detailsOpen ? 'Ocultar detalles' : 'Ver detalles'}
              </Text>
            </Pressable>
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
            <Pressable onPress={() => setHistoryOpen(true)} style={[styles.detailsButton, { borderColor: theme.colors.line }]} accessibilityLabel="Abrir historial de jornadas">
              <MaterialCommunityIcons name="history" size={18} color={theme.colors.text} />
              <Text style={[styles.detailsButtonText, { color: theme.colors.text }]}>Historial</Text>
            </Pressable>
          </>
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

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trackList}>
          {trackingVehicles.map((vehicle) => {
            const isSelected = vehicle.id === selectedVehicle?.id;
            const selectedTrackChipStyle = {
              backgroundColor: theme.colors.accent,
              borderColor: theme.colors.accent,
            };
            const trackChipTitleStyle = isSelected ? styles.trackChipTitleSelected : { color: theme.colors.text };

            return (
              <Pressable
                key={vehicle.id}
                onPress={() => onSelectTrackingVehicle(vehicle)}
                style={({ pressed }) => [
                  styles.trackChip,
                  { borderColor: theme.colors.line },
                  isSelected ? selectedTrackChipStyle : undefined,
                  pressed ? styles.controlPressed : undefined,
                ]}>
                <Text style={[styles.trackChipTitle, trackChipTitleStyle]}>{vehicle.code}</Text>
              </Pressable>
            );
          })}
          {!trackingVehicles.length && !selectedVehicle ? (
            <View style={styles.emptyTrackState}>
              <MaterialCommunityIcons name="bus-clock" size={18} color={theme.colors.muted} />
              <Text style={[styles.emptyTrackText, { color: theme.colors.muted }]}>Sin unidades disponibles</Text>
            </View>
          ) : null}
        </ScrollView>
      </View>
      <Modal visible={historyOpen} transparent animationType="slide" onRequestClose={() => setHistoryOpen(false)}>
        <View style={styles.historyBackdrop}>
          <View style={[styles.historyCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.line }]}>
            <View style={styles.followHeader}>
              <Text style={[styles.followTitle, { color: theme.colors.text }]}>Historial</Text>
              <Pressable onPress={() => setHistoryOpen(false)} accessibilityLabel="Cerrar historial">
                <MaterialCommunityIcons name="close" size={24} color={theme.colors.text} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.historyList}>
              {selectedSession ? <>
                <Pressable onPress={() => setSelectedSession(null)} style={styles.historyBack}>
                  <MaterialCommunityIcons name="chevron-left" size={20} color={theme.colors.accent} />
                  <Text style={[styles.detailsButtonText, { color: theme.colors.accent }]}>Jornadas</Text>
                </Pressable>
                {historyRows.map(([label, value]) => <View key={label} style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: theme.colors.muted }]}>{label}</Text>
                  <Text style={[styles.detailValue, { color: theme.colors.text }]}>{value}</Text>
                </View>)}
              </> : history.length ? history.map((session) => <View key={session.id} style={[styles.historyItem, { borderColor: theme.colors.line }]}>
                <View style={styles.followIdentity}>
                  <Text style={[styles.detailValue, { color: theme.colors.text, textAlign: 'left' }]}>{formatDateTime(session.startedAt)}</Text>
                  <Text style={[styles.detailLabel, { color: theme.colors.muted }]}>{formatDuration(getSessionDuration(session))} · {formatVehicleStatus(session.status)}</Text>
                </View>
                <Pressable onPress={() => setSelectedSession(session)} style={[styles.detailsButton, { borderColor: theme.colors.line }]} accessibilityLabel="Ver detalles de jornada">
                  <Text style={[styles.detailsButtonText, { color: theme.colors.text }]}>Detalles</Text>
                </Pressable>
              </View>) : <Text style={[styles.emptyTrackText, { color: theme.colors.muted }]}>Sin Trip Logs disponibles</Text>}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
