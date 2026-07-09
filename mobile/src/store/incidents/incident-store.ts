import { useAppStore } from '../root-store';
import type { AppState } from '../root-store';

export const selectIncidentState = (state: AppState) => ({
  createIncident: state.createIncident,
  focusedIncidentId: state.focusedIncidentId,
  incidents: state.incidents,
  setFocusedIncidentId: state.setFocusedIncidentId,
  updateIncidentStatus: state.updateIncidentStatus,
});

export function useIncidentStore<T>(selector: (state: AppState) => T) {
  return useAppStore(selector);
}
