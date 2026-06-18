import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { Redirect, router, useLocalSearchParams } from '@/src/navigation/router';
import { StatusBar } from '@/src/native/status-bar';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
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
import {
  confirmCommercialPaymentRequest,
  createCommercialCheckoutRequest,
  getApiErrorMessage,
  getCommercialPlansRequest,
} from '@/src/api/client';
import { BrandLogo } from '@/src/components/brand-logo';
import { FALLBACK_COMMERCIAL_PLANS } from '@/src/constants/commercial';
import { useAppStore } from '@/src/store/use-app-store';
import type { CommercialPlan } from '@/src/types/app';
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
  'Activacion por unidades',
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

function normalizeDigits(value: string, maxLength: number) {
  return value.replace(/[^\d]/g, '').slice(0, maxLength);
}

function getPlanById(plans: CommercialPlan[], planId?: string | null) {
  return plans.find((plan) => plan.id === planId) || FALLBACK_COMMERCIAL_PLANS.find((plan) => plan.id === planId) || null;
}

function getContactPhone(phone?: string | null) {
  const cleanPhone = String(phone || '').trim();
  return cleanPhone || 'Por confirmar';
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
  const { createPaymentMethod, loadAll, portalSubmitting } = usePortalStore(
    useShallow((state) => ({
      createPaymentMethod: state.createPaymentMethod,
      loadAll: state.loadAll,
      portalSubmitting: state.isSubmitting,
    }))
  );
  const [plans, setPlans] = useState<CommercialPlan[]>(FALLBACK_COMMERCIAL_PLANS);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('card');
  const [cardNumber, setCardNumber] = useState('');
  const [expiration, setExpiration] = useState('');
  const [cvc, setCvc] = useState('');
  const [cardholder, setCardholder] = useState(user?.name || '');
  const [step, setStep] = useState<CheckoutStep>('payment');
  const [message, setMessage] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<any>(null);
  const [processing, setProcessing] = useState(false);

  const selectedPlan = useMemo(() => getPlanById(plans, planId), [planId, plans]);
  const buttonAmount = `${formatCurrency(selectedPlan?.price)} MXN`;
  const canSubmit = Boolean(selectedPlan && user && !processing && !portalSubmitting);

  useEffect(() => {
    void getCommercialPlansRequest()
      .then((response) => {
        if (response.length) {
          setPlans(response);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (planId) {
      saveCheckoutContext(planId, requestTrial);
    }
  }, [planId, requestTrial]);

  useEffect(() => {
    if (!cardholder && user?.name) {
      setCardholder(user.name);
    }
  }, [cardholder, user?.name]);

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

  const validateCard = () => {
    const digits = normalizeDigits(cardNumber, 16);
    const cleanExpiration = expiration.trim();
    const cleanCvc = normalizeDigits(cvc, 4);
    const cleanName = cardholder.trim();

    if (selectedMethod !== 'card') {
      return true;
    }

    if (digits.length < 15 || !/^\d{2}\s*\/\s*\d{2}$/.test(cleanExpiration) || cleanCvc.length < 3 || !cleanName) {
      setMessage('Completa los datos visuales de tarjeta antes de continuar.');
      return false;
    }

    return true;
  };

  const submitPayment = async () => {
    if (!canSubmit || !validateCard()) {
      return;
    }

    setProcessing(true);
    setStep('confirmation');
    setMessage(null);

    try {
      const companyName = user.companyProfile?.companyName || user.name || 'Cuenta ManeComb';
      const checkout = await createCommercialCheckoutRequest({
        companyName,
        contactName: user.name || companyName,
        email: user.email,
        phone: getContactPhone(user.phone),
        planId: selectedPlan.id,
        paymentMethod: requestTrial ? 'trial' : selectedMethod,
        requestTrial,
        selectedAddOns: [],
      });

      const activatedOrder = requestTrial
        ? checkout
        : await confirmCommercialPaymentRequest({
            externalReference: checkout.paymentExternalReference || checkout.id || checkout.referenceCode,
            paymentId: `visual-checkout-${Date.now()}`,
            paymentMethod: selectedMethod,
            visualSimulation: true,
          });

      if (selectedMethod === 'card' && !requestTrial) {
        const cleanDigits = normalizeDigits(cardNumber, 16);
        const [expMonth = '', expYear = ''] = expiration.split('/').map((item) => item.trim());

        await createPaymentMethod({
          brand: 'Tarjeta',
          last4: cleanDigits.slice(-4),
          expMonth,
          expYear,
          providerToken: 'visual-checkout-token',
        }).catch(() => undefined);
      }

      await loadAll().catch(() => undefined);
      clearCheckoutContext();
      setReceipt(activatedOrder);
      setStep('done');
    } catch (error) {
      const readableMessage = getApiErrorMessage(error, 'No fue posible completar la compra.');
      setMessage(readableMessage);
      setStep('payment');
    } finally {
      setProcessing(false);
    }
  };

  const goToPortal = () => {
    router.replace({ pathname: '/portal', params: { compra: 'lista' } } as never);
  };

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
          <Pressable onPress={() => router.push('/ventas' as never)} style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={18} color={palette.text} />
            <Text style={styles.backText}>Cambiar plan</Text>
          </Pressable>
        </View>

        <View style={styles.checkoutFrame}>
          <Stepper currentStep={step} />

          {step === 'done' ? (
            <View style={styles.donePanel}>
              <View style={styles.doneIcon}>
                <MaterialCommunityIcons name="check-circle-outline" size={46} color={palette.lime} />
              </View>
              <Text style={styles.doneTitle}>Plan activado en tu cuenta.</Text>
              <Text style={styles.doneText}>
                {receipt?.planName || selectedPlan.name} quedo ligado a tu portal ManeComb. El proximo cobro usara {buttonAmount}.
              </Text>
              <Pressable onPress={goToPortal} style={[styles.payButton, styles.doneButton]}>
                <MaterialCommunityIcons name="view-dashboard-outline" size={22} color="#FFFFFF" />
                <Text style={styles.payButtonText}>Acceder al dashboard</Text>
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
                      <Text style={styles.panelTitle}>Informacion de pago</Text>
                      <Text style={styles.panelSubtitle}>Elige tu metodo y completa la transaccion.</Text>
                    </View>
                  </View>

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
                    <View style={styles.formGrid}>
                      <CheckoutField
                        label="Numero de tarjeta"
                        placeholder="1234 1234 1234 1234"
                        value={cardNumber}
                        keyboardType="number-pad"
                        maxLength={19}
                        onChangeText={(value) => {
                          const digits = normalizeDigits(value, 16);
                          setCardNumber(digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim());
                        }}
                        right={<CardMarks />}
                      />
                      <View style={styles.inlineFields}>
                        <CheckoutField
                          label="Fecha de expiracion"
                          placeholder="MM / AA"
                          value={expiration}
                          maxLength={7}
                          onChangeText={(value) => {
                            const digits = normalizeDigits(value, 4);
                            setExpiration(digits.length > 2 ? `${digits.slice(0, 2)} / ${digits.slice(2)}` : digits);
                          }}
                        />
                        <CheckoutField
                          label="CVC"
                          placeholder="123"
                          value={cvc}
                          keyboardType="number-pad"
                          maxLength={4}
                          onChangeText={(value) => setCvc(normalizeDigits(value, 4))}
                          right={<MaterialCommunityIcons name="credit-card-lock-outline" size={20} color={palette.muted} />}
                        />
                      </View>
                      <CheckoutField
                        label="Nombre en la tarjeta"
                        placeholder="Nombre completo"
                        value={cardholder}
                        onChangeText={setCardholder}
                      />
                    </View>
                  ) : (
                    <View style={styles.speiPanel}>
                      <MaterialCommunityIcons name="bank-transfer" size={32} color={palette.cyan} />
                      <View style={styles.speiCopy}>
                        <Text style={styles.speiTitle}>Referencia SPEI preparada</Text>
                        <Text style={styles.speiText}>
                          La compra queda registrada con referencia comercial y se completa con la simulacion interna de pago.
                        </Text>
                      </View>
                    </View>
                  )}

                  <View style={styles.securityNote}>
                    <MaterialCommunityIcons name="lock-outline" size={18} color={palette.violet} />
                    <Text style={styles.securityText}>Pago seguro, facturacion automatica y cancelacion sin complicaciones.</Text>
                  </View>

                  {message ? (
                    <View style={styles.messageBox}>
                      <Text style={styles.messageText}>{message}</Text>
                    </View>
                  ) : null}

                  <Pressable
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
                          {requestTrial ? `Activar prueba ${selectedPlan.trialDays || 7} dias` : `Pagar ${buttonAmount}`}
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
                <TrustItem icon="file-document-outline" title="Facturacion automatica" body="El portal conserva tu comprobante comercial." />
                <TrustItem icon="calendar-refresh-outline" title="Cobro mensual" body={`Renovacion por ${buttonAmount}.`} />
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
    <Pressable onPress={onPress} style={[styles.methodTab, active ? styles.methodTabActive : undefined]}>
      <MaterialCommunityIcons name={icon} size={23} color={active ? palette.violet : palette.text} />
      <Text style={[styles.methodLabel, active ? styles.methodLabelActive : undefined]}>{label}</Text>
    </Pressable>
  );
}

function CheckoutField({
  keyboardType = 'default',
  label,
  maxLength,
  onChangeText,
  placeholder,
  right,
  value,
}: {
  keyboardType?: 'default' | 'number-pad';
  label: string;
  maxLength?: number;
  onChangeText: (value: string) => void;
  placeholder: string;
  right?: ReactNode;
  value: string;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.inputShell, focused ? styles.inputShellFocused : undefined]}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="rgba(216, 226, 245, 0.42)"
          keyboardType={keyboardType}
          maxLength={maxLength}
          selectionColor={palette.violet}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={styles.input}
        />
        {right ? <View style={styles.fieldRight}>{right}</View> : null}
      </View>
    </View>
  );
}

function CardMarks() {
  return (
    <View style={styles.cardMarks}>
      {['VISA', 'MC', 'AMEX'].map((item) => (
        <View key={item} style={styles.cardMark}>
          <Text style={styles.cardMarkText}>{item}</Text>
        </View>
      ))}
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
          <Text style={styles.cancelTitle}>{requestTrial ? 'Demo 7 dias' : 'Cancelacion sin complicaciones'}</Text>
          <Text style={styles.cancelText}>
            {requestTrial ? 'Prueba primero y conserva el plan seleccionado.' : 'Puedes cancelar cuando quieras. Sin cargos ocultos.'}
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
