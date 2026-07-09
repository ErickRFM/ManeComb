import type { AppState } from '../root-store';

export type StoreSetter = (
  partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)
) => void;

export type StoreGetter = () => AppState;
