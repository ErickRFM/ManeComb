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

  it('starts from the existing light default', () => {
    const state = {
      user: null,
      themeMode: 'light' as const,
    };
    const slice = createPreferencesSlice(
      (partial) => Object.assign(state, partial),
      () => state
    );

    expect(slice.themeMode).toBe('light');
  });

  it('persists appearance by organization and user before updating state', async () => {
    const state: {
      user: { id: string; organizationId: string | null } | null;
      themeMode: 'light' | 'dark';
    } = {
      user: { id: 'driver-1', organizationId: 'org-1' },
      themeMode: 'light',
    };
    const set = jest.fn((partial: { themeMode?: 'light' | 'dark' }) => {
      Object.assign(state, partial);
    });
    const slice = createPreferencesSlice(set, () => state);

    await slice.setThemeMode('dark');

    await expect(
      loadThemePreference({ userId: 'driver-1', organizationId: 'org-1' })
    ).resolves.toBe('dark');
    expect(state.themeMode).toBe('dark');
    expect(set).toHaveBeenLastCalledWith({ themeMode: 'dark' });
  });

  it('does not persist an accountless theme or leave anonymous UI dark', async () => {
    const state: {
      user: { id: string; organizationId: string | null } | null;
      themeMode: 'light' | 'dark';
    } = {
      user: null,
      themeMode: 'dark',
    };
    const set = jest.fn((partial: { themeMode?: 'light' | 'dark' }) => {
      Object.assign(state, partial);
    });
    const slice = createPreferencesSlice(set, () => state);

    await slice.setThemeMode('dark');

    expect(state.themeMode).toBe('light');
    expect(await AsyncStorage.getAllKeys()).toEqual([]);
  });
});
