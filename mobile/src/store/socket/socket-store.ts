import { useAppStore } from '../root-store';
import type { AppState } from '../root-store';

export const selectSocketState = (state: AppState) => ({
  networkStatus: state.networkStatus,
  realtimeDiagnostics: state.realtimeDiagnostics,
  socketStatus: state.socketStatus,
});

export function useSocketStore<T>(selector: (state: AppState) => T) {
  return useAppStore(selector);
}
