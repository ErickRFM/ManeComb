import { useCallback, useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { getAppTheme, getNavigationTheme, type ThemeMode } from '@/constants/theme';
import { useAppStore } from '@/src/store/use-app-store';
import {
  clearLegacyThemePreference,
  resolveAccountThemePreference,
  writeAccountThemePreference,
} from '@/src/store/theme-preference';

let reconciledUserId: string | null | undefined;
let reconciliationSequence = 0;
let legacyMigrationAvailable = true;

function reconcileAccountTheme(userId: string | null, isHydrated: boolean) {
  if (!isHydrated || reconciledUserId === userId) return;

  const previousUserId = reconciledUserId;
  reconciledUserId = userId;
  const sequence = ++reconciliationSequence;

  if (!userId) {
    legacyMigrationAvailable = false;
    useAppStore.setState({ themeMode: 'light' });
    void clearLegacyThemePreference();
    return;
  }

  const allowLegacyMigration =
    legacyMigrationAvailable &&
    (previousUserId === undefined || previousUserId === null);
  legacyMigrationAvailable = false;

  // During an account switch never render the previous account's appearance
  // while the new preference is loading. A remembered cold-start session may
  // keep the legacy value briefly so it can be migrated to that same account.
  if (!allowLegacyMigration) {
    useAppStore.setState({ themeMode: 'light' });
  }

  void resolveAccountThemePreference(userId, { allowLegacyMigration }).then((mode) => {
    if (
      sequence === reconciliationSequence &&
      useAppStore.getState().user?.id === userId
    ) {
      useAppStore.setState({ themeMode: mode });
    }
  });
}

export function useAppTheme() {
  const { isHydrated, themeMode, userId } = useAppStore(
    useShallow((state) => ({
      isHydrated: state.isHydrated,
      themeMode: state.themeMode,
      userId: state.user?.id || null,
    }))
  );

  useEffect(() => {
    reconcileAccountTheme(userId, isHydrated);
  }, [isHydrated, userId]);

  const setThemeMode = useCallback(async (mode: ThemeMode) => {
    const activeUserId = useAppStore.getState().user?.id || null;

    if (!activeUserId) {
      useAppStore.setState({ themeMode: 'light' });
      return;
    }

    useAppStore.setState({ themeMode: mode });
    await writeAccountThemePreference(activeUserId, mode);
  }, []);

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
