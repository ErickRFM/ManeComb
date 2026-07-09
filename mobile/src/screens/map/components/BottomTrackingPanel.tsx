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
            style={[styles.locationRetry, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.line }]}
            accessibilityLabel="Reintentar ubicacion">
            <MaterialCommunityIcons name="refresh" size={18} color={theme.colors.text} />
          </Pressable>
        </View>
      ) : null}
      <View style={[styles.followCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.line }]}>
        <View style={styles.followHeader}>
          <View>
            <Text style={[styles.followTitle, { color: theme.colors.text }]}>{selectedVehicle?.code || 'Flota'}</Text>
            <Text style={[styles.followMeta, { color: theme.colors.muted }]}>{selectedVehicle?.driverName || 'En monitoreo'}</Text>
          </View>
          <StatusPill label={`${selectedVehicle?.speed || 0} km/h`} tone="info" />
        </View>

        {activeIncident && activeIncidentVehicle ? (
          <Pressable
            onPress={() => onSelectIncidentVehicle(activeIncidentVehicle)}
            style={[styles.alertStrip, { backgroundColor: theme.colors.danger, borderColor: theme.colors.danger }]}>
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
                style={[styles.trackChip, isSelected ? selectedTrackChipStyle : undefined]}>
                <Text style={[styles.trackChipTitle, trackChipTitleStyle]}>{vehicle.code}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}
