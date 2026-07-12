import { useAppStore } from '../root-store';
import type { AppState } from '../root-store';

export const selectFleetState = (state: AppState) => ({
  mapData: state.mapData,
  refreshAll: state.refreshAll,
});

export function useFleetStore<T>(selector: (state: AppState) => T) {
  return useAppStore(selector);
}
