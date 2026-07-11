import { Pressable, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { mapStyles as styles } from '../map-styles';

type FloatingControlsProps = {
  canRetryLocation: boolean;
  followMode: boolean;
  incidentCount: number;
  isRefreshing: boolean;
  onFocusNextAlert: () => void;
  onRefresh: () => void;
  onRetryLocation: () => void;
  onToggleFollow: () => void;
  onToggleTraffic: () => void;
  top: number;
  trafficEnabled: boolean;
};

export function FloatingControls({
  canRetryLocation,
  followMode,
  incidentCount,
  isRefreshing,
  onFocusNextAlert,
  onRefresh,
  onRetryLocation,
  onToggleFollow,
  onToggleTraffic,
  top,
  trafficEnabled,
}: FloatingControlsProps) {
  const { theme } = useAppTheme();

  return (
    <View style={[styles.sideActions, { top }]}>
      <View style={[styles.fabGroup, { backgroundColor: theme.colors.headerGlass, borderColor: theme.colors.line }]}>
        <Pressable
          onPress={onRefresh}
          style={({ pressed }) => [styles.fabCompact, pressed ? styles.controlPressed : undefined]}
          accessibilityLabel="Actualizar seguimiento">
          <MaterialCommunityIcons name={isRefreshing ? 'sync' : 'refresh'} size={21} color={theme.colors.text} />
        </Pressable>
        <View style={[styles.fabDivider, { backgroundColor: theme.colors.line }]} />
        <Pressable
          onPress={onToggleFollow}
          style={({ pressed }) => [
            styles.fabCompact,
            followMode ? { backgroundColor: theme.colors.accent } : undefined,
            pressed ? styles.controlPressed : undefined,
          ]}
          accessibilityLabel={followMode ? 'Desactivar seguimiento de unidad' : 'Activar seguimiento de unidad'}>
          <MaterialCommunityIcons name={followMode ? 'navigation' : 'map-search'} size={21} color={followMode ? '#FFF' : theme.colors.text} />
        </Pressable>
        <View style={[styles.fabDivider, { backgroundColor: theme.colors.line }]} />
        <Pressable
          onPress={onToggleTraffic}
          style={({ pressed }) => [
            styles.fabCompact,
            trafficEnabled ? { backgroundColor: theme.colors.warning } : undefined,
            pressed ? styles.controlPressed : undefined,
          ]}
          accessibilityLabel={trafficEnabled ? 'Ocultar trafico' : 'Mostrar trafico'}>
          <MaterialCommunityIcons name="traffic-light" size={21} color={trafficEnabled ? '#FFF' : theme.colors.text} />
        </Pressable>
      </View>
      {incidentCount ? (
        <Pressable
          onPress={onFocusNextAlert}
          style={({ pressed }) => [
            styles.fab,
            { backgroundColor: theme.colors.danger, borderColor: theme.colors.danger },
            pressed ? styles.controlPressed : undefined,
          ]}
          accessibilityLabel="Ver siguiente alerta en mapa">
          <MaterialCommunityIcons name="alert-decagram" size={22} color="#FFF" />
        </Pressable>
      ) : null}
      {canRetryLocation && (
        <Pressable
          onPress={onRetryLocation}
          style={({ pressed }) => [
            styles.fab,
            { backgroundColor: theme.colors.warning, borderColor: theme.colors.line },
            pressed ? styles.controlPressed : undefined,
          ]}
          accessibilityLabel="Reintentar ubicacion GPS">
          <MaterialCommunityIcons name="crosshairs-gps" size={22} color="#FFF" />
        </Pressable>
      )}
    </View>
  );
}
