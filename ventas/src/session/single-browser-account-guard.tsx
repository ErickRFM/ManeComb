import { type PropsWithChildren, useEffect, useMemo, useRef } from 'react';
import { useAppStore } from '@/src/store/use-app-store';

const ACTIVE_IDENTITY_KEY = 'manecomb-ventas-active-identity:v1';
const IDENTITY_CHANNEL = 'manecomb-ventas-active-identity:v1';

const TAB_ID = (() => {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  return `tab:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
})();

type ActiveIdentityMarker = {
  identity: string;
  tabId: string;
  updatedAt: number;
};

function getIdentity(user: { id: string; organizationId?: string | null } | null | undefined) {
  if (!user?.id) return null;
  return `${String(user.organizationId || 'no-org')}:${user.id}`;
}

function parseMarker(value: unknown): ActiveIdentityMarker | null {
  if (!value) return null;

  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== 'object') return null;
    const marker = parsed as Partial<ActiveIdentityMarker>;
    if (typeof marker.identity !== 'string' || typeof marker.tabId !== 'string') return null;
    return {
      identity: marker.identity,
      tabId: marker.tabId,
      updatedAt: Number(marker.updatedAt) || 0,
    };
  } catch {
    return null;
  }
}

function writeMarker(marker: ActiveIdentityMarker) {
  try {
    window.localStorage.setItem(ACTIVE_IDENTITY_KEY, JSON.stringify(marker));
  } catch {
    // BroadcastChannel sigue cubriendo navegadores que restringen localStorage.
  }
}

function removeOwnedMarker() {
  try {
    const current = parseMarker(window.localStorage.getItem(ACTIVE_IDENTITY_KEY));
    if (current?.tabId === TAB_ID) {
      window.localStorage.removeItem(ACTIVE_IDENTITY_KEY);
    }
  } catch {
    // La sesión en memoria sigue siendo la autoridad de esta pestaña.
  }
}

function mustYieldToDifferentIdentity(marker: ActiveIdentityMarker | null) {
  const currentIdentity = getIdentity(useAppStore.getState().user);
  return Boolean(
    currentIdentity &&
    marker &&
    marker.tabId !== TAB_ID &&
    marker.identity !== currentIdentity
  );
}

/**
 * Mantiene una sola identidad de ManeComb por navegador/origen.
 * Varias pestañas de la misma cuenta son válidas; si otra pestaña autentica una
 * identidad distinta, esta pestaña se recarga y adopta la nueva sesión
 * persistida (o queda cerrada si la nueva sesión no pidió persistencia).
 *
 * No ejecutamos signOut al detectar el relevo: una pestaña vieja no debe borrar
 * los tokens que la pestaña nueva acaba de publicar en localStorage.
 */
export function SingleBrowserAccountGuard({ children }: PropsWithChildren) {
  const userId = useAppStore((state) => state.user?.id || null);
  const organizationId = useAppStore((state) => state.user?.organizationId || null);
  const identity = useMemo(
    () => (userId ? `${String(organizationId || 'no-org')}:${userId}` : null),
    [organizationId, userId]
  );
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const reconcile = (marker: ActiveIdentityMarker | null) => {
      if (mustYieldToDifferentIdentity(marker)) {
        window.location.reload();
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== ACTIVE_IDENTITY_KEY) return;
      reconcile(parseMarker(event.newValue));
    };

    window.addEventListener('storage', handleStorage);

    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(IDENTITY_CHANNEL);
      channelRef.current = channel;
      channel.onmessage = (event: MessageEvent<unknown>) => {
        reconcile(parseMarker(event.data));
      };
    }

    return () => {
      window.removeEventListener('storage', handleStorage);
      channelRef.current?.close();
      channelRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!identity) {
      removeOwnedMarker();
      return;
    }

    const marker: ActiveIdentityMarker = {
      identity,
      tabId: TAB_ID,
      updatedAt: Date.now(),
    };
    writeMarker(marker);
    channelRef.current?.postMessage(marker);
  }, [identity]);

  return <>{children}</>;
}
