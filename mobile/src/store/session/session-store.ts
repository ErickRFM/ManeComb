import { useAppStore } from '../root-store';
import type { AppState } from '../root-store';

export const selectSessionState = (state: AppState) => ({
  apiUrl: state.apiUrl,
  flushPendingSync: state.flushPendingSync,
  initialize: state.initialize,
  isBootstrapping: state.isBootstrapping,
  isHydrated: state.isHydrated,
  isRefreshing: state.isRefreshing,
  lastCacheAt: state.lastCacheAt,
  lastSyncedAt: state.lastSyncedAt,
  networkSnapshot: state.networkSnapshot,
  networkStatus: state.networkStatus,
  pendingSyncCount: state.pendingSyncCount,
  refreshAll: state.refreshAll,
});

export function useSessionStore<T>(selector: (state: AppState) => T) {
  return useAppStore(selector);
}
