import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function write(path, content) {
  fs.writeFileSync(path, content, 'utf8');
}

function replaceExactly(content, before, after, label) {
  const occurrences = content.split(before).length - 1;
  if (occurrences !== 1) {
    throw new Error(`${label}: expected exactly 1 occurrence, found ${occurrences}`);
  }
  return content.replace(before, after);
}

const rootStorePath = 'mobile/src/store/root-store.ts';
let rootStore = read(rootStorePath);

rootStore = replaceExactly(
  rootStore,
  "import { beginSessionEpoch, getSessionEpoch, isSessionEpochStale } from '@/src/store/session-epoch';\n",
  "import { beginSessionEpoch, getSessionEpoch, isSessionEpochStale } from '@/src/store/session-epoch';\nimport { isRealtimeAuthError } from '@/src/utils/realtime-state';\n",
  'root-store import realtime auth helper'
);

rootStore = replaceExactly(
  rootStore,
  "let socketReconnectAttempts = 0;\n",
  "let socketReconnectAttempts = 0;\nlet socketAuthRetries = 0;\nlet realtimeAuthRefreshInFlight: Promise<string | null> | null = null;\n",
  'root-store realtime auth globals'
);

rootStore = replaceExactly(
  rootStore,
  "type SocketStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';",
  "type SocketStatus =\n  | 'idle'\n  | 'connecting'\n  | 'connected'\n  | 'reconnecting'\n  | 'disconnected'\n  | 'unauthorized'\n  | 'error';",
  'root-store SocketStatus'
);

rootStore = replaceExactly(
  rootStore,
  "async function clearSessionState(set: StoreSet, error: string | null = null) {\n  beginSessionEpoch();\n  cleanupSessionRuntime();",
  "async function clearSessionState(set: StoreSet, error: string | null = null) {\n  beginSessionEpoch();\n  socketAuthRetries = 0;\n  cleanupSessionRuntime();",
  'root-store clear session auth retry reset'
);

rootStore = replaceExactly(
  rootStore,
  "function configureMobileRuntime(set: StoreSet, get: () => AppState) {",
  `async function applyRefreshedSession(\n  set: StoreSet,\n  get: () => AppState,\n  result: LoginResult\n) {\n  const nextRefreshToken = result.refreshToken || get().refreshToken;\n  const authContext = getAuthContextFromPayload(result);\n  setAuthToken(result.token);\n  await persistSession(result.token, get().connectionMode, nextRefreshToken);\n  set({\n    authContext,\n    token: result.token,\n    refreshToken: nextRefreshToken || null,\n    user: result.user || get().user,\n  });\n  connectSocket(set, get);\n}\n\nfunction refreshRealtimeAuth(set: StoreSet, get: () => AppState): Promise<string | null> {\n  if (realtimeAuthRefreshInFlight) {\n    return realtimeAuthRefreshInFlight;\n  }\n\n  const epoch = getSessionEpoch();\n  realtimeAuthRefreshInFlight = (async () => {\n    const refreshToken = get().refreshToken || await getStoredItem(REFRESH_TOKEN_KEY);\n\n    if (!refreshToken) {\n      setSocketTransition(set, 'unauthorized', 'socket_auth_refresh_token_missing');\n      return null;\n    }\n\n    try {\n      const result = await refreshSessionRequest(refreshToken, APP_VERSION);\n      if (isSessionEpochStale(epoch) || !get().user) {\n        return null;\n      }\n\n      // One successful refresh is allowed per authentication-failure cycle. A\n      // second rejection of the refreshed token is terminal until re-login.\n      socketAuthRetries += 1;\n      await applyRefreshedSession(set, get, result);\n      return result.token;\n    } catch (error) {\n      if (isSessionEpochStale(epoch) || !get().user) {\n        return null;\n      }\n\n      const status = isAxiosError(error) ? error.response?.status : null;\n      const transientFailure =\n        isProbablyNetworkError(error) ||\n        status === 429 ||\n        (typeof status === 'number' && status >= 500);\n\n      setSocketTransition(\n        set,\n        transientFailure ? 'reconnecting' : 'unauthorized',\n        transientFailure\n          ? 'socket_auth_refresh_temporarily_unavailable'\n          : 'socket_auth_refresh_rejected'\n      );\n      return null;\n    } finally {\n      realtimeAuthRefreshInFlight = null;\n    }\n  })();\n\n  return realtimeAuthRefreshInFlight;\n}\n\nfunction configureMobileRuntime(set: StoreSet, get: () => AppState) {`,
  'root-store realtime auth helpers'
);

rootStore = replaceExactly(
  rootStore,
  "  socket.on('connect', () => {\n    missedHeartbeatAcks = 0;",
  "  socket.on('connect', () => {\n    missedHeartbeatAcks = 0;\n    socketAuthRetries = 0;",
  'root-store successful socket auth reset'
);

rootStore = replaceExactly(
  rootStore,
  `  socket.on('connect_error', (error) => {\n    // \`socket.active\` is true while the manager will keep retrying (e.g. the\n    // server is asleep during a Render cold start). In that case the banner must\n    // read \"Reconectando\", not the terminal \"Servidor no disponible\" — the\n    // latter is reserved for fatal failures where reconnection has stopped.\n    setSocketTransition(\n      set,\n      socket?.active ? 'reconnecting' : 'error',\n      \`socket_connect_error:\${error.message}\`\n    );\n    mobileLog('socket', 'connect_error', error.message);\n  });`,
  `  socket.on('connect_error', (error) => {\n    if (isRealtimeAuthError(error.message)) {\n      if (socketAuthRetries >= 1) {\n        setSocketTransition(set, 'unauthorized', 'socket_auth_retry_exhausted');\n        mobileLog('socket', 'connect_error after refreshed token', error.message);\n        return;\n      }\n\n      setSocketTransition(set, 'reconnecting', 'socket_auth_refresh_requested');\n      mobileLog('socket', 'connect_error requires token refresh', error.message);\n      void refreshRealtimeAuth(set, get).catch((refreshError) => {\n        mobileLog('socket', 'unexpected realtime auth refresh failure', refreshError);\n        if (get().user) {\n          setSocketTransition(set, 'reconnecting', 'socket_auth_refresh_unexpected_failure');\n        }\n      });\n      return;\n    }\n\n    // \`socket.active\` is true while the manager will keep retrying (e.g. the\n    // server is asleep during a Render cold start). In that case the banner must\n    // read \"Reconectando\", not the terminal \"Servidor no disponible\" — the\n    // latter is reserved for fatal failures where reconnection has stopped.\n    setSocketTransition(\n      set,\n      socket?.active ? 'reconnecting' : 'error',\n      \`socket_connect_error:\${error.message}\`\n    );\n    mobileLog('socket', 'connect_error', error.message);\n  });`,
  'root-store connect_error auth recovery'
);

rootStore = replaceExactly(
  rootStore,
  `      onTokenRefresh: async (result) => {\n        const nextRefreshToken = result.refreshToken || get().refreshToken;\n        const authContext = getAuthContextFromPayload(result);\n        setAuthToken(result.token);\n        await persistSession(result.token, get().connectionMode, nextRefreshToken);\n        set({\n          authContext,\n          token: result.token,\n          refreshToken: nextRefreshToken || null,\n          user: result.user || get().user,\n        });\n\n        if (socket) {\n          socket.auth = result.token ? { token: result.token } : {};\n          socket.disconnect().connect();\n        }\n      },`,
  `      onTokenRefresh: async (result) => {\n        await applyRefreshedSession(set, get, result);\n      },`,
  'root-store unified REST token refresh'
);

write(rootStorePath, rootStore);

const realtimeStatePath = 'mobile/src/utils/realtime-state.ts';
let realtimeState = read(realtimeStatePath);

realtimeState = replaceExactly(
  realtimeState,
  "  | 'RECONNECTING'\n  | 'ERROR';",
  "  | 'RECONNECTING'\n  | 'UNAUTHORIZED'\n  | 'ERROR';",
  'realtime-state unauthorized machine state'
);

realtimeState = replaceExactly(
  realtimeState,
  "  socketStatus?: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error' | null;",
  "  socketStatus?:\n    | 'idle'\n    | 'connecting'\n    | 'connected'\n    | 'reconnecting'\n    | 'disconnected'\n    | 'unauthorized'\n    | 'error'\n    | null;",
  'realtime-state unauthorized socket status'
);

realtimeState = replaceExactly(
  realtimeState,
  "export function getRealtimeSnapshot({",
  `export function isRealtimeAuthError(error?: string | null) {\n  const value = String(error || '').toLowerCase();\n  return (\n    value.includes('unauthorized') ||\n    value.includes('invalid token') ||\n    value.includes('jwt') ||\n    value.includes('token expired') ||\n    value.includes('authentication failed')\n  );\n}\n\nexport function getRealtimeSnapshot({`,
  'realtime-state auth error classifier'
);

realtimeState = replaceExactly(
  realtimeState,
  "  if (socketStatus === 'error') {",
  `  if (socketStatus === 'unauthorized') {\n    return {\n      canTransmit: false,\n      detail: 'Sesión expirada. Vuelve a iniciar sesión.',\n      label: 'Sesión expirada',\n      state: 'UNAUTHORIZED',\n      tone: 'danger',\n    };\n  }\n\n  if (socketStatus === 'error') {`,
  'realtime-state unauthorized snapshot'
);

write(realtimeStatePath, realtimeState);

const bannerPath = 'mobile/src/components/connection-banner.tsx';
let banner = read(bannerPath);

banner = replaceExactly(
  banner,
  "  const { isRefreshing, networkStatus, pendingSyncCount, realtimeDiagnostics, refreshAll, socketStatus, user } = useAppStore(\n",
  "  const { isRefreshing, networkStatus, pendingSyncCount, realtimeDiagnostics, refreshAll, signOut, socketStatus, user } = useAppStore(\n",
  'connection-banner select signOut'
);

banner = replaceExactly(
  banner,
  "      refreshAll: state.refreshAll,\n      socketStatus: state.socketStatus,",
  "      refreshAll: state.refreshAll,\n      signOut: state.signOut,\n      socketStatus: state.socketStatus,",
  'connection-banner map signOut'
);

banner = replaceExactly(
  banner,
  "  const offline = realtime.state === 'DISCONNECTED';\n  const visibleStates = new Set(['CONNECTING', 'AUTHENTICATING', 'RECONNECTING', 'ERROR']);",
  "  const offline = realtime.state === 'DISCONNECTED';\n  const unauthorized = realtime.state === 'UNAUTHORIZED';\n  const visibleStates = new Set([\n    'CONNECTING',\n    'AUTHENTICATING',\n    'RECONNECTING',\n    'UNAUTHORIZED',\n    'ERROR',\n  ]);",
  'connection-banner unauthorized visibility'
);

banner = replaceExactly(
  banner,
  "  const tint = offline ? theme.colors.warning : theme.colors.info;",
  "  const tint = unauthorized\n    ? theme.colors.danger\n    : offline\n      ? theme.colors.warning\n      : theme.colors.info;",
  'connection-banner unauthorized tint'
);

banner = replaceExactly(
  banner,
  "          backgroundColor: offline ? theme.colors.warningSoft : theme.colors.infoSoft,",
  "          backgroundColor: unauthorized\n            ? theme.colors.dangerSoft\n            : offline\n              ? theme.colors.warningSoft\n              : theme.colors.infoSoft,",
  'connection-banner unauthorized background'
);

banner = replaceExactly(
  banner,
  `        onPress={() => {\n          if (!isRefreshing) {\n            refreshAll();\n          }\n        }}\n        disabled={isRefreshing}\n        accessibilityRole=\"button\"\n        accessibilityLabel=\"Reintentar conexion\"`,
  `        onPress={() => {\n          if (isRefreshing) {\n            return;\n          }\n          if (unauthorized) {\n            void signOut();\n            return;\n          }\n          void refreshAll();\n        }}\n        disabled={isRefreshing}\n        accessibilityRole=\"button\"\n        accessibilityLabel={unauthorized ? 'Volver a iniciar sesión' : 'Reintentar conexion'}`,
  'connection-banner unauthorized action'
);

banner = replaceExactly(
  banner,
  "          <MaterialCommunityIcons name={offline ? 'wifi-off' : 'sync'} size={16} color={tint} />",
  "          <MaterialCommunityIcons\n            name={unauthorized ? 'account-alert-outline' : offline ? 'wifi-off' : 'sync'}\n            size={16}\n            color={tint}\n          />",
  'connection-banner unauthorized icon'
);

write(bannerPath, banner);

const testPath = 'mobile/src/utils/realtime-state.test.ts';
let tests = read(testPath);

tests = replaceExactly(
  tests,
  "import { getRealtimeSnapshot } from './realtime-state';",
  "import { getRealtimeSnapshot, isRealtimeAuthError } from './realtime-state';",
  'realtime-state test import'
);

tests = replaceExactly(
  tests,
  "describe('realtime state machine', () => {\n",
  `describe('realtime state machine', () => {\n  it('classifies authentication failures separately from transport failures', () => {\n    expect(isRealtimeAuthError('unauthorized')).toBe(true);\n    expect(isRealtimeAuthError('invalid token')).toBe(true);\n    expect(isRealtimeAuthError('jwt expired')).toBe(true);\n    expect(isRealtimeAuthError('timeout')).toBe(false);\n  });\n\n  it('reports an expired session instead of a server outage', () => {\n    const snapshot = getRealtimeSnapshot({\n      hasUser: true,\n      networkStatus: 'online',\n      socketStatus: 'unauthorized',\n    });\n\n    expect(snapshot.state).toBe('UNAUTHORIZED');\n    expect(snapshot.label).toBe('Sesión expirada');\n    expect(snapshot.detail).toBe('Sesión expirada. Vuelve a iniciar sesión.');\n  });\n\n`,
  'realtime-state auth tests'
);

write(testPath, tests);

// Do not leave the one-shot patch machinery in the product branch.
fs.rmSync('scripts/apply-mobile-server-banner-auth-fix.mjs', { force: true });
fs.rmSync('.github/workflows/apply-mobile-server-banner-auth-fix.yml', { force: true });

console.log('Mobile server banner auth fix applied successfully.');
