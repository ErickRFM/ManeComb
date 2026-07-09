import type { AppState } from '../root-store';

export type StoreAction<K extends keyof AppState> = AppState[K];

export const selectRefreshAll = (state: AppState) => state.refreshAll;
export const selectFlushPendingSync = (state: AppState) => state.flushPendingSync;
