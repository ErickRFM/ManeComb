import { isAxiosError } from 'axios';
import { create } from 'zustand';
import {
  cancelAccountSubscriptionRequest,
  changeAccountPlanRequest,
  generateAdminActivationKeyRequest,
  getAdminActivationKeysRequest,
  getAccountInvoicesRequest,
  getAccountSessionsRequest,
  getAccountSubscriptionRequest,
  getApiErrorMessage,
  getPortalOnboardingRequest,
  getPortalOverviewRequest,
  revokeAccountSessionRequest,
  revokeAdminActivationKeyRequest,
} from '../api';
import type {
  PortalInvoice,
  PortalActivationKey,
  PortalActivationKeysSummary,
  PortalOnboarding,
  PortalOverview,
  PortalSession,
  PortalSubscription,
} from '../types';

type PortalActionResult = {
  ok: boolean;
  message?: string;
};

type PortalStore = {
  overview: PortalOverview | null;
  onboarding: PortalOnboarding | null;
  subscription: PortalSubscription | null;
  activationKeys: PortalActivationKey[];
  activationSummary: PortalActivationKeysSummary | null;
  invoices: PortalInvoice[];
  sessions: PortalSession[];
  isLoading: boolean;
  isSubmitting: boolean;
  error: string | null;
  loadOverview: () => Promise<void>;
  loadActivationKeys: () => Promise<void>;
  loadBilling: () => Promise<void>;
  loadSessions: () => Promise<void>;
  loadAll: () => Promise<void>;
  generateActivationKey: () => Promise<PortalActionResult>;
  revokeActivationKey: (activationKeyId: string) => Promise<PortalActionResult>;
  changePlan: (planId: string, selectedAddOns?: string[]) => Promise<PortalActionResult>;
  cancelPlan: (reason?: string) => Promise<PortalActionResult>;
  revokeSession: (sessionId: string) => Promise<PortalActionResult>;
  applyRealtimeEvent: (eventName: string, payload?: unknown) => void;
  reset: () => void;
  clearError: () => void;
};

const emptyPortalState = {
  overview: null,
  onboarding: null,
  subscription: null,
  activationKeys: [],
  activationSummary: null,
  invoices: [],
  sessions: [],
  isLoading: false,
  isSubmitting: false,
  error: null,
};

async function getOptionalActivationKeys() {
  return await getAdminActivationKeysRequest().catch(() => ({
    keys: [],
    summary: null,
  }));
}

function getMessage(error: unknown, fallback: string) {
  if (isAxiosError(error)) {
    return getApiErrorMessage(error, fallback);
  }

  return error instanceof Error ? error.message : fallback;
}

function needsFullCommercialReload(eventName: string) {
  return ['payment:confirmed', 'plan:active', 'subscription:updated'].includes(eventName);
}

export const usePortalStore = create<PortalStore>((set, get) => ({
  overview: null,
  onboarding: null,
  subscription: null,
  activationKeys: [],
  activationSummary: null,
  invoices: [],
  sessions: [],
  isLoading: false,
  isSubmitting: false,
  error: null,
  reset: () => set(emptyPortalState),
  clearError: () => set({ error: null }),
  loadOverview: async () => {
    set({ isLoading: true, error: null });
    try {
      const [overview, subscription, onboarding, activationKeysResponse] = await Promise.all([
        getPortalOverviewRequest(),
        getAccountSubscriptionRequest(),
        getPortalOnboardingRequest(),
        getOptionalActivationKeys(),
      ]);

      set({
        overview,
        subscription,
        onboarding,
        activationKeys: activationKeysResponse.keys,
        activationSummary: activationKeysResponse.summary,
        isLoading: false,
      });
    } catch (error) {
      set({ error: getMessage(error, 'No fue posible cargar el portal.'), isLoading: false });
    }
  },
  loadActivationKeys: async () => {
    set({ isLoading: true, error: null });
    try {
      const activationKeysResponse = await getAdminActivationKeysRequest();
      set({
        activationKeys: activationKeysResponse.keys,
        activationSummary: activationKeysResponse.summary,
        isLoading: false,
      });
    } catch (error) {
      set({ error: getMessage(error, 'No fue posible cargar keys de activacion.'), isLoading: false });
    }
  },
  loadBilling: async () => {
    set({ isLoading: true, error: null });
    try {
      const invoices = await getAccountInvoicesRequest();
      set({ invoices, isLoading: false });
    } catch (error) {
      set({ error: getMessage(error, 'No fue posible cargar facturacion.'), isLoading: false });
    }
  },
  loadSessions: async () => {
    set({ isLoading: true, error: null });
    try {
      const sessions = await getAccountSessionsRequest();
      set({ sessions, isLoading: false });
    } catch (error) {
      set({ error: getMessage(error, 'No fue posible cargar sesiones.'), isLoading: false });
    }
  },
  loadAll: async () => {
    set({ isLoading: true, error: null });
    try {
      const [overview, subscription, onboarding, activationKeysResponse, invoices, sessions] =
        await Promise.all([
          getPortalOverviewRequest(),
          getAccountSubscriptionRequest(),
          getPortalOnboardingRequest(),
          getOptionalActivationKeys(),
          getAccountInvoicesRequest(),
          getAccountSessionsRequest(),
        ]);

      set({
        overview,
        subscription,
        onboarding,
        activationKeys: activationKeysResponse.keys,
        activationSummary: activationKeysResponse.summary,
        invoices,
        sessions,
        isLoading: false,
      });
    } catch (error) {
      set({ error: getMessage(error, 'No fue posible cargar los datos de cuenta.'), isLoading: false });
    }
  },
  generateActivationKey: async () => {
    set({ isSubmitting: true, error: null });
    try {
      const activationKeysResponse = await generateAdminActivationKeyRequest();
      set({
        activationKeys: activationKeysResponse.keys,
        activationSummary: activationKeysResponse.summary,
        isSubmitting: false,
      });
      void get().loadOverview();
      return { ok: true };
    } catch (error) {
      const message = getMessage(error, 'No fue posible generar la key.');
      set({ error: message, isSubmitting: false });
      return { ok: false, message };
    }
  },
  revokeActivationKey: async (activationKeyId) => {
    set({ isSubmitting: true, error: null });
    try {
      const activationKeysResponse = await revokeAdminActivationKeyRequest(activationKeyId);
      set({
        activationKeys: activationKeysResponse.keys,
        activationSummary: activationKeysResponse.summary,
        isSubmitting: false,
      });
      void get().loadOverview();
      return { ok: true };
    } catch (error) {
      const message = getMessage(error, 'No fue posible revocar la key.');
      set({ error: message, isSubmitting: false });
      return { ok: false, message };
    }
  },
  changePlan: async (planId, selectedAddOns = []) => {
    set({ isSubmitting: true, error: null });
    try {
      const subscription = await changeAccountPlanRequest(planId, selectedAddOns);
      set({ subscription, isSubmitting: false });
      void get().loadOverview();
      return { ok: true };
    } catch (error) {
      const message = getMessage(error, 'No fue posible cambiar el plan.');
      set({ error: message, isSubmitting: false });
      return { ok: false, message };
    }
  },
  cancelPlan: async (reason) => {
    set({ isSubmitting: true, error: null });
    try {
      const subscription = await cancelAccountSubscriptionRequest(reason);
      set({ subscription, isSubmitting: false });
      void get().loadOverview();
      return { ok: true };
    } catch (error) {
      const message = getMessage(error, 'No fue posible cancelar el plan.');
      set({ error: message, isSubmitting: false });
      return { ok: false, message };
    }
  },
  revokeSession: async (sessionId) => {
    set({ isSubmitting: true, error: null });
    try {
      await revokeAccountSessionRequest(sessionId);
      set((state) => ({
        sessions: state.sessions.filter((session) => session.id !== sessionId),
        isSubmitting: false,
      }));
      return { ok: true };
    } catch (error) {
      const message = getMessage(error, 'No fue posible cerrar la sesion.');
      set({ error: message, isSubmitting: false });
      return { ok: false, message };
    }
  },
  applyRealtimeEvent: (eventName, payload) => {
    if (
      [
        'account:created',
        'payment:confirmed',
        'plan:active',
        'users:invited',
        'user:first-login',
        'subscription:updated',
        'onboarding:updated',
        'activation-keys:updated',
      ].includes(eventName)
    ) {
      if (eventName === 'subscription:updated' && payload && typeof payload === 'object') {
        const subscription = (payload as { subscription?: PortalSubscription }).subscription;
        if (subscription) {
          set({ subscription });
        }
      }

      if (eventName === 'onboarding:updated' && payload && typeof payload === 'object') {
        const onboarding = (payload as { onboarding?: PortalOnboarding }).onboarding;
        if (onboarding) {
          set({ onboarding });
        }
      }

      if (eventName === 'activation-keys:updated' && payload && typeof payload === 'object') {
        const activationPayload = payload as {
          keys?: PortalActivationKey[];
          summary?: PortalActivationKeysSummary;
        };
        if (activationPayload.keys && activationPayload.summary) {
          set({
            activationKeys: activationPayload.keys,
            activationSummary: activationPayload.summary,
          });
        }
      }

      if (needsFullCommercialReload(eventName)) {
        void get().loadAll();
        return;
      }

      void get().loadOverview();
    }
  },
}));
