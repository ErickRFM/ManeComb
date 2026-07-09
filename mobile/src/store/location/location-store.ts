import { useAppStore } from '../root-store';
import type { AppState } from '../root-store';

export const selectLocationState = (state: AppState) => ({
  connectionMode: state.connectionMode,
  mapData: state.mapData,
  networkStatus: state.networkStatus,
  pendingSyncCount: state.pendingSyncCount,
  sendVehicleLocation: state.sendVehicleLocation,
});

export function useLocationStore<T>(selector: (state: AppState) => T) {
  return useAppStore(selector);
}
