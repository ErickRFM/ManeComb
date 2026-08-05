import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { Redirect, router, useLocalSearchParams } from '@/src/navigation/router';
import { StatusBar } from '@/src/native/status-bar';
import { KeyboardSafeScrollView } from '@/src/components/keyboard-safe-layout';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { useAppStore } from '@/src/store/use-app-store';
import { useCheckoutExperience, validateTestCard, type TestCardInput } from '@/features/commercial';
import {
  buildCheckoutParams,
  clearCheckoutContext,
  markCheckoutAttemptRedirected,
  readCheckoutContext,
  saveCheckoutContext,
} from '@/src/utils/checkout-context';
import { getAuthenticatedHome, isCustomerAccount } from '@/src/utils/account-routing';
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
  const user = useAppStore((state) => state.user);
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
  const paymentInFlight = useRef(false);

  const {
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
  const canSubmit = Boolean(selectedPlan && user && !processing && providerMode !== 'unavailable');
  const isTestPaymentMode = providerMode === 'test';
  const isManualPaymentMode = providerMode === 'manual';
  const isManualCardDemo = isManualPaymentMode && selectedMethod === 'card' && !requestTrial;

  useEffect(() => {
    if (planId) {
      saveCheckoutContext(planId, requestTrial);
    }
  }, [planId, requestTrial]);

  if (!planId) {
    return <Redirect href="/ventas" />;
  }

  if (!user) {
    return <Redirect href={{ pathname: '/ventas/registro', params: buildCheckoutParams(planId, requestTrial) }} />;
  }

  if (!isCustomerAccount(user)) {
    return <Redirect href={getAuthenticatedHome(user) as never} />;
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

  const submitPayment = async () => {
    if (!canSubmit || paymentInFlight.current) return;

    if (isManualCardDemo) {
      paymentInFlight.current = true;
      try {
        const validationMessage = validateTestCard(testCard);
        if (validationMessage) {
          setCardDemoMessage(validationMessage);
          return;
        }

        setCardDemoMessage(
          'Tarjeta demo validada correctamente. No se realizó ningún cargo, no se creó una orden y los datos fueron limpiados.'
        );
        setTestCard(EMPTY_TEST_CARD);
      } finally {
        paymentInFlight.current = false;
      }
      return;
    }

    paymentInFlight.current = true;
    setStep('confirmation');
    setCardDemoMessage(null);
    try {
      const nextResult = await submit({
        method: selectedMethod,
        selectedAddOns: includeRadioAddon ? ['radio_dispatch'] : [],
        testCard,
      });
      if (!nextResult?.ok) {
        setStep('payment');
        return;
      }
      if (nextResult.session?.checkoutUrl) {
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
    } finally {
      paymentInFlight.current = false;
    }
  };

  const selectPaymentMethod = (method: PaymentMethod) => {
    setSelectedMethod(method);
    setCardDemoMessage(null);
  };

  const goToPortal = () => {
    router.replace((receiptIsActive ? '/portal/onboarding' : '/portal/plan') as never);
  };
  const doneTitle = receiptIsActive
    ? 'Plan activado en tu cuenta.'
    : receiptIsPending
      ? 'Transferencia pendiente de validación.'
      : 'Orden registrada.';
  const doneText =
    receipt?.nextStep ||
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
                  requestTrial={requestTrial}
                  selectedMethod={selectedMethod}
                  onSelectMethod={selectPaymentMethod}
                  testCard={testCard}
                  onTestCardChange={(updates) => {
                    setCardDemoMessage(null);
                    setTestCard((current) => ({ ...current, ...updates }));
                  }}
                  includeRadioAddon={includeRadioAddon}
                  onToggleRadioAddon={() => setIncludeRadioAddon((current) => !current)}
                  selectedPlan={selectedPlan}
                  buttonAmount={buttonAmount}
                  canSubmit={canSubmit}
                  processing={processing}
                  checkoutMessage={checkoutMessage}
                  providerMode={providerMode}
                  onSubmitPayment={() => void submitPayment()}
                />
                <OrderSummary
                  includeRadioAddon={includeRadioAddon}
                  plan={selectedPlan}
                  requestTrial={requestTrial}
                  totalAmount={totalAmount}
                />
              </View>

              <CheckoutTrustStrip buttonAmount={buttonAmount} />
            </>
          )}
        </View>
      </KeyboardSafeScrollView>
    </View>
  );
}
