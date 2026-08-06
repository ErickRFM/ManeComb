import { create } from 'zustand';
import type {
  AdminAuthMode,
  AdminChallengeData,
  AdminSessionData,
  AdminSessionInfo,
} from './types';
import {
  platformLoginRequest,
  platformMfaSetupRequest,
  platformMfaConfirmRequest,
  platformMfaVerifyRequest,
  platformMfaRecoveryRequest,
  platformSessionRequest,
  platformLogoutRequest,
  platformRefreshRequest,
} from './api';

const ACCESS_TOKEN_KEY = 'manecomb-platform-token';
const REFRESH_TOKEN_KEY = 'manecomb-platform-refresh-token';
const CHALLENGE_STORAGE_KEY = 'manecomb-platform-challenge';
const SESSION_REFRESH_THRESHOLD_MS = 2 * 60 * 1000;
let renewalPromise: Promise<boolean> | null = null;
let authEpoch = 0;

function getStorageItem(key: string) {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage.getItem(key); } catch { return null; }
}

function setStorageItem(key: string, value: string) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(key, value); } catch {}
}

function removeStorageItem(key: string) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(key); } catch {}
}

function getSessionChallenge() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(CHALLENGE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AdminChallengeData) : null;
  } catch { return null; }
}

function setSessionChallenge(data: AdminChallengeData | null) {
  if (typeof window === 'undefined') return;
  try {
    if (data) window.sessionStorage.setItem(CHALLENGE_STORAGE_KEY, JSON.stringify(data));
    else window.sessionStorage.removeItem(CHALLENGE_STORAGE_KEY);
  } catch {}
}

function persistSession(token: string, refreshToken: string) {
  setStorageItem(ACCESS_TOKEN_KEY, token);
  setStorageItem(REFRESH_TOKEN_KEY, refreshToken);
}

function clearPersistedSession() {
  removeStorageItem(ACCESS_TOKEN_KEY);
  removeStorageItem(REFRESH_TOKEN_KEY);
}

function readTokenExpiration(token: string) {
  try {
    const payload = token.split('.')[1];
    if (!payload || typeof globalThis.atob !== 'function') return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const decoded = JSON.parse(globalThis.atob(padded)) as { exp?: unknown };
    const expiresAt = Number(decoded.exp) * 1000;
    return Number.isFinite(expiresAt) && expiresAt > 0 ? expiresAt : null;
  } catch {
    return null;
  }
}

export function shouldRenewPlatformSession(
  token: string,
  now = Date.now(),
  thresholdMs = SESSION_REFRESH_THRESHOLD_MS
) {
  const expiresAt = readTokenExpiration(token);
  return expiresAt === null || expiresAt <= now + thresholdMs;
}

async function restoreSessionFromRefresh(refreshToken: string) {
  const refreshed = await platformRefreshRequest(refreshToken);
  const { user, session: info } = await platformSessionRequest(refreshed.token);
  return {
    session: {
      token: refreshed.token,
      refreshToken: refreshed.refreshToken,
      user,
    } satisfies AdminSessionData,
    sessionInfo: info,
  };
}

type AdminStore = {
  mode: AdminAuthMode;
  error: string | null;
  challengeData: AdminChallengeData | null;
  session: AdminSessionData | null;
  sessionInfo: AdminSessionInfo | null;
  isBootstrapping: boolean;
  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  setupMfa: () => Promise<{ secret: string; uri: string }>;
  confirmMfa: (token: string) => Promise<string[]>;
  verifyMfa: (token: string) => Promise<void>;
  recoverMfa: (recoveryCode: string) => Promise<void>;
  renewSession: () => Promise<boolean>;
  refreshSession: () => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
};

export const useAdminStore = create<AdminStore>((set, get) => ({
  mode: 'idle',
  error: null,
  challengeData: null,
  session: null,
  sessionInfo: null,
  isBootstrapping: true,

  bootstrap: async () => {
    const epoch = ++authEpoch;
    renewalPromise = null;
    const token = getStorageItem(ACCESS_TOKEN_KEY);
    const refreshToken = getStorageItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) {
      clearPersistedSession();
      if (epoch === authEpoch) {
        set({ mode: 'idle', session: null, sessionInfo: null, isBootstrapping: false });
      }
      return;
    }

    if (token) {
      try {
        const { user, session: info } = await platformSessionRequest(token);
        if (epoch !== authEpoch) return;
        set({
          mode: 'authenticated',
          session: { token, refreshToken, user },
          sessionInfo: info,
          isBootstrapping: false,
        });
        return;
      } catch {
        // El access token puede haber expirado mientras el refresh token sigue vigente.
      }
    }

    try {
      const restored = await restoreSessionFromRefresh(refreshToken);
      if (epoch !== authEpoch) return;
      persistSession(restored.session.token, restored.session.refreshToken);
      set({
        mode: 'authenticated',
        session: restored.session,
        sessionInfo: restored.sessionInfo,
        isBootstrapping: false,
      });
    } catch {
      if (epoch !== authEpoch) return;
      clearPersistedSession();
      set({
        mode: 'idle',
        session: null,
        sessionInfo: null,
        challengeData: null,
        isBootstrapping: false,
      });
    }
  },

  login: async (email: string, password: string) => {
    const epoch = ++authEpoch;
    renewalPromise = null;
    set({ mode: 'loading', error: null });
    try {
      const result = await platformLoginRequest(email, password);
      if (epoch !== authEpoch) return;
      if (result.mfaRequired && result.challengeToken) {
        const challengeData: AdminChallengeData = {
          token: result.challengeToken,
          purpose: result.mfaNeedsSetup ? 'mfa_enroll' : 'mfa_verify',
          refreshToken: result.refreshToken,
          session: result.session,
          user: result.user!,
        };
        setSessionChallenge(challengeData);
        set({ mode: result.mfaNeedsSetup ? 'mfa_enrollment' : 'mfa_challenge', challengeData, error: null });
        return;
      }
      if (result.token && result.user) {
        persistSession(result.token, result.refreshToken);
        set({
          mode: 'authenticated',
          session: { token: result.token, refreshToken: result.refreshToken, user: result.user },
          sessionInfo: null,
          error: null,
        });
        return;
      }
      set({ mode: 'error', error: 'Respuesta del servidor inválida' });
    } catch (error) {
      if (epoch !== authEpoch) return;
      set({ mode: 'error', error: error instanceof Error ? error.message : 'Error al iniciar sesión' });
    }
  },

  setupMfa: async () => {
    const challenge = get().challengeData || getSessionChallenge();
    if (!challenge || challenge.purpose !== 'mfa_enroll') throw new Error('No hay challenge de enrolamiento activo');
    const result = await platformMfaSetupRequest(challenge.token);
    return { secret: result.secret, uri: result.uri };
  },

  confirmMfa: async (totpToken: string) => {
    const challenge = get().challengeData || getSessionChallenge();
    if (!challenge) throw new Error('No hay challenge activo');
    const result = await platformMfaConfirmRequest(challenge.token, totpToken);
    set({ mode: 'login', error: null, challengeData: null });
    setSessionChallenge(null);
    return result.backupCodes;
  },

  verifyMfa: async (totpToken: string) => {
    const challenge = get().challengeData || getSessionChallenge();
    if (!challenge) throw new Error('No hay challenge activo');
    const epoch = ++authEpoch;
    renewalPromise = null;
    const result = await platformMfaVerifyRequest(challenge.token, totpToken);
    const refreshResult = await platformRefreshRequest(challenge.refreshToken);
    if (epoch !== authEpoch) return;
    setSessionChallenge(null);
    persistSession(refreshResult.token, refreshResult.refreshToken);
    set({
      mode: 'authenticated',
      session: {
        token: refreshResult.token,
        refreshToken: refreshResult.refreshToken,
        user: result.user,
      },
      sessionInfo: null,
      challengeData: null,
      error: null,
    });
  },

  recoverMfa: async (recoveryCode: string) => {
    const challenge = get().challengeData || getSessionChallenge();
    if (!challenge) throw new Error('No hay challenge activo');
    const epoch = ++authEpoch;
    renewalPromise = null;
    const result = await platformMfaRecoveryRequest(challenge.token, recoveryCode);
    const refreshResult = await platformRefreshRequest(challenge.refreshToken);
    if (epoch !== authEpoch) return;
    setSessionChallenge(null);
    persistSession(refreshResult.token, refreshResult.refreshToken);
    set({
      mode: 'authenticated',
      session: {
        token: refreshResult.token,
        refreshToken: refreshResult.refreshToken,
        user: result.user,
      },
      sessionInfo: null,
      challengeData: null,
      error: null,
    });
  },

  renewSession: async () => {
    if (renewalPromise) return renewalPromise;
    const current = get().session;
    if (!current?.refreshToken) return false;
    const epoch = authEpoch;

    const request = (async () => {
      try {
        const restored = await restoreSessionFromRefresh(current.refreshToken);
        const latest = get().session;
        if (
          epoch !== authEpoch
          || !latest
          || latest.refreshToken !== current.refreshToken
        ) {
          return false;
        }
        persistSession(restored.session.token, restored.session.refreshToken);
        set({
          mode: 'authenticated',
          session: restored.session,
          sessionInfo: restored.sessionInfo,
          error: null,
        });
        return true;
      } catch {
        return false;
      }
    })();
    renewalPromise = request;

    try {
      return await request;
    } finally {
      if (renewalPromise === request) renewalPromise = null;
    }
  },

  refreshSession: async () => {
    const current = get().session;
    if (!current) return;
    const epoch = authEpoch;
    try {
      const { user, session: info } = await platformSessionRequest(current.token);
      if (epoch !== authEpoch || get().session?.token !== current.token) return;
      set({ session: { ...current, user }, sessionInfo: info });
    } catch {
      if (epoch === authEpoch) await get().renewSession();
    }
  },

  logout: async () => {
    const current = get().session;
    authEpoch += 1;
    renewalPromise = null;
    clearPersistedSession();
    setSessionChallenge(null);
    set({ mode: 'idle', session: null, sessionInfo: null, challengeData: null, error: null });
    if (current) await platformLogoutRequest(current.token).catch(() => {});
  },

  clearError: () => set({ error: null, mode: 'login' }),
}));
