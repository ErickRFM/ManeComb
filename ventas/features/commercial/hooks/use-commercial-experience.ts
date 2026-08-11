import { useCallback, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { usePortalStore } from '@/features/portal/store/use-portal-store';
import { getCommercialPlansRequest } from '@/src/api/client';
import type { CommercialPlan } from '@/src/types/app';
import { createCommercialService } from '../create-commercial-service';
import type {
  CommercialChangeSummary,
  CommercialDashboardModel,
  CommercialWorkspace,
} from '../types';

function useCommercialRuntime() {
  const [runtime] = useState(() => createCommercialService());
  const [plans, setPlans] = useState<CommercialPlan[]>([]);
  const [plansLoaded, setPlansLoaded] = useState(false);
  const [plansError, setPlansError] = useState<string | null>(null);
  const { cancelPlan, changePlan, invoices, isLoading, isSubmitting, loadAll, onboarding, overview, subscription } = usePortalStore(
    useShallow((state) => ({
      cancelPlan: state.cancelPlan,
      changePlan: state.changePlan,
      invoices: state.invoices,
      isLoading: state.isLoading,
      isSubmitting: state.isSubmitting,
      loadAll: state.loadAll,
      onboarding: state.onboarding,
      overview: state.overview,
      subscription: state.subscription,
    }))
  );

  const synchronize = useCallback(async () => {
    await runtime.service.synchronize({
      subscription: subscription || overview?.subscription || null,
      plans,
      invoices,
      organizationCreatedAt: null,
    });
  }, [invoices, overview?.subscription, plans, runtime, subscription]);

  useEffect(() => {
    if (!overview && !isLoading) void loadAll();
  }, [isLoading, loadAll, overview]);

  const reloadPlans = useCallback(async () => {
    setPlansLoaded(false);
    setPlansError(null);
    try {
      setPlans(await getCommercialPlansRequest());
    } catch {
      setPlansError('No pudimos cargar los planes. Revisa tu conexión e intenta nuevamente.');
    } finally {
      setPlansLoaded(true);
    }
  }, []);

  useEffect(() => {
    void reloadPlans();
  }, [reloadPlans]);

  // Una cuenta recién creada puede llegar a Plan mientras las superficies de
  // overview/onboarding todavía se están reconciliando (o con un payload legacy
  // sin onboarding). Esa ausencia significa "pendiente", nunca un error de render.
  const onboardingStatus = onboarding?.status ?? overview?.onboarding?.status ?? 'pending';

  return {
    activationComplete: onboardingStatus === 'completed',
    cancelPlan,
    changePlan,
    isLoading: isLoading || !plansLoaded,
    isSubmitting,
    plansError,
    reload: loadAll,
    reloadPlans,
    runtime,
    synchronize,
  };
}

export function useCommercialExperience() {
  const { cancelPlan, changePlan, isLoading, isSubmitting, plansError, reload, reloadPlans, runtime, synchronize } = useCommercialRuntime();
  const [workspace, setWorkspace] = useState<CommercialWorkspace | null>(null);
  const [comparison, setComparison] = useState<CommercialChangeSummary | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const actionInFlight = useRef(false);

  const refresh = useCallback(async () => {
    await synchronize();
    setWorkspace(await runtime.service.getWorkspace());
  }, [runtime.service, synchronize]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectPlan = useCallback(async (planId: string) => {
    setSelectedPlanId(planId);
    setActionMessage(null);
    setComparison(await runtime.service.evaluateChange(planId));
  }, [runtime.service]);

  const continuePreview = useCallback(async () => {
    if (!selectedPlanId || !comparison?.validation.allowed || actionInFlight.current) return;
    actionInFlight.current = true;
    try {
      const result = await changePlan(selectedPlanId);
      if (!result.ok) {
        setActionMessage(result.message || 'No fue posible cambiar el plan.');
        return;
      }
      setActionMessage('El plan se actualizó correctamente.');
      setSelectedPlanId(null);
      setComparison(null);
      await reload({ force: true });
    } finally {
      actionInFlight.current = false;
    }
  }, [changePlan, comparison?.validation.allowed, reload, selectedPlanId]);

  const clearSelection = useCallback(() => {
    setSelectedPlanId(null);
    setComparison(null);
    setActionMessage(null);
  }, []);

  const cancelSubscription = useCallback(async () => {
    if (actionInFlight.current) return false;
    actionInFlight.current = true;
    try {
      const result = await cancelPlan();
      if (!result.ok) {
        setActionMessage(result.message || 'No fue posible cancelar la suscripción.');
        return false;
      }
      setActionMessage('La suscripción se canceló correctamente.');
      setSelectedPlanId(null);
      setComparison(null);
      await reload({ force: true });
      return true;
    } finally {
      actionInFlight.current = false;
    }
  }, [cancelPlan, reload]);

  const comparisonAction = comparison ? (() => {
    if (comparison.validation.allowed) {
      return { kind: 'continue' as const, label: comparison.validation.actionLabel, href: null };
    }
    if (comparison.validation.code === 'NO_ACTIVE_SUBSCRIPTION') {
      return { kind: 'checkout' as const, label: 'Contratar plan', href: null };
    }
    if (comparison.validation.action === 'REVIEW_PAYMENT') {
      return { kind: 'navigate' as const, label: comparison.validation.actionLabel, href: '/portal/pagos' as const };
    }
    if (comparison.validation.action === 'CONTACT_SUPPORT') {
      return {
        kind: 'navigate' as const,
        label: comparison.validation.actionLabel,
        href: '/portal/perfil?section=soporte' as const,
      };
    }
    if (comparison.validation.action === 'RESOLVE_USAGE') {
      return { kind: 'navigate' as const, label: comparison.validation.actionLabel, href: '/portal/unidades' as const };
    }
    if (comparison.validation.action === 'COMPARE_PLAN') {
      return { kind: 'select' as const, label: comparison.validation.actionLabel, href: null };
    }
    return { kind: 'disabled' as const, label: comparison.validation.actionLabel, href: null };
  })() : null;

  return {
    actionMessage,
    cancelSubscription,
    clearSelection,
    comparison,
    comparisonAction,
    continuePreview,
    isLoading: isLoading || !workspace,
    isSubmitting,
    plansError,
    reloadPlans,
    selectPlan,
    selectedPlanId,
    workspace,
  };
}

export function useCommercialDashboard() {
  const { activationComplete, isLoading, reload, runtime, synchronize } = useCommercialRuntime();
  const [model, setModel] = useState<CommercialDashboardModel | null>(null);

  const refresh = useCallback(async () => {
    await synchronize();
    setModel(await runtime.service.getDashboardModel({ activationComplete }));
  }, [activationComplete, runtime.service, synchronize]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    isLoading: isLoading || !model,
    model,
    reload,
    refresh,
  };
}