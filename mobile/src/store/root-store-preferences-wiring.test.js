const fs = require('node:fs');
const path = require('node:path');

describe('root-store preferences wiring', () => {
  it('composes account-scoped preferences without a device-wide theme key', () => {
    const source = fs.readFileSync(path.join(__dirname, 'root-store.ts'), 'utf8');

    expect(source).toMatch(/from ['"]\.\/slices\/preferences-slice['"]/);
    expect(source).toContain('...createPreferencesSlice(set, get)');
    expect(source).not.toContain("const THEME_KEY = 'combis-theme-mode'");
    expect(source).not.toContain('getStoredItem(THEME_KEY)');
    expect(source).not.toMatch(/setThemeMode:\s*async/);
    expect(source).not.toMatch(/themeMode:\s*'light'/);
  });
});
