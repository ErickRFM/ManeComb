const fs = require('node:fs');
const path = require('node:path');

function source(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

function between(text, start, end) {
  const startIndex = text.indexOf(start);
  const endIndex = text.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) {
    throw new Error(`Could not isolate source section: ${start} -> ${end}`);
  }
  return text.slice(startIndex, endIndex);
}

describe('Mobile identity lifecycle boundary', () => {
  it('uses the existing session epoch as the single invalidation authority', () => {
    const epoch = source('./session-epoch.ts');
    const facade = source('./use-app-store.ts');
    const boundary = source('../api/api-session-boundary.ts');

    expect(epoch).toContain('export function subscribeSessionEpoch');
    expect(epoch).toContain('sessionEpochListeners.forEach');
    expect(boundary).toContain('subscribeSessionEpoch(() =>');
    expect(boundary).toContain('suspendSessionCredentialWrites()');
    expect(facade).toContain('installApiSessionBoundary();');
    expect(boundary).not.toMatch(/class\s+(Auth|Session).*Manager/i);
  });

  it('fences stale HTTP responses and blocks operational requests during teardown', () => {
    const boundary = source('../api/api-session-boundary.ts');

    expect(boundary).toContain('boundaryConfig._manecombSessionEpoch = getSessionEpoch()');
    expect(boundary).toContain('epoch !== getSessionEpoch()');
    expect(boundary).toContain("path === '/auth/logout'");
    expect(boundary).toContain("path.startsWith('/notifications/push-subscriptions/')");
    expect(boundary).toContain("path === '/auth/login'");
    expect(boundary).toContain('new StaleApiSessionError()');
    expect(boundary).not.toContain("path === '/auth/refresh'");
  });

  it('serializes every session-bound persisted value including the FCM token', () => {
    const secureStore = source('../native/secure-store.ts');

    expect(secureStore).toContain("'combis-session-token'");
    expect(secureStore).toContain("'combis-refresh-token'");
    expect(secureStore).toContain("'combis-session-mode'");
    expect(secureStore).toContain("'combis-push-token'");
    expect(secureStore).toContain('sessionCredentialMutationTail.then');
    expect(secureStore).toContain('sessionCredentialWritesSuspended');
    expect(secureStore).toContain('await serializeSessionCredentialMutation(remove)');
  });

  it('invalidates the epoch before push unregister and server logout', () => {
    const store = source('./root-store.ts');
    const signOut = between(store, 'signOut: async () => {', 'setThemeMode: async');

    const epochIndex = signOut.indexOf('beginSessionEpoch();');
    const unregisterIndex = signOut.indexOf('await unregisterPushSubscriptionRequest(pt);');
    const logoutIndex = signOut.indexOf('await logoutRequest(rt, pushTokenForLogout)');
    const clearIndex = signOut.indexOf('await clearSessionState(set);');

    expect(epochIndex).toBeGreaterThanOrEqual(0);
    expect(unregisterIndex).toBeGreaterThan(epochIndex);
    expect(logoutIndex).toBeGreaterThan(unregisterIndex);
    expect(clearIndex).toBeGreaterThan(logoutIndex);
  });

  it('binds offline replay to both epoch and user before local queue mutations', () => {
    const store = source('./root-store.ts');
    const replay = between(
      store,
      'async function processPendingSyncQueue',
      'export const useAppStore'
    );

    expect(replay).toContain('const replaySession = captureSessionIdentity(get);');
    expect(replay).toContain('isSessionIdentityCurrent(get, replaySession)');
    expect(replay).toMatch(/isSessionIdentityCurrent\(get, replaySession\)[\s\S]*removePendingSyncOperation/);
    expect(replay).toMatch(/catch \(error\)[\s\S]*isSessionIdentityCurrent\(get, replaySession\)[\s\S]*replacePendingSyncOperation/);
  });

  it('binds socket handlers and async hydration to the socket session identity', () => {
    const store = source('./root-store.ts');
    const socketSection = between(store, 'function connectSocket(', 'async function hydrateConversationMessage');

    expect(socketSection).toContain('const socketEpoch = getSessionEpoch();');
    expect(socketSection).toContain('const socketUserId = user.id;');
    expect(socketSection).toContain('const isSocketSessionCurrent = () =>');
    expect(socketSection).toMatch(/await hydrateConversationMessage[\s\S]*if \(!isSocketSessionCurrent\(\)\) return;/);
    expect(socketSection).toMatch(/chat:read[\s\S]*if \(!isSocketSessionCurrent\(\)\) return;/);
  });

  it('normalizes transient UI work when an identity ends', () => {
    const facade = source('./use-app-store.ts');
    const observer = between(
      facade,
      'function ensureNativeSessionTeardownObserver()',
      '// Se instala antes'
    );

    expect(observer).toContain('identityJustEnded');
    expect(observer).toContain('isSubmitting: false');
    expect(observer).toContain('isLoadingConversation: false');
    expect(observer).toContain('isLoadingChatContacts: false');
    expect(observer).toContain('teardownNativeSessionResources();');
  });
});
