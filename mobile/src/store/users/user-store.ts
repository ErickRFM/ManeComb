import { useAppStore } from '../root-store';
import type { AppState } from '../root-store';

export const selectUserState = (state: AppState) => ({
  createUser: state.createUser,
  deleteUser: state.deleteUser,
  loadUsers: state.loadUsers,
  updateProfile: state.updateProfile,
  updateUser: state.updateUser,
  user: state.user,
  users: state.users,
});

export function useUserStore<T>(selector: (state: AppState) => T) {
  return useAppStore(selector);
}
