import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { Typography } from '@/constants/theme';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { useAppStore } from '@/src/store/use-app-store';
import { getRealtimeSnapshot } from '@/src/utils/realtime-state';

export function ConnectionBanner() {
  const { theme } = useAppTheme();
  const { isRefreshing, networkStatus, pendingSyncCount, realtimeDiagnostics, refreshAll, signOut, socketStatus, user } = useAppStore(
    useShallow((state) => ({
      isRefreshing: state.isRefreshing,
      networkStatus: state.networkStatus,
      pendingSyncCount: state.pendingSyncCount,
      realtimeDiagnostics: state.realtimeDiagnostics,
      refreshAll: state.refreshAll,
      signOut: state.signOut,
      socketStatus: state.socketStatus,
      user: state.user,
    }))
  );

  const realtime = getRealtimeSnapshot({
    heartbeatHealthy: Boolean(
      realtimeDiagnostics.lastPongAt &&
      realtimeDiagnostics.missedHeartbeatAcks === 0 &&
      Date.now() - new Date(realtimeDiagnostics.lastPongAt).getTime() <= 55000
    ),
    hasUser: Boolean(user),
    networkStatus,
    pendingSyncCount,
    socketStatus,
  });
  const offline = realtime.state === 'DISCONNECTED';
  const unauthorized = realtime.state === 'UNAUTHORIZED';
  const visibleStates = new Set([
    'CONNECTING',
    'AUTHENTICATING',
    'RECONNECTING',
    'UNAUTHORIZED',
    'ERROR',
  ]);

  if (!offline && !visibleStates.has(realtime.state) && pendingSyncCount === 0) {
    return null;
  }

  const label = offline
    ? realtime.detail
    : pendingSyncCount > 0
      ? 'Sincronizando pendientes...'
      : realtime.detail;
  const tint = unauthorized
    ? theme.colors.danger
    : offline
      ? theme.colors.warning
      : theme.colors.info;

  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: unauthorized
            ? theme.colors.dangerSoft
            : offline
              ? theme.colors.warningSoft
              : theme.colors.infoSoft,
          borderColor: tint,
        },
      ]}>
      <Pressable
        onPress={() => {
          if (isRefreshing) {
            return;
          }
          if (unauthorized) {
            void signOut();
            return;
          }
          void refreshAll();
        }}
        disabled={isRefreshing}
        accessibilityRole="button"
        accessibilityLabel={unauthorized ? 'Volver a iniciar sesión' : 'Reintentar conexion'}
        accessibilityState={{ busy: isRefreshing, disabled: isRefreshing }}
        hitSlop={10}
        style={styles.retryButton}>
        {isRefreshing ? (
          <ActivityIndicator size="small" color={tint} />
        ) : (
          <MaterialCommunityIcons
            name={unauthorized ? 'account-alert-outline' : offline ? 'wifi-off' : 'sync'}
            size={16}
            color={tint}
          />
        )}
      </Pressable>
      <Text
        numberOfLines={2}
        style={[
          styles.text,
          {
            color: tint,
          },
        ]}>
        {pendingSyncCount > 0 ? `${label} (${pendingSyncCount})` : label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  retryButton: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 16,
  },
});
