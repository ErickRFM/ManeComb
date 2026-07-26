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
    const token = getStorageItem(ACCESS_TOKEN_KEY);
    const refreshToken = getStorageItem(REFRESH_TOKEN_KEY);
    if (!token || !refreshToken) {
      set({ isBootstrapping: false });
      return;
    }
    try {
      const { user, session: info } = await platformSessionRequest(token);
      set({
        mode: 'authenticated',
        session: { token, refreshToken, user },
        sessionInfo: info,
        isBootstrapping: false,
      });
    } catch {
      clearPersistedSession();
      set({ isBootstrapping: false });
    }
  },

  login: async (email: string, password: string) => {
    set({ mode: 'loading', error: null });
    try {
      const result = await platformLoginRequest(email, password);
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
        set({ mode: 'authenticated', session: { token: result.token, refreshToken: result.refreshToken, user: result.user }, error: null });
        return;
      }
      set({ mode: 'error', error: 'Respuesta del servidor inválida' });
    } catch (error) {
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
    const result = await platformMfaVerifyRequest(challenge.token, totpToken);
    setSessionChallenge(null);
    const refreshResult = await platformRefreshRequest(challenge.refreshToken);
    persistSession(result.token, refreshResult.refreshToken);
    set({ mode: 'authenticated', session: { token: result.token, refreshToken: refreshResult.refreshToken, user: result.user }, challengeData: null, error: null });
  },

  recoverMfa: async (recoveryCode: string) => {
    const challenge = get().challengeData || getSessionChallenge();
    if (!challenge) throw new Error('No hay challenge activo');
    const result = await platformMfaRecoveryRequest(challenge.token, recoveryCode);
    setSessionChallenge(null);
    const refreshResult = await platformRefreshRequest(challenge.refreshToken);
    persistSession(result.token, refreshResult.refreshToken);
    set({ mode: 'authenticated', session: { token: result.token, refreshToken: refreshResult.refreshToken, user: result.user }, challengeData: null, error: null });
  },

  refreshSession: async () => {
    const s = get().session;
    if (!s) return;
    try {
      const { user, session: info } = await platformSessionRequest(s.token);
      set({ sessionInfo: info });
    } catch {}
  },

  logout: async () => {
    const s = get().session;
    if (s) await platformLogoutRequest(s.token).catch(() => {});
    clearPersistedSession();
    setSessionChallenge(null);
    set({ mode: 'idle', session: null, sessionInfo: null, challengeData: null, error: null });
  },

  clearError: () => set({ error: null, mode: 'login' }),
}));
