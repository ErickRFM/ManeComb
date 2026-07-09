import { useAppStore } from '../root-store';
import type { AppState } from '../root-store';

export const selectSettingsState = (state: AppState) => ({
  setThemeMode: state.setThemeMode,
  themeMode: state.themeMode,
});

export function useSettingsStore<T>(selector: (state: AppState) => T) {
  return useAppStore(selector);
}
