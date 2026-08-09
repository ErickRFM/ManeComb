const fs = require('node:fs');
const path = require('node:path');

function source(relativePath) {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
}

function section(text, start, end) {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return text.slice(from, to);
}

describe('Mobile startup stability contract', () => {
  const client = source('src/api/client.ts');
  const store = source('src/store/root-store.ts');
  const app = source('App.tsx');
  const gate = source('src/screens/mobile-account-gate-screen.tsx');

  it('bounds cold-start session validation to one network request policy', () => {
    const request = section(client, 'export async function getSessionRequest', 'export async function refreshSessionRequest');
    expect(request).toContain('COLD_START_SESSION_TIMEOUT_MS');
    expect(request).toContain('_skipNetworkRetry: true');
  });

  it('never automatically replays a rotating refresh token', () => {
    const request = section(client, 'export async function refreshSessionRequest', 'export async function forgotPasswordRequest');
    expect(request).toContain('_skipAuthRefresh: true');
    expect(request).toContain('_skipNetworkRetry: true');
    expect(request).not.toContain('_allowRetry: true');
  });

  it('shows synchronization loading only while refreshAll is active', () => {
    expect(gate).toContain("reason === 'sync_error' && isRefreshing && !error");
    expect(gate).not.toContain('useSyncWaitStage');
  });

  it('does not turn a GPS problem into an authentication bypass', () => {
    expect(app).toContain('bootTimedOut || bootstrapFailed');
    expect(app).not.toContain('continueWithoutLocation');
    expect(app).not.toContain('Continuar sin ubicacion');
  });

  it('closes the boot lifecycle when the session is cleared', () => {
    // `initialize` marca `isBootstrapping: true` y luego abandona sus escrituras
    // si el epoch cambio. Quien invalida el epoch es `clearSessionState`, asi que
    // es esa funcion la que debe declarar el estado de arranque resultante. Sin
    // esto la app se queda en el loader de arranque indefinidamente tras un
    // logout concurrente con un `/auth/me` en vuelo.
    const clear = section(store, 'async function clearSessionState', 'function isPlanRequiredError');
    expect(clear).toContain('beginSessionEpoch();');
    expect(clear).toContain('isBootstrapping: false');
    expect(clear).toContain('isHydrated: true');
  });

  it('does not keep dead splash lifecycle in the root component', () => {
    // No existe modulo de splash nativo en el proyecto; cualquier `hideSplash`
    // es un efecto que no hace nada y confunde el diagnostico de arranque.
    expect(app).not.toContain('hideSplash');
    expect(app).not.toContain('splashHidden');
  });

  it('preserves cached authority and leaves optional operational hydration in background', () => {
    const initialize = section(store, 'initialize: async () =>', 'signIn: async');
    const signIn = section(store, 'signIn: async', 'signOut: async');
    expect(initialize).toContain('...cachedState');
    expect(initialize).not.toContain('refreshSessionRequest(rt');
    expect(initialize).toContain('sessionToken = get().token || sessionToken');
    expect(signIn).toContain('void get().refreshAll();');
    expect(signIn).not.toContain('await get().refreshAll();');
  });
});
