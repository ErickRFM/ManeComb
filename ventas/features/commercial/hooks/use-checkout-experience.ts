import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CommercialPlan, User } from '@/src/types/app';
import {
  clearCheckoutContext,
  getOrCreateCheckoutIdempotencyKey,
  normalizeTrialIntent,
} from '@/src/utils/checkout-context';
import { createCheckoutService } from '../create-commercial-service';
import { readCachedPlans, writeCachedPlans } from '../services/plans-cache';
import {
  PAYMENT_SESSION_STATUSES,
  type CheckoutPaymentMethod,
  type PaymentProviderMode,
  type PaymentReturnConfirmation,
  type PaymentResult,
  type TestCardInput,
} from '../types';

function getContactPhone(phone?: string | null) {
  return String(phone || '').trim() || 'Por confirmar';
}

export function useCheckoutExperience({
  planId,
  requestTrial,
  user,
}: {
  planId?: string | null;
  requestTrial: boolean;
  user: User | null;
}) {
  const [service] = useState(() => createCheckoutService());
  const [plans, setPlans] = useState<CommercialPlan[]>(() => readCachedPlans());
  const [plansLoading, setPlansLoading] = useState(() => readCachedPlans().length === 0);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [providerMode, setProviderMode] = useState<PaymentProviderMode>('unavailable');
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<PaymentResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const submitInFlight = useRef(false);

  const loadPlans = useCallback(async () => {
    setPlansError(null);
    setPlansLoading((current) => current || plans.length === 0);
    try {
      const fresh = await service.listPlans();
      setPlans(fresh);
      writeCachedPlans(fresh);
    } catch {
      if (plans.length === 0) {
        setPlansError('No pudimos cargar los planes. Revisa tu conexión e inténtalo de nuevo.');
      }
    } finally {
      setPlansLoading(false);
    }
  }, [plans.length, service]);

  useEffect(() => {
    void loadPlans();
    void service.getProviderMode().then(setProviderMode);
  }, [loadPlans, service]);

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === planId) || null,
    [planId, plans]
  );

  const canUseDemoCard = Boolean(
    selectedPlan
    && selectedPlan.trialEligible === true
    && Number(selectedPlan.units) === 2
    && Number(selectedPlan.trialDays) === 7
  );
  const effectiveRequestTrial = Boolean(
    selectedPlan
    && canUseDemoCard
    && normalizeTrialIntent(selectedPlan.id, requestTrial)
  );

  useEffect(() => {
    if (selectedPlan && requestTrial && !effectiveRequestTrial) {
      setMessage('La prueba gratuita solo está disponible para el plan de 2 combis durante 7 días.');
    }
  }, [effectiveRequestTrial, requestTrial, selectedPlan]);

  const submit = useCallback(async ({
    method,
    selectedAddOns = [],
    testCard,
    demoTrial = false,
  }: {
    method: Exclude<CheckoutPaymentMethod, 'trial'>;
    selectedAddOns?: string[];
    testCard: TestCardInput;
    demoTrial?: boolean;
  }) => {
    if (!selectedPlan || !user || submitInFlight.current) return null;

    if (requestTrial && !effectiveRequestTrial) {
      setMessage('La prueba gratuita solo está disponible para el plan de 2 combis durante 7 días.');
      return null;
    }

    if (demoTrial && !canUseDemoCard) {
      setMessage('La tarjeta demo solo puede activar la prueba de 7 días del plan de 2 combis.');
      return null;
    }

    const trialForSubmit = effectiveRequestTrial || demoTrial;
    if (!trialForSubmit && providerMode === 'test') {
      const validationMessage = service.validateTestCard(testCard);
      if (validationMessage) {
        setMessage(validationMessage);
        return null;
      }
    }

    submitInFlight.current = true;
    setProcessing(true);
    setMessage(null);
    try {
      const companyName = user.companyProfile?.companyName || user.name || 'Cuenta ManeComb';
      const paymentMethod = trialForSubmit ? 'trial' : method;
      const safeAddOns = trialForSubmit ? [] : selectedAddOns;
      const expectedAmount = trialForSubmit
        ? 0
        : Number(selectedPlan.price || 0)
          + (safeAddOns.includes('radio_dispatch') ? Number(selectedPlan.radioAddonPrice || 0) : 0);
      const nextResult = await service.createPaymentSession({
        idempotencyKey: getOrCreateCheckoutIdempotencyKey({
          userId: user.id,
          planId: selectedPlan.id,
          paymentMethod,
          requestTrial: trialForSubmit,
          selectedAddOns: safeAddOns,
        }),
        companyName,
        contactName: user.name || companyName,
        email: user.email,
        phone: getContactPhone(user.phone),
        planId: selectedPlan.id,
        paymentMethod,
        requestTrial: trialForSubmit,
        selectedAddOns: safeAddOns,
      });

      if (
        !trialForSubmit
        && nextResult.session
        && Math.abs(Number(nextResult.session.amount || 0) - expectedAmount) > 0.001
      ) {
        setMessage(
          `Bloqueamos la orden porque el backend devolvió ${Number(nextResult.session.amount || 0).toFixed(2)} MXN y tu selección corresponde a ${expectedAmount.toFixed(2)} MXN. No realices la transferencia; vuelve a elegir el plan o contacta soporte.`
        );
        return null;
      }

      setResult(nextResult);
      setMessage(nextResult.message);
      return nextResult;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible iniciar el pago. Intenta nuevamente.');
      return null;
    } finally {
      submitInFlight.current = false;
      setProcessing(false);
    }
  }, [canUseDemoCard, effectiveRequestTrial, providerMode, requestTrial, selectedPlan, service, user]);

  return {
    canUseDemoCard,
    clearMessage: () => setMessage(null),
    effectiveRequestTrial,
    isCompleted: result?.status === PAYMENT_SESSION_STATUSES.COMPLETED,
    isPending: result?.status === PAYMENT_SESSION_STATUSES.PENDING,
    message,
    loadPlans,
    plans,
    plansError,
    plansLoading,
    processing,
    providerMode,
    result,
    selectedPlan,
    submit,
  };
}

export function usePublicCommercialFlow({
  externalReference,
  paymentId,
}: {
  externalReference?: string | null;
  paymentId?: string | null;
}) {
  const [service] = useState(() => createCheckoutService());
  const [plans, setPlans] = useState<CommercialPlan[]>(() => readCachedPlans());
  const [plansLoading, setPlansLoading] = useState(() => readCachedPlans().length === 0);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<PaymentReturnConfirmation>({ status: 'idle' });
  const lastConfirmation = useRef<string | null>(null);

  const loadPlans = useCallback(async () => {
    setPlansError(null);
    setPlansLoading((current) => current || plans.length === 0);
    try {
      const fresh = await service.listPlans();
      setPlans(fresh);
      writeCachedPlans(fresh);
    } catch {
      if (plans.length === 0) {
        setPlansError('No pudimos cargar los planes. Revisa tu conexion e intenta nuevamente.');
      }
    } finally {
      setPlansLoading(false);
    }
  }, [plans.length, service]);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  useEffect(() => {
    const cleanPaymentId = String(paymentId || '').trim();
    if (!cleanPaymentId) return;
    const key = `${cleanPaymentId}:${externalReference || ''}`;
    if (lastConfirmation.current === key) return;
    lastConfirmation.current = key;
    setConfirmation({ status: 'checking' });
    void service.confirmPaymentReturn({ paymentId: cleanPaymentId, externalReference })
      .then((nextResult) => {
        if (nextResult.ok) clearCheckoutContext();
        setConfirmation({
          message: nextResult.message,
          paymentStatus: nextResult.rawPaymentStatus,
          status: nextResult.ok ? 'confirmed' : 'error',
        });
      });
  }, [externalReference, paymentId, service]);

  return { confirmation, loadPlans, plans, plansError, plansLoading };
}
