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

const ACCESS_TOKEN_KEY = 'admin-platform-token';
const REFRESH_TOKEN_KEY = 'admin-platform-refresh-token';

function getStorageItem(key: string) {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setStorageItem(key: string, value: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {}
}

function removeStorageItem(key: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
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
      set({ isBootstrapping: false });
      clearPersistedSession();
    }
  },

  login: async (email: string, password: string) => {
    set({ mode: 'loading', error: null });

    try {
      const result = await platformLoginRequest(email, password);

      if (result.mfaRequired && result.challengeToken) {
        set({
          mode: result.mfaNeedsSetup ? 'mfa_enrollment' : 'mfa_challenge',
          challengeData: {
            token: result.challengeToken,
            purpose: result.mfaNeedsSetup ? 'mfa_enroll' : 'mfa_verify',
            session: result.session,
            user: result.user!,
          },
          error: null,
        });
        return;
      }

      if (result.token && result.user) {
        persistSession(result.token, result.refreshToken);
        set({
          mode: 'authenticated',
          session: {
            token: result.token,
            refreshToken: result.refreshToken,
            user: result.user,
          },
          error: null,
        });
        return;
      }

      set({ mode: 'error', error: 'Respuesta del servidor inválida' });
    } catch (error) {
      set({
        mode: 'error',
        error: error instanceof Error ? error.message : 'Error al iniciar sesión',
      });
    }
  },

  setupMfa: async () => {
    const challenge = get().challengeData;
    if (!challenge) throw new Error('No hay challenge activo');

    const result = await platformMfaSetupRequest(challenge.token);
    return { secret: result.secret, uri: result.uri };
  },

  confirmMfa: async (token: string) => {
    const challenge = get().challengeData;
    if (!challenge) throw new Error('No hay challenge activo');

    const result = await platformMfaConfirmRequest(challenge.token, token);
    set({ mode: 'login', error: null, challengeData: null });
    return result.backupCodes;
  },

  verifyMfa: async (token: string) => {
    const challenge = get().challengeData;
    if (!challenge) throw new Error('No hay challenge activo');

    try {
      const result = await platformMfaVerifyRequest(challenge.token, token);
      persistSession(result.token, '');
      const refreshResult = await platformRefreshRequest(result.token);
      persistSession(result.token, refreshResult.refreshToken);
      set({
        mode: 'authenticated',
        session: {
          token: result.token,
          refreshToken: refreshResult.refreshToken,
          user: result.user,
        },
        challengeData: null,
        error: null,
      });
    } catch (error) {
      throw error;
    }
  },

  recoverMfa: async (recoveryCode: string) => {
    const challenge = get().challengeData;
    if (!challenge) throw new Error('No hay challenge activo');

    try {
      const result = await platformMfaRecoveryRequest(
        challenge.token,
        recoveryCode
      );
      persistSession(result.token, '');
      const refreshResult = await platformRefreshRequest(result.token);
      persistSession(result.token, refreshResult.refreshToken);
      set({
        mode: 'authenticated',
        session: {
          token: result.token,
          refreshToken: refreshResult.refreshToken,
          user: result.user,
        },
        challengeData: null,
        error: null,
      });
    } catch (error) {
      throw error;
    }
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
    if (s) {
      await platformLogoutRequest(s.token).catch(() => {});
    }
    clearPersistedSession();
    set({
      mode: 'idle',
      session: null,
      sessionInfo: null,
      challengeData: null,
      error: null,
    });
  },

  clearError: () => set({ error: null, mode: 'login' }),
}));
