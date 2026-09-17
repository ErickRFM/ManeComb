const fs = require('node:fs');
const path = require('node:path');

function source(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

describe('Mobile identity teardown boundary', () => {
  it('installs the extracted native lifecycle from the public store facade', () => {
    const facade = source('./use-app-store.ts');

    expect(facade).toContain("import { installNativeSessionLifecycle } from './native-session-lifecycle';");
    expect(facade).toContain('installApiSessionBoundary();');
    expect(facade).toContain('installNativeSessionLifecycle();');
    expect(facade).not.toContain('useAppStore.subscribe((state, previousState) =>');
  });

  it('cleans native push state whenever an authenticated identity becomes unauthenticated', () => {
    const lifecycle = source('./native-session-lifecycle.ts');

    expect(lifecycle).toContain('useAppStore.subscribe((state, previousState) =>');
    expect(lifecycle).toContain('previousState.token && previousState.user?.id');
    expect(lifecycle).toContain('state.token && state.user?.id');
    expect(lifecycle).toContain('identityJustEnded');
    expect(lifecycle).toContain('clearSessionNotifications()');
    expect(lifecycle).toContain('deleteNativePushToken()');
  });

  it('cleans native residue only after cold bootstrap confirms there is no identity', () => {
    const lifecycle = source('./native-session-lifecycle.ts');

    expect(lifecycle).toContain('unauthenticatedBootstrapJustSettled');
    expect(lifecycle).toContain('state.isHydrated');
    expect(lifecycle).toContain('!state.isBootstrapping');
    expect(lifecycle).toContain('!currentHasIdentity');
    expect(lifecycle).toContain('!previousState.isHydrated || previousState.isBootstrapping');
  });

  it('uses a global HMR guard instead of registering duplicate teardown observers', () => {
    const lifecycle = source('./native-session-lifecycle.ts');

    expect(lifecycle).toContain('__MANECOMB_NATIVE_SESSION_TEARDOWN_SUBSCRIBED__');
    expect(lifecycle).toContain('if (runtime.__MANECOMB_NATIVE_SESSION_TEARDOWN_SUBSCRIBED__) return;');
  });
});
