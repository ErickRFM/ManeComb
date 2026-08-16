import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import {
  getSharedRealtimeSocket as readSharedRealtimeSocket,
  useAppStore,
} from './root-store';
import {
  FLEET_REALTIME_INVALIDATION_EVENTS,
  SHARED_SOCKET_DISCOVERY_INTERVAL_MS,
  SHARED_SOCKET_DISCOVERY_MAX_ATTEMPTS,
  shouldRequestColdStartRealtimeRecovery,
  shouldRetrySharedRealtimeSocket,
} from './shared-realtime-socket';
import { logRealtimeDiag } from './realtime-diagnostics-log';
import {
  clearSessionNotifications,
  deleteNativePushToken,
} from '@/src/utils/push-notifications';

const COLD_START_RECOVERY_RETRY_MS = 3000;
let coldStartRecoveryKey: string | null = null;
let coldStartRecoveryInFlight = false;
let coldStartRecoveryAttemptedAt = 0;

type LifecycleGlobal = typeof globalThis & {
  __MANECOMB_NATIVE_SESSION_TEARDOWN_SUBSCRIBED__?: boolean;
};

/**
 * Root-store conserva la autoridad de autenticacion. Este observer solo limpia
 * recursos Android que viven fuera de Zustand cuando esa autoridad termina la
 * identidad local. Asi una expiracion/suspension tambien elimina el token FCM y
 * las tarjetas de la cuenta anterior, no solo el logout pulsado por el usuario.
 *
 * El marcador global evita subscriptions duplicadas bajo Fast Refresh/HMR.
 */
function ensureNativeSessionTeardownObserver() {
  const runtime = globalThis as LifecycleGlobal;
  if (runtime.__MANECOMB_NATIVE_SESSION_TEARDOWN_SUBSCRIBED__) return;
  runtime.__MANECOMB_NATIVE_SESSION_TEARDOWN_SUBSCRIBED__ = true;

  useAppStore.subscribe((state, previousState) => {
    const previousHadIdentity = Boolean(previousState.token && previousState.user?.id);
    const currentHasIdentity = Boolean(state.token && state.user?.id);

    if (!previousHadIdentity || currentHasIdentity) return;

    // Son recursos locales del dispositivo: deben fallar cerrado aunque el
    // backend no sea alcanzable durante el teardown.
    void Promise.allSettled([
      clearSessionNotifications(),
      deleteNativePushToken(),
    ]);
  });
}

ensureNativeSessionTeardownObserver();

export { useAppStore };
export type { AppState } from './root-store';

export function getSharedRealtimeSocket() {
  return readSharedRealtimeSocket();
}

function requestColdStartRealtimeRecovery(token: string, userId: string) {
  const recoveryKey = `${userId}:${token}`;
  const now = Date.now();

  if (
    coldStartRecoveryInFlight ||
    (coldStartRecoveryKey === recoveryKey &&
      now - coldStartRecoveryAttemptedAt < COLD_START_RECOVERY_RETRY_MS)
  ) {
    return;
  }

  coldStartRecoveryKey = recoveryKey;
  coldStartRecoveryAttemptedAt = now;
  coldStartRecoveryInFlight = true;

  void useAppStore
    .getState()
    .refreshAll()
    .catch(() => undefined)
    .finally(() => {
      coldStartRecoveryInFlight = false;
    });
}

export function useSharedRealtimeSocket(): Socket | null {
  const authContextReady = useAppStore((state) => Boolean(state.authContext));
  const isBootstrapping = useAppStore((state) => state.isBootstrapping);
  const isHydrated = useAppStore((state) => state.isHydrated);
  const networkStatus = useAppStore((state) => state.networkStatus);
  const socketStatus = useAppStore((state) => state.socketStatus);
  const token = useAppStore((state) => state.token);
  const userId = useAppStore((state) => state.user?.id || null);
  const [sharedSocket, setSharedSocket] = useState<Socket | null>(() =>
    readSharedRealtimeSocket()
  );

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const syncSocket = () => {
      if (cancelled) return;

      const nextSocket = readSharedRealtimeSocket();
      setSharedSocket((current) => (current === nextSocket ? current : nextSocket));

      const keepPolling = shouldRetrySharedRealtimeSocket({
        attempt,
        hasSession: Boolean(token && userId),
        hasSocket: Boolean(nextSocket),
        socketStatus,
      });

      logRealtimeDiag('syncSocket', {
        attempt,
        hasSession: Boolean(token && userId),
        hasSocket: Boolean(nextSocket),
        socketId: nextSocket?.id || null,
        socketConnected: Boolean(nextSocket?.connected),
        socketStatus,
        authContextReady,
        isHydrated,
        isBootstrapping,
        networkStatus,
        keepPolling,
        // Por que deja de sondear: es el dato que distingue "descubierto" de
        // "se rindio" y de "sesion invalida".
        stopReason: keepPolling
          ? null
          : nextSocket
            ? 'socket_discovered'
            : !token || !userId
              ? 'no_session'
              : attempt >= SHARED_SOCKET_DISCOVERY_MAX_ATTEMPTS
                ? 'max_attempts_exhausted'
                : `socket_status_not_retryable:${socketStatus}`,
      });

      if (
        token &&
        userId &&
        shouldRequestColdStartRealtimeRecovery({
          authContextReady,
          hasSession: true,
          hasSocket: Boolean(nextSocket),
          isBootstrapping,
          isHydrated,
          networkStatus,
          socketStatus,
        })
      ) {
        requestColdStartRealtimeRecovery(token, userId);
      }

      if (keepPolling) {
        attempt += 1;
        timer = setTimeout(syncSocket, SHARED_SOCKET_DISCOVERY_INTERVAL_MS);
      }
    };

    if (!token || !userId || socketStatus === 'unauthorized') {
      logRealtimeDiag('syncSocket:released', {
        reason: socketStatus === 'unauthorized' ? 'socket_status_unauthorized' : 'no_session',
        hasSession: Boolean(token && userId),
        socketStatus,
        networkStatus,
      });
      coldStartRecoveryKey = null;
      coldStartRecoveryAttemptedAt = 0;
      setSharedSocket(null);
      return () => undefined;
    }

    syncSocket();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [
    authContextReady,
    isBootstrapping,
    isHydrated,
    networkStatus,
    socketStatus,
    token,
    userId,
  ]);

  useEffect(() => {
    if (!sharedSocket) return undefined;

    const refreshFleetAuthority = () => {
      void useAppStore.getState().refreshAll().catch(() => undefined);
    };

    FLEET_REALTIME_INVALIDATION_EVENTS.forEach((eventName) => {
      sharedSocket.on(eventName, refreshFleetAuthority);
    });

    return () => {
      FLEET_REALTIME_INVALIDATION_EVENTS.forEach((eventName) => {
        sharedSocket.off(eventName, refreshFleetAuthority);
      });
    };
  }, [sharedSocket]);

  return sharedSocket;
}
