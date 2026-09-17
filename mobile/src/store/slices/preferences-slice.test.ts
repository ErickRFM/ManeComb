import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadThemePreference } from '../theme-preference';
import { createPreferencesSlice } from './preferences-slice';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

describe('preferences slice', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('uses the existing light default', () => {
    const state = { user: null, themeMode: 'light' as const };
    const slice = createPreferencesSlice(
      (partial) => Object.assign(state, partial),
      () => state
    );
    expect(slice.themeMode).toBe('light');
  });

  it('persists by organization + user and updates the active owner only', async () => {
    const state: {
      user: { id: string; organizationId: string | null } | null;
      themeMode: 'light' | 'dark';
    } = {
      user: { id: 'driver-1', organizationId: 'org-1' },
      themeMode: 'light',
    };
    const slice = createPreferencesSlice(
      (partial) => Object.assign(state, partial),
      () => state
    );

    await slice.setThemeMode('dark');

    await expect(loadThemePreference({
      userId: 'driver-1',
      organizationId: 'org-1',
    })).resolves.toBe('dark');
    expect(state.themeMode).toBe('dark');
  });

  it('keeps anonymous appearance light without persistence', async () => {
    const state: {
      user: { id: string; organizationId: string | null } | null;
      themeMode: 'light' | 'dark';
    } = { user: null, themeMode: 'dark' };

    const slice = createPreferencesSlice(
      (partial) => Object.assign(state, partial),
      () => state
    );

    await slice.setThemeMode('dark');

    expect(state.themeMode).toBe('light');
    expect(await AsyncStorage.getAllKeys()).toEqual([]);
  });
});
