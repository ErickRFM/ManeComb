const fs = require('node:fs');
const path = require('node:path');

describe('useAppTheme store ownership', () => {
  it('uses the preferences slice action instead of persisting independently', () => {
    const source = fs.readFileSync(path.join(__dirname, 'use-app-theme.ts'), 'utf8');

    expect(source).toContain('setThemeMode: state.setThemeMode');
    expect(source).not.toContain('saveThemePreference');
    expect(source).not.toMatch(/const\s+setThemeMode\s*=\s*useCallback/);
  });
});
