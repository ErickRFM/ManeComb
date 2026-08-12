import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { Typography } from '@/constants/theme';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { useAppStore } from '@/src/store/use-app-store';
import {
  getRealtimeSnapshot,
  isRealtimeHeartbeatHealthy,
} from '@/src/utils/realtime-state';

export const TRANSIENT_CONNECTION_NOTICE_DELAY_MS = 3500;

export function ConnectionBanner() {
  const { theme } = useAppTheme();
  const [showTransientNotice, setShowTransientNotice] = useState(false);
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

  const heartbeatHealthy = isRealtimeHeartbeatHealthy(realtimeDiagnostics);
  const realtime = getRealtimeSnapshot({
    heartbeatHealthy,
    hasUser: Boolean(user),
    networkStatus,
    pendingSyncCount,
    socketStatus,
  });
  const offline = realtime.state === 'DISCONNECTED';
  const unauthorized = realtime.state === 'UNAUTHORIZED';
  const hardFailure = offline || unauthorized || realtime.state === 'ERROR';

  // `networkStatus: recovering` tambien se usa mientras se reconcilian datos despues
  // de una reconexion. Si Socket.IO ya esta conectado y el heartbeat esta sano, no
  // debemos volver a presentar esa reconciliacion como una caida del transporte.
  const transportRecovering =
    (realtime.state === 'CONNECTING' ||
      realtime.state === 'AUTHENTICATING' ||
      realtime.state === 'RECONNECTING') &&
    !(socketStatus === 'connected' && heartbeatHealthy);
  const transientNotice = !hardFailure && (transportRecovering || pendingSyncCount > 0);

  useEffect(() => {
    if (!transientNotice) {
      setShowTransientNotice(false);
      return;
    }

    const timer = setTimeout(() => {
      setShowTransientNotice(true);
    }, TRANSIENT_CONNECTION_NOTICE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [transientNotice]);

  if (!hardFailure && (!transientNotice || !showTransientNotice)) {
    return null;
  }

  const label = offline
    ? realtime.detail
    : pendingSyncCount > 0 && !transportRecovering
      ? 'Sincronizando pendientes...'
      : realtime.state === 'RECONNECTING'
        ? 'Reconectando...'
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
        accessibilityLabel={unauthorized ? 'Volver a iniciar sesión' : 'Reintentar conexión'}
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
