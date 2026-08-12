import { type PropsWithChildren, useEffect, useRef } from 'react';
import { useAdminStore } from '../store';

const ACTIVE_IDENTITY_KEY = 'manecomb-platform-active-identity:v1';
const IDENTITY_CHANNEL = 'manecomb-platform-active-identity:v1';

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
    // BroadcastChannel conserva el relevo cuando storage está restringido.
  }
}

function removeOwnedMarker() {
  try {
    const current = parseMarker(window.localStorage.getItem(ACTIVE_IDENTITY_KEY));
    if (current?.tabId === TAB_ID) {
      window.localStorage.removeItem(ACTIVE_IDENTITY_KEY);
    }
  } catch {
    // El store en memoria sigue siendo la autoridad de esta pestaña.
  }
}

function mustYieldToDifferentIdentity(marker: ActiveIdentityMarker | null) {
  const currentUserId = useAdminStore.getState().session?.user.id || null;
  return Boolean(
    currentUserId &&
    marker &&
    marker.tabId !== TAB_ID &&
    marker.identity !== currentUserId
  );
}

/**
 * Admin Global admite varias pestañas de la misma identidad, pero nunca dos
 * administradores distintos activos al mismo tiempo dentro del mismo navegador.
 * El login más reciente releva a la identidad anterior y las pestañas viejas se
 * recargan para adoptar la sesión persistida vigente.
 */
export function SingleBrowserAdminAccountGuard({ children }: PropsWithChildren) {
  const userId = useAdminStore((state) => state.session?.user.id || null);
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

    if (!userId) {
      removeOwnedMarker();
      return;
    }

    const marker: ActiveIdentityMarker = {
      identity: userId,
      tabId: TAB_ID,
      updatedAt: Date.now(),
    };
    writeMarker(marker);
    channelRef.current?.postMessage(marker);
  }, [userId]);

  return <>{children}</>;
}
