import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import {
  getSharedRealtimeSocket as readSharedRealtimeSocket,
  useAppStore,
} from './root-store';
import {
  FLEET_REALTIME_INVALIDATION_EVENTS,
  SHARED_SOCKET_DISCOVERY_INTERVAL_MS,
  shouldRequestColdStartRealtimeRecovery,
  shouldRetrySharedRealtimeSocket,
} from './shared-realtime-socket';

const COLD_START_RECOVERY_RETRY_MS = 3000;
let coldStartRecoveryKey: string | null = null;
let coldStartRecoveryInFlight = false;
let coldStartRecoveryAttemptedAt = 0;

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

      if (
        shouldRetrySharedRealtimeSocket({
          attempt,
          hasSession: Boolean(token && userId),
          hasSocket: Boolean(nextSocket),
          socketStatus,
        })
      ) {
        attempt += 1;
        timer = setTimeout(syncSocket, SHARED_SOCKET_DISCOVERY_INTERVAL_MS);
      }
    };

    if (!token || !userId || socketStatus === 'unauthorized') {
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
