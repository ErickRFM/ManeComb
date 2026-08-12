export type BrowserIdentityMarker = {
  identity: string;
  tabId: string;
  updatedAt: number;
};

type SingleBrowserIdentityCoordinatorOptions = {
  storageKey: string;
  channelName?: string;
  getCurrentIdentity: () => string | null;
  onDifferentIdentity: () => void;
};

function createTabId() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  return `tab:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
}

export function parseBrowserIdentityMarker(value: unknown): BrowserIdentityMarker | null {
  if (!value) return null;

  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== 'object') return null;
    const marker = parsed as Partial<BrowserIdentityMarker>;
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

/**
 * Autoridad compartida para mantener una sola identidad distinta por navegador.
 * Varias pestañas de la misma identidad son válidas. Cuando otra pestaña publica
 * una identidad diferente, la pestaña anterior cede el control mediante el
 * callback suministrado por cada producto.
 */
export function createSingleBrowserIdentityCoordinator(
  options: SingleBrowserIdentityCoordinatorOptions
) {
  const tabId = createTabId();
  const channelName = options.channelName || options.storageKey;
  let channel: BroadcastChannel | null = null;
  let storageListener: ((event: StorageEvent) => void) | null = null;

  const reconcile = (marker: BrowserIdentityMarker | null) => {
    const currentIdentity = options.getCurrentIdentity();
    if (
      currentIdentity &&
      marker &&
      marker.tabId !== tabId &&
      marker.identity !== currentIdentity
    ) {
      options.onDifferentIdentity();
    }
  };

  const writeMarker = (marker: BrowserIdentityMarker) => {
    try {
      window.localStorage.setItem(options.storageKey, JSON.stringify(marker));
    } catch {
      // BroadcastChannel sigue cubriendo navegadores con storage restringido.
    }
    channel?.postMessage(marker);
  };

  const clearOwnedMarker = () => {
    try {
      const current = parseBrowserIdentityMarker(
        window.localStorage.getItem(options.storageKey)
      );
      if (current?.tabId === tabId) {
        window.localStorage.removeItem(options.storageKey);
      }
    } catch {
      // La sesión en memoria de cada producto sigue siendo su autoridad local.
    }
  };

  return {
    start() {
      if (typeof window === 'undefined' || storageListener) return;

      storageListener = (event: StorageEvent) => {
        if (event.key !== options.storageKey) return;
        reconcile(parseBrowserIdentityMarker(event.newValue));
      };
      window.addEventListener('storage', storageListener);

      if (typeof BroadcastChannel !== 'undefined') {
        channel = new BroadcastChannel(channelName);
        channel.onmessage = (event: MessageEvent<unknown>) => {
          reconcile(parseBrowserIdentityMarker(event.data));
        };
      }
    },

    stop() {
      if (typeof window !== 'undefined' && storageListener) {
        window.removeEventListener('storage', storageListener);
      }
      storageListener = null;
      channel?.close();
      channel = null;
    },

    publish(identity: string | null) {
      if (typeof window === 'undefined') return;
      if (!identity) {
        clearOwnedMarker();
        return;
      }

      writeMarker({
        identity,
        tabId,
        updatedAt: Date.now(),
      });
    },
  } as const;
}
