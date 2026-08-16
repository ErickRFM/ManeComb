import type { PortalResourceDomain, PortalStore } from './portal-types';
import { PORTAL_LOAD_TTL_MS, emptyPortalState } from './portal-initial-state';
import { getErrorCode, getOptionalActivationKeys, getMessage } from './portal-api';
import { applyIncrementalResourceEvent, beginResourceAttempt, completeResourceAttempt, failResourceAttempt } from '@shared/resource-state';
import { createLatestEffectCoordinator, createResourceLoadCoordinator } from '@shared/resource-load-coordinator';
import { shouldSkipResourceLoad } from '@shared/resource-load-policy';
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
const loadCoordinator = createResourceLoadCoordinator<PortalResourceDomain>();
const globalEffectCoordinator = createLatestEffectCoordinator();

function beginGlobalEffect() {
  return globalEffectCoordinator.begin();
}

function setLatestGlobalError(
  set: (partial: Partial<PortalStore> | ((state: PortalStore) => Partial<PortalStore>)) => void,
  generation: number,
  error: string | null,
) {
  if (globalEffectCoordinator.isLatest(generation)) set({ error });
}

function beginResourceLoad(
  set: (partial: Partial<PortalStore> | ((state: PortalStore) => Partial<PortalStore>)) => void,
  domain: PortalResourceDomain,
) {
  const generation = loadCoordinator.begin(domain);
  set((state) => ({
    isLoading: true,
    resources: {
      ...state.resources,
      [domain]: {
        ...beginResourceAttempt(state.resources[domain]),
      },
    },
  }));
  return generation;
}

function finishResourceLoad(
  set: (partial: Partial<PortalStore> | ((state: PortalStore) => Partial<PortalStore>)) => void,
  domain: PortalResourceDomain,
  generation: number,
  outcome: { empty?: boolean; errorCode?: string; errorMessage?: string; source?: 'rest' | 'realtime' | 'cache' } = {},
) {
  const completion = loadCoordinator.finish(domain, generation);
  set((state) => ({
    isLoading: completion.isLoading,
    resources: {
      ...state.resources,
      [domain]: !completion.isLatest
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

function setLatestResourceData(
  set: (partial: Partial<PortalStore> | ((state: PortalStore) => Partial<PortalStore>)) => void,
  domain: PortalResourceDomain,
  generation: number,
  partial: Partial<PortalStore>,
) {
  if (loadCoordinator.isLatest(domain, generation)) set(partial);
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
  hasDataAfterMutation: boolean,
) {
  set((state) => ({
    resources: {
      ...state.resources,
      [domain]: applyIncrementalResourceEvent(state.resources[domain], { hasDataAfterMutation }),
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
      globalEffectCoordinator.invalidate();
      loadCoordinator.reset();
      set(emptyPortalState);
    },
    clearError: () => set({ error: null }),
    loadOverview: async () => {
      const effectGeneration = beginGlobalEffect();
      const accountGeneration = beginResourceLoad(set, 'account');
      const activationKeysGeneration = beginResourceLoad(set, 'activationKeys');
      setLatestGlobalError(set, effectGeneration, null);
      const [overviewResult, subscriptionResult, onboardingResult, activationKeysResult] = await Promise.allSettled([
          getPortalOverviewRequest(),
          getAccountSubscriptionRequest(),
          getPortalOnboardingRequest(),
          getOptionalActivationKeys(),
        ]);
      const accountResults = [overviewResult, subscriptionResult, onboardingResult];
      setLatestResourceData(set, 'account', accountGeneration, {
        ...(overviewResult.status === 'fulfilled' ? { overview: overviewResult.value } : {}),
        ...(subscriptionResult.status === 'fulfilled' ? { subscription: subscriptionResult.value } : {}),
        ...(onboardingResult.status === 'fulfilled' ? { onboarding: onboardingResult.value } : {}),
      });
      setLatestResourceData(set, 'activationKeys', activationKeysGeneration, {
        ...(activationKeysResult.status === 'fulfilled' ? {
          activationKeys: activationKeysResult.value.keys,
          activationSummary: activationKeysResult.value.summary,
        } : {}),
      });
      const accountFailure = accountResults.find((result) => result.status === 'rejected');
      if (accountFailure?.status === 'rejected') {
        const failure = resourceFailure(accountFailure.reason, 'No fue posible actualizar la cuenta.');
        setLatestGlobalError(set, effectGeneration, failure.errorMessage);
        finishResourceLoad(set, 'account', accountGeneration, failure);
      } else {
        finishResourceLoad(set, 'account', accountGeneration);
      }
      if (activationKeysResult.status === 'rejected') {
        const failure = resourceFailure(activationKeysResult.reason, 'No fue posible cargar keys de activación.');
        setLatestGlobalError(set, effectGeneration, failure.errorMessage);
        finishResourceLoad(set, 'activationKeys', activationKeysGeneration, failure);
      } else {
        finishResourceLoad(set, 'activationKeys', activationKeysGeneration, { empty: activationKeysResult.value.keys.length === 0 });
      }
    },
    loadAppInfo: async () => {
      const effectGeneration = beginGlobalEffect();
      const generation = beginResourceLoad(set, 'appInfo');
      setLatestGlobalError(set, effectGeneration, null);
      try {
        const appInfo = await getAppInfoRequest();
        setLatestResourceData(set, 'appInfo', generation, { appInfo });
        finishResourceLoad(set, 'appInfo', generation, { empty: !appInfo });
      } catch (error) {
        const failure = resourceFailure(error, 'No fue posible cargar info de la app.');
        setLatestGlobalError(set, effectGeneration, failure.errorMessage);
        finishResourceLoad(set, 'appInfo', generation, failure);
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
      const effectGeneration = beginGlobalEffect();
      const generation = beginResourceLoad(set, 'activationKeys');
      setLatestGlobalError(set, effectGeneration, null);
      try {
        const activationKeysResponse = await getAdminActivationKeysRequest();
        setLatestResourceData(set, 'activationKeys', generation, {
          activationKeys: activationKeysResponse.keys,
          activationSummary: activationKeysResponse.summary,
        });
        finishResourceLoad(set, 'activationKeys', generation, { empty: activationKeysResponse.keys.length === 0 });
      } catch (error) {
        const failure = resourceFailure(error, 'No fue posible cargar keys de activación.');
        setLatestGlobalError(set, effectGeneration, failure.errorMessage);
        finishResourceLoad(set, 'activationKeys', generation, failure);
      }
    },
    loadBilling: async () => {
      const effectGeneration = beginGlobalEffect();
      const generation = beginResourceLoad(set, 'billing');
      setLatestGlobalError(set, effectGeneration, null);
      try {
        const invoices = await getAccountInvoicesRequest();
        setLatestResourceData(set, 'billing', generation, { invoices });
        finishResourceLoad(set, 'billing', generation, { empty: invoices.length === 0 });
      } catch (error) {
        const message = getMessage(error, 'No fue posible cargar facturacion.');
        setLatestGlobalError(set, effectGeneration, message);
        finishResourceLoad(set, 'billing', generation, { errorCode: getErrorCode(error), errorMessage: message });
      }
    },
    loadSessions: async () => {
      const effectGeneration = beginGlobalEffect();
      const generation = beginResourceLoad(set, 'sessions');
      setLatestGlobalError(set, effectGeneration, null);
      try {
        const sessions = await getAccountSessionsRequest();
        setLatestResourceData(set, 'sessions', generation, { sessions });
        finishResourceLoad(set, 'sessions', generation, { empty: sessions.length === 0 });
      } catch (error) {
        const failure = resourceFailure(error, 'No fue posible cargar sesiones.');
        setLatestGlobalError(set, effectGeneration, failure.errorMessage);
        finishResourceLoad(set, 'sessions', generation, failure);
      }
    },
    loadDocuments: async () => {
      const effectGeneration = beginGlobalEffect();
      const generation = beginResourceLoad(set, 'documents');
      setLatestGlobalError(set, effectGeneration, null);
      try {
        const documents = await getDocumentsRequest();
        setLatestResourceData(set, 'documents', generation, { documents });
        finishResourceLoad(set, 'documents', generation, { empty: documents.length === 0 });
      } catch (error) {
        const failure = resourceFailure(error, 'No fue posible cargar los documentos.');
        setLatestGlobalError(set, effectGeneration, failure.errorMessage);
        finishResourceLoad(set, 'documents', generation, failure);
      }
    },
    loadIncidents: async () => {
      const effectGeneration = beginGlobalEffect();
      const generation = beginResourceLoad(set, 'incidents');
      setLatestGlobalError(set, effectGeneration, null);
      try {
        const incidents = await getIncidentsRequest();
        setLatestResourceData(set, 'incidents', generation, { incidents });
        finishResourceLoad(set, 'incidents', generation, { empty: incidents.length === 0 });
      } catch (error) {
        const failure = resourceFailure(error, 'No fue posible cargar las incidencias.');
        setLatestGlobalError(set, effectGeneration, failure.errorMessage);
        finishResourceLoad(set, 'incidents', generation, failure);
      }
    },
    loadAll: async (options) => {
      const includeBilling = typeof options?.includeBilling === 'boolean'
        ? options.includeBilling
        : lastFullLoadIncludedBilling;
      const billingScopeChanged = includeBilling !== lastFullLoadIncludedBilling;

      if (fullLoadPromise) return fullLoadPromise;
      if (shouldSkipResourceLoad({
        scope: 'full',
        force: options?.force,
        scopeChanged: billingScopeChanged,
        lastFullLoadAt,
        now: Date.now(),
        ttlMs: PORTAL_LOAD_TTL_MS,
      })) return;

      fullLoadPromise = (async () => {
        const effectGeneration = beginGlobalEffect();
        const accountGeneration = beginResourceLoad(set, 'account');
        const activationKeysGeneration = beginResourceLoad(set, 'activationKeys');
        const sessionsGeneration = beginResourceLoad(set, 'sessions');
        const billingGeneration = includeBilling ? beginResourceLoad(set, 'billing') : null;
        setLatestGlobalError(set, effectGeneration, null);
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
          setLatestResourceData(set, 'account', accountGeneration, {
            ...(overviewResult.status === 'fulfilled' ? { overview: overviewResult.value } : {}),
            ...(subscriptionResult.status === 'fulfilled' ? { subscription: subscriptionResult.value } : {}),
            ...(onboardingResult.status === 'fulfilled' ? { onboarding: onboardingResult.value } : {}),
          });
          setLatestResourceData(set, 'activationKeys', activationKeysGeneration, {
            ...(activationKeysResult.status === 'fulfilled' ? {
              activationKeys: activationKeysResult.value.keys,
              activationSummary: activationKeysResult.value.summary,
            } : {}),
          });
          if (billingGeneration !== null && invoicesResult.status === 'fulfilled') {
            setLatestResourceData(set, 'billing', billingGeneration, { invoices: invoicesResult.value });
          }
          setLatestResourceData(set, 'sessions', sessionsGeneration, {
            ...(sessionsResult.status === 'fulfilled' ? { sessions: sessionsResult.value } : {}),
          });

          const failures: string[] = [];
          const accountFailure = [overviewResult, subscriptionResult, onboardingResult]
            .find((result) => result.status === 'rejected');
          if (accountFailure?.status === 'rejected') {
            const failure = resourceFailure(accountFailure.reason, 'No fue posible actualizar la cuenta.');
            failures.push(failure.errorMessage);
            finishResourceLoad(set, 'account', accountGeneration, failure);
          } else finishResourceLoad(set, 'account', accountGeneration);

          if (activationKeysResult.status === 'rejected') {
            const failure = resourceFailure(activationKeysResult.reason, 'No fue posible actualizar keys de activación.');
            failures.push(failure.errorMessage);
            finishResourceLoad(set, 'activationKeys', activationKeysGeneration, failure);
          } else finishResourceLoad(set, 'activationKeys', activationKeysGeneration, { empty: activationKeysResult.value.keys.length === 0 });

          if (includeBilling) {
            if (invoicesResult.status === 'rejected') {
              const failure = resourceFailure(invoicesResult.reason, 'No fue posible actualizar facturación.');
              failures.push(failure.errorMessage);
              finishResourceLoad(set, 'billing', billingGeneration!, failure);
            } else finishResourceLoad(set, 'billing', billingGeneration!, { empty: invoicesResult.value.length === 0 });
          }

          if (sessionsResult.status === 'rejected') {
            const failure = resourceFailure(sessionsResult.reason, 'No fue posible actualizar sesiones.');
            failures.push(failure.errorMessage);
            finishResourceLoad(set, 'sessions', sessionsGeneration, failure);
          } else finishResourceLoad(set, 'sessions', sessionsGeneration, { empty: sessionsResult.value.length === 0 });

          if (failures.length) setLatestGlobalError(set, effectGeneration, failures[0]);
        } catch (error) {
          // Programming/setup failures outside the independent requests still
          // terminate every resource attempt without discarding prior data.
          const failure = resourceFailure(error, 'No fue posible cargar los datos de cuenta.');
          setLatestGlobalError(set, effectGeneration, failure.errorMessage);
          finishResourceLoad(set, 'account', accountGeneration, failure);
          finishResourceLoad(set, 'activationKeys', activationKeysGeneration, failure);
          finishResourceLoad(set, 'sessions', sessionsGeneration, failure);
          if (billingGeneration !== null) finishResourceLoad(set, 'billing', billingGeneration, failure);
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
        markIncrementalRealtime(set, 'incidents', true);
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
            markIncrementalRealtime(set, 'account', true);
          }
        }

        if (eventName === 'onboarding:updated' && payload && typeof payload === 'object') {
          const onboarding = (payload as { onboarding?: PortalOnboarding }).onboarding;
          if (onboarding) {
            set({ onboarding });
            markIncrementalRealtime(set, 'account', true);
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
            markIncrementalRealtime(set, 'activationKeys', activationPayload.keys.length > 0);
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
