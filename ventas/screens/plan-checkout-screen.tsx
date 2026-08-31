import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { Redirect, router, useLocalSearchParams } from '@/src/navigation/router';
import { StatusBar } from '@/src/native/status-bar';
import { KeyboardSafeScrollView } from '@/src/components/keyboard-safe-layout';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { useAppStore } from '@/src/store/use-app-store';
import { PAYMENT_SESSION_STATUSES, useCheckoutExperience, validateTestCard, type TestCardInput } from '@/features/commercial';
import { trackSalesEvent } from '@/features/commercial/analytics/sales-analytics';
import {
  buildCheckoutParams,
  clearCheckoutContext,
  markCheckoutAttemptRedirected,
  readCheckoutContext,
  saveCheckoutContext,
} from '@/src/utils/checkout-context';
import { usePortalStore } from '@/features/portal/store/use-portal-store';

import { CheckoutHeader } from './checkout/components/checkout-header';
import { Stepper } from './checkout/components/checkout-stepper';
import { CheckoutDonePanel } from './checkout/components/checkout-done-panel';
import { CheckoutPaymentSection } from './checkout/components/checkout-payment-section';
import { OrderSummary } from './checkout/components/checkout-order-summary';
import { CheckoutTrustStrip } from './checkout/components/checkout-trust-strip';

import { palette } from './checkout/checkout.constants';
import type { PaymentMethod, CheckoutStep } from './checkout/checkout.types';
import { getFirstParam, formatCurrency, openCheckoutUrl, getCheckoutMessage } from './checkout/checkout.utils';
import { styles } from './checkout/checkout.styles';

const EMPTY_TEST_CARD: TestCardInput = {
  cardholderName: '',
  cardNumber: '',
  cvv: '',
  expiry: '',
  postalCode: '',
};

type DemoCardReceipt = {
  brand: string;
  last4: string;
  amount: number;
  email: string;
};

function onlyDigits(value: string) {
  return String(value || '').replace(/\D/g, '');
}

function detectCardBrand(cardNumber: string) {
  const digits = onlyDigits(cardNumber);
  const firstSix = Number(digits.slice(0, 6));

  if (/^4/.test(digits)) return 'Visa';
  if (/^3[47]/.test(digits)) return 'American Express';
  if (/^(6011|65|64[4-9])/.test(digits)) return 'Discover';
  if (/^5[1-5]/.test(digits) || (firstSix >= 222100 && firstSix <= 272099)) return 'Mastercard';
  return 'Tarjeta';
}

function parseCardExpiry(value: string) {
  const match = String(value || '').trim().match(/^(\d{2})\s*\/\s*(\d{2}|\d{4})$/);
  return {
    month: match?.[1] || '',
    year: match?.[2]?.slice(-2) || '',
  };
}

function createDemoPaymentReference() {
  const randomPart = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID().replace(/-/g, '')
    : `${Date.now()}${Math.random().toString(16).slice(2)}`;

  return `demo_pm_${randomPart}`;
}

export function PlanCheckoutScreen() {
  const { width } = useWindowDimensions();
  const isTwoColumn = width >= 980;
  const isPhone = width < 640;
  const params = useLocalSearchParams<{ planId?: string | string[]; trial?: string | string[] }>();
  const storedCheckout = readCheckoutContext();
  const planId = getFirstParam(params.planId) || storedCheckout?.planId;
  const routeTrialParam = getFirstParam(params.trial);
  const requestTrial =
    typeof routeTrialParam === 'string'
      ? routeTrialParam === '1'
      : Boolean(storedCheckout?.requestTrial && storedCheckout.planId === planId);
  const { user, updateProfile } = useAppStore(
    useShallow((state) => ({
      user: state.user,
      updateProfile: state.updateProfile,
    }))
  );
  const { loadAll } = usePortalStore(
    useShallow((state) => ({
      loadAll: state.loadAll,
    }))
  );
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('card');
  const [includeRadioAddon, setIncludeRadioAddon] = useState(false);
  const [step, setStep] = useState<CheckoutStep>('payment');
  const [testCard, setTestCard] = useState<TestCardInput>(EMPTY_TEST_CARD);
  const [cardDemoMessage, setCardDemoMessage] = useState<string | null>(null);
  const [demoCardReceipt, setDemoCardReceipt] = useState<DemoCardReceipt | null>(null);
  const [cardSaving, setCardSaving] = useState(false);
  const paymentInFlight = useRef(false);
  const checkoutViewedKey = useRef<string | null>(null);

  const {
    canUseDemoCard,
    effectiveRequestTrial,
    isCompleted: receiptIsActive,
    isPending: receiptIsPending,
    message,
    loadPlans,
    plansError,
    plansLoading,
    processing,
    providerMode,
    result: receipt,
    selectedPlan,
    submit,
  } = useCheckoutExperience({ planId, requestTrial, user });
  const addonPrice = includeRadioAddon ? Number(selectedPlan?.radioAddonPrice || 0) : 0;
  const totalAmount = Number(selectedPlan?.price || 0) + addonPrice;
  const buttonAmount = `${formatCurrency(totalAmount)} MXN`;
  const canSubmit = Boolean(
    selectedPlan
      && user
      && !processing
      && !cardSaving
      && (effectiveRequestTrial || providerMode !== 'unavailable')
  );
  const isTestPaymentMode = providerMode === 'test';
  const isTrialCardDemo = Boolean(
    effectiveRequestTrial
      && canUseDemoCard
      && selectedMethod === 'card'
  );

  useEffect(() => {
    if (planId) {
      saveCheckoutContext(planId, requestTrial);
    }
  }, [planId, requestTrial]);

  useEffect(() => {
    if (!selectedPlan?.id) return;
    const key = `${selectedPlan.id}:${effectiveRequestTrial ? 'trial' : 'paid'}`;
    if (checkoutViewedKey.current === key) return;
    checkoutViewedKey.current = key;
    trackSalesEvent('checkout_viewed', {
      planId: selectedPlan.id,
      requestTrial: effectiveRequestTrial,
      providerMode,
      route: '/ventas/pago',
    });
  }, [effectiveRequestTrial, providerMode, selectedPlan?.id]);

  if (!planId) {
    return <Redirect href="/ventas" />;
  }

  if (!user) {
    return <Redirect href={{ pathname: '/ventas/registro', params: buildCheckoutParams(planId, requestTrial) }} />;
  }

  if (plansLoading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color={palette.accent} />
        <Text style={styles.loadingText}>Preparando tu plan...</Text>
      </View>
    );
  }

  if (plansError || !selectedPlan) {
    return (
      <View style={styles.loadingScreen}>
        <MaterialCommunityIcons name="alert-circle-outline" size={34} color={palette.accent} />
        <Text style={styles.loadingText}>{plansError || 'El plan seleccionado ya no está disponible.'}</Text>
        {plansError ? (
          <Pressable accessibilityRole="button" onPress={() => void loadPlans()} style={styles.doneButton}>
            <Text style={styles.payButtonText}>Reintentar</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="link" onPress={() => router.replace('/ventas' as never)} style={styles.doneButton}>
            <Text style={styles.payButtonText}>Volver a planes</Text>
          </Pressable>
        )}
      </View>
    );
  }

  const saveDemoCard = async (): Promise<DemoCardReceipt | null> => {
    const validationMessage = validateTestCard(testCard);
    if (validationMessage) {
      setCardDemoMessage(validationMessage);
      return null;
    }

    const digits = onlyDigits(testCard.cardNumber);
    const brand = detectCardBrand(digits);
    const last4 = digits.slice(-4);
    const expiry = parseCardExpiry(testCard.expiry);

    setCardSaving(true);
    try {
      const result = await updateProfile({
        paymentProfile: {
          preferredMethod: 'card',
          cardholderName: testCard.cardholderName.trim(),
          cardBrand: brand,
          cardLast4: last4,
          cardExpMonth: expiry.month,
          cardExpYear: expiry.year,
          customerReference: createDemoPaymentReference(),
        },
      });

      if (!result.ok) {
        setCardDemoMessage(result.message || 'No fue posible guardar la tarjeta.');
        return null;
      }

      const safeReceipt = {
        brand,
        last4,
        amount: Number(selectedPlan.price || 0),
        email: user.email,
      };
      setDemoCardReceipt(safeReceipt);
      setCardDemoMessage(
        `${brand} terminada en ${last4} validada correctamente. El número completo y el CVV fueron descartados.`
      );
      return safeReceipt;
    } finally {
      setCardSaving(false);
    }
  };

  const submitPayment = async () => {
    if (!canSubmit || paymentInFlight.current) return;

    paymentInFlight.current = true;
    setCardDemoMessage(null);
    trackSalesEvent('checkout_started', {
      planId: selectedPlan.id,
      requestTrial: effectiveRequestTrial,
      paymentMethod: selectedMethod,
      providerMode,
      route: '/ventas/pago',
    });
    try {
      if (isTrialCardDemo) {
        const savedCard = await saveDemoCard();
        if (!savedCard) {
          trackSalesEvent('checkout_failed', {
            planId: selectedPlan.id,
            requestTrial: true,
            paymentMethod: 'card',
            providerMode,
            outcome: 'demo_card_validation',
          });
          return;
        }

        setStep('confirmation');
        const nextResult = await submit({
          method: 'card',
          selectedAddOns: [],
          testCard: EMPTY_TEST_CARD,
          demoTrial: true,
        });
        if (!nextResult?.ok) {
          trackSalesEvent('checkout_failed', {
            planId: selectedPlan.id,
            requestTrial: true,
            paymentMethod: 'card',
            providerMode,
            outcome: 'request_rejected',
          });
          setStep('payment');
          return;
        }
        await loadAll({ force: true });
        clearCheckoutContext();
        setTestCard(EMPTY_TEST_CARD);
        setStep('done');
        trackSalesEvent('checkout_completed', {
          planId: selectedPlan.id,
          requestTrial: true,
          paymentMethod: 'card',
          providerMode,
          outcome: 'trial_active',
        });
        return;
      }

      setStep('confirmation');
      const nextResult = await submit({
        method: selectedMethod,
        selectedAddOns: includeRadioAddon ? ['radio_dispatch'] : [],
        testCard,
      });
      if (!nextResult?.ok) {
        trackSalesEvent('checkout_failed', {
          planId: selectedPlan.id,
          requestTrial: effectiveRequestTrial,
          paymentMethod: selectedMethod,
          providerMode,
          outcome: 'request_rejected',
        });
        setStep('payment');
        return;
      }
      if (nextResult.session?.checkoutUrl) {
        trackSalesEvent('checkout_redirected', {
          planId: selectedPlan.id,
          requestTrial: effectiveRequestTrial,
          paymentMethod: selectedMethod,
          providerMode,
          outcome: 'provider_redirect',
        });
        // La misma llave sigue protegiendo el submit actual. Solo después de
        // entregar el control al proveedor se marca como consumida para que
        // un clic posterior cree una orden/preference nueva.
        markCheckoutAttemptRedirected();
        openCheckoutUrl(nextResult.session.checkoutUrl);
        return;
      }
      await loadAll({ force: true });
      clearCheckoutContext();
      setStep('done');
      trackSalesEvent(nextResult.status === PAYMENT_SESSION_STATUSES.PENDING ? 'payment_pending' : 'checkout_completed', {
        planId: selectedPlan.id,
        requestTrial: effectiveRequestTrial,
        paymentMethod: selectedMethod,
        providerMode,
        outcome: nextResult.status,
      });
    } finally {
      paymentInFlight.current = false;
    }
  };

  const selectPaymentMethod = (method: PaymentMethod) => {
    setSelectedMethod(method);
    trackSalesEvent('payment_method_selected', {
      planId: selectedPlan.id,
      requestTrial: effectiveRequestTrial,
      paymentMethod: method,
      providerMode,
      route: '/ventas/pago',
    });
    if (effectiveRequestTrial || (method === 'card' && canUseDemoCard)) {
      setIncludeRadioAddon(false);
    }
    setCardDemoMessage(null);
  };

  const goToPortal = () => {
    router.replace((receiptIsActive ? '/portal/onboarding' : '/portal/plan') as never);
  };
  const doneTitle = effectiveRequestTrial && receiptIsActive
    ? 'Prueba activada en tu cuenta.'
    : receiptIsActive
      ? 'Plan activado en tu cuenta.'
      : receiptIsPending
        ? 'Transferencia pendiente de validación.'
        : 'Orden registrada.';
  const doneText = demoCardReceipt && receiptIsActive
    ? `${demoCardReceipt.brand} •••• ${demoCardReceipt.last4} registrada correctamente. No se realizó ningún cargo. La confirmación se enviará a ${demoCardReceipt.email} y tu prueba de ${selectedPlan.trialDays || 7} días ya está activa.`
    : receipt?.nextStep ||
      (receiptIsActive
        ? `${receipt?.planName || selectedPlan.name} quedó ligado a tu portal ManeComb.`
        : 'Revisa el estado del pago desde tu portal ManeComb.');
  const doneButtonLabel = receiptIsActive ? 'Continuar configuración' : 'Ver estado en portal';
  const checkoutMessage = getCheckoutMessage(cardDemoMessage || message);

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View pointerEvents="none" style={styles.backgroundLayer}>
        <View style={styles.backgroundGlowTop} />
        <View style={styles.backgroundGlowBottom} />
        <View style={styles.backgroundRail} />
      </View>

      <KeyboardSafeScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, isPhone ? styles.contentPhone : undefined]}
        showsVerticalScrollIndicator={Platform.OS === 'web'}>
        <CheckoutHeader isPhone={isPhone} onBack={() => router.push('/ventas' as never)} />

        <View style={styles.checkoutFrame}>
          <Stepper currentStep={step} />

          {step === 'done' ? (
            <CheckoutDonePanel
              receiptIsActive={receiptIsActive}
              doneTitle={doneTitle}
              doneText={doneText}
              doneButtonLabel={doneButtonLabel}
              onGoToPortal={goToPortal}
            />
          ) : (
            <>
              <View style={[styles.checkoutGrid, isTwoColumn ? styles.checkoutGridWide : undefined]}>
                <CheckoutPaymentSection
                  isTwoColumn={isTwoColumn}
                  isTestPaymentMode={isTestPaymentMode}
                  requestTrial={effectiveRequestTrial}
                  selectedMethod={selectedMethod}
                  onSelectMethod={selectPaymentMethod}
                  testCard={testCard}
                  savedCard={user.paymentProfile}
                  onTestCardChange={(updates) => {
                    setCardDemoMessage(null);
                    setTestCard((current) => ({ ...current, ...updates }));
                  }}
                  includeRadioAddon={includeRadioAddon}
                  onToggleRadioAddon={() => setIncludeRadioAddon((current) => !current)}
                  selectedPlan={selectedPlan}
                  buttonAmount={buttonAmount}
                  canSubmit={canSubmit}
                  processing={processing || cardSaving}
                  checkoutMessage={checkoutMessage}
                  providerMode={providerMode}
                  onSubmitPayment={() => void submitPayment()}
                />
                <OrderSummary
                  includeRadioAddon={includeRadioAddon}
                  plan={selectedPlan}
                  requestTrial={effectiveRequestTrial}
                  totalAmount={totalAmount}
                />
              </View>

              <CheckoutTrustStrip
                buttonAmount={
                  effectiveRequestTrial
                    ? `Prueba ${selectedPlan.trialDays || 7} días · sin cargo`
                    : buttonAmount
                }
              />
            </>
          )}
        </View>
      </KeyboardSafeScrollView>
    </View>
  );
}
