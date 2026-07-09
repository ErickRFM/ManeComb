import type { AppState } from '../root-store';

export type AppStoreSelector<T> = (state: AppState) => T;

export const selectError = (state: AppState) => state.error;
export const selectClearError = (state: AppState) => state.clearError;
export const selectIsSubmitting = (state: AppState) => state.isSubmitting;
export const selectIsRefreshing = (state: AppState) => state.isRefreshing;
export const selectIsHydrated = (state: AppState) => state.isHydrated;
