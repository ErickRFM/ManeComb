import { useAppStore } from '../root-store';
import type { AppState } from '../root-store';

export const selectNotificationState = (state: AppState) => ({
  handlePushIntent: state.handlePushIntent,
  markNotificationRead: state.markNotificationRead,
  notifications: state.notifications,
});

export function useNotificationStore<T>(selector: (state: AppState) => T) {
  return useAppStore(selector);
}
