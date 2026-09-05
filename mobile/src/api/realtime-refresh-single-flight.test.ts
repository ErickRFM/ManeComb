import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { apiClient, configureApiSessionRecovery, refreshAccessToken, setAuthToken } from './client';
import { beginSessionEpoch, getSessionEpoch } from '@/src/store/session-epoch';

jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));

jest.mock('@/src/api/mobile-runtime', () => ({
  API_URL: 'https://backend.test/api', API_ORIGIN: 'https://backend.test', SOCKET_URL: 'https://backend.test',
  API_TIMEOUT_MS: 1000, mobileLog: jest.fn(), runtimeNetworkConfig: { platform: 'android' }, wait: async () => {},
}));
jest.mock('@/src/native/background-location', () => ({
  getBackgroundLocationCredentialStateAsync: jest.fn(async () => null),
  setBackgroundLocationCredentialsAsync: jest.fn(async () => true),
  setBackgroundLocationRefreshRequestIdAsync: jest.fn(async () => true),
}));

const originalAdapter = apiClient.defaults.adapter;
afterEach(() => { configureApiSessionRecovery(null); apiClient.defaults.adapter = originalAdapter; setAuthToken(null); });

it('shares exactly one refresh and publication between HTTP 401 and both realtime callers', async () => {
  const rotated = { token: 'test-next', refreshToken: 'test-refresh-next' };
  const onTokenRefresh = jest.fn();
  configureApiSessionRecovery({ getRefreshToken: () => 'test-refresh', onTokenRefresh, onSessionExpired: jest.fn(), onAccountSuspended: jest.fn() });
  setAuthToken('test-old');
  let refreshCount = 0;
  let releaseRefresh: () => void = () => {};
  const barrier = new Promise<void>((resolve) => { releaseRefresh = resolve; });
  const response = (config: InternalAxiosRequestConfig, status: number, data: unknown): AxiosResponse => ({ config, status, data, headers: {}, statusText: String(status) });
  apiClient.defaults.adapter = async (config) => {
    if (config.url === '/auth/refresh') {
      refreshCount += 1;
      await barrier;
      return response(config, 200, rotated);
    }
    if (config.headers.Authorization !== 'Bearer test-next') {
      throw new AxiosError('unauthorized', 'ERR_BAD_REQUEST', config, undefined, response(config, 401, {}));
    }
    return response(config, 200, { ok: true });
  };
  const rest = apiClient.get('/test-session');
  const sharedSocket = refreshAccessToken('1.3.0');
  const nativeRadio = refreshAccessToken('1.3.0');
  for (let turn = 0; turn < 25; turn += 1) await Promise.resolve();
  expect(refreshCount).toBe(1);
  releaseRefresh();
  const [restResult, sharedToken, nativeToken] = await Promise.all([rest, sharedSocket, nativeRadio]);
  expect(restResult.status).toBe(200);
  expect(sharedToken).toBe(rotated.token);
  expect(nativeToken).toBe(rotated.token);
  expect(onTokenRefresh).toHaveBeenCalledTimes(1);
  expect(onTokenRefresh).toHaveBeenCalledWith(rotated);
  expect(refreshCount).toBe(1);
});

it('replays a late old-token 401 with current credentials without another refresh', async () => {
  const onTokenRefresh = jest.fn();
  configureApiSessionRecovery({ getRefreshToken: () => 'test-refresh', onTokenRefresh, onSessionExpired: jest.fn(), onAccountSuspended: jest.fn() });
  setAuthToken('test-old');
  let refreshCount = 0;
  let releaseLate: () => void = () => {};
  let requestStarted: () => void = () => {};
  const started = new Promise<void>(resolve => { requestStarted = resolve; });
  const barrier = new Promise<void>(resolve => { releaseLate = resolve; });
  const response = (config: InternalAxiosRequestConfig, status: number, data: unknown): AxiosResponse => ({ config, status, data, headers: {}, statusText: String(status) });
  apiClient.defaults.adapter = async config => {
    if (config.url === '/auth/refresh') {
      refreshCount += 1;
      return response(config, 200, { token: 'test-next', refreshToken: 'test-refresh-next' });
    }
    if (config.headers.Authorization === 'Bearer test-old') {
      requestStarted();
      await barrier;
      throw new AxiosError('unauthorized', 'ERR_BAD_REQUEST', config, undefined, response(config, 401, {}));
    }
    return response(config, 200, { ok: true });
  };
  const late = apiClient.get('/test-late-media');
  await started;
  await refreshAccessToken();
  releaseLate();
  expect((await late).status).toBe(200);
  expect(refreshCount).toBe(1);
  expect(onTokenRefresh).toHaveBeenCalledTimes(1);
});

it.each([undefined, 'ACCOUNT_SUSPENDED'])('never recovers or expires a newer identity for a stale 401 (%s)', async (code) => {
  const onTokenRefresh = jest.fn();
  const onSessionExpired = jest.fn();
  const onAccountSuspended = jest.fn();
  const getRefreshToken = jest.fn(() => 'test-current-refresh');
  configureApiSessionRecovery({ getRefreshToken, onTokenRefresh, onSessionExpired, onAccountSuspended });
  const oldEpoch = getSessionEpoch();
  beginSessionEpoch();
  setAuthToken('test-new-account');
  let requests = 0;
  apiClient.defaults.adapter = async config => {
    requests += 1;
    const response: AxiosResponse = { config, status: 401, data: { code }, headers: {}, statusText: 'Unauthorized' };
    throw new AxiosError('unauthorized', 'ERR_BAD_REQUEST', config, undefined, response);
  };
  // The existing boundary stamps this field at dispatch in production.
  await expect(apiClient.get('/test-old-account-request', {
    headers: { Authorization: 'Bearer test-old-account' },
    ...{ _manecombSessionEpoch: oldEpoch },
  })).rejects.toMatchObject({ response: { status: 401 } });
  expect(requests).toBe(1);
  expect(getRefreshToken).not.toHaveBeenCalled();
  expect(onTokenRefresh).not.toHaveBeenCalled();
  expect(onSessionExpired).not.toHaveBeenCalled();
  expect(onAccountSuspended).not.toHaveBeenCalled();
});
