import type { PortalResourceDomain, PortalStore } from './portal-types';
import { PORTAL_LOAD_TTL_MS, emptyPortalState } from './portal-initial-state';
import { getErrorCode, getOptionalActivationKeys, getMessage } from './portal-api';
import { applyIncrementalResourceEvent, beginResourceAttempt, completeResourceAttempt, failResourceAttempt } from '@shared/resource-state';
import { needsFullCommercialReload } from './portal-utils';
import {
  cancelAccountSubscriptionRequest,
  changeAccountPlanRequest,
  generateAdminActivationKeyRequest,
  getAdminActivationKeysRequest,
  getAccountInvoicesRequest,
  getAccountSessionsRequest,
  getAccountSubscriptionRequest,
  getAppInfoRequest,
  getDocumentsRequest,
  getIncidentsRequest,
  getPortalOnboardingRequest,
  getPortalOverviewRequest,
  reviewDocumentRequest,
  revokeAccountSessionRequest,
  revokeAdminActivationKeyRequest,
  shareAdminActivationKeyRequest,
  deleteAdminActivationKeyRequest,
  updateAppInfoRequest,
  updateIncidentStatusRequest,
} from '../api';
import type {
  PortalActivationKey,
  PortalActivationKeysSummary,
  PortalOnboarding,
  PortalSubscription,
} from '../types';

let fullLoadPromise: Promise<void> | null = null;
let lastFullLoadAt = 0;
let lastFullLoadIncludedBilling = false;
const activeLoads = new Map<PortalResourceDomain, number>();

function beginResourceLoad(
  set: (partial: Partial<PortalStore> | ((state: PortalStore) => Partial<PortalStore>)) => void,
  domain: PortalResourceDomain,
) {
  activeLoads.set(domain, (activeLoads.get(domain) || 0) + 1);
  set((state) => ({
    isLoading: true,
    resources: {
      ...state.resources,
      [domain]: {
        ...beginResourceAttempt(state.resources[domain]),
      },
    },
  }));
}

function finishResourceLoad(
  set: (partial: Partial<PortalStore> | ((state: PortalStore) => Partial<PortalStore>)) => void,
  domain: PortalResourceDomain,
  outcome: { empty?: boolean; errorCode?: string; errorMessage?: string; source?: 'rest' | 'realtime' | 'cache' } = {},
) {
  const remaining = Math.max(0, (activeLoads.get(domain) || 1) - 1);
  if (remaining) activeLoads.set(domain, remaining);
  else activeLoads.delete(domain);
  set((state) => ({
    isLoading: activeLoads.size > 0,
    resources: {
      ...state.resources,
      [domain]: remaining
        ? state.resources[domain]
        : outcome.errorMessage
          ? failResourceAttempt(state.resources[domain], {
              errorCode: outcome.errorCode || 'request_failed',
              errorMessage: outcome.errorMessage,
            })
          : completeResourceAttempt(state.resources[domain], {
              empty: Boolean(outcome.empty),
              source: outcome.source || 'rest',
            }),
    },
  }));
}

function resourceFailure(error: unknown, fallback: string) {
  return {
    errorCode: getErrorCode(error),
    errorMessage: getMessage(error, fallback),
  };
}

function markIncrementalRealtime(
  set: (partial: Partial<PortalStore> | ((state: PortalStore) => Partial<PortalStore>)) => void,
  domain: PortalResourceDomain,
) {
  set((state) => ({
    resources: {
      ...state.resources,
      [domain]: applyIncrementalResourceEvent(state.resources[domain]),
    },
  }));
}

export function createPortalActions(
  set: (partial: Partial<PortalStore> | ((state: PortalStore) => Partial<PortalStore>)) => void,
  get: () => PortalStore,
): Pick<PortalStore,
  | 'loadOverview' | 'loadAppInfo' | 'updateAppInfo'
  | 'loadActivationKeys' | 'loadBilling' | 'loadSessions'
  | 'loadDocuments' | 'loadIncidents' | 'loadAll'
  | 'generateActivationKey' | 'shareActivationKey'
  | 'revokeActivationKey' | 'deleteActivationKey'
  | 'changePlan' | 'cancelPlan'
  | 'reviewDocument' | 'updateIncidentStatus'
  | 'revokeSession'
  | 'applyRealtimeEvent'
  | 'reset' | 'clearError'
> {
  return {
    reset: () => {
      fullLoadPromise = null;
      lastFullLoadAt = 0;
      lastFullLoadIncludedBilling = false;
      activeLoads.clear();
      set(emptyPortalState);
    },
    clearError: () => set({ error: null }),
    loadOverview: async () => {
      beginResourceLoad(set, 'account');
      beginResourceLoad(set, 'activationKeys');
      set({ error: null });
      const [overviewResult, subscriptionResult, onboardingResult, activationKeysResult] = await Promise.allSettled([
          getPortalOverviewRequest(),
          getAccountSubscriptionRequest(),
          getPortalOnboardingRequest(),
          getOptionalActivationKeys(),
        ]);
      const accountResults = [overviewResult, subscriptionResult, onboardingResult];
      set({
        ...(overviewResult.status === 'fulfilled' ? { overview: overviewResult.value } : {}),
        ...(subscriptionResult.status === 'fulfilled' ? { subscription: subscriptionResult.value } : {}),
        ...(onboardingResult.status === 'fulfilled' ? { onboarding: onboardingResult.value } : {}),
        ...(activationKeysResult.status === 'fulfilled' ? {
          activationKeys: activationKeysResult.value.keys,
          activationSummary: activationKeysResult.value.summary,
        } : {}),
      });
      const accountFailure = accountResults.find((result) => result.status === 'rejected');
      if (accountFailure?.status === 'rejected') {
        const failure = resourceFailure(accountFailure.reason, 'No fue posible actualizar la cuenta.');
        set({ error: failure.errorMessage });
        finishResourceLoad(set, 'account', failure);
      } else {
        finishResourceLoad(set, 'account');
      }
      if (activationKeysResult.status === 'rejected') {
        const failure = resourceFailure(activationKeysResult.reason, 'No fue posible cargar keys de activación.');
        set({ error: failure.errorMessage });
        finishResourceLoad(set, 'activationKeys', failure);
      } else {
        finishResourceLoad(set, 'activationKeys', { empty: activationKeysResult.value.keys.length === 0 });
      }
    },
    loadAppInfo: async () => {
      beginResourceLoad(set, 'appInfo');
      set({ error: null });
      try {
        const appInfo = await getAppInfoRequest();
        set({ appInfo });
        finishResourceLoad(set, 'appInfo', { empty: !appInfo });
      } catch (error) {
        const failure = resourceFailure(error, 'No fue posible cargar info de la app.');
        set({ error: failure.errorMessage });
        finishResourceLoad(set, 'appInfo', failure);
      }
    },
    updateAppInfo: async (payload) => {
      if (get().isSubmitting) return { ok: false, message: 'Hay una operacion en curso.' };
      set({ isSubmitting: true, error: null });
      try {
        const appInfo = await updateAppInfoRequest(payload);
        set({ appInfo, isSubmitting: false });
        return { ok: true };
      } catch (error) {
        const message = getMessage(error, 'No fue posible actualizar la app.');
        set({ error: message, isSubmitting: false });
        return { ok: false, message };
      }
    },
    loadActivationKeys: async () => {
      beginResourceLoad(set, 'activationKeys');
      set({ error: null });
      try {
        const activationKeysResponse = await getAdminActivationKeysRequest();
        set({
          activationKeys: activationKeysResponse.keys,
          activationSummary: activationKeysResponse.summary,
        });
        finishResourceLoad(set, 'activationKeys', { empty: activationKeysResponse.keys.length === 0 });
      } catch (error) {
        const failure = resourceFailure(error, 'No fue posible cargar keys de activación.');
        set({ error: failure.errorMessage });
        finishResourceLoad(set, 'activationKeys', failure);
      }
    },
    loadBilling: async () => {
      beginResourceLoad(set, 'billing');
      set({ error: null });
      try {
        const invoices = await getAccountInvoicesRequest();
        set({ invoices });
        finishResourceLoad(set, 'billing', { empty: invoices.length === 0 });
      } catch (error) {
        const message = getMessage(error, 'No fue posible cargar facturacion.');
        set({ error: message });
        finishResourceLoad(set, 'billing', { errorCode: getErrorCode(error), errorMessage: message });
      }
    },
    loadSessions: async () => {
      beginResourceLoad(set, 'sessions');
      set({ error: null });
      try {
        const sessions = await getAccountSessionsRequest();
        set({ sessions });
        finishResourceLoad(set, 'sessions', { empty: sessions.length === 0 });
      } catch (error) {
        const failure = resourceFailure(error, 'No fue posible cargar sesiones.');
        set({ error: failure.errorMessage });
        finishResourceLoad(set, 'sessions', failure);
      }
    },
    loadDocuments: async () => {
      beginResourceLoad(set, 'documents');
      set({ error: null });
      try {
        const documents = await getDocumentsRequest();
        set({ documents });
        finishResourceLoad(set, 'documents', { empty: documents.length === 0 });
      } catch (error) {
        const failure = resourceFailure(error, 'No fue posible cargar los documentos.');
        set({ error: failure.errorMessage });
        finishResourceLoad(set, 'documents', failure);
      }
    },
    loadIncidents: async () => {
      beginResourceLoad(set, 'incidents');
      set({ error: null });
      try {
        const incidents = await getIncidentsRequest();
        set({ incidents });
        finishResourceLoad(set, 'incidents', { empty: incidents.length === 0 });
      } catch (error) {
        const failure = resourceFailure(error, 'No fue posible cargar las incidencias.');
        set({ error: failure.errorMessage });
        finishResourceLoad(set, 'incidents', failure);
      }
    },
    loadAll: async (options) => {
      const includeBilling = typeof options?.includeBilling === 'boolean'
        ? options.includeBilling
        : lastFullLoadIncludedBilling;
      const billingScopeChanged = includeBilling !== lastFullLoadIncludedBilling;

      if (fullLoadPromise) return fullLoadPromise;
      if (
        !options?.force &&
        !billingScopeChanged &&
        lastFullLoadAt &&
        Date.now() - lastFullLoadAt < PORTAL_LOAD_TTL_MS
      ) return;

      fullLoadPromise = (async () => {
        beginResourceLoad(set, 'account');
        beginResourceLoad(set, 'activationKeys');
        beginResourceLoad(set, 'sessions');
        if (includeBilling) beginResourceLoad(set, 'billing');
        set({ error: null });
        try {
          const [overviewResult, subscriptionResult, onboardingResult, activationKeysResult, invoicesResult, sessionsResult] =
            await Promise.allSettled([
              getPortalOverviewRequest(),
              getAccountSubscriptionRequest(),
              getPortalOnboardingRequest(),
              getOptionalActivationKeys(),
              includeBilling ? getAccountInvoicesRequest() : Promise.resolve([]),
              getAccountSessionsRequest(),
            ]);

          lastFullLoadAt = Date.now();
          lastFullLoadIncludedBilling = includeBilling;
          set({
            ...(overviewResult.status === 'fulfilled' ? { overview: overviewResult.value } : {}),
            ...(subscriptionResult.status === 'fulfilled' ? { subscription: subscriptionResult.value } : {}),
            ...(onboardingResult.status === 'fulfilled' ? { onboarding: onboardingResult.value } : {}),
            ...(activationKeysResult.status === 'fulfilled' ? {
              activationKeys: activationKeysResult.value.keys,
              activationSummary: activationKeysResult.value.summary,
            } : {}),
            ...(includeBilling && invoicesResult.status === 'fulfilled'
              ? { invoices: invoicesResult.value }
              : {}),
            ...(sessionsResult.status === 'fulfilled' ? { sessions: sessionsResult.value } : {}),
          });

          const failures: string[] = [];
          const accountFailure = [overviewResult, subscriptionResult, onboardingResult]
            .find((result) => result.status === 'rejected');
          if (accountFailure?.status === 'rejected') {
            const failure = resourceFailure(accountFailure.reason, 'No fue posible actualizar la cuenta.');
            failures.push(failure.errorMessage);
            finishResourceLoad(set, 'account', failure);
          } else finishResourceLoad(set, 'account');

          if (activationKeysResult.status === 'rejected') {
            const failure = resourceFailure(activationKeysResult.reason, 'No fue posible actualizar keys de activación.');
            failures.push(failure.errorMessage);
            finishResourceLoad(set, 'activationKeys', failure);
          } else finishResourceLoad(set, 'activationKeys', { empty: activationKeysResult.value.keys.length === 0 });

          if (includeBilling) {
            if (invoicesResult.status === 'rejected') {
              const failure = resourceFailure(invoicesResult.reason, 'No fue posible actualizar facturación.');
              failures.push(failure.errorMessage);
              finishResourceLoad(set, 'billing', failure);
            } else finishResourceLoad(set, 'billing', { empty: (invoicesResult.value || []).length === 0 });
          }

          if (sessionsResult.status === 'rejected') {
            const failure = resourceFailure(sessionsResult.reason, 'No fue posible actualizar sesiones.');
            failures.push(failure.errorMessage);
            finishResourceLoad(set, 'sessions', failure);
          } else finishResourceLoad(set, 'sessions', { empty: sessionsResult.value.length === 0 });

          if (failures.length) set({ error: failures[0] });
        } catch (error) {
          // Programming/setup failures outside the independent requests still
          // terminate every resource attempt without discarding prior data.
          const failure = resourceFailure(error, 'No fue posible cargar los datos de cuenta.');
          set({ error: failure.errorMessage });
          finishResourceLoad(set, 'account', failure);
          finishResourceLoad(set, 'activationKeys', failure);
          finishResourceLoad(set, 'sessions', failure);
          if (includeBilling) finishResourceLoad(set, 'billing', failure);
        } finally {
          fullLoadPromise = null;
        }
      })();

      return fullLoadPromise;
    },
    generateActivationKey: async () => {
      if (get().isSubmitting) return { ok: false, message: 'Hay una operacion en curso.' };
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
    shareActivationKey: async (activationKeyId) => {
      if (get().isSubmitting) return { ok: false, message: 'Hay una operacion en curso.' };
      set({ isSubmitting: true, error: null });
      try {
        const activationKeysResponse = await shareAdminActivationKeyRequest(activationKeyId);
        set({
          activationKeys: activationKeysResponse.keys,
          activationSummary: activationKeysResponse.summary,
          isSubmitting: false,
        });
        void get().loadOverview();
        return { ok: true };
      } catch (error) {
        const message = getMessage(error, 'No fue posible compartir la key.');
        set({ error: message, isSubmitting: false });
        return { ok: false, message };
      }
    },
    revokeActivationKey: async (activationKeyId) => {
      if (get().isSubmitting) return { ok: false, message: 'Hay una operacion en curso.' };
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
    deleteActivationKey: async (activationKeyId) => {
      if (get().isSubmitting) return { ok: false, message: 'Hay una operacion en curso.' };
      set({ isSubmitting: true, error: null });
      try {
        const activationKeysResponse = await deleteAdminActivationKeyRequest(activationKeyId);
        set({
          activationKeys: activationKeysResponse.keys,
          activationSummary: activationKeysResponse.summary,
          isSubmitting: false,
        });
        void get().loadOverview();
        return { ok: true };
      } catch (error) {
        const message = getMessage(error, 'No fue posible eliminar la key.');
        set({ error: message, isSubmitting: false });
        return { ok: false, message };
      }
    },
    changePlan: async (planId, selectedAddOns = []) => {
      if (get().isSubmitting) return { ok: false, message: 'Hay una operacion en curso.' };
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
      if (get().isSubmitting) return { ok: false, message: 'Hay una operacion en curso.' };
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
    reviewDocument: async (documentId, payload) => {
      if (get().isSubmitting) return { ok: false, message: 'Hay una operacion en curso.' };
      set({ isSubmitting: true, error: null });
      try {
        const updated = await reviewDocumentRequest(documentId, payload);
        set((state) => ({
          documents: state.documents.map((d) => (d.id === documentId ? updated : d)),
          isSubmitting: false,
        }));
        return { ok: true };
      } catch (error) {
        const message = getMessage(error, 'No fue posible revisar el documento.');
        set({ error: message, isSubmitting: false });
        return { ok: false, message };
      }
    },
    updateIncidentStatus: async (incidentId, status) => {
      if (get().isSubmitting) return { ok: false, message: 'Hay una operacion en curso.' };
      set({ isSubmitting: true, error: null });
      try {
        const updated = await updateIncidentStatusRequest(incidentId, status);
        set((state) => ({
          incidents: state.incidents.map((i) => (i.id === incidentId ? updated : i)),
          isSubmitting: false,
        }));
        return { ok: true };
      } catch (error) {
        const message = getMessage(error, 'No fue posible actualizar la incidencia.');
        set({ error: message, isSubmitting: false });
        return { ok: false, message };
      }
    },
    revokeSession: async (sessionId) => {
      if (get().isSubmitting) return { ok: false, message: 'Hay una operacion en curso.' };
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
      if (eventName === 'incident:updated' && payload && typeof payload === 'object' && 'id' in payload) {
        const incident = payload as PortalStore['incidents'][number];
        set((state) => ({
          incidents: state.incidents.some((entry) => entry.id === incident.id)
            ? state.incidents.map((entry) => entry.id === incident.id ? incident : entry)
            : [...state.incidents, incident],
        }));
        markIncrementalRealtime(set, 'incidents');
        return;
      }
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
          'driver:offboarded',
          'driver:reactivated',
          'vehicle:released',
          'activation:summary-updated',
        ].includes(eventName)
      ) {
        if (eventName === 'subscription:updated' && payload && typeof payload === 'object') {
          const subscription = (payload as { subscription?: PortalSubscription }).subscription;
          if (subscription) {
            set({ subscription });
            markIncrementalRealtime(set, 'account');
          }
        }

        if (eventName === 'onboarding:updated' && payload && typeof payload === 'object') {
          const onboarding = (payload as { onboarding?: PortalOnboarding }).onboarding;
          if (onboarding) {
            set({ onboarding });
            markIncrementalRealtime(set, 'account');
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
            markIncrementalRealtime(set, 'activationKeys');
          }
        }

        if (needsFullCommercialReload(eventName)) {
          void get().loadAll({ force: true, includeBilling: lastFullLoadIncludedBilling });
          return;
        }

        void get().loadOverview();
      }
    },
  };
}
