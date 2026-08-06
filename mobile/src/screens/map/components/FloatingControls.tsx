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
  journeyStatus?: 'none' | 'assigned' | 'ready' | 'running' | 'paused';
  onConfirmJourney?: () => void;
  onStartJourney?: () => void;
  onFinishJourney?: () => void;
  onPauseJourney?: () => void;
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
  journeyStatus,
  onConfirmJourney,
  onStartJourney,
  onFinishJourney,
  onPauseJourney,
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
      {journeyStatus ? (
        <View style={[styles.fabGroup, { backgroundColor: theme.colors.headerGlass, borderColor: theme.colors.accent }]}>
          {journeyStatus === 'assigned' && onConfirmJourney ? (
            <Pressable
              onPress={onConfirmJourney}
              style={({ pressed }) => [styles.fabCompact, pressed ? styles.controlPressed : undefined]}
              accessibilityLabel="Confirmar jornada asignada">
              <MaterialCommunityIcons name="check-circle-outline" size={24} color={theme.colors.accent} />
            </Pressable>
          ) : null}
          {(journeyStatus === 'none' || journeyStatus === 'ready') && onStartJourney ? (
            <Pressable
              onPress={onStartJourney}
              style={({ pressed }) => [styles.fabCompact, pressed ? styles.controlPressed : undefined]}
              accessibilityLabel={journeyStatus === 'ready' ? 'Iniciar jornada confirmada' : 'Iniciar jornada'}>
              <MaterialCommunityIcons name="play-circle-outline" size={24} color={theme.colors.accent} />
            </Pressable>
          ) : null}
          {(journeyStatus === 'running' || journeyStatus === 'paused') && onPauseJourney && onFinishJourney ? (
            <>
              <Pressable
                onPress={onPauseJourney}
                style={({ pressed }) => [styles.fabCompact, pressed ? styles.controlPressed : undefined]}
                accessibilityLabel={journeyStatus === 'paused' ? 'Reanudar jornada' : 'Pausar jornada'}>
                <MaterialCommunityIcons
                  name={journeyStatus === 'paused' ? 'play-circle-outline' : 'pause-circle-outline'}
                  size={24}
                  color={theme.colors.text}
                />
              </Pressable>
              <View style={[styles.fabDivider, { backgroundColor: theme.colors.line }]} />
              <Pressable
                onPress={onFinishJourney}
                style={({ pressed }) => [styles.fabCompact, pressed ? styles.controlPressed : undefined]}
                accessibilityLabel="Finalizar jornada">
                <MaterialCommunityIcons name="stop-circle-outline" size={24} color={theme.colors.danger} />
              </Pressable>
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
