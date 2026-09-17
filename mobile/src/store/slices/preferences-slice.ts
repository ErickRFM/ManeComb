import type { ThemeMode } from '@/constants/theme';
import {
  DEFAULT_THEME_MODE,
  getThemePreferenceScope,
  saveThemePreference,
  type ThemePreferenceOwner,
} from '../theme-preference';

type PreferencesUser = {
  id: string;
  organizationId?: string | null;
};

type PreferencesStoreView = {
  user: PreferencesUser | null;
};

type PreferencesSet = (partial: { themeMode: ThemeMode }) => void;
type PreferencesGet = () => PreferencesStoreView;

export type PreferencesSlice = {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
};

function getPreferenceOwner(state: PreferencesStoreView): ThemePreferenceOwner {
  return {
    userId: state.user?.id || null,
    organizationId: state.user?.organizationId || null,
  };
}

export function createPreferencesSlice(
  set: PreferencesSet,
  get: PreferencesGet
): PreferencesSlice {
  return {
    themeMode: DEFAULT_THEME_MODE,

    async setThemeMode(mode) {
      const owner = getPreferenceOwner(get());
      const scope = getThemePreferenceScope(owner);

      if (!scope) {
        set({ themeMode: DEFAULT_THEME_MODE });
        return;
      }

      await saveThemePreference(owner, mode);

      // A preference write can outlive logout/account switching. Only apply it
      // to Zustand when the same tenant + user still owns the active session.
      if (getThemePreferenceScope(getPreferenceOwner(get())) === scope) {
        set({ themeMode: mode });
      }
    },
  };
}
