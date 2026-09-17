const fs = require('node:fs');
const path = require('node:path');

const rootStorePath = path.join(__dirname, 'root-store.ts');

function readRootStore() {
  return fs.readFileSync(rootStorePath, 'utf8');
}

describe('root-store preferences wiring', () => {
  it('composes account-scoped preferences without a second device-wide theme key', () => {
    const source = readRootStore();

    expect(source).toMatch(/from ['"]\.\/slices\/preferences-slice['"]/);
    expect(source).toContain('createPreferencesSlice');
    expect(source).toContain('...createPreferencesSlice(set, get)');

    expect(source).not.toContain("const THEME_KEY = 'combis-theme-mode'");
    expect(source).not.toContain('getStoredItem(THEME_KEY)');
    expect(source).not.toMatch(/setThemeMode:\s*async/);
    expect(source).not.toMatch(/themeMode:\s*'light'/);
  });
});
