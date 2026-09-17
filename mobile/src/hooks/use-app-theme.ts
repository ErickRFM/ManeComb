import { useCallback, useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { getAppTheme, getNavigationTheme, type ThemeMode } from '@/constants/theme';
import { useAppStore } from '@/src/store/use-app-store';
import {
  DEFAULT_THEME_MODE,
  getThemePreferenceScope,
  loadThemePreference,
  saveThemePreference,
} from '@/src/store/theme-preference';

let activeThemeScope: string | null | undefined;
let themeHydrationVersion = 0;

export function useAppTheme() {
  const { organizationId, themeMode, userId } = useAppStore(
    useShallow((state) => ({
      organizationId: state.user?.organizationId || null,
      themeMode: state.themeMode,
      userId: state.user?.id || null,
    }))
  );

  const owner = useMemo(
    () => ({ organizationId, userId }),
    [organizationId, userId]
  );
  const themeScope = useMemo(() => getThemePreferenceScope(owner), [owner]);

  // Never render account B with account A's appearance while its preference is
  // being loaded. Logged-out/auth screens deliberately fall back to light.
  const resolvedThemeMode =
    themeScope && activeThemeScope === themeScope ? themeMode : DEFAULT_THEME_MODE;

  useEffect(() => {
    if (activeThemeScope === themeScope) return;

    activeThemeScope = themeScope;
    const hydrationVersion = ++themeHydrationVersion;
    useAppStore.setState({ themeMode: DEFAULT_THEME_MODE });

    if (!themeScope) return;

    void loadThemePreference(owner).then((storedThemeMode) => {
      if (
        hydrationVersion !== themeHydrationVersion ||
        activeThemeScope !== themeScope
      ) {
        return;
      }

      useAppStore.setState({ themeMode: storedThemeMode });
    });
  }, [owner, themeScope]);

  const setThemeMode = useCallback(
    async (mode: ThemeMode) => {
      if (!themeScope) {
        useAppStore.setState({ themeMode: DEFAULT_THEME_MODE });
        return;
      }

      await saveThemePreference(owner, mode);
      if (activeThemeScope === themeScope) {
        useAppStore.setState({ themeMode: mode });
      }
    },
    [owner, themeScope]
  );

  const theme = useMemo(() => getAppTheme(resolvedThemeMode), [resolvedThemeMode]);
  const navigationTheme = useMemo(
    () => getNavigationTheme(resolvedThemeMode),
    [resolvedThemeMode]
  );

  return {
    isDark: resolvedThemeMode === 'dark',
    navigationTheme,
    setThemeMode,
    theme,
    themeMode: resolvedThemeMode,
  } as const;
}

export type AppThemeShape = ReturnType<typeof getAppTheme>;
export type AppThemeMode = ThemeMode;
