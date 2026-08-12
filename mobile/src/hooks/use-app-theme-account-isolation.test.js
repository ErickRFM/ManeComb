const fs = require('node:fs');
const path = require('node:path');

function source(relativePath) {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
}

describe('mobile theme account isolation contract', () => {
  const hook = source('src/hooks/use-app-theme.ts');

  it('keys appearance by the authenticated tenant and user', () => {
    expect(hook).toContain("organizationId: state.user?.organizationId || null");
    expect(hook).toContain("userId: state.user?.id || null");
    expect(hook).toContain('getThemePreferenceScope(owner)');
  });

  it('renders a safe light default while account B is hydrating', () => {
    expect(hook).toContain('activeThemeScope === themeScope ? themeMode : DEFAULT_THEME_MODE');
    expect(hook).toContain('useAppStore.setState({ themeMode: DEFAULT_THEME_MODE });');
  });

  it('persists through the account-scoped preference instead of the legacy global store setter', () => {
    expect(hook).toContain('loadThemePreference(owner)');
    expect(hook).toContain('saveThemePreference(owner, mode)');
    expect(hook).not.toContain('setThemeMode: state.setThemeMode');
  });
});
