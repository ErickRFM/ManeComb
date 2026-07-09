import { useAppStore } from '../root-store';
import type { AppState } from '../root-store';

export const selectAuthState = (state: AppState) => ({
  activateDriverWithKey: state.activateDriverWithKey,
  authContext: state.authContext,
  connectionMode: state.connectionMode,
  error: state.error,
  isSubmitting: state.isSubmitting,
  refreshToken: state.refreshToken,
  register: state.register,
  signIn: state.signIn,
  signOut: state.signOut,
  token: state.token,
  user: state.user,
});

export function useAuthStore<T>(selector: (state: AppState) => T) {
  return useAppStore(selector);
}
