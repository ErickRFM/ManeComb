import { type ReactNode, useCallback, useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/src/store/use-app-store';

const REALTIME_STALL_RECONCILE_MS = 12_000;
const DISCONNECTED_RECONCILE_MS = 4_000;
const RECOVERY_COOLDOWN_MS = 3_000;
const WATCHDOG_TICK_MS = 2_000;

type RecoveryReason = 'online' | 'pageshow' | 'socket' | 'stalled' | 'visible';

/**
 * Cinturon de seguridad del Portal sobre el Socket.IO canonico.
 *
 * El socket sigue siendo la via primaria y los eventos `operational-unit:updated`
 * deben llegar de inmediato. Este guard NO abre un segundo socket ni deriva GPS.
 * Solo reconcilia el snapshot REST canonico cuando el navegador vuelve a primer
 * plano, recupera red o deja de observar progreso realtime durante demasiado
 * tiempo. Asi una pestaña dormida/half-open no puede quedarse mostrando el GPS
 * de ayer aunque Socket.IO tarde en detectar el corte.
 */
export function PortalRealtimeRecoveryGuard({ children }: { children: ReactNode }) {
  const {
    operationalUnits,
    refreshAll,
    socketStatus,
    token,
    userId,
  } = useAppStore(
    useShallow((state) => ({
      operationalUnits: state.operationalUnits,
      refreshAll: state.refreshAll,
      socketStatus: state.socketStatus,
      token: state.token,
      userId: state.user?.id || null,
    }))
  );
  const lastSnapshotProgressAt = useRef(Date.now());
  const lastRecoveryAt = useRef(0);
  const recoveryInFlight = useRef<Promise<void> | null>(null);

  useEffect(() => {
    // `operationalUnits` se reemplaza tanto por Socket.IO como por la
    // reconciliacion REST de `loadVehicles`; cualquiera de los dos demuestra
    // que la proyeccion operacional avanzo.
    lastSnapshotProgressAt.current = Date.now();
  }, [operationalUnits]);

  const reconcile = useCallback((reason: RecoveryReason) => {
    if (!token || !userId) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden' && reason === 'stalled') {
      return;
    }
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
    if (!token || !userId || typeof window === 'undefined' || typeof document === 'undefined') {
      return undefined;
    }

    const onOnline = () => reconcile('online');
    const onPageShow = () => reconcile('pageshow');
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        lastSnapshotProgressAt.current = Date.now();
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

      const stalledForMs = Date.now() - lastSnapshotProgressAt.current;
      const threshold = socketStatus === 'connected'
        ? REALTIME_STALL_RECONCILE_MS
        : DISCONNECTED_RECONCILE_MS;

      if (stalledForMs >= threshold) {
        reconcile(socketStatus === 'connected' ? 'stalled' : 'socket');
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
