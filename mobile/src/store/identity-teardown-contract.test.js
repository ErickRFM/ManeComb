const fs = require('node:fs');
const path = require('node:path');

function source(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

describe('Mobile identity teardown boundary', () => {
  it('cleans native push state whenever an authenticated identity becomes unauthenticated', () => {
    const facade = source('./use-app-store.ts');

    expect(facade).toContain('useAppStore.subscribe((state, previousState) =>');
    expect(facade).toContain('previousState.token && previousState.user?.id');
    expect(facade).toContain('state.token && state.user?.id');
    expect(facade).toContain('clearSessionNotifications()');
    expect(facade).toContain('deleteNativePushToken()');
  });

  it('uses a global HMR guard instead of registering duplicate teardown observers', () => {
    const facade = source('./use-app-store.ts');

    expect(facade).toContain('__MANECOMB_NATIVE_SESSION_TEARDOWN_SUBSCRIBED__');
    expect(facade).toContain('if (runtime.__MANECOMB_NATIVE_SESSION_TEARDOWN_SUBSCRIBED__) return;');
  });
});
