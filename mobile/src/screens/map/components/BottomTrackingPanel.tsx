import { Pressable, ScrollView, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { StatusPill } from '@/src/components/status-pill';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import type { Incident, Vehicle } from '@/src/types/app';
import type { LocationStatusSnapshot } from '../types';
import { mapStyles as styles } from '../map-styles';

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
  const hasSelectedVehicleLocation = Boolean(selectedVehicle?.locationTimestamp);

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
              {selectedVehicle?.code || 'Tu ubicación actual'}
            </Text>
            <Text style={[styles.followMeta, { color: theme.colors.muted }]}>
              {selectedVehicle
                ? `Placas ${selectedVehicle.plate} · Ruta ${selectedVehicle.assignedRoute ? 'asignada' : 'No asignada'}`
                : 'No tienes una unidad asignada. Contacta al administrador.'}
            </Text>
          </View>
          {selectedVehicle?.assignedRoute ? (
            <View style={styles.followMetrics}>
              <StatusPill
                label={hasSelectedVehicleLocation ? `${selectedVehicle.speed} km/h` : 'GPS pendiente'}
                tone={hasSelectedVehicleLocation ? 'info' : 'warning'}
              />
              <StatusPill
                label={selectedVehicle.status}
                tone={selectedVehicle.status === 'maintenance' ? 'danger' : 'positive'}
              />
            </View>
          ) : null}
        </View>

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
