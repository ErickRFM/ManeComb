import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { getAppTheme, getNavigationTheme, type ThemeMode } from '@/constants/theme';
import { useAppStore } from '@/src/store/use-app-store';

export function useAppTheme() {
  const { setThemeMode, themeMode } = useAppStore(
    useShallow((state) => ({
      setThemeMode: state.setThemeMode,
      themeMode: state.themeMode,
    }))
  );

  const theme = useMemo(() => getAppTheme(themeMode), [themeMode]);
  const navigationTheme = useMemo(() => getNavigationTheme(themeMode), [themeMode]);

  return {
    isDark: themeMode === 'dark',
    navigationTheme,
    setThemeMode,
    theme,
    themeMode,
  } as const;
}

export type AppThemeShape = ReturnType<typeof getAppTheme>;
export type AppThemeMode = ThemeMode;
