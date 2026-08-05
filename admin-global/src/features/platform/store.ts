import { create } from 'zustand';
import { platformCapabilitiesRequest, platformOverviewRequest } from './api';
import type { PlatformCapabilities, PlatformLoadState, PlatformOverview } from './types';

type PlatformStore = {
  state: PlatformLoadState;
  error: string | null;
  capabilities: PlatformCapabilities | null;
  overview: PlatformOverview | null;
  loadedForToken: string | null;
  load: (token: string, force?: boolean) => Promise<void>;
  reset: () => void;
};

export const usePlatformStore = create<PlatformStore>((set, get) => ({
  state: 'idle',
  error: null,
  capabilities: null,
  overview: null,
  loadedForToken: null,

  load: async (token: string, force = false) => {
    if (!token) return;

    const current = get();
    if (!force && current.state === 'ready' && current.loadedForToken === token) return;
    if (!force && current.state === 'loading' && current.loadedForToken === token) return;

    set({ state: 'loading', error: null, loadedForToken: token });

    try {
      const capabilities = await platformCapabilitiesRequest(token);
      const overview = capabilities.modules.companies
        ? await platformOverviewRequest(token)
        : null;

      set({
        state: 'ready',
        error: null,
        capabilities,
        overview,
        loadedForToken: token,
      });
    } catch (error) {
      set({
        state: 'error',
        error: error instanceof Error ? error.message : 'No fue posible cargar el Admin Global',
        loadedForToken: token,
      });
    }
  },

  reset: () => set({
    state: 'idle',
    error: null,
    capabilities: null,
    overview: null,
    loadedForToken: null,
  }),
}));
