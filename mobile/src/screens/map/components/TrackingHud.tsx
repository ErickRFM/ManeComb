import { Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { router } from '@/src/navigation/router';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { mapStyles as styles } from '../map-styles';
import { getTrackingHudRouteSummary } from '../utils/tracking';

type TrackingHudProps = {
  activeRouteCount: number;
  unknownStateCount: number;
  incidentCount: number;
  locationStatusColor: string;
  locationStatusLabel: string;
  serverSyncColor: string;
  serverSyncLabel: string;
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
  serverSyncColor,
  serverSyncLabel,
  onOpenMenu,
  paddingTop,
  trafficEnabled,
}: TrackingHudProps) {
  const { theme } = useAppTheme();
  const routeSummary = getTrackingHudRouteSummary(activeRouteCount, unknownStateCount);

  return (
    <View
      style={[styles.topOverlay, { paddingTop }]}
      accessibilityLabel={`Seguimiento. ${routeSummary.active.label}: ${routeSummary.active.value}. ${routeSummary.unknown.label}: ${routeSummary.unknown.value}. GPS local: ${locationStatusLabel}. GPS de unidad asignada: ${serverSyncLabel}. Tráfico ${trafficEnabled ? 'activado' : 'desactivado'}.`}>
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
            "En ruta" y "Sin datos" son estados independientes. Nunca se
            presentan como fraccion: el segundo numero no es el total de rutas.
          */}
          <HUDItem
            label={routeSummary.active.label}
            value={routeSummary.active.value}
            icon="bus"
            color={theme.colors.success}
          />
          <HUDItem
            label={routeSummary.unknown.label}
            value={routeSummary.unknown.value}
            icon="help-circle-outline"
            color={unknownStateCount ? theme.colors.warning : theme.colors.muted}
          />
          <HUDItem label="GPS local" value={locationStatusLabel} icon="crosshairs-gps" color={locationStatusColor} />
          {/*
            Este valor viene de la unidad asignada al usuario, no del socket.
            Se corrige el rotulo historico "Servidor" para no afirmar una
            conexion que este dato nunca midio. El estado de red/socket sigue
            perteneciendo al banner global de conexion.
          */}
          <HUDItem label="GPS unidad" value={serverSyncLabel} icon="bus-marker" color={serverSyncColor} />
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
