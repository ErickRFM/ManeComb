import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import * as Keychain from 'react-native-keychain';
import { apiClient, configureApiSessionRecovery, loginRequest, setAuthToken } from './client';
import { installApiSessionBoundary } from './api-session-boundary';
import { beginSessionEpoch } from '@/src/store/session-epoch';
import { setItemAsync } from '@/src/native/secure-store';
import { ensureLoginBackendReady } from '@/src/screens/auth/login-readiness';

jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@/src/api/mobile-runtime', () => ({
  API_URL: 'https://backend.test/api', API_ORIGIN: 'https://backend.test', SOCKET_URL: 'https://backend.test',
  API_TIMEOUT_MS: 1000, mobileLog: jest.fn(), runtimeNetworkConfig: { platform: 'android' }, wait: async () => {},
  getMobileNetworkSnapshot: jest.fn(async () => ({ isConnected: true, isInternetReachable: true })),
  isNetworkReachable: jest.fn(() => true),
}));
jest.mock('@/src/native/background-location', () => ({
  getBackgroundLocationCredentialStateAsync: jest.fn(async () => null),
  setBackgroundLocationCredentialsAsync: jest.fn(async () => true),
  setBackgroundLocationRefreshRequestIdAsync: jest.fn(async () => true),
}));
jest.mock('react-native-keychain', () => ({
  ACCESSIBLE: { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'test-device-only' },
  setGenericPassword: jest.fn(async () => true), getGenericPassword: jest.fn(async () => false),
  resetGenericPassword: jest.fn(async () => true),
}));

const runtime = globalThis as typeof globalThis & { __MANECOMB_API_SESSION_BOUNDARY_SUSPENDED__?: boolean };
const originalAdapter = apiClient.defaults.adapter;
let requests: InternalAxiosRequestConfig[];
const response = (config: InternalAxiosRequestConfig, status = 200, data: unknown = { ok: true }): AxiosResponse =>
  ({ config, status, data, headers: {}, statusText: String(status) });
beforeAll(() => installApiSessionBoundary());
beforeEach(() => {
  configureApiSessionRecovery(null);
  jest.clearAllMocks(); requests = [];
  setAuthToken(null);
  beginSessionEpoch();
  apiClient.defaults.adapter = async config => { requests.push(config); return response(config); };
});
afterEach(() => { apiClient.defaults.adapter = originalAdapter; setAuthToken(null); configureApiSessionRecovery(null); });

it('allows the real unauthenticated login readiness after teardown without reopening the session', async () => {
  setAuthToken('test-previous-account');
  expect(await ensureLoginBackendReady()).toMatchObject({ ok: true });
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({ method: 'get', url: '/health' });
  expect(requests[0].headers.Authorization).toBeUndefined();
  expect(runtime.__MANECOMB_API_SESSION_BOUNDARY_SUSPENDED__).toBe(true);
  await setItemAsync('combis-session-token', 'test-stale-write');
  expect(Keychain.setGenericPassword).not.toHaveBeenCalled();
  await expect(apiClient.get('/auth/me')).rejects.toMatchObject({ code: 'MANECOMB_STALE_SESSION' });
  await expect(apiClient.post('/auth/refresh')).rejects.toMatchObject({ code: 'MANECOMB_STALE_SESSION' });
  expect(requests).toHaveLength(1);
});

it('reopens transport and credential writes only after the normal new login response', async () => {
  expect(await ensureLoginBackendReady()).toMatchObject({ ok: true });
  expect(runtime.__MANECOMB_API_SESSION_BOUNDARY_SUSPENDED__).toBe(true);
  await loginRequest('test@example.invalid', 'test-password');
  expect(runtime.__MANECOMB_API_SESSION_BOUNDARY_SUSPENDED__).toBe(false);
  await setItemAsync('combis-session-token', 'test-new-token');
  expect(Keychain.setGenericPassword).toHaveBeenCalledTimes(1);
  await apiClient.get('/auth/me');
  expect(requests.map(({ url }) => url)).toEqual(['/health', '/auth/login', '/auth/me']);
});

it.each([
  ['post', '/health'], ['put', '/health'], ['delete', '/health'], ['head', '/health'],
  ['get', '/health/private'], ['get', '/health/ready'], ['get', '/healthcheck'],
  ['get', '/auth/login'], ['post', '/auth/refresh'], ['get', '/vehicles'],
])('keeps %s %s fenced while the session is suspended', async (method, url) => {
  await expect(apiClient.request({ method, url })).rejects.toMatchObject({ code: 'MANECOMB_STALE_SESSION' });
  expect(requests).toHaveLength(0);
  expect(runtime.__MANECOMB_API_SESSION_BOUNDARY_SUSPENDED__).toBe(true);
});

it('does not resume or replay credentials when the new login is rejected', async () => {
  apiClient.defaults.adapter = async config => {
    requests.push(config);
    throw new AxiosError('unauthorized', 'ERR_BAD_REQUEST', config, undefined, response(config, 401));
  };
  await expect(loginRequest('test@example.invalid', 'test-password')).rejects.toMatchObject({ response: { status: 401 } });
  expect(requests).toHaveLength(1);
  expect(runtime.__MANECOMB_API_SESSION_BOUNDARY_SUSPENDED__).toBe(true);
  await setItemAsync('combis-session-token', 'test-stale-write');
  expect(Keychain.setGenericPassword).not.toHaveBeenCalled();
});

it('retains bounded health retries and keeps a failed readiness unauthenticated', async () => {
  apiClient.defaults.adapter = async config => {
    requests.push(config);
    throw new AxiosError('unavailable', 'ERR_BAD_RESPONSE', config, undefined, response(config, 503));
  };
  expect(await ensureLoginBackendReady()).toMatchObject({ ok: false });
  expect(requests).toHaveLength(3);
  expect(requests.every(config => config.url === '/health')).toBe(true);
  expect(runtime.__MANECOMB_API_SESSION_BOUNDARY_SUSPENDED__).toBe(true);
  expect(Keychain.setGenericPassword).not.toHaveBeenCalled();
});

it('still discards an exempt health response from an invalidated epoch', async () => {
  let release: () => void = () => {};
  const barrier = new Promise<void>(resolve => { release = resolve; });
  apiClient.defaults.adapter = async config => { requests.push(config); await barrier; return response(config); };
  const pending = apiClient.get('/health').then(() => null, error => error);
  try {
    for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
    expect(requests).toHaveLength(1);
    beginSessionEpoch(); release();
    expect(await pending).toMatchObject({ code: 'MANECOMB_STALE_SESSION' });
    expect(runtime.__MANECOMB_API_SESSION_BOUNDARY_SUSPENDED__).toBe(true);
  } finally { release(); await pending; }
});
