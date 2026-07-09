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
      <Pressable
        onPress={onRefresh}
        style={[styles.fab, { backgroundColor: theme.colors.headerGlass, borderColor: theme.colors.line }]}
        accessibilityLabel="Actualizar seguimiento">
        <MaterialCommunityIcons name={isRefreshing ? 'sync' : 'refresh'} size={22} color={theme.colors.text} />
      </Pressable>
      <Pressable
        onPress={onToggleFollow}
        style={[
          styles.fab,
          { backgroundColor: followMode ? theme.colors.accent : theme.colors.headerGlass, borderColor: theme.colors.line },
        ]}
        accessibilityLabel={followMode ? 'Desactivar seguimiento de unidad' : 'Activar seguimiento de unidad'}>
        <MaterialCommunityIcons name={followMode ? 'navigation' : 'map-search'} size={22} color={followMode ? '#FFF' : theme.colors.text} />
      </Pressable>
      <Pressable
        onPress={onToggleTraffic}
        style={[
          styles.fab,
          { backgroundColor: trafficEnabled ? theme.colors.warning : theme.colors.headerGlass, borderColor: theme.colors.line },
        ]}
        accessibilityLabel={trafficEnabled ? 'Ocultar trafico' : 'Mostrar trafico'}>
        <MaterialCommunityIcons name="traffic-light" size={22} color={trafficEnabled ? '#FFF' : theme.colors.text} />
      </Pressable>
      <Pressable
        onPress={onFocusNextAlert}
        style={[
          styles.fab,
          { backgroundColor: incidentCount ? theme.colors.danger : theme.colors.headerGlass, borderColor: theme.colors.line },
        ]}
        accessibilityLabel={incidentCount ? 'Ver siguiente alerta en mapa' : 'Abrir incidencias'}>
        <MaterialCommunityIcons name="alert-decagram" size={22} color={incidentCount ? '#FFF' : theme.colors.text} />
      </Pressable>
      {canRetryLocation && (
        <Pressable
          onPress={onRetryLocation}
          style={[styles.fab, { backgroundColor: theme.colors.warning, borderColor: theme.colors.line }]}
          accessibilityLabel="Reintentar ubicacion GPS">
          <MaterialCommunityIcons name="crosshairs-gps" size={22} color="#FFF" />
        </Pressable>
      )}
    </View>
  );
}
