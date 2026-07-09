import { Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { router } from '@/src/navigation/router';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { mapStyles as styles } from '../map-styles';

type TrackingHudProps = {
  activeRouteCount: number;
  incidentCount: number;
  locationStatusColor: string;
  locationStatusLabel: string;
  onOpenMenu: () => void;
  paddingTop: number;
  trafficEnabled: boolean;
};

export function TrackingHud({
  activeRouteCount,
  incidentCount,
  locationStatusColor,
  locationStatusLabel,
  onOpenMenu,
  paddingTop,
  trafficEnabled,
}: TrackingHudProps) {
  const { theme } = useAppTheme();

  return (
    <View style={[styles.topOverlay, { paddingTop }]}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.push('/incidencias')}
          style={[styles.iconButton, { backgroundColor: theme.colors.headerGlass, borderColor: theme.colors.line }]}
          accessibilityLabel="Abrir incidencias">
          <MaterialCommunityIcons name="alert-outline" size={24} color={theme.colors.accent} />
        </Pressable>

        <View style={[styles.hud, { backgroundColor: theme.colors.headerGlass, borderColor: theme.colors.line }]}>
          <HUDItem value={`${activeRouteCount}`} icon="bus" color={theme.colors.info} />
          <HUDItem value={`${incidentCount}`} icon="alert" color={theme.colors.danger} />
          <HUDItem value={locationStatusLabel} icon="crosshairs-gps" color={locationStatusColor} />
          <HUDItem
            value={trafficEnabled ? 'ON' : 'OFF'}
            icon="traffic-light"
            color={trafficEnabled ? theme.colors.warning : theme.colors.muted}
          />
        </View>

        <Pressable
          onPress={onOpenMenu}
          style={[styles.iconButton, { backgroundColor: theme.colors.headerGlass, borderColor: theme.colors.line }]}
          accessibilityLabel="Abrir menu operativo">
          <MaterialCommunityIcons name="menu" size={24} color={theme.colors.text} />
        </Pressable>
      </View>
    </View>
  );
}

function HUDItem({ value, icon, color }: { value: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; color: string }) {
  const { theme } = useAppTheme();
  return (
    <View style={styles.hudItem}>
      <MaterialCommunityIcons name={icon} size={14} color={color} />
      <Text style={[styles.hudValue, { color: theme.colors.text }]}>{value}</Text>
    </View>
  );
}
