from pathlib import Path
import re


TARGETS = {
    "client": Path("mobile/src/api/client.ts"),
    "gate": Path("mobile/src/screens/mobile-account-gate-screen.tsx"),
    "app": Path("mobile/App.tsx"),
    "store": Path("mobile/src/store/root-store.ts"),
    "package": Path("mobile/package.json"),
}


def read_sources():
    return {name: path.read_text(encoding="utf-8") for name, path in TARGETS.items()}


def replace_exact(text: str, label: str, old: str, new: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one exact match, found {count}")
    return text.replace(old, new, 1)


def replace_regex(text: str, label: str, pattern: str, replacement: str) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{label}: expected one regex match, found {count}")
    return updated


sources = read_sources()
outputs = dict(sources)

# 1. Network policy: one bounded cold-start GET and no replay of rotating refresh tokens.
outputs["client"] = replace_exact(
    outputs["client"],
    "client cold-start request",
    """    options.coldStart
      ? { params, timeout: COLD_START_SESSION_TIMEOUT_MS }
      : { params }
""",
    """    options.coldStart
      ? {
          params,
          timeout: COLD_START_SESSION_TIMEOUT_MS,
          _skipNetworkRetry: true,
        } as RetryableRequestConfig
      : { params }
""",
)
outputs["client"] = replace_exact(
    outputs["client"],
    "client rotating refresh request",
    """export async function refreshSessionRequest(refreshToken: string, appVersion?: string) {
  const response = await apiClient.post<LoginResult>('/auth/refresh', {
    refreshToken,
    appVersion,
  }, {
    _allowRetry: true,
    _skipAuthRefresh: true,
  } as RetryableRequestConfig);

  return response.data;
}
""",
    """export async function refreshSessionRequest(refreshToken: string, appVersion?: string) {
  const response = await apiClient.post<LoginResult>('/auth/refresh', {
    refreshToken,
    appVersion,
  }, {
    _skipAuthRefresh: true,
    _skipNetworkRetry: true,
  } as RetryableRequestConfig);

  return response.data;
}
""",
)

# 2. Sync-error route: a loader is valid only while refreshAll is actually active.
gate = outputs["gate"]
gate = replace_exact(
    gate,
    "gate wait-stage import",
    "import { useSyncWaitStage } from '@/src/hooks/use-sync-wait-stage';\n",
    "",
)
gate = replace_exact(
    gate,
    "gate wait-stage hook",
    "  const waitStage = useSyncWaitStage(reason === 'sync_error' && !isSigningOut && !error);\n",
    "",
)
gate = replace_exact(
    gate,
    "gate passive loader",
    """  if (reason === 'sync_error' && !error && waitStage !== 'expired') {
    return <BrandSyncLoader stage={waitStage === 'slow' ? 'slow' : 'loading'} />;
  }
""",
    """  if (reason === 'sync_error' && isRefreshing && !error) {
    return <BrandSyncLoader />;
  }
""",
)
outputs["gate"] = gate

# 3. Root bootstrap recovery: remove the unrelated location bypass and surface terminal errors.
app = outputs["app"]
for label, old in (
    ("app continueLabel parameter", "  continueLabel,\n"),
    ("app onContinue parameter", "  onContinue,\n"),
    ("app continueLabel type", "  continueLabel?: string;\n"),
    ("app onContinue type", "  onContinue?: () => void;\n"),
):
    app = replace_exact(app, label, old, "")

app = replace_regex(
    app,
    "app recoverable continue button",
    r"\n        \{onContinue \? \(.*?\n        \) : null\}",
    "",
)
app = replace_regex(
    app,
    "app continueWithoutLocation callback",
    r"\n  const continueWithoutLocation = useCallback\(\(\) => \{.*?\n  \}, \[authContext, user\]\);\n",
    "\n",
)

for label, old, new in (
    (
        "app store selection",
        "  const { authContext, handlePushIntent, initialize, isHydrated, isBootstrapping, user } = useAppStore(\n",
        "  const { authContext, error, handlePushIntent, initialize, isHydrated, isBootstrapping, user } = useAppStore(\n",
    ),
    (
        "app selected error",
        "      authContext: state.authContext,\n      handlePushIntent: state.handlePushIntent,\n",
        "      authContext: state.authContext,\n      error: state.error,\n      handlePushIntent: state.handlePushIntent,\n",
    ),
    (
        "app bootstrap failed state",
        "  const isReady = isHydrated && !isBootstrapping;\n",
        "  const isReady = isHydrated && !isBootstrapping;\n  const bootstrapFailed = !isReady && !isBootstrapping && Boolean(error);\n",
    ),
    (
        "app recovery condition",
        "                bootTimedOut ? (\n",
        "                bootTimedOut || bootstrapFailed ? (\n",
    ),
    (
        "app recovery message",
        """                    message="La sesion tardo demasiado en cargar. Reintenta la sincronizacion o inicia sesion de nuevo."
                    continueLabel="Continuar sin ubicacion"
                    onContinue={user ? continueWithoutLocation : undefined}
""",
        """                    message={error || 'La sesion tardo demasiado en cargar. Reintenta la sincronizacion o inicia sesion de nuevo.'}
""",
    ),
):
    app = replace_exact(app, label, old, new)
outputs["app"] = app

# 4. Store: preserve cached authority, avoid duplicate refresh and retain renewed credentials.
store = outputs["store"]
store = replace_exact(
    store,
    "store initialize session block",
    """      setAuthToken(t);
      let sessionToken = t;
      let nextRefreshToken = rt;
      let s: SessionResult;
      try {
        s = await getSessionRequest({ coldStart: true, appVersion: APP_VERSION });
      } catch (error) {
        if (isSessionEpochStale(epoch)) return;
        if (isProbablyNetworkError(error) && cached?.user) {
          set({
            ...getEmptyOperationalState(),
            connectionMode,
            token: sessionToken,
            refreshToken: nextRefreshToken,
            themeMode: th === 'dark' ? 'dark' : 'light',
            user: cached.user,
            authContext: null,
            lastCacheAt: cached.savedAt,
            isHydrated: true,
            isBootstrapping: false,
            networkStatus: 'recovering',
            error: 'No pudimos sincronizar tu cuenta. Reintenta cuando el servidor responda.',
          });
          return;
        }
        if (!rt) throw error;
        const refreshed = await refreshSessionRequest(rt, APP_VERSION);
        sessionToken = refreshed.token;
        nextRefreshToken = refreshed.refreshToken || rt;
        setAuthToken(sessionToken);
        await persistSession(sessionToken, connectionMode, nextRefreshToken);
        s = await getSessionRequest({ coldStart: true, appVersion: APP_VERSION });
      }
""",
    """      setAuthToken(t);
      let sessionToken = t;
      let nextRefreshToken = rt;
      let s: SessionResult;
      try {
        // `/auth/me` already owns 401 recovery through the Axios interceptor.
        // A second manual refresh here could replay a rotating refresh token.
        s = await getSessionRequest({ coldStart: true, appVersion: APP_VERSION });
        sessionToken = get().token || sessionToken;
        nextRefreshToken = get().refreshToken || nextRefreshToken;
      } catch (error) {
        if (isSessionEpochStale(epoch)) return;
        if (isProbablyNetworkError(error)) {
          const startupError = getReadableErrorMessage(
            error,
            'No pudimos conectar con el servidor. Reintenta cuando responda.',
            networkSnapshot
          );

          if (cached?.user) {
            const cachedState = stateFromCache(cached);
            const hasCachedAuthority = Boolean(cachedState.authContext);
            set({
              ...getEmptyOperationalState(),
              ...cachedState,
              connectionMode,
              token: get().token || sessionToken,
              refreshToken: get().refreshToken || nextRefreshToken,
              themeMode: th === 'dark' ? 'dark' : 'light',
              isHydrated: true,
              isBootstrapping: false,
              networkStatus: 'offline',
              error: hasCachedAuthority ? null : startupError,
            });
            return;
          }

          // Keep persisted credentials for an explicit retry, without leaving a
          // stale Authorization header active while recovery is shown.
          setAuthToken(null);
          set({
            ...getEmptyOperationalState(),
            connectionMode,
            token: null,
            refreshToken: null,
            authContext: null,
            user: null,
            themeMode: th === 'dark' ? 'dark' : 'light',
            isHydrated: false,
            isBootstrapping: false,
            networkStatus: 'offline',
            error: startupError,
          });
          return;
        }
        throw error;
      }
""",
)

store, sign_in_count = re.subn(
    r"""(if\s*\(\s*shouldRefreshOperationalData\(\s*authContext\s*,\s*session\.profile\.user\s*\)\s*\)\s*\{\s*)await\s+get\(\)\.refreshAll\(\);""",
    r"\1void get().refreshAll();",
    store,
    count=1,
    flags=re.S,
)
if sign_in_count != 1:
    raise SystemExit(f"store signIn background refresh: expected one match, found {sign_in_count}")

store = replace_exact(
    store,
    "store refreshAll terminal catch",
    """      if (isProbablyNetworkError(error)) {
        const cached = await loadOfflineCache().catch(() => null);
        if (isSessionEpochStale(epoch)) return;
        set({ ...stateFromCache(cached), isRefreshing: false, networkStatus: 'offline' });
        return;
      }
      set({ isRefreshing: false });
""",
    """      if (isProbablyNetworkError(error)) {
        const cached = await loadOfflineCache().catch(() => null);
        if (isSessionEpochStale(epoch)) return;
        const cachedState = stateFromCache(cached);
        const hasAuthority = Boolean(cachedState.authContext || get().authContext);
        set({
          ...cachedState,
          isRefreshing: false,
          isHydrated: true,
          isBootstrapping: false,
          networkStatus: 'offline',
          error: hasAuthority
            ? null
            : getReadableErrorMessage(
                error,
                'No pudimos validar tu sesion. Reintenta cuando el servidor responda.',
                get().networkSnapshot
              ),
        });
        return;
      }
      set({
        isRefreshing: false,
        error: getReadableErrorMessage(
          error,
          'No pudimos sincronizar tu cuenta.',
          get().networkSnapshot
        ),
      });
""",
)
outputs["store"] = store

# 5. Add the permanent contract to the explicit Jest gate.
outputs["package"] = replace_exact(
    outputs["package"],
    "mobile test command",
    'src/native/call-action-headless-task.test.ts"',
    'src/native/call-action-headless-task.test.ts src/navigation/startup-stability.test.ts"',
)

startup_test = """const fs = require('fs');
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
"""

report = """# RC-MOBILE-STARTUP-STABILITY-01

## Base congelada

- Rama: `fix/mobile-startup-stability-20260806`
- Base: `main@1d30cb95391a8557bd21684d03d6c7f561cd71f4`
- Mobile observado: `1.2.0 (20)`

## Causa raíz confirmada

1. `/sync-error` mostraba `BrandSyncLoader` cuando `error` era nulo, aunque `refreshAll` no estuviera ejecutándose.
2. `/auth/me` en arranque tenía timeout de 75 segundos, pero el interceptor podía repetirlo dos veces.
3. `/auth/refresh` rotaba credenciales y estaba marcado como reintentable.
4. El fallback offline conservaba `cached.user` pero descartaba `cached.authContext`.
5. `Continuar sin ubicación` alteraba flags de autenticación desde un problema ajeno a GPS.
6. `signIn` esperaba cargas operativas opcionales antes de devolver control a navegación.
7. Una renovación realizada por el interceptor podía ser reemplazada por el access token anterior al terminar `initialize`.

## Corrección mínima

- El loader de sincronización solo aparece mientras `isRefreshing` es verdadero.
- El GET de sesión de arranque mantiene su timeout existente y no se repite de forma oculta.
- El refresh token rotatorio no se reintenta automáticamente.
- El caché conserva usuario, `authContext` y datos operativos.
- Una sesión renovada conserva siempre los tokens nuevos.
- Sin caché y sin servidor se usa la recuperación existente sin destruir la sesión persistida.
- Se eliminó el bypass de ubicación.
- Las cargas operativas se ejecutan en segundo plano después de establecer identidad y autoridad.

## Alcance no modificado

- GPS y servicio en segundo plano.
- Llamadas y WebRTC.
- Mapas y rutas.
- Pagos y planes.
- Contratos del backend.
- Diseño general.

## Gates

- `mobile npm run typecheck`
- `mobile npm run lint`
- `mobile npm test`
- `backend npm test`
- CI completa del PR
- APK release candidato
- Prueba física pendiente antes de merge

## Estado

- `STARTUP_ROOT_CAUSE_CONFIRMED`
- `NO_PASSIVE_SYNC_LOADER`
- `NO_REFRESH_TOKEN_REPLAY`
- `RENEWED_SESSION_PRESERVED`
- `CACHED_AUTHORITY_PRESERVED`
- `OPTIONAL_DATA_NOT_BOOT_BLOCKING`
- `APK_PHYSICAL_PASS=PENDING`
- `MERGE=NO`
"""

# Final validation before the first write. This makes the patch transactional.
required_markers = {
    "client": ["_skipNetworkRetry: true", "_skipAuthRefresh: true"],
    "gate": ["reason === 'sync_error' && isRefreshing && !error"],
    "app": ["bootTimedOut || bootstrapFailed"],
    "store": ["void get().refreshAll();", "...cachedState", "sessionToken = get().token || sessionToken"],
    "package": ["src/navigation/startup-stability.test.ts"],
}
for name, markers in required_markers.items():
    for marker in markers:
        if marker not in outputs[name]:
            raise SystemExit(f"{name}: missing final marker {marker!r}")

for name, path in TARGETS.items():
    path.write_text(outputs[name], encoding="utf-8")

Path("mobile/src/navigation/startup-stability.test.ts").write_text(startup_test, encoding="utf-8")
Path("RC-MOBILE-STARTUP-STABILITY-01.md").write_text(report, encoding="utf-8")

print("RC_MOBILE_STARTUP_PATCH_APPLIED")
