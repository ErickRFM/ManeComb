import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { StatusPill } from '@/src/components/status-pill';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import type { Incident, Vehicle } from '@/src/types/app';
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
}: BottomTrackingPanelProps) {
  const { theme } = useAppTheme();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const hasSelectedVehicleLocation = Boolean(selectedVehicle?.locationTimestamp);
  const speedLabel = formatVehicleSpeed(selectedVehicle);
  const routeLabel = formatRouteLabel(selectedVehicle);
  const statusLabel = formatVehicleStatus(selectedVehicle?.status);
  const gpsLabel = getGpsLabel(selectedVehicle);
  const kilometersLabel = formatKilometers(selectedVehicle?.currentKilometers);
  const detailRows = useMemo(
    () =>
      selectedVehicle
        ? [
            ['Unidad', selectedVehicle.code],
            ['Chofer', selectedVehicle.driver?.name || selectedVehicle.driverName || 'Sin chofer asignado'],
            ['Placas', selectedVehicle.plate || 'Sin placas'],
            ['Ruta', routeLabel],
            ['Estado', statusLabel],
            ['Velocidad', speedLabel],
            ['GPS', gpsLabel],
            ['Ultima actualizacion', formatLastUpdate(selectedVehicle.locationTimestamp)],
            ...(kilometersLabel ? [['Kilometros', kilometersLabel]] : []),
          ]
        : [],
    [gpsLabel, kilometersLabel, routeLabel, selectedVehicle, speedLabel, statusLabel]
  );

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
          {selectedVehicle ? (
            <View style={styles.followMetrics}>
              <StatusPill
                label={speedLabel}
                tone={hasSelectedVehicleLocation ? 'info' : 'warning'}
              />
              <StatusPill
                label={statusLabel}
                tone={selectedVehicle.status === 'maintenance' ? 'danger' : 'positive'}
              />
            </View>
          ) : null}
        </View>

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
    </View>
  );
}
