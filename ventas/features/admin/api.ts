import axios, { type AxiosInstance, type AxiosError } from 'axios';

const API_BASE = (() => {
  if (typeof window === 'undefined') return 'http://localhost:4000';
  const origin = window.location.origin;
  const port = origin.includes('localhost') || origin.includes('127.0.0.1') ? ':4000' : '';
  return origin.includes('localhost') || origin.includes('127.0.0.1')
    ? `http://localhost:4000`
    : origin;
})();

const PLATFORM_AUTH_PATH = '/api/platform/auth';

function createPlatformInstance(): AxiosInstance {
  const instance = axios.create({
    baseURL: `${API_BASE}${PLATFORM_AUTH_PATH}`,
    headers: { 'Content-Type': 'application/json' },
    timeout: 15000,
  });

  instance.interceptors.response.use(
    (res) => res,
    (error: AxiosError<{ ok: false; message: string }>) => {
      const message =
        error.response?.data?.message || error.message || 'Error de conexión';
      return Promise.reject(new Error(message));
    }
  );

  return instance;
}

function getTokenHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

const platformApi = createPlatformInstance();

export async function platformLoginRequest(email: string, password: string) {
  const { data } = await platformApi.post('/login', { email, password });
  return data.data as import('./types').AdminLoginResponse;
}

export async function platformRefreshRequest(refreshToken: string) {
  const { data } = await platformApi.post('/refresh', { refreshToken });
  return data.data as { token: string; refreshToken: string; session: { id: string; expiresAt: string } };
}

export async function platformSessionRequest(token: string) {
  const { data } = await platformApi.get('/session', {
    headers: getTokenHeader(token),
  });
  return data.data as { user: import('./types').AdminUser; session: import('./types').AdminSessionInfo };
}

export async function platformLogoutRequest(token: string) {
  const { data } = await platformApi.post(
    '/logout',
    {},
    { headers: getTokenHeader(token) }
  );
  return data.data as { message: string };
}

export async function platformLogoutAllRequest(token: string) {
  const { data } = await platformApi.post(
    '/logout-all',
    {},
    { headers: getTokenHeader(token) }
  );
  return data.data as { message: string; revokedCount: number };
}

export async function platformMfaSetupRequest(challengeToken: string) {
  const { data } = await platformApi.post(
    '/mfa/setup',
    {},
    { headers: getTokenHeader(challengeToken) }
  );
  return data.data as import('./types').AdminMfaSetupResponse;
}

export async function platformMfaConfirmRequest(
  challengeToken: string,
  token: string
) {
  const { data } = await platformApi.post(
    '/mfa/confirm',
    { token },
    { headers: getTokenHeader(challengeToken) }
  );
  return data.data as import('./types').AdminMfaConfirmResponse;
}

export async function platformMfaVerifyRequest(
  challengeToken: string,
  token: string
) {
  const { data } = await platformApi.post('/mfa/verify', {
    challengeToken,
    token,
  });
  return data.data as import('./types').AdminMfaVerifyResponse;
}

export async function platformMfaRecoveryRequest(
  challengeToken: string,
  recoveryCode: string
) {
  const { data } = await platformApi.post('/mfa/recovery', {
    challengeToken,
    recoveryCode,
  });
  return data.data as import('./types').AdminMfaVerifyResponse;
}
