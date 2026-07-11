import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CommercialPlan, User } from '@/src/types/app';
import { createCheckoutService } from '../create-commercial-service';
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
  const [plans, setPlans] = useState<CommercialPlan[]>([]);
  const [providerMode, setProviderMode] = useState<PaymentProviderMode>('unavailable');
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<PaymentResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void service.listPlans().then(setPlans);
    void service.getProviderMode().then(setProviderMode);
  }, [service]);

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === planId) || null,
    [planId, plans]
  );

  const submit = useCallback(async ({
    method,
    testCard,
  }: {
    method: Exclude<CheckoutPaymentMethod, 'trial'>;
    testCard: TestCardInput;
  }) => {
    if (!selectedPlan || !user) return null;
    if (!requestTrial && providerMode === 'test') {
      const validationMessage = service.validateTestCard(testCard);
      if (validationMessage) {
        setMessage(validationMessage);
        return null;
      }
    }

    setProcessing(true);
    setMessage(null);
    const companyName = user.companyProfile?.companyName || user.name || 'Cuenta ManeComb';
    const nextResult = await service.createPaymentSession({
      companyName,
      contactName: user.name || companyName,
      email: user.email,
      phone: getContactPhone(user.phone),
      planId: selectedPlan.id,
      paymentMethod: requestTrial ? 'trial' : method,
      requestTrial,
      selectedAddOns: [],
    });
    setResult(nextResult);
    setMessage(nextResult.message);
    setProcessing(false);
    return nextResult;
  }, [providerMode, requestTrial, selectedPlan, service, user]);

  return {
    clearMessage: () => setMessage(null),
    isCompleted: result?.status === PAYMENT_SESSION_STATUSES.COMPLETED,
    isPending: result?.status === PAYMENT_SESSION_STATUSES.PENDING,
    message,
    plans,
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
  const [plans, setPlans] = useState<CommercialPlan[]>([]);
  const [confirmation, setConfirmation] = useState<PaymentReturnConfirmation>({ status: 'idle' });
  const lastConfirmation = useRef<string | null>(null);

  useEffect(() => {
    void service.listPlans().then(setPlans);
  }, [service]);

  useEffect(() => {
    const cleanPaymentId = String(paymentId || '').trim();
    if (!cleanPaymentId) return;
    const key = `${cleanPaymentId}:${externalReference || ''}`;
    if (lastConfirmation.current === key) return;
    lastConfirmation.current = key;
    setConfirmation({ status: 'checking' });
    void service.confirmPaymentReturn({ paymentId: cleanPaymentId, externalReference })
      .then((result) => {
        setConfirmation({
          message: result.message,
          paymentStatus: result.rawPaymentStatus,
          status: result.ok ? 'confirmed' : 'error',
        });
      });
  }, [externalReference, paymentId, service]);

  return { confirmation, plans };
}
