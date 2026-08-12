import {
  REALTIME_DIAG_TAG,
  isRealtimeDiagEnabled,
  logRealtimeDiag,
  sanitizeRealtimeDiagFields,
} from './realtime-diagnostics-log';

const fs = jest.requireActual('fs') as {
  readFileSync: (filePath: string, encoding: string) => string;
};

function source(relativePath: string) {
  return fs.readFileSync(`src/store/${relativePath}`, 'utf8');
}

const diagModule = source('realtime-diagnostics-log.ts');
const rootStore = source('root-store.ts');
const appStore = source('use-app-store.ts');
const callStore = source('../features/calls/call-store.ts');
const instrumented = [rootStore, appStore, callStore];

describe('realtime diagnostics payload safety', () => {
  it('never emits credentials, even if a caller passes them by mistake', () => {
    const safe = sanitizeRealtimeDiagFields({
      token: 'ey.should.not.appear',
      accessToken: 'nope',
      access_token: 'nope',
      refreshToken: 'nope',
      refresh_token: 'nope',
      authorization: 'Bearer nope',
      auth: { token: 'nope' },
      password: 'nope',
      secret: 'nope',
      jwt: 'nope',
      credentials: 'nope',
      socketId: 'abc123',
      accessTokenChanged: true,
    });

    expect(safe).toEqual({ socketId: 'abc123', accessTokenChanged: true });
    expect(JSON.stringify(safe)).not.toContain('nope');
    expect(JSON.stringify(safe)).not.toContain('ey.should.not.appear');
  });

  it('drops undefined fields so the log stays readable', () => {
    expect(sanitizeRealtimeDiagFields({ a: undefined, b: null, c: 0 })).toEqual({ b: null, c: 0 });
  });

  it('reports token rotation as a boolean and never as a value or hash', () => {
    // El unico dato de token admitido es si cambio, porque es lo que decide si
    // connectSocket vera una sessionKey distinta.
    expect(rootStore).toContain('accessTokenChanged: get().token !== tokenBefore');
    expect(rootStore).not.toMatch(/logRealtimeDiag\([^)]*\btoken:\s*(?!null)/);
    for (const text of instrumented) {
      expect(text).not.toMatch(/logRealtimeDiag\([\s\S]{0,400}?(sha256|hash\(|\.slice\(0,\s*\d+\).*token)/i);
    }
  });
});

describe('realtime diagnostics is inert in production', () => {
  const runtime = globalThis as typeof globalThis & { __DEV__?: boolean };
  const originalDev = runtime.__DEV__;

  afterEach(() => {
    runtime.__DEV__ = originalDev;
    jest.restoreAllMocks();
  });

  it('emits nothing when the runtime is not DEV', () => {
    runtime.__DEV__ = false;
    const spy = jest.spyOn(console, 'info').mockImplementation(() => undefined);

    expect(isRealtimeDiagEnabled()).toBe(false);
    logRealtimeDiag('connect_error', { reason: 'unauthorized' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('emits a single tagged line with sanitized fields in DEV', () => {
    runtime.__DEV__ = true;
    const spy = jest.spyOn(console, 'info').mockImplementation(() => undefined);

    logRealtimeDiag('connect_error', { reason: 'unauthorized', token: 'must-not-appear' });

    expect(spy).toHaveBeenCalledTimes(1);
    const [line, fields] = spy.mock.calls[0];
    expect(String(line)).toContain('[MC_REALTIME_DIAG]');
    expect(String(line)).toContain('connect_error');
    expect(fields).toEqual({ reason: 'unauthorized' });
    expect(JSON.stringify(fields)).not.toContain('must-not-appear');
  });

  it('uses one greppable tag', () => {
    expect(REALTIME_DIAG_TAG).toBe('MC_REALTIME_DIAG');
  });
});

describe('instrumentation does not change realtime behaviour', () => {
  it('adds no second socket client', () => {
    expect(diagModule).not.toContain('socket.io-client');
    expect(diagModule).not.toMatch(/\bio\(/);
    // root-store sigue siendo el unico que construye el socket compartido.
    expect((rootStore.match(/=\s*io\(SOCKET_URL/g) || []).length).toBe(1);
    expect(appStore).not.toMatch(/\bio\(/);
    expect(callStore).not.toMatch(/\bio\(/);
  });

  it('adds no timer, interval or reconnect loop', () => {
    expect(diagModule).not.toContain('setTimeout');
    expect(diagModule).not.toContain('setInterval');
    expect(diagModule).not.toContain('connect(');
  });

  it('keeps the diagnostics module free of state and side effects', () => {
    // Solo funciones puras + una escritura de consola: nada que desvie el flujo.
    expect(diagModule).not.toContain('useAppStore');
    expect(diagModule).not.toMatch(/^let /m);
  });

  it('stays a dependency-free leaf so no consumer inherits new imports', () => {
    // Importar api_config aqui arrastraria react-native-config hasta Calls y
    // rompia sus pruebas aisladas: la instrumentacion no puede tener ese alcance.
    expect(diagModule).not.toMatch(/^import /m);
    expect(callStore).toContain("import { logRealtimeDiag } from '@/src/store/realtime-diagnostics-log'");
    expect(callStore).not.toContain("from '@/src/store/root-store'");
  });

  it('preserves the auth failure policy untouched', () => {
    // Los umbrales y transiciones que gobiernan el estado terminal siguen igual:
    // esta tanda observa, no corrige.
    expect(rootStore).toContain("if (socketAuthRetries >= 1) {");
    expect(rootStore).toContain("setSocketTransition(set, 'unauthorized', 'socket_auth_retry_exhausted');");
    expect(rootStore).toContain("setSocketTransition(set, 'unauthorized', 'socket_auth_refresh_token_missing');");
    expect(rootStore).toContain('socketAuthRetries += 1;');
  });

  it('preserves the shared socket discovery policy untouched', () => {
    const policy = source('shared-realtime-socket.ts');
    expect(policy).toContain('export const SHARED_SOCKET_DISCOVERY_INTERVAL_MS = 25;');
    expect(policy).toContain('export const SHARED_SOCKET_DISCOVERY_MAX_ATTEMPTS = 160;');
    expect(policy).toContain('if (!input.hasSession || input.hasSocket) return false;');
    // El log lee la misma decision que ya gobernaba el polling; no la duplica.
    expect(appStore).toContain('const keepPolling = shouldRetrySharedRealtimeSocket({');
    expect(appStore).toContain('if (keepPolling) {');
  });

  it('logs call socket binding only on real instance transitions', () => {
    const bind = callStore.slice(
      callStore.indexOf('bindSocket: (socket) => {'),
      callStore.indexOf('unbindSocket: () => {')
    );
    // El early-return por instancia identica precede al log: nunca por render.
    expect(bind.indexOf('if (current === socket) return;')).toBeLessThan(
      bind.indexOf('logRealtimeDiag(')
    );
  });

  it('tags every connectSocket entry point so the trigger is identifiable', () => {
    expect(rootStore).toContain("diagTrigger: 'applyRefreshedSession'");
    expect(rootStore).toContain("diagTrigger: 'foregroundRecovery'");
    expect(rootStore).toContain("diagTrigger: 'healthcheckSocketDown'");
    expect(rootStore).toContain("diagTrigger: 'healthcheckStaleHeartbeat'");
    // diagTrigger es opcional: no altera la firma efectiva de connectSocket.
    expect(rootStore).toContain('options: { forceFreshTransport?: boolean; diagTrigger?: string } = {}');
  });
});


