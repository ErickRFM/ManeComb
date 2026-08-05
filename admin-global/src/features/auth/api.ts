import axios, { type AxiosInstance, type AxiosError } from 'axios';

const PLATFORM_AUTH_PATH = '/api/platform/auth';

function normalizeApiOrigin(value: string) {
  const rawValue = value.trim();
  if (!rawValue) return '';

  let parsed: URL;
  try {
    parsed = new URL(rawValue);
  } catch {
    throw new Error('VITE_API_URL debe ser una URL absoluta valida.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('VITE_API_URL solo admite http o https.');
  }

  if (parsed.username || parsed.password) {
    throw new Error('VITE_API_URL no debe incluir credenciales.');
  }

  parsed.search = '';
  parsed.hash = '';
  parsed.pathname = parsed.pathname.replace(/\/api\/?$/i, '').replace(/\/+$/, '');
  return parsed.toString().replace(/\/+$/, '');
}

function resolveApiBase() {
  const configuredOrigin = normalizeApiOrigin(import.meta.env.VITE_API_URL || '');
  if (configuredOrigin) return configuredOrigin;

  if (import.meta.env.DEV) {
    // En desarrollo se usa el proxy /api de Vite para evitar CORS y puertos duplicados.
    return '';
  }

  throw new Error('VITE_API_URL es obligatorio para construir Admin Global.');
}

const API_BASE = resolveApiBase();

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
