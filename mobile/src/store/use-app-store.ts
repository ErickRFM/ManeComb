import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import {
  getSharedRealtimeSocket as readSharedRealtimeSocket,
  useAppStore,
} from './root-store';
import {
  SHARED_SOCKET_DISCOVERY_INTERVAL_MS,
  shouldRetrySharedRealtimeSocket,
} from './shared-realtime-socket';

export { useAppStore };
export type { AppState } from './root-store';

export function getSharedRealtimeSocket() {
  return readSharedRealtimeSocket();
}

export function useSharedRealtimeSocket(): Socket | null {
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
      setSharedSocket(null);
      return () => undefined;
    }

    syncSocket();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [socketStatus, token, userId]);

  return sharedSocket;
}
