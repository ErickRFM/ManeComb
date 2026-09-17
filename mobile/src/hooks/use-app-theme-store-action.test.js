const fs = require('node:fs');
const path = require('node:path');

const hookPath = path.join(__dirname, 'use-app-theme.ts');

describe('useAppTheme store ownership', () => {
  it('uses the store preference action instead of persisting theme independently', () => {
    const source = fs.readFileSync(hookPath, 'utf8');

    expect(source).toContain('setThemeMode: state.setThemeMode');
    expect(source).not.toContain('saveThemePreference');
    expect(source).not.toMatch(/const\s+setThemeMode\s*=\s*useCallback/);
  });
});
