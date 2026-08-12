const fs = require('node:fs');
const path = require('node:path');

const mobileRoot = path.resolve(__dirname, '../..');
const read = (relativePath) => fs.readFileSync(path.join(mobileRoot, relativePath), 'utf8').replace(/\r\n/g, '\n');

const auth = read('src/screens/customer-auth-screen.tsx');
const store = read('src/store/root-store.ts');
const offline = read('src/api/offline-cache.ts');
const theme = read('src/hooks/use-app-theme.ts');

 describe('single account mobile runtime contract', () => {
  it('never exposes login/register over an already authenticated identity', () => {
    expect(auth).toContain('if (user) {');
    expect(auth).toContain('return <Redirect href={getAuthenticatedHome(user, authContext) as never} />;');
  });

  it('invalidates and tears down the previous runtime before logout completes', () => {
    expect(store).toContain('beginSessionEpoch();');
    expect(store).toContain('disconnectSocket();');
    expect(store).toContain('cleanupSessionRuntime();');
    expect(store).toContain('hardResetBackgroundLocationServiceAsync()');
    expect(store).toContain('unregisterPushSubscriptionRequest');
    expect(store).toContain('await clearSessionState(set);');
  });

  it('clears tenant cache and pending sync work before adopting another account', () => {
    expect(store).toContain('await clearTenantCache();');
    expect(store).toContain('await clearTenantCache();\n  setAuthToken(token);');
    expect(offline).toContain('await AsyncStorage.removeItem(CACHE_KEY);');
    expect(offline).toContain('await AsyncStorage.removeItem(QUEUE_KEY);');
  });

  it('keeps appearance isolated by organization and user', () => {
    expect(theme).toContain('organizationId: state.user?.organizationId || null');
    expect(theme).toContain('userId: state.user?.id || null');
    expect(theme).toContain('getThemePreferenceScope(owner)');
  });
});
