import { type ReactNode, useCallback, useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { usePortalStore } from '@/features/portal/store/use-portal-store';
import {
  getSharedPortalRealtimeSocket,
  subscribeSharedPortalRealtimeSocket,
  useAppStore,
} from '@/src/store/use-app-store';
import { shouldReconcileDisconnected } from './recovery-policy';

const RECOVERY_COOLDOWN_MS = 3_000;
const WATCHDOG_TICK_MS = 2_000;

type RecoveryReason = 'online' | 'pageshow' | 'socket' | 'visible';

type IncidentEnvelope = {
  incident?: unknown;
};

/**
 * Cinturon de seguridad del Portal sobre el Socket.IO canonico.
 *
 * Socket.IO sigue siendo la via primaria. Mientras el transporte reporta
 * `connected`, su ping/ping-timeout es la autoridad de salud y una flota quieta
 * no se interpreta como un socket estancado. REST solo reconcilia cuando el
 * navegador vuelve a primer plano, recupera red o Socket.IO entra en un estado
 * de recuperacion real. La rotacion JWT se sincroniza directamente en la
 * credencial `socket.auth` desde el store, sin abrir otro socket ni recargar el
 * Portal completo.
 *
 * Este mismo borde normaliza los envelopes realtime operativos que backend emite
 * con nombres distintos. No crea otro transporte: `incident:created` y
 * `incident:sos` se proyectan al handler incremental de `incident:updated` que
 * ya es la autoridad del store del Portal.
 */
export function PortalRealtimeRecoveryGuard({ children }: { children: ReactNode }) {
  const {
    refreshAll,
    socketStatus,
    token,
    userId,
  } = useAppStore(
    useShallow((state) => ({
      refreshAll: state.refreshAll,
      socketStatus: state.socketStatus,
      token: state.token,
      userId: state.user?.id || null,
    }))
  );
  const disconnectedSinceAt = useRef<number | null>(
    socketStatus === 'connected' ? null : Date.now()
  );
  const lastRecoveryAt = useRef(0);
  const recoveryInFlight = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (socketStatus === 'connected') {
      disconnectedSinceAt.current = null;
      return;
    }

    if (disconnectedSinceAt.current === null) {
      disconnectedSinceAt.current = Date.now();
    }
  }, [socketStatus]);

  const reconcile = useCallback((reason: RecoveryReason) => {
    if (!token || !userId) return;
    if (recoveryInFlight.current) return;

    const now = Date.now();
    if (now - lastRecoveryAt.current < RECOVERY_COOLDOWN_MS) return;
    lastRecoveryAt.current = now;

    const recovery = refreshAll()
      .catch(() => undefined)
      .finally(() => {
        if (recoveryInFlight.current === recovery) {
          recoveryInFlight.current = null;
        }
      });
    recoveryInFlight.current = recovery;
  }, [refreshAll, token, userId]);

  useEffect(() => {
    if (!token || !userId) return undefined;

    let boundSocket: ReturnType<typeof getSharedPortalRealtimeSocket> = null;

    const applyIncident = (payload: unknown) => {
      if (!payload || typeof payload !== 'object' || !('id' in payload)) return;
      usePortalStore.getState().applyRealtimeEvent('incident:updated', payload);
    };
    const onIncidentCreated = (payload: unknown) => applyIncident(payload);
    const onIncidentSos = (payload: IncidentEnvelope) => applyIncident(payload?.incident);

    const bind = (nextSocket: ReturnType<typeof getSharedPortalRealtimeSocket>) => {
      if (boundSocket === nextSocket) return;
      boundSocket?.off('incident:created', onIncidentCreated);
      boundSocket?.off('incident:sos', onIncidentSos);
      boundSocket = nextSocket;
      boundSocket?.on('incident:created', onIncidentCreated);
      boundSocket?.on('incident:sos', onIncidentSos);
    };

    const unsubscribe = subscribeSharedPortalRealtimeSocket(bind);
    return () => {
      boundSocket?.off('incident:created', onIncidentCreated);
      boundSocket?.off('incident:sos', onIncidentSos);
      unsubscribe();
    };
  }, [token, userId]);

  useEffect(() => {
    if (!token || !userId || typeof window === 'undefined' || typeof document === 'undefined') {
      return undefined;
    }

    const onOnline = () => reconcile('online');
    const onPageShow = () => reconcile('pageshow');
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        reconcile('visible');
      }
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', onVisibilityChange);

    // La primera reconciliacion cierra la ventana entre el REST inicial y el
    // momento en que `presence:join` termina de meter el socket en rooms.
    reconcile('visible');

    const watchdog = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;

      const disconnectedForMs = disconnectedSinceAt.current === null
        ? 0
        : Date.now() - disconnectedSinceAt.current;

      if (shouldReconcileDisconnected({
        socketStatus,
        visible: true,
        disconnectedForMs,
      })) {
        reconcile('socket');
      }
    }, WATCHDOG_TICK_MS);

    return () => {
      window.clearInterval(watchdog);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [reconcile, socketStatus, token, userId]);

  return children;
}
