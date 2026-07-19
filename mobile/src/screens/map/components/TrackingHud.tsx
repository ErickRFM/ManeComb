import { Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { router } from '@/src/navigation/router';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { mapStyles as styles } from '../map-styles';

type TrackingHudProps = {
  activeRouteCount: number;
  unknownStateCount: number;
  incidentCount: number;
  locationStatusColor: string;
  locationStatusLabel: string;
  onOpenMenu: () => void;
  paddingTop: number;
  trafficEnabled: boolean;
};

export function TrackingHud({
  activeRouteCount,
  unknownStateCount,
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
          hitSlop={10}
          onPress={() => router.push('/incidencias')}
          style={[styles.iconButton, { backgroundColor: theme.colors.headerGlass, borderColor: theme.colors.line }]}
          accessibilityLabel="Abrir incidencias">
          <MaterialCommunityIcons name={incidentCount ? 'alert-decagram' : 'alert-outline'} size={22} color={incidentCount ? theme.colors.danger : theme.colors.text} />
        </Pressable>

        <View style={[styles.hud, { backgroundColor: theme.colors.headerGlass, borderColor: theme.colors.line }]}>
          {/*
            Se muestra "en ruta / sin datos" cuando hay unidades cuyo estado no
            se puede afirmar. Antes esas unidades caian en `stopped` y el
            contador daba 0 sin explicar por que.
          */}
          <HUDItem
            label="Rutas"
            value={unknownStateCount ? `${activeRouteCount} / ${unknownStateCount}?` : `${activeRouteCount}`}
            icon="bus"
            color={theme.colors.info}
          />
          <HUDItem label="GPS" value={locationStatusLabel} icon="crosshairs-gps" color={locationStatusColor} />
          <HUDItem
            label="Trafico"
            value={trafficEnabled ? 'ON' : 'OFF'}
            icon="traffic-light"
            color={trafficEnabled ? theme.colors.warning : theme.colors.muted}
          />
        </View>

        <Pressable
          hitSlop={10}
          onPress={onOpenMenu}
          style={[styles.iconButton, { backgroundColor: theme.colors.headerGlass, borderColor: theme.colors.line }]}
          accessibilityLabel="Abrir menu operativo">
          <MaterialCommunityIcons name="menu" size={22} color={theme.colors.text} />
        </Pressable>
      </View>
    </View>
  );
}

function HUDItem({
  color,
  icon,
  label,
  value,
}: {
  color: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  value: string;
}) {
  const { theme } = useAppTheme();
  return (
    <View style={styles.hudItem}>
      <MaterialCommunityIcons name={icon} size={14} color={color} />
      <View style={styles.hudTextBlock}>
        <Text style={[styles.hudLabel, { color: theme.colors.muted }]}>{label}</Text>
        <Text style={[styles.hudValue, { color: theme.colors.text }]} numberOfLines={1}>{value}</Text>
      </View>
    </View>
  );
}
