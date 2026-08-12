const fs = require('node:fs');
const path = require('node:path');

function source(relativePath) {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
}

describe('Mobile account-scoped theme contract', () => {
  const hook = source('src/hooks/use-app-theme.ts');
  const preference = source('src/store/theme-preference.ts');

  it('persists appearance with an account-specific storage key', () => {
    expect(preference).toContain("const ACCOUNT_THEME_KEY_PREFIX = 'combis-theme-mode:account:';");
    expect(preference).toContain('encodeURIComponent');
    expect(preference).toContain('readAccountThemePreference(userId)');
    expect(preference).toContain('writeAccountThemePreference(userId, legacyTheme)');
  });

  it('does not use the legacy device-global setter as the UI authority', () => {
    expect(hook).not.toContain('setThemeMode: state.setThemeMode');
    expect(hook).toContain('writeAccountThemePreference(activeUserId, mode)');
    expect(hook).toContain("useAppStore.setState({ themeMode: mode });");
  });

  it('returns the unauthenticated shell to light mode between accounts', () => {
    expect(hook).toContain('if (!userId)');
    expect(hook).toContain("useAppStore.setState({ themeMode: 'light' });");
    expect(hook).toContain('clearLegacyThemePreference()');
  });

  it('never renders the previous account theme while the next preference loads', () => {
    expect(hook).toContain('if (!allowLegacyMigration)');
    expect(hook).toContain("useAppStore.setState({ themeMode: 'light' });");
    expect(hook).toContain('resolveAccountThemePreference(userId, { allowLegacyMigration })');
    expect(hook).toContain('useAppStore.getState().user?.id === userId');
    expect(hook).toContain('sequence === reconciliationSequence');
  });

  it('migrates the old device preference only for a remembered cold-start identity', () => {
    expect(hook).toContain('let legacyMigrationAvailable = true;');
    expect(hook).toContain('previousUserId === undefined || previousUserId === null');
    expect(hook).toContain('legacyMigrationAvailable = false;');
    expect(preference).toContain('if (options.allowLegacyMigration)');
    expect(preference).toContain('if (migrated) await clearLegacyThemePreference();');
  });

  it('defaults a new account with no saved preference to light', () => {
    expect(preference).toContain("return 'light';");
  });
});
