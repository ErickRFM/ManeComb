import { create } from 'zustand';
import {
  checkoutPlanRequest,
  configureApiTokens,
  getApiErrorMessage,
  getCommercialPlansRequest,
  getDashboardRequest,
  getIncidentsRequest,
  getSessionRequest,
  getVehiclesRequest,
  listActivationKeysRequest,
  loginRequest,
  logoutRequest,
  registerDriverActivationRequest,
  registerRequest,
} from '../api/client';
import { connectSocket, disconnectSocket } from '../services/socket';
import { deleteSecureValue, readSecureValue, saveSecureValue } from '../services/secure-storage';
import { getFcmToken } from '../services/notifications';
import type {
  ActivationPayload,
  CommercialPlan,
  DashboardData,
  Incident,
  RegisterPayload,
  User,
  Vehicle,
} from '../types/app';

const ACCESS_TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';

type ActionResult = {
  ok: boolean;
  message?: string;
};

type SessionState = {
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  dashboard: DashboardData | null;
  plans: CommercialPlan[];
  vehicles: Vehicle[];
  incidents: Incident[];
  activationKeys: unknown[];
  isBootstrapping: boolean;
  isLoading: boolean;
  error: string | null;
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<ActionResult>;
  register: (payload: RegisterPayload) => Promise<ActionResult>;
  activateDriver: (payload: ActivationPayload) => Promise<ActionResult>;
  signOut: () => Promise<void>;
  refreshOperationalData: () => Promise<void>;
  loadPlans: () => Promise<void>;
  checkoutPlan: (planId: string, requestTrial?: boolean) => Promise<ActionResult>;
  clearError: () => void;
};

async function persistTokens(accessToken: string | null, refreshToken: string | null) {
  if (accessToken) {
    await saveSecureValue(ACCESS_TOKEN_KEY, accessToken);
  } else {
    await deleteSecureValue(ACCESS_TOKEN_KEY);
  }

  if (refreshToken) {
    await saveSecureValue(REFRESH_TOKEN_KEY, refreshToken);
  } else {
    await deleteSecureValue(REFRESH_TOKEN_KEY);
  }
}

function resolveDashboard(data: unknown): DashboardData | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  return data as DashboardData;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  accessToken: null,
  refreshToken: null,
  user: null,
  dashboard: null,
  plans: [],
  vehicles: [],
  incidents: [],
  activationKeys: [],
  isBootstrapping: true,
  isLoading: false,
  error: null,

  async initialize() {
    const accessToken = await readSecureValue(ACCESS_TOKEN_KEY);
    const refreshToken = await readSecureValue(REFRESH_TOKEN_KEY);
    configureApiTokens(accessToken, refreshToken);

    if (!accessToken) {
      set({ isBootstrapping: false });
      return;
    }

    try {
      const session = await getSessionRequest();
      connectSocket(accessToken);
      getFcmToken().catch(() => undefined);
      set({
        accessToken,
        refreshToken,
        user: session.user,
        dashboard: resolveDashboard(session.dashboard),
        isBootstrapping: false,
      });
      await get().refreshOperationalData();
    } catch (error) {
      await persistTokens(null, null);
      configureApiTokens(null, null);
      disconnectSocket();
      set({
        accessToken: null,
        refreshToken: null,
        user: null,
        dashboard: null,
        isBootstrapping: false,
        error: getApiErrorMessage(error, 'La sesión guardada ya no es válida.'),
      });
    }
  },

  async signIn(email, password) {
    set({ isLoading: true, error: null });
    try {
      const response = await loginRequest(email, password);
      await persistTokens(response.token, response.refreshToken || null);
      configureApiTokens(response.token, response.refreshToken || null);
      connectSocket(response.token);
      getFcmToken().catch(() => undefined);
      set({
        accessToken: response.token,
        refreshToken: response.refreshToken || null,
        user: response.user,
        dashboard: resolveDashboard(response.dashboard),
        isLoading: false,
      });
      await get().refreshOperationalData();
      return { ok: true };
    } catch (error) {
      const message = getApiErrorMessage(error, 'No se pudo iniciar sesión.');
      set({ isLoading: false, error: message });
      return { ok: false, message };
    }
  },

  async register(payload) {
    set({ isLoading: true, error: null });
    try {
      const response = await registerRequest(payload);
      await persistTokens(response.token, response.refreshToken || null);
      configureApiTokens(response.token, response.refreshToken || null);
      connectSocket(response.token);
      set({
        accessToken: response.token,
        refreshToken: response.refreshToken || null,
        user: response.user,
        dashboard: resolveDashboard(response.dashboard),
        isLoading: false,
      });
      return { ok: true };
    } catch (error) {
      const message = getApiErrorMessage(error, 'No se pudo registrar la cuenta.');
      set({ isLoading: false, error: message });
      return { ok: false, message };
    }
  },

  async activateDriver(payload) {
    set({ isLoading: true, error: null });
    try {
      const response = await registerDriverActivationRequest(payload);
      await persistTokens(response.token, response.refreshToken || null);
      configureApiTokens(response.token, response.refreshToken || null);
      connectSocket(response.token);
      set({
        accessToken: response.token,
        refreshToken: response.refreshToken || null,
        user: response.user,
        dashboard: resolveDashboard(response.dashboard),
        isLoading: false,
      });
      await get().refreshOperationalData();
      return { ok: true };
    } catch (error) {
      const message = getApiErrorMessage(error, 'No se pudo activar la cuenta con esa key.');
      set({ isLoading: false, error: message });
      return { ok: false, message };
    }
  },

  async signOut() {
    const refreshToken = get().refreshToken;
    set({ isLoading: true });
    await logoutRequest(refreshToken).catch(() => undefined);
    await persistTokens(null, null);
    configureApiTokens(null, null);
    disconnectSocket();
    set({
      accessToken: null,
      refreshToken: null,
      user: null,
      dashboard: null,
      vehicles: [],
      incidents: [],
      activationKeys: [],
      isLoading: false,
      error: null,
    });
  },

  async refreshOperationalData() {
    if (!get().accessToken) {
      return;
    }

    set({ isLoading: true, error: null });
    try {
      const [dashboard, vehicles, incidents, activationKeys] = await Promise.all([
        getDashboardRequest().catch(() => null),
        getVehiclesRequest().catch(() => []),
        getIncidentsRequest().catch(() => []),
        listActivationKeysRequest()
          .then((response) => response.data?.keys || response.data || [])
          .catch(() => []),
      ]);

      set({
        dashboard,
        vehicles,
        incidents,
        activationKeys,
        isLoading: false,
      });
    } catch (error) {
      set({
        isLoading: false,
        error: getApiErrorMessage(error, 'No se pudo actualizar la operación.'),
      });
    }
  },

  async loadPlans() {
    try {
      const plans = await getCommercialPlansRequest();
      set({ plans });
    } catch (error) {
      set({ error: getApiErrorMessage(error, 'No se pudieron cargar los planes.') });
    }
  },

  async checkoutPlan(planId, requestTrial = false) {
    const user = get().user;
    if (!user) {
      return { ok: false, message: 'Inicia sesión para seleccionar un plan.' };
    }

    set({ isLoading: true, error: null });
    try {
      await checkoutPlanRequest({ planId, user, requestTrial });
      const session = await getSessionRequest();
      set({
        user: session.user,
        dashboard: resolveDashboard(session.dashboard),
        isLoading: false,
      });
      return { ok: true };
    } catch (error) {
      const message = getApiErrorMessage(error, 'No se pudo iniciar la compra del plan.');
      set({ isLoading: false, error: message });
      return { ok: false, message };
    }
  },

  clearError() {
    set({ error: null });
  },
}));
