import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_THEME_MODE,
  getThemePreferenceKey,
  getThemePreferenceScope,
  loadThemePreference,
  normalizeThemeMode,
  saveThemePreference,
} from './theme-preference';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

describe('account-scoped theme preference', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('uses a tenant + user scope instead of one device-wide key', () => {
    const admin = { organizationId: 'org-1', userId: 'admin-1' };
    const driver = { organizationId: 'org-1', userId: 'driver-1' };

    expect(getThemePreferenceScope(admin)).toBe('org-1:admin-1');
    expect(getThemePreferenceScope(driver)).toBe('org-1:driver-1');
    expect(getThemePreferenceKey(admin)).not.toBe(getThemePreferenceKey(driver));
    expect(getThemePreferenceKey({ organizationId: 'org-2', userId: 'admin-1' }))
      .not.toBe(getThemePreferenceKey(admin));
  });

  it('falls back to light when there is no authenticated account', async () => {
    expect(getThemePreferenceScope({ userId: null })).toBeNull();
    expect(normalizeThemeMode(null)).toBe(DEFAULT_THEME_MODE);
    await expect(loadThemePreference({ userId: null })).resolves.toBe('light');
  });

  it('does not leak an admin dark preference into a driver account', async () => {
    const admin = { organizationId: 'org-1', userId: 'admin-1' };
    const driver = { organizationId: 'org-1', userId: 'driver-1' };

    await saveThemePreference(admin, 'dark');

    await expect(loadThemePreference(admin)).resolves.toBe('dark');
    await expect(loadThemePreference(driver)).resolves.toBe('light');
  });

  it('restores each account preference independently', async () => {
    const admin = { organizationId: 'org-1', userId: 'admin-1' };
    const driver = { organizationId: 'org-1', userId: 'driver-1' };

    await saveThemePreference(admin, 'dark');
    await saveThemePreference(driver, 'light');

    await expect(loadThemePreference(admin)).resolves.toBe('dark');
    await expect(loadThemePreference(driver)).resolves.toBe('light');
  });
});
