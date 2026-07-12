import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { Redirect, router, useLocalSearchParams } from '@/src/navigation/router';
import { StatusBar } from '@/src/native/status-bar';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { Typography } from '@/constants/theme';
import { BrandLogo } from '@/src/components/brand-logo';
import { useAppStore } from '@/src/store/use-app-store';
import type { CommercialPlan } from '@/src/types/app';
import { useCheckoutExperience, type TestCardInput } from '@/features/commercial';
import {
  buildCheckoutParams,
  clearCheckoutContext,
  readCheckoutContext,
  saveCheckoutContext,
} from '@/src/utils/checkout-context';
import { getAuthenticatedHome, isCustomerAccount } from '@/src/utils/account-routing';
import { usePortalStore } from '@/features/portal/store/use-portal-store';

type PaymentMethod = 'card' | 'spei';
type CheckoutStep = 'payment' | 'confirmation' | 'done';
const palette = {
  background: '#050816',
  panel: 'rgba(12, 18, 36, 0.92)',
  panelStrong: 'rgba(18, 25, 48, 0.94)',
  panelSoft: 'rgba(255, 255, 255, 0.06)',
  line: 'rgba(255, 255, 255, 0.13)',
  lineStrong: 'rgba(168, 85, 247, 0.6)',
  text: '#F8FAFC',
  muted: '#A8B1C2',
  mutedSoft: '#6B7890',
  accent: '#FF245C',
  violet: '#A855F7',
  cyan: '#23D5FF',
  lime: '#52F2A7',
};

const checkoutBenefits = [
  'Acceso para administradores y choferes',
  'Dashboard en tiempo real',
  'Activación por unidades',
  'Soporte operativo',
  'Actualizaciones incluidas',
];

function getFirstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatCurrency(value?: number | null) {
  return new Intl.NumberFormat('es-MX', {
    currency: 'MXN',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(Number(value || 0));
}

function openCheckoutUrl(url: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.location.assign(url);
  }
}

function getCheckoutMessage(message: string | null) {
  if (!message) return null;
  if (/MERCADO_PAGO|MERCADOPAGO|\bMP_|variables? (le[ií]das?|obligatorias?)/i.test(message)) {
    return 'El servicio de pago no está disponible en este momento. Intenta de nuevo más tarde o elige otra forma de pago.';
  }
  return message;
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
  const user = useAppStore((state) => state.user);
  const { loadAll } = usePortalStore(
    useShallow((state) => ({
      loadAll: state.loadAll,
    }))
  );
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('card');
  const [step, setStep] = useState<CheckoutStep>('payment');
  const [testCard, setTestCard] = useState<TestCardInput>({
    cardholderName: '',
    cardNumber: '',
    cvv: '',
    expiry: '',
    postalCode: '',
  });

  const {
    isCompleted: receiptIsActive,
    isPending: receiptIsPending,
    message,
    processing,
    providerMode,
    result: receipt,
    selectedPlan,
    submit,
  } = useCheckoutExperience({ planId, requestTrial, user });
  const buttonAmount = `${formatCurrency(selectedPlan?.price)} MXN`;
  const canSubmit = Boolean(selectedPlan && user && !processing && providerMode !== 'unavailable');
  const isTestPaymentMode = providerMode === 'test';

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

  if (!selectedPlan) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color={palette.accent} />
        <Text style={styles.loadingText}>Preparando tu plan...</Text>
      </View>
    );
  }

  const submitPayment = async () => {
    if (!canSubmit) return;
    setStep('confirmation');
    const nextResult = await submit({ method: selectedMethod, testCard });
    if (!nextResult) {
      setStep('payment');
      return;
    }
    if (!nextResult.ok) {
      setStep('payment');
      return;
    }
    if (nextResult.session?.checkoutUrl) {
      openCheckoutUrl(nextResult.session.checkoutUrl);
      return;
    }
    await loadAll().catch(() => undefined);
    clearCheckoutContext();
    setStep('done');
  };

  const goToPortal = () => {
    router.replace((receiptIsActive ? '/portal/activacion' : '/portal/plan') as never);
  };
  const doneTitle = receiptIsActive
    ? 'Plan activado en tu cuenta.'
    : receiptIsPending
      ? 'Pago pendiente de confirmacion.'
      : 'Orden registrada.';
  const doneText =
    receipt?.nextStep ||
    (receiptIsActive
      ? `${receipt?.planName || selectedPlan.name} quedó ligado a tu portal ManeComb.`
      : 'Revisa el estado del pago desde tu portal ManeComb.');
  const doneButtonLabel = receiptIsActive ? 'Continuar configuración' : 'Ver estado en portal';
  const checkoutMessage = getCheckoutMessage(message);

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View pointerEvents="none" style={styles.backgroundLayer}>
        <View style={styles.backgroundGlowTop} />
        <View style={styles.backgroundGlowBottom} />
        <View style={styles.backgroundRail} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, isPhone ? styles.contentPhone : undefined]}
        showsVerticalScrollIndicator={Platform.OS === 'web'}>
        <View style={styles.header}>
          <BrandLogo size={isPhone ? 'sm' : 'md'} tone="light" plain />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Volver y cambiar plan"
            onPress={() => router.push('/ventas' as never)}
            style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={18} color={palette.text} />
            <Text style={styles.backText}>Cambiar plan</Text>
          </Pressable>
        </View>

        <View style={styles.checkoutFrame}>
          <Stepper currentStep={step} />

          {step === 'done' ? (
            <View style={styles.donePanel}>
              <View style={styles.doneIcon}>
                <MaterialCommunityIcons
                  name={receiptIsActive ? 'check-circle-outline' : 'clock-outline'}
                  size={46}
                  color={receiptIsActive ? palette.lime : palette.cyan}
                />
              </View>
              <Text style={styles.doneTitle}>{doneTitle}</Text>
              <Text style={styles.doneText}>{doneText}</Text>
                <Pressable accessibilityRole="button" onPress={goToPortal} style={[styles.payButton, styles.doneButton]}>
                <MaterialCommunityIcons name="view-dashboard-outline" size={22} color="#FFFFFF" />
                <Text style={styles.payButtonText}>{doneButtonLabel}</Text>
                <MaterialCommunityIcons name="arrow-right" size={22} color="#FFFFFF" />
              </Pressable>
            </View>
          ) : (
            <>
              <View style={[styles.checkoutGrid, isTwoColumn ? styles.checkoutGridWide : undefined]}>
                <View style={[styles.leftPanel, !isTwoColumn ? styles.fullPanel : undefined]}>
                  <View style={styles.panelTitleRow}>
                    <View style={styles.panelTitleIcon}>
                      <MaterialCommunityIcons name="credit-card-check-outline" size={24} color={palette.violet} />
                    </View>
                    <View style={styles.panelTitleCopy}>
                      <Text style={styles.panelTitle}>Información de pago</Text>
                      <Text style={styles.panelSubtitle}>Elige tu método y completa la transacción.</Text>
                    </View>
                  </View>

                  {isTestPaymentMode && !requestTrial ? (
                    <View style={styles.testPaymentPanel}>
                      <View style={styles.testModeHeader}>
                        <View style={styles.testModeBadge}>
                          <MaterialCommunityIcons name="flask-outline" size={18} color={palette.lime} />
                          <Text style={styles.testModeBadgeText}>Modo de pruebas</Text>
                        </View>
                        <Text style={styles.testModeText}>Pago simulado sin cargo real.</Text>
                      </View>

                      <View style={styles.formGrid}>
                        <TestPaymentInput
                          icon="account-outline"
                          label="Nombre del titular"
                          onChangeText={(value) => setTestCard((current) => ({ ...current, cardholderName: value }))}
                          placeholder="Nombre como aparece en la tarjeta"
                          value={testCard.cardholderName}
                        />
                        <TestPaymentInput
                          icon="credit-card-outline"
                          keyboardType="number-pad"
                          label="Numero de tarjeta"
                          onChangeText={(value) => setTestCard((current) => ({ ...current, cardNumber: value }))}
                          placeholder="4111 1111 1111 1111"
                          value={testCard.cardNumber}
                        />
                        <View style={styles.inlineFields}>
                          <TestPaymentInput
                            icon="calendar-outline"
                            label="Expiracion"
                            onChangeText={(value) => setTestCard((current) => ({ ...current, expiry: value }))}
                            placeholder="MM/AA"
                            value={testCard.expiry}
                          />
                          <TestPaymentInput
                            icon="lock-outline"
                            keyboardType="number-pad"
                            label="CVV"
                            onChangeText={(value) => setTestCard((current) => ({ ...current, cvv: value }))}
                            placeholder="123"
                            secureTextEntry
                            value={testCard.cvv}
                          />
                        </View>
                        <TestPaymentInput
                          icon="map-marker-outline"
                          label="Codigo postal"
                          onChangeText={(value) => setTestCard((current) => ({ ...current, postalCode: value }))}
                          placeholder="Opcional"
                          value={testCard.postalCode}
                        />
                      </View>
                    </View>
                  ) : (
                    <>
                      <View style={styles.methodTabs}>
                        <MethodTab
                          active={selectedMethod === 'card'}
                          icon="credit-card-outline"
                          label="Tarjeta credito/debito"
                          onPress={() => setSelectedMethod('card')}
                        />
                        <MethodTab
                          active={selectedMethod === 'spei'}
                          icon="bank-outline"
                          label="Transferencia SPEI"
                          onPress={() => setSelectedMethod('spei')}
                        />
                      </View>

                      {selectedMethod === 'card' ? (
                    <View style={styles.speiPanel}>
                      <MaterialCommunityIcons name="shield-lock-outline" size={32} color={palette.cyan} />
                      <View style={styles.speiCopy}>
                        <Text style={styles.speiTitle}>Checkout seguro</Text>
                        <Text style={styles.speiText}>
                          Al continuar te llevaremos al proveedor disponible para completar el pago. ManeComb no captura ni guarda datos de tarjeta.
                        </Text>
                      </View>
                    </View>
                      ) : (
                    <View style={styles.speiPanel}>
                      <MaterialCommunityIcons name="bank-transfer" size={32} color={palette.cyan} />
                      <View style={styles.speiCopy}>
                        <Text style={styles.speiTitle}>Pago SPEI por proveedor externo</Text>
                        <Text style={styles.speiText}>
                          Al continuar abriremos el checkout disponible para completar o registrar el cobro. El plan se activa cuando el pago sea validado.
                        </Text>
                      </View>
                    </View>
                      )}
                    </>
                  )}

                  <View style={styles.securityNote}>
                    <MaterialCommunityIcons name="lock-outline" size={18} color={palette.violet} />
                    <Text style={styles.securityText}>
                      {isTestPaymentMode && !requestTrial
                        ? 'Pago simulado para desarrollo. No se guardan el CVV ni el número completo de la tarjeta.'
                        : 'Pago seguro por proveedor externo y estado del plan confirmado por backend.'}
                    </Text>
                  </View>

                  {checkoutMessage ? (
                    <View style={styles.messageBox}>
                      <Text style={styles.messageText}>{checkoutMessage}</Text>
                    </View>
                  ) : null}

                  {providerMode === 'unavailable' ? (
                    <View style={styles.messageBox}>
                      <Text style={styles.messageText}>
                        El servicio de pago no está disponible en este momento. Tu selección permanece guardada.
                      </Text>
                    </View>
                  ) : null}

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={requestTrial ? 'Activar prueba' : 'Continuar al pago seguro'}
                    disabled={!canSubmit}
                    onPress={() => void submitPayment()}
                    style={({ pressed }) => [
                      styles.payButton,
                      pressed && canSubmit ? styles.pressed : undefined,
                      !canSubmit ? styles.disabledButton : undefined,
                    ]}>
                    {processing ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <>
                        <MaterialCommunityIcons name={requestTrial ? 'flask-outline' : 'lock-check-outline'} size={24} color="#FFFFFF" />
                        <Text style={styles.payButtonText}>
                          {requestTrial
                            ? `Activar prueba ${selectedPlan.trialDays || 7} dias`
                            : isTestPaymentMode
                              ? `Pagar en modo de pruebas ${buttonAmount}`
                              : selectedMethod === 'card'
                              ? 'Continuar al pago seguro'
                              : `Continuar pago SPEI ${buttonAmount}`}
                        </Text>
                        <MaterialCommunityIcons name="arrow-right" size={22} color="#FFFFFF" />
                      </>
                    )}
                  </Pressable>
                </View>

                <OrderSummary plan={selectedPlan} requestTrial={requestTrial} />
              </View>

              <View style={styles.trustStrip}>
                <TrustItem icon="shield-lock-outline" title="Pago 100% seguro" body="Tus datos estan protegidos con encriptacion SSL." />
                <TrustItem icon="file-document-outline" title="Comprobante comercial" body="Consulta el resultado de tu orden desde el portal." />
                <TrustItem icon="calendar-refresh-outline" title="Periodo mensual" body={`Renovación estimada por ${buttonAmount}.`} />
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function Stepper({ currentStep }: { currentStep: CheckoutStep }) {
  const items = [
    { id: 'payment', label: 'Pago', icon: 'credit-card-outline' as const },
    { id: 'confirmation', label: 'Confirmacion', icon: 'account-check-outline' as const },
    { id: 'done', label: 'Listo', icon: 'check-circle-outline' as const },
  ];
  const currentIndex = items.findIndex((item) => item.id === currentStep);

  return (
    <View style={styles.stepper}>
      {items.map((item, index) => {
        const active = index <= currentIndex;

        return (
          <View key={item.id} style={styles.stepItem}>
            <View style={[styles.stepBadge, active ? styles.stepBadgeActive : undefined]}>
              <Text style={[styles.stepNumber, active ? styles.stepNumberActive : undefined]}>{index + 1}</Text>
            </View>
            <MaterialCommunityIcons name={item.icon} size={22} color={active ? palette.violet : palette.mutedSoft} />
            <Text style={[styles.stepLabel, active ? styles.stepLabelActive : undefined]}>{item.label}</Text>
            {index < items.length - 1 ? <View style={styles.stepLine} /> : null}
          </View>
        );
      })}
    </View>
  );
}

function MethodTab({
  active,
  icon,
  label,
  onPress,
}: {
  active: boolean;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.methodTab, active ? styles.methodTabActive : undefined]}>
      <MaterialCommunityIcons name={icon} size={23} color={active ? palette.violet : palette.text} />
      <Text style={[styles.methodLabel, active ? styles.methodLabelActive : undefined]}>{label}</Text>
    </Pressable>
  );
}

function TestPaymentInput({
  icon,
  keyboardType,
  label,
  onChangeText,
  placeholder,
  secureTextEntry,
  value,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  keyboardType?: 'default' | 'number-pad';
  label: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  value: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputShell}>
        <MaterialCommunityIcons name={icon} size={20} color={palette.violet} />
        <TextInput
          autoCapitalize="none"
          keyboardType={keyboardType}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="rgba(168, 177, 194, 0.52)"
          secureTextEntry={secureTextEntry}
          style={styles.input}
          value={value}
        />
      </View>
    </View>
  );
}

function OrderSummary({ plan, requestTrial }: { plan: CommercialPlan; requestTrial: boolean }) {
  return (
    <View style={styles.summaryPanel}>
      <View style={styles.panelTitleRow}>
        <View style={styles.panelTitleIcon}>
          <MaterialCommunityIcons name="clipboard-check-outline" size={24} color={palette.violet} />
        </View>
        <View style={styles.panelTitleCopy}>
          <Text style={styles.panelTitle}>Resumen de tu pedido</Text>
          <Text style={styles.panelSubtitle}>Plan seleccionado para la cuenta.</Text>
        </View>
      </View>

      <View style={styles.summaryHero}>
        <View style={styles.summaryIcon}>
          <MaterialCommunityIcons name="bus-electric" size={42} color={palette.violet} />
        </View>
        <View style={styles.summaryCopy}>
          <Text style={styles.summaryPlan}>{plan.name}</Text>
          <Text style={styles.summaryPrice}>{formatCurrency(plan.price)} MXN / mes</Text>
          <Text style={styles.summaryMeta}>Incluye {plan.units} unidades y acceso administrativo completo.</Text>
        </View>
      </View>

      <View style={styles.totals}>
        <TotalRow label="Subtotal" value={`${formatCurrency(plan.price)} MXN`} />
        <TotalRow label="IVA incluido" value="Incluido" />
        <View style={styles.totalDivider} />
        <TotalRow label="Total mensual" value={`${formatCurrency(plan.price)} MXN`} strong />
      </View>

      <View style={styles.summaryBenefits}>
        <Text style={styles.summaryBenefitsTitle}>Incluye:</Text>
        {checkoutBenefits.map((benefit) => (
          <View key={benefit} style={styles.summaryBenefitRow}>
            <MaterialCommunityIcons name="check-circle-outline" size={17} color={palette.violet} />
            <Text style={styles.summaryBenefitText}>{benefit}</Text>
          </View>
        ))}
      </View>

      <View style={styles.cancelBox}>
        <MaterialCommunityIcons name={requestTrial ? 'flask-outline' : 'shield-check-outline'} size={28} color={palette.violet} />
        <View style={styles.cancelCopy}>
          <Text style={styles.cancelTitle}>{requestTrial ? 'Demo 7 días' : 'Control de tu suscripción'}</Text>
          <Text style={styles.cancelText}>
            {requestTrial
              ? 'Prueba primero y conserva el plan seleccionado.'
              : 'La administración del ciclo de vida estará disponible desde tu portal.'}
          </Text>
        </View>
      </View>
    </View>
  );
}

function TotalRow({ label, strong, value }: { label: string; strong?: boolean; value: string }) {
  return (
    <View style={styles.totalRow}>
      <Text style={[styles.totalLabel, strong ? styles.totalLabelStrong : undefined]}>{label}</Text>
      <Text style={[styles.totalValue, strong ? styles.totalValueStrong : undefined]}>{value}</Text>
    </View>
  );
}

function TrustItem({
  body,
  icon,
  title,
}: {
  body: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
}) {
  return (
    <View style={styles.trustItem}>
      <View style={styles.trustIcon}>
        <MaterialCommunityIcons name={icon} size={24} color={palette.violet} />
      </View>
      <View style={styles.trustCopy}>
        <Text style={styles.trustTitle}>{title}</Text>
        <Text style={styles.trustBody}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: palette.background,
    flex: 1,
    minHeight: '100vh' as any,
  },
  scroll: {
    flex: 1,
  },
  content: {
    gap: 18,
    marginHorizontal: 'auto' as any,
    maxWidth: 1320,
    minHeight: '100vh' as any,
    padding: 24,
    width: '100%',
  },
  contentPhone: {
    padding: 14,
  },
  backgroundLayer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  backgroundGlowTop: {
    backgroundColor: 'rgba(168, 85, 247, 0.2)',
    borderRadius: 260,
    height: 520,
    position: 'absolute',
    right: -170,
    top: -210,
    width: 520,
  },
  backgroundGlowBottom: {
    backgroundColor: 'rgba(255, 36, 92, 0.16)',
    borderRadius: 280,
    bottom: -210,
    height: 560,
    left: -220,
    position: 'absolute',
    width: 560,
  },
  backgroundRail: {
    backgroundColor: 'rgba(35, 213, 255, 0.08)',
    height: 1,
    left: -120,
    position: 'absolute',
    right: -120,
    top: 160,
    transform: [{ rotate: '-5deg' }],
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
    minWidth: 0,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderColor: palette.line,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 42,
    paddingHorizontal: 14,
  },
  backText: {
    color: palette.text,
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '900',
  },
  checkoutFrame: {
    borderColor: 'rgba(168, 85, 247, 0.28)',
    borderRadius: 8,
    borderWidth: 1,
    gap: 24,
    overflow: 'hidden',
    padding: 24,
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage: 'linear-gradient(145deg, rgba(5, 8, 22, 0.94), rgba(10, 16, 36, 0.96))',
          boxShadow: '0 0 0 1px rgba(168, 85, 247, 0.08), 0 28px 90px rgba(0, 0, 0, 0.46)',
        } as any)
      : {
          backgroundColor: 'rgba(7, 12, 28, 0.96)',
        }),
  },
  stepper: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    minHeight: 48,
  },
  stepItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minWidth: 0,
  },
  stepBadge: {
    alignItems: 'center',
    borderColor: palette.line,
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  stepBadgeActive: {
    backgroundColor: 'rgba(168, 85, 247, 0.22)',
    borderColor: palette.violet,
  },
  stepNumber: {
    color: palette.mutedSoft,
    fontFamily: Typography.body,
    fontSize: 15,
    fontWeight: '900',
  },
  stepNumberActive: {
    color: palette.text,
  },
  stepLabel: {
    color: palette.muted,
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '800',
  },
  stepLabelActive: {
    color: palette.violet,
  },
  stepLine: {
    backgroundColor: 'rgba(168, 85, 247, 0.28)',
    height: 1,
    width: 82,
  },
  checkoutGrid: {
    gap: 24,
  },
  checkoutGridWide: {
    alignItems: 'stretch',
    flexDirection: 'row',
  },
  leftPanel: {
    borderColor: palette.lineStrong,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1.55,
    gap: 20,
    minWidth: 0,
    padding: 24,
    ...(Platform.OS === 'web'
      ? ({ backgroundImage: 'linear-gradient(145deg, rgba(16, 20, 44, 0.94), rgba(32, 18, 54, 0.74))' } as any)
      : { backgroundColor: palette.panel }),
  },
  fullPanel: {
    width: '100%',
  },
  panelTitleRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    minWidth: 0,
  },
  panelTitleIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(168, 85, 247, 0.14)',
    borderRadius: 10,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  panelTitleCopy: {
    flex: 1,
    gap: 5,
    minWidth: 0,
  },
  panelTitle: {
    color: palette.text,
    fontFamily: Typography.display,
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 28,
  },
  panelSubtitle: {
    color: palette.muted,
    fontFamily: Typography.body,
    fontSize: 13,
    lineHeight: 20,
  },
  methodTabs: {
    borderColor: palette.line,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    overflow: 'hidden',
  },
  methodTab: {
    alignItems: 'center',
    borderColor: palette.line,
    borderRightWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    minHeight: 64,
    minWidth: 220,
    paddingHorizontal: 14,
  },
  methodTabActive: {
    backgroundColor: 'rgba(168, 85, 247, 0.22)',
  },
  methodLabel: {
    color: palette.text,
    flexShrink: 1,
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '900',
    minWidth: 0,
  },
  methodLabelActive: {
    color: '#FFFFFF',
  },
  formGrid: {
    gap: 16,
  },
  testPaymentPanel: {
    borderColor: 'rgba(82, 242, 167, 0.35)',
    borderRadius: 8,
    borderWidth: 1,
    gap: 18,
    padding: 18,
    ...(Platform.OS === 'web'
      ? ({ backgroundImage: 'linear-gradient(145deg, rgba(6, 32, 28, 0.82), rgba(16, 20, 44, 0.9))' } as any)
      : { backgroundColor: 'rgba(6, 32, 28, 0.82)' }),
  },
  testModeHeader: {
    gap: 8,
  },
  testModeBadge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(82, 242, 167, 0.12)',
    borderColor: 'rgba(82, 242, 167, 0.42)',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 34,
    paddingHorizontal: 10,
  },
  testModeBadgeText: {
    color: palette.lime,
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '900',
  },
  testModeText: {
    color: palette.muted,
    fontFamily: Typography.body,
    fontSize: 13,
    lineHeight: 20,
  },
  inlineFields: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  field: {
    flex: 1,
    gap: 8,
    minWidth: 220,
  },
  fieldLabel: {
    color: 'rgba(248, 250, 252, 0.82)',
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '800',
  },
  inputShell: {
    alignItems: 'center',
    backgroundColor: 'rgba(5, 8, 22, 0.68)',
    borderColor: palette.line,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 54,
    paddingHorizontal: 14,
  },
  inputShellFocused: {
    borderColor: 'rgba(168, 85, 247, 0.78)',
  },
  input: {
    color: palette.text,
    flex: 1,
    fontFamily: Typography.body,
    fontSize: 15,
    minHeight: 52,
    paddingHorizontal: 0,
  },
  fieldRight: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: 6,
  },
  cardMarks: {
    flexDirection: 'row',
    gap: 5,
  },
  cardMark: {
    backgroundColor: 'rgba(35, 213, 255, 0.14)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 3,
  },
  cardMarkText: {
    color: palette.text,
    fontFamily: Typography.body,
    fontSize: 9,
    fontWeight: '900',
  },
  speiPanel: {
    alignItems: 'center',
    backgroundColor: 'rgba(35, 213, 255, 0.08)',
    borderColor: 'rgba(35, 213, 255, 0.24)',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    padding: 18,
  },
  speiCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  speiTitle: {
    color: palette.text,
    fontFamily: Typography.body,
    fontSize: 15,
    fontWeight: '900',
  },
  speiText: {
    color: palette.muted,
    fontFamily: Typography.body,
    fontSize: 13,
    lineHeight: 20,
  },
  securityNote: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderColor: palette.line,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 12,
  },
  securityText: {
    color: palette.muted,
    flexShrink: 1,
    fontFamily: Typography.body,
    fontSize: 12,
    lineHeight: 18,
    minWidth: 0,
    textAlign: 'center',
  },
  messageBox: {
    backgroundColor: 'rgba(255, 36, 92, 0.14)',
    borderColor: 'rgba(255, 36, 92, 0.46)',
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
  },
  messageText: {
    color: '#FFB4C8',
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 18,
    textAlign: 'center',
  },
  payButton: {
    alignItems: 'center',
    backgroundColor: palette.accent,
    borderRadius: 10,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
    minHeight: 64,
    paddingHorizontal: 18,
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage: 'linear-gradient(135deg, #F3155F, #B72CF5 58%, #7C3AED)',
          boxShadow: '0 18px 42px rgba(255, 36, 92, 0.26), 0 0 24px rgba(168, 85, 247, 0.24)',
          cursor: 'pointer',
        } as any)
      : null),
  },
  payButtonText: {
    color: '#FFFFFF',
    flexShrink: 1,
    fontFamily: Typography.body,
    fontSize: 17,
    fontWeight: '900',
    minWidth: 0,
    textAlign: 'center',
  },
  disabledButton: {
    opacity: 0.58,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  summaryPanel: {
    borderColor: 'rgba(255, 36, 92, 0.7)',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    gap: 22,
    minWidth: 300,
    padding: 24,
    ...(Platform.OS === 'web'
      ? ({ backgroundImage: 'linear-gradient(145deg, rgba(11, 14, 34, 0.96), rgba(28, 13, 45, 0.9))' } as any)
      : { backgroundColor: palette.panelStrong }),
  },
  summaryHero: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 18,
    minWidth: 0,
  },
  summaryIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(168, 85, 247, 0.18)',
    borderColor: 'rgba(168, 85, 247, 0.42)',
    borderRadius: 12,
    borderWidth: 1,
    height: 88,
    justifyContent: 'center',
    width: 88,
  },
  summaryCopy: {
    flex: 1,
    gap: 6,
    minWidth: 0,
  },
  summaryPlan: {
    color: palette.text,
    fontFamily: Typography.display,
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 36,
  },
  summaryPrice: {
    color: palette.violet,
    fontFamily: Typography.body,
    fontSize: 16,
    fontWeight: '900',
  },
  summaryMeta: {
    color: palette.muted,
    fontFamily: Typography.body,
    fontSize: 13,
    lineHeight: 20,
  },
  totals: {
    borderBottomColor: palette.line,
    borderBottomWidth: 1,
    borderTopColor: palette.line,
    borderTopWidth: 1,
    gap: 12,
    paddingVertical: 18,
  },
  totalRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  totalLabel: {
    color: palette.muted,
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '700',
  },
  totalLabelStrong: {
    color: palette.text,
    fontWeight: '900',
  },
  totalValue: {
    color: palette.text,
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '800',
  },
  totalValueStrong: {
    fontFamily: Typography.display,
    fontSize: 24,
    fontWeight: '900',
  },
  totalDivider: {
    backgroundColor: palette.line,
    height: 1,
  },
  summaryBenefits: {
    gap: 10,
  },
  summaryBenefitsTitle: {
    color: palette.text,
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '900',
  },
  summaryBenefitRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
  },
  summaryBenefitText: {
    color: palette.muted,
    flex: 1,
    fontFamily: Typography.body,
    fontSize: 13,
    lineHeight: 19,
    minWidth: 0,
  },
  cancelBox: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderColor: palette.line,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 14,
  },
  cancelCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  cancelTitle: {
    color: palette.text,
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '900',
  },
  cancelText: {
    color: palette.muted,
    fontFamily: Typography.body,
    fontSize: 12,
    lineHeight: 18,
  },
  trustStrip: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderColor: palette.line,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    padding: 16,
  },
  trustItem: {
    alignItems: 'center',
    flex: 1,
    flexBasis: 260,
    flexDirection: 'row',
    gap: 12,
    minWidth: 0,
  },
  trustIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(168, 85, 247, 0.15)',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  trustCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  trustTitle: {
    color: palette.text,
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '900',
  },
  trustBody: {
    color: palette.muted,
    fontFamily: Typography.body,
    fontSize: 12,
    lineHeight: 18,
  },
  donePanel: {
    alignItems: 'center',
    borderColor: 'rgba(82, 242, 167, 0.42)',
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    minHeight: 420,
    justifyContent: 'center',
    padding: 28,
    ...(Platform.OS === 'web'
      ? ({ backgroundImage: 'linear-gradient(145deg, rgba(8, 30, 28, 0.9), rgba(20, 16, 42, 0.94))' } as any)
      : { backgroundColor: palette.panel }),
  },
  doneIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(82, 242, 167, 0.12)',
    borderRadius: 42,
    height: 84,
    justifyContent: 'center',
    width: 84,
  },
  doneTitle: {
    color: palette.text,
    fontFamily: Typography.display,
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 36,
    textAlign: 'center',
  },
  doneText: {
    color: palette.muted,
    fontFamily: Typography.body,
    fontSize: 15,
    lineHeight: 23,
    maxWidth: 620,
    textAlign: 'center',
  },
  doneButton: {
    marginTop: 8,
    maxWidth: 440,
    width: '100%',
  },
  loadingScreen: {
    alignItems: 'center',
    backgroundColor: palette.background,
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    minHeight: '100vh' as any,
  },
  loadingText: {
    color: palette.muted,
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '800',
  },
});
