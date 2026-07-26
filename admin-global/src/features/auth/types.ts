export type AdminSessionInfo = {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  ip: string;
  userAgent: string;
  platform: string;
  deviceName: string;
  mfaVerified: boolean;
};

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
  lastLoginAt: string;
};

export type AdminLoginResponse = {
  mfaRequired?: boolean;
  mfaNeedsSetup?: boolean;
  challengeToken?: string;
  token?: string;
  refreshToken: string;
  session: { id: string; expiresAt: string };
  user?: AdminUser;
};

export type AdminMfaSetupResponse = {
  secret: string;
  uri: string;
};

export type AdminMfaConfirmResponse = {
  backupCodes: string[];
};

export type AdminMfaVerifyResponse = {
  token: string;
  session: { id: string; expiresAt: string };
  user: AdminUser;
};

export type AdminAuthMode =
  | 'idle'
  | 'login'
  | 'loading'
  | 'mfa_enrollment'
  | 'mfa_challenge'
  | 'authenticated'
  | 'error';

export type AdminChallengeData = {
  token: string;
  purpose: 'mfa_enroll' | 'mfa_verify';
  refreshToken: string;
  session: { id: string; expiresAt: string };
  user: AdminUser;
};

export type AdminSessionData = {
  token: string;
  refreshToken: string;
  user: AdminUser;
};
