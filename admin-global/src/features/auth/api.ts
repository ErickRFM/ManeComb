import { createPlatformApiClient, getPlatformTokenHeader } from '@/lib/platform-api-client';

const platformApi = createPlatformApiClient('/api/platform/auth');

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
