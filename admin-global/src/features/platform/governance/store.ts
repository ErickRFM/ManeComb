import { create } from 'zustand';
import {
  createPlatformTeamUserRequest,
  platformGovernanceActionRequest,
  platformSessionsRequest,
  platformTeamRequest,
} from './api';
import type {
  GovernanceActionPayload,
  GovernanceActionResult,
  PlatformGovernanceSession,
  PlatformInternalUser,
} from './types';
import type { PlatformPagination } from '../companies/types';

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

type PendingGovernanceAction = {
  idempotencyKey: string;
  fingerprint: string;
  payload: GovernanceActionPayload;
};

type GovernanceStore = {
  teamState: LoadState;
  teamError: string | null;
  users: PlatformInternalUser[];
  teamPagination: PlatformPagination | null;
  sessionsState: LoadState;
  sessionsError: string | null;
  sessions: PlatformGovernanceSession[];
  sessionsPagination: PlatformPagination | null;
  createState: LoadState;
  createError: string | null;
  actionState: LoadState;
  actionError: string | null;
  pendingAction: PendingGovernanceAction | null;
  lastActionResult: GovernanceActionResult | null;
  loadTeam: (token: string, params?: Record<string, string | number | boolean | null | undefined>) => Promise<void>;
  createUser: (token: string, payload: { name: string; email: string; password: string; role: string }) => Promise<PlatformInternalUser | null>;
  loadSessions: (token: string, params?: Record<string, string | number | boolean | null | undefined>) => Promise<void>;
  submitAction: (token: string, payload: GovernanceActionPayload) => Promise<GovernanceActionResult | null>;
  retryAction: (token: string) => Promise<GovernanceActionResult | null>;
  clearAction: () => void;
  reset: () => void;
};

function actionFingerprint(payload: GovernanceActionPayload) {
  return JSON.stringify({
    action: payload.action,
    targetId: payload.targetId,
    reason: payload.reason.trim(),
    confirmation: payload.confirmation.trim(),
    nextRole: payload.nextRole || null,
  });
}

function createIdempotencyKey() {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') {
    return `admin-global-${cryptoApi.randomUUID()}`;
  }
  if (typeof cryptoApi?.getRandomValues === 'function') {
    const bytes = new Uint8Array(24);
    cryptoApi.getRandomValues(bytes);
    return `admin-global-${Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')}`;
  }
  throw new Error('El navegador no ofrece un generador criptográfico seguro para la acción.');
}

const errorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

export const usePlatformGovernanceStore = create<GovernanceStore>((set, get) => ({
  teamState: 'idle',
  teamError: null,
  users: [],
  teamPagination: null,
  sessionsState: 'idle',
  sessionsError: null,
  sessions: [],
  sessionsPagination: null,
  createState: 'idle',
  createError: null,
  actionState: 'idle',
  actionError: null,
  pendingAction: null,
  lastActionResult: null,

  loadTeam: async (token, params = {}) => {
    if (!token) return;
    set({ teamState: 'loading', teamError: null });
    try {
      const result = await platformTeamRequest(token, params);
      set({ teamState: 'ready', users: result.items, teamPagination: result.pagination });
    } catch (error) {
      set({ teamState: 'error', teamError: errorMessage(error, 'No fue posible cargar el personal interno') });
    }
  },

  createUser: async (token, payload) => {
    if (!token || get().createState === 'loading') return null;
    set({ createState: 'loading', createError: null });
    try {
      const created = await createPlatformTeamUserRequest(token, payload);
      set((state) => ({
        createState: 'ready',
        users: [created, ...state.users.filter((user) => user.id !== created.id)],
      }));
      return created;
    } catch (error) {
      set({ createState: 'error', createError: errorMessage(error, 'No fue posible crear el usuario Platform') });
      return null;
    }
  },

  loadSessions: async (token, params = {}) => {
    if (!token) return;
    set({ sessionsState: 'loading', sessionsError: null });
    try {
      const result = await platformSessionsRequest(token, params);
      set({ sessionsState: 'ready', sessions: result.items, sessionsPagination: result.pagination });
    } catch (error) {
      set({ sessionsState: 'error', sessionsError: errorMessage(error, 'No fue posible cargar las sesiones Platform') });
    }
  },

  submitAction: async (token, payload) => {
    if (!token || get().actionState === 'loading') return null;
    const fingerprint = actionFingerprint(payload);
    const current = get().pendingAction;
    const pendingAction = current && current.fingerprint === fingerprint
      ? current
      : { idempotencyKey: createIdempotencyKey(), fingerprint, payload };

    set({ actionState: 'loading', actionError: null, pendingAction, lastActionResult: null });
    try {
      const result = await platformGovernanceActionRequest(token, pendingAction.idempotencyKey, pendingAction.payload);
      set({ actionState: 'ready', actionError: null, pendingAction: null, lastActionResult: result });
      return result;
    } catch (error) {
      set({
        actionState: 'error',
        actionError: errorMessage(error, 'No fue posible ejecutar la acción controlada'),
        pendingAction,
      });
      return null;
    }
  },

  retryAction: async (token) => {
    const pending = get().pendingAction;
    if (!pending || !token || get().actionState === 'loading') return null;
    set({ actionState: 'loading', actionError: null });
    try {
      const result = await platformGovernanceActionRequest(token, pending.idempotencyKey, pending.payload);
      set({ actionState: 'ready', actionError: null, pendingAction: null, lastActionResult: result });
      return result;
    } catch (error) {
      set({ actionState: 'error', actionError: errorMessage(error, 'No fue posible reintentar la acción controlada') });
      return null;
    }
  },

  clearAction: () => set({ actionState: 'idle', actionError: null, pendingAction: null, lastActionResult: null }),

  reset: () => set({
    teamState: 'idle',
    teamError: null,
    users: [],
    teamPagination: null,
    sessionsState: 'idle',
    sessionsError: null,
    sessions: [],
    sessionsPagination: null,
    createState: 'idle',
    createError: null,
    actionState: 'idle',
    actionError: null,
    pendingAction: null,
    lastActionResult: null,
  }),
}));
