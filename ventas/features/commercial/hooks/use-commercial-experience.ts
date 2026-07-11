import { useCallback, useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { usePortalStore } from '@/features/portal/store/use-portal-store';
import { createCommercialService } from '../create-commercial-service';
import type {
  CommercialChangeSummary,
  CommercialDashboardModel,
  CommercialWorkspace,
} from '../types';

function useCommercialRuntime() {
  const [runtime] = useState(() => createCommercialService());
  const { invoices, isLoading, loadAll, onboarding, overview, paymentMethods, subscription } = usePortalStore(
    useShallow((state) => ({
      invoices: state.invoices,
      isLoading: state.isLoading,
      loadAll: state.loadAll,
      onboarding: state.onboarding,
      overview: state.overview,
      paymentMethods: state.paymentMethods,
      subscription: state.subscription,
    }))
  );

  const synchronize = useCallback(async () => {
    await runtime.service.synchronize({
      subscription: subscription || overview?.subscription || null,
      plans: runtime.plans,
      invoices,
      paymentMethods,
      organizationCreatedAt: null,
    });
  }, [invoices, overview?.subscription, paymentMethods, runtime, subscription]);

  useEffect(() => {
    if (!overview && !isLoading) void loadAll();
  }, [isLoading, loadAll, overview]);

  return {
    activationComplete: (onboarding?.status || overview?.onboarding.status) === 'completed',
    isLoading,
    reload: loadAll,
    runtime,
    synchronize,
  };
}

export function useCommercialExperience() {
  const { isLoading, runtime, synchronize } = useCommercialRuntime();
  const [workspace, setWorkspace] = useState<CommercialWorkspace | null>(null);
  const [comparison, setComparison] = useState<CommercialChangeSummary | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [readyForNextStep, setReadyForNextStep] = useState(false);

  const refresh = useCallback(async () => {
    await synchronize();
    setWorkspace(await runtime.service.getWorkspace());
  }, [runtime.service, synchronize]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectPlan = useCallback(async (planId: string) => {
    setSelectedPlanId(planId);
    setReadyForNextStep(false);
    setComparison(await runtime.service.evaluateChange(planId));
  }, [runtime.service]);

  const continuePreview = useCallback(async () => {
    if (!selectedPlanId || !comparison?.validation.allowed) return;
    await runtime.service.registerPreview(selectedPlanId);
    setReadyForNextStep(true);
    setWorkspace(await runtime.service.getWorkspace());
  }, [comparison?.validation.allowed, runtime.service, selectedPlanId]);

  const clearSelection = useCallback(() => {
    setSelectedPlanId(null);
    setComparison(null);
    setReadyForNextStep(false);
  }, []);

  const comparisonAction = comparison ? (() => {
    if (comparison.validation.allowed) {
      return { kind: 'continue' as const, label: comparison.validation.actionLabel, href: null };
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
    if (comparison.validation.action === 'COMPARE_PLAN') {
      return { kind: 'select' as const, label: comparison.validation.actionLabel, href: null };
    }
    return { kind: 'disabled' as const, label: comparison.validation.actionLabel, href: null };
  })() : null;

  return {
    clearSelection,
    comparison,
    comparisonAction,
    continuePreview,
    isLoading: isLoading || !workspace,
    readyForNextStep,
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
