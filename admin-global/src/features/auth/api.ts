import {
  createPlatformApiClient,
  getPlatformTokenHeader,
  isTransientPlatformApiError,
} from '@/lib/platform-api-client';

const platformApi = createPlatformApiClient('/api/platform/auth');

function createRefreshRequestId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `platform-refresh-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function platformLoginRequest(email: string, password: string) {
  const { data } = await platformApi.post('/login', { email, password });
  return data.data as import('./types').AdminLoginResponse;
}

export async function platformRefreshRequest(refreshToken: string) {
  const refreshRequestId = createRefreshRequestId();
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { data } = await platformApi.post('/refresh', { refreshToken, refreshRequestId });
      return data.data as { token: string; refreshToken: string; session: { id: string; expiresAt: string } };
    } catch (error) {
      lastError = error;
      if (attempt > 0 || !isTransientPlatformApiError(error)) throw error;
      await delay(250);
    }
  }

  throw lastError;
}

export async function platformSessionRequest(token: string) {
  const { data } = await platformApi.get('/session', {
    headers: getPlatformTokenHeader(token),
  });
  return data.data as { user: import('./types').AdminUser; session: import('./types').AdminSessionInfo };
}

export async function platformLogoutRequest(token: string) {
  const { data } = await platformApi.post(
    '/logout',
    {},
    { headers: getPlatformTokenHeader(token) }
  );
  return data.data as { message: string };
}

export async function platformLogoutAllRequest(token: string) {
  const { data } = await platformApi.post(
    '/logout-all',
    {},
    { headers: getPlatformTokenHeader(token) }
  );
  return data.data as { message: string; revokedCount: number };
}

export async function platformMfaSetupRequest(challengeToken: string) {
  const { data } = await platformApi.post(
    '/mfa/setup',
    {},
    { headers: getPlatformTokenHeader(challengeToken) }
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
    { headers: getPlatformTokenHeader(challengeToken) }
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
