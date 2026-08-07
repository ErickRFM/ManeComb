const fs = require('fs');
const path = require('path');
const nodeProcess = require('process');

export {};

function section(source: string, start: string, end: string) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe('Mobile startup stability contract', () => {
  const mobileRoot = nodeProcess.cwd();
  const client = fs.readFileSync(path.join(mobileRoot, 'src', 'api', 'client.ts'), 'utf8');
  const store = fs.readFileSync(path.join(mobileRoot, 'src', 'store', 'root-store.ts'), 'utf8');
  const app = fs.readFileSync(path.join(mobileRoot, 'App.tsx'), 'utf8');
  const gate = fs.readFileSync(
    path.join(mobileRoot, 'src', 'screens', 'mobile-account-gate-screen.tsx'),
    'utf8'
  );

  it('bounds cold-start session validation to one request policy', () => {
    const sessionRequest = section(client, 'export async function getSessionRequest', 'export async function refreshSessionRequest');
    expect(sessionRequest).toContain('COLD_START_SESSION_TIMEOUT_MS');
    expect(sessionRequest).toContain('_skipNetworkRetry: true');
  });

  it('never replays a rotating refresh token automatically', () => {
    const refreshRequest = section(client, 'export async function refreshSessionRequest', 'export async function forgotPasswordRequest');
    expect(refreshRequest).toContain('_skipAuthRefresh: true');
    expect(refreshRequest).toContain('_skipNetworkRetry: true');
    expect(refreshRequest).not.toContain('_allowRetry: true');
  });

  it('shows synchronization loading only while a request is active', () => {
    expect(gate).toContain("reason === 'sync_error' && isRefreshing && !error");
    expect(gate).not.toContain('useSyncWaitStage');
  });

  it('removes the unrelated location bypass from account bootstrap', () => {
    expect(app).toContain('bootTimedOut || bootstrapFailed');
    expect(app).not.toContain('continueWithoutLocation');
    expect(app).not.toContain('Continuar sin ubicacion');
  });

  it('preserves cached account authority and leaves optional data loading in background', () => {
    const initialize = section(store, 'initialize: async () =>', 'signIn: async');
    const signIn = section(store, 'signIn: async', 'signOut: async');
    expect(initialize).toContain('...cachedState');
    expect(initialize).not.toContain('refreshSessionRequest(rt');
    expect(initialize).toContain('sessionToken = get().token || sessionToken');
    expect(signIn).toContain('void get().refreshAll();');
    expect(signIn).not.toContain('await get().refreshAll();');
  });
});
