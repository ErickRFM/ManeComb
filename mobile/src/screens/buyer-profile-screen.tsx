import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
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
  API_ORIGIN,
  createCommercialCheckoutRequest,
  getCommercialPlansRequest,
  getMyCommercialOrdersRequest,
} from '@/src/api/client';
import { BrandLogo } from '@/src/components/brand-logo';
import { UserAvatar } from '@/src/components/user-avatar';
import { COMMERCIAL_PAYMENT_METHODS, FALLBACK_COMMERCIAL_PLANS } from '@/src/constants/commercial';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { useAppStore } from '@/src/store/use-app-store';
import type {
  CommercialCheckoutResult,
  CommercialDownloadAsset,
  CommercialPlan,
  ProfileMutationPayload,
} from '@/src/types/app';
import { getAuthenticatedHome, isCustomerAccount } from '@/src/utils/account-routing';
import { getPasswordStrength, isStrongPassword, PASSWORD_MIN_LENGTH } from '@/src/utils/password-strength';

type PortalMessageTone = 'danger' | 'success' | 'info';

type ProfileForm = {
  name: string;
  email: string;
  phone: string;
  companyName: string;
  legalName: string;
  taxId: string;
  billingEmail: string;
  billingAddress: string;
  preferredMethod: 'card' | 'spei' | 'transfer';
  cardholderName: string;
  cardBrand: string;
  cardLast4: string;
  cardExpMonth: string;
  cardExpYear: string;
  customerReference: string;
};

type PurchaseForm = {
  paymentMethod: 'card' | 'spei' | 'transfer';
  requestTrial: boolean;
  needsInvoice: boolean;
  needsOnboarding: boolean;
  selectedAddOns: string[];
  notes: string;
};

type DownloadEntry = {
  asset: CommercialDownloadAsset;
  order: CommercialCheckoutResult;
};

const initialProfileForm: ProfileForm = {
  name: '',
  email: '',
  phone: '',
  companyName: '',
  legalName: '',
  taxId: '',
  billingEmail: '',
  billingAddress: '',
  preferredMethod: 'spei',
  cardholderName: '',
  cardBrand: '',
  cardLast4: '',
  cardExpMonth: '',
  cardExpYear: '',
  customerReference: '',
};

const initialPurchaseForm: PurchaseForm = {
  paymentMethod: 'spei',
  requestTrial: false,
  needsInvoice: true,
  needsOnboarding: true,
  selectedAddOns: [],
  notes: '',
};

function getFirstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function BuyerProfileScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1080;
  const isTablet = width >= 760;
  const { theme } = useAppTheme();
  const params = useLocalSearchParams<{ planId?: string | string[]; trial?: string | string[] }>();
  const { isSubmitting, signOut, updateProfile, user } = useAppStore(
    useShallow((state) => ({
      isSubmitting: state.isSubmitting,
      signOut: state.signOut,
      updateProfile: state.updateProfile,
      user: state.user,
    }))
  );
  const routePlanId = getFirstParam(params.planId);
  const routeRequestsTrial = getFirstParam(params.trial) === '1';

  const [plans, setPlans] = useState<CommercialPlan[]>(FALLBACK_COMMERCIAL_PLANS);
  const [orders, setOrders] = useState<CommercialCheckoutResult[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>(
    routePlanId || FALLBACK_COMMERCIAL_PLANS[0].id
  );
  const [profileForm, setProfileForm] = useState<ProfileForm>(initialProfileForm);
  const [purchaseForm, setPurchaseForm] = useState<PurchaseForm>(initialPurchaseForm);
  const [securityPassword, setSecurityPassword] = useState('');
  const [securityConfirm, setSecurityConfirm] = useState('');
  const [portalLoading, setPortalLoading] = useState(true);
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [portalMessage, setPortalMessage] = useState<string | null>(null);
  const [portalTone, setPortalTone] = useState<PortalMessageTone>('info');

  const palette = theme.mode === 'dark'
    ? {
        background: '#07111D',
        panel: '#101D2C',
        panelSoft: '#142436',
        line: 'rgba(255,255,255,0.08)',
        text: '#F7FAFC',
        muted: '#9FB0C6',
        accent: '#E31E24',
        accentSoft: 'rgba(227, 30, 36, 0.18)',
        success: '#36C57A',
        warning: '#F0A725',
        info: '#60A5FA',
      }
    : {
        background: '#F4F7FB',
        panel: '#FFFFFF',
        panelSoft: '#EEF3F8',
        line: '#D9E1EA',
        text: '#132033',
        muted: '#5C6B7D',
        accent: '#D91E18',
        accentSoft: 'rgba(217, 30, 24, 0.1)',
        success: '#1E9B5B',
        warning: '#C98A14',
        info: '#2563EB',
      };

  useEffect(() => {
    if (!user) {
      return;
    }

    setProfileForm({
      name: user.name || '',
      email: user.email || '',
      phone: user.phone || '',
      companyName: user.companyProfile?.companyName || '',
      legalName: user.companyProfile?.legalName || '',
      taxId: user.companyProfile?.taxId || '',
      billingEmail: user.companyProfile?.billingEmail || user.email || '',
      billingAddress: user.companyProfile?.billingAddress || '',
      preferredMethod: user.paymentProfile?.preferredMethod || 'spei',
      cardholderName: user.paymentProfile?.cardholderName || '',
      cardBrand: user.paymentProfile?.cardBrand || '',
      cardLast4: user.paymentProfile?.cardLast4 || '',
      cardExpMonth: user.paymentProfile?.cardExpMonth || '',
      cardExpYear: user.paymentProfile?.cardExpYear || '',
      customerReference: user.paymentProfile?.customerReference || '',
    });
    setPurchaseForm((current) => ({
      ...current,
      paymentMethod: user.paymentProfile?.preferredMethod || current.paymentMethod,
    }));
  }, [user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    let mounted = true;
    setPortalLoading(true);

    void Promise.all([getCommercialPlansRequest(), getMyCommercialOrdersRequest()])
      .then(([plansResponse, ordersResponse]) => {
        if (!mounted) {
          return;
        }

        const nextPlans = plansResponse.length ? plansResponse : FALLBACK_COMMERCIAL_PLANS;
        setPlans(nextPlans);
        setOrders(ordersResponse);

        const purchasedPlanIds = new Set(ordersResponse.map((order) => order.planId));
        const suggestedPlan =
          nextPlans.find((plan) => plan.id === routePlanId) ||
          nextPlans.find((plan) => !purchasedPlanIds.has(plan.id)) ||
          nextPlans[0] ||
          FALLBACK_COMMERCIAL_PLANS[0];
        setSelectedPlanId(suggestedPlan.id);
      })
      .catch(() => {
        if (!mounted) {
          return;
        }

        setPlans(FALLBACK_COMMERCIAL_PLANS);
      })
      .finally(() => {
        if (mounted) {
          setPortalLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [routePlanId, user]);

  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) || plans[0];
  const passwordStrength = useMemo(() => getPasswordStrength(securityPassword), [securityPassword]);

  useEffect(() => {
    if (!selectedPlan) {
      return;
    }

    setPurchaseForm((current) => ({
      ...current,
      requestTrial:
        routeRequestsTrial && selectedPlan.id === routePlanId && selectedPlan.trialEligible
          ? true
          : selectedPlan.trialEligible
            ? current.requestTrial
            : false,
      selectedAddOns: selectedPlan.radioAddonEligible
        ? current.selectedAddOns
        : current.selectedAddOns.filter((item) => item !== 'radio_dispatch'),
    }));
  }, [routePlanId, routeRequestsTrial, selectedPlan]);

  const activeOrder =
    orders.find((order) => order.activationStatus === 'active') ||
    orders.find((order) => order.paymentStatus === 'trial_active') ||
    orders.find((order) => order.status === 'paid' || order.status === 'active') ||
    orders[0] ||
    null;

  const downloadEntries = useMemo<DownloadEntry[]>(
    () =>
      orders.flatMap((order) =>
        (order.downloads || [])
          .filter((asset) => asset.available && asset.token)
          .map((asset) => ({
            asset,
            order,
          }))
      ),
    [orders]
  );

  const purchasedPlanIds = useMemo(() => new Set(orders.map((order) => order.planId)), [orders]);
  const readyInvoices = orders.filter((order) => order.invoiceSummary?.status === 'ready').length;

  if (!user) {
    return <Redirect href="/login" />;
  }

  if (!isCustomerAccount(user)) {
    return <Redirect href={getAuthenticatedHome(user) as never} />;
  }

  const setMessage = (message: string | null, tone: PortalMessageTone = 'info') => {
    setPortalMessage(message);
    setPortalTone(tone);
  };

  const handleProfileSave = async () => {
    setMessage(null);

    if (!profileForm.name.trim() || !profileForm.email.trim()) {
      setMessage('Nombre y correo son obligatorios para guardar el perfil.', 'danger');
      return;
    }

    const payload: ProfileMutationPayload = {
      name: profileForm.name.trim(),
      email: profileForm.email.trim(),
      phone: profileForm.phone.trim(),
      companyProfile: {
        companyName: profileForm.companyName.trim(),
        legalName: profileForm.legalName.trim(),
        taxId: profileForm.taxId.trim().toUpperCase(),
        billingEmail: profileForm.billingEmail.trim(),
        billingAddress: profileForm.billingAddress.trim(),
      },
      paymentProfile: {
        preferredMethod: profileForm.preferredMethod,
        cardholderName: profileForm.cardholderName.trim(),
        cardBrand: profileForm.cardBrand.trim(),
        cardLast4: profileForm.cardLast4.replace(/[^\d]/g, '').slice(-4),
        cardExpMonth: profileForm.cardExpMonth.replace(/[^\d]/g, '').slice(0, 2),
        cardExpYear: profileForm.cardExpYear.replace(/[^\d]/g, '').slice(-2),
        customerReference: profileForm.customerReference.trim(),
      },
    };

    const result = await updateProfile(payload);
    if (!result.ok) {
      setMessage(result.message || 'No fue posible actualizar el perfil.', 'danger');
      return;
    }

    setMessage('Perfil y datos de facturación actualizados.', 'success');
  };

  const handleSecuritySave = async () => {
    setMessage(null);

    if (!securityPassword.trim()) {
      setMessage('Captura una nueva contraseña para actualizar la seguridad.', 'danger');
      return;
    }

    if (!isStrongPassword(securityPassword)) {
      setMessage(
        `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres, letras, números y símbolos.`,
        'danger'
      );
      return;
    }

    if (securityPassword !== securityConfirm) {
      setMessage('La confirmación de contraseña no coincide.', 'danger');
      return;
    }

    const result = await updateProfile({ password: securityPassword });
    if (!result.ok) {
      setMessage(result.message || 'No fue posible actualizar la contraseña.', 'danger');
      return;
    }

    setSecurityPassword('');
    setSecurityConfirm('');
    setMessage('Contraseña actualizada correctamente.', 'success');
  };

  const handlePurchase = async () => {
    setMessage(null);

    if (!selectedPlan) {
      setMessage('Selecciona un producto antes de comprar.', 'danger');
      return;
    }

    if (!profileForm.companyName.trim() || !profileForm.phone.trim()) {
      setMessage('Completa empresa y teléfono para generar la orden comercial.', 'danger');
      return;
    }

    setPurchaseLoading(true);
    try {
      const order = await createCommercialCheckoutRequest({
        companyName: profileForm.companyName.trim(),
        contactName: profileForm.name.trim() || user.name,
        email: profileForm.email.trim() || user.email,
        phone: profileForm.phone.trim(),
        legalName: profileForm.legalName.trim(),
        billingEmail: profileForm.billingEmail.trim(),
        billingAddress: profileForm.billingAddress.trim(),
        taxId: profileForm.taxId.trim().toUpperCase(),
        planId: selectedPlan.id,
        paymentMethod: purchaseForm.paymentMethod,
        needsInvoice: purchaseForm.needsInvoice,
        needsOnboarding: purchaseForm.needsOnboarding,
        requestTrial: purchaseForm.requestTrial,
        selectedAddOns: purchaseForm.selectedAddOns,
        notes: purchaseForm.notes.trim(),
      });

      setOrders((current) => [order, ...current]);
      setPurchaseForm((current) => ({
        ...current,
        notes: '',
      }));
      setMessage(order.nextStep || 'Orden creada correctamente.', 'success');

      if (order.checkoutUrl) {
        await Linking.openURL(order.checkoutUrl);
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'No fue posible registrar la compra.',
        'danger'
      );
    } finally {
      setPurchaseLoading(false);
    }
  };

  const handleDownload = async (asset: CommercialDownloadAsset) => {
    if (!asset.urlPath) {
      setMessage('Esta descarga aún no está disponible para la orden.', 'danger');
      return;
    }

    try {
      await Linking.openURL(`${API_ORIGIN}${asset.urlPath}`);
    } catch {
      setMessage('No fue posible abrir la descarga asociada.', 'danger');
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.background }]}>
      <View style={[styles.glowTop, { backgroundColor: palette.accentSoft }]} />
      <View style={[styles.glowBottom, { backgroundColor: `${palette.info}12` }]} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={Platform.OS === 'web'}>
        <View style={styles.container}>
          <View style={[styles.navbar, isDesktop && styles.navbarDesktop]}>
            <View style={styles.brandBlock}>
              <BrandLogo
                size={isTablet ? 'md' : 'sm'}
                subtitle="Perfil, compras y descargas."
              />
            </View>
            <View style={styles.navActions}>
              <GhostButton
                label="Ventas"
                onPress={() => router.push('/ventas')}
                palette={palette}
              />
              <PrimaryButton label="Cerrar sesión" onPress={() => void signOut()} />
            </View>
          </View>

          <View style={[styles.hero, isDesktop && styles.heroDesktop]}>
            <View
              style={[
                styles.profileHeroCard,
                {
                  backgroundColor: palette.panel,
                  borderColor: palette.line,
                },
              ]}>
              <View style={[styles.profileHeroTop, !isTablet && styles.profileHeroTopMobile]}>
                <View style={styles.profileIdentity}>
                  <View style={styles.avatarFrame}>
                    <UserAvatar
                      user={{
                        avatar: user.avatar,
                        avatarUrl: user.avatarUrl || null,
                        name: profileForm.name || user.name,
                      }}
                      size={84}
                    />
                  </View>
                  <View style={styles.identityCopy}>
                    <Text style={[styles.identityEyebrow, { color: palette.accent }]}>
                      PORTAL CLIENTE
                    </Text>
                    <Text style={[styles.identityName, { color: palette.text }]}>
                      {profileForm.companyName || user.companyProfile?.companyName || user.name}
                    </Text>
                    <Pressable
                      onPress={() =>
                        setMessage('Edita tus datos en la sección Perfil y facturación.', 'info')
                      }
                      style={[styles.profileLink, { backgroundColor: palette.panelSoft }]}>
                      <MaterialCommunityIcons name="account-circle-outline" size={18} color={palette.accent} />
                      <Text style={[styles.profileLinkText, { color: palette.text }]}>Editar datos</Text>
                    </Pressable>
                    <Text style={[styles.identityBody, { color: palette.muted }]}>
                      Perfil, seguridad, historial, factura y descargas de tu cuenta.
                    </Text>
                  </View>
                </View>

                <View
                  style={[
                    styles.statusCard,
                    {
                      backgroundColor: palette.panelSoft,
                      borderColor: palette.line,
                    },
                  ]}>
                  <Text style={[styles.statusLabel, { color: palette.muted }]}>Orden activa</Text>
                  <Text style={[styles.statusValue, { color: palette.text }]}>
                    {activeOrder?.planName || 'Sin orden activa'}
                  </Text>
                  <Text style={[styles.statusBody, { color: palette.muted }]}>
                    {activeOrder?.nextStep ||
                      'Crea una compra para habilitar descargas y seguimiento.'}
                  </Text>
                </View>
              </View>

              <View style={styles.statsRow}>
                <MetricChip
                  palette={palette}
                  icon="cart-check"
                  label="Compras"
                  value={String(orders.length)}
                />
                <MetricChip
                  palette={palette}
                  icon="download-lock-outline"
                  label="Descargas"
                  value={String(downloadEntries.length)}
                />
                <MetricChip
                  palette={palette}
                  icon="file-document-check-outline"
                  label="Facturas listas"
                  value={String(readyInvoices)}
                />
              </View>
            </View>

            <View
              style={[
                styles.summaryCard,
                {
                  backgroundColor: palette.panel,
                  borderColor: palette.line,
                },
              ]}>
              <Text style={[styles.cardEyebrow, { color: palette.accent }]}>Resumen</Text>
              <Text style={[styles.cardTitle, { color: palette.text }]}>Estado comercial</Text>
              {[
                {
                  label: 'Cuenta',
                  value: profileForm.email || user.email,
                },
                {
                  label: 'Método preferido',
                  value: profileForm.preferredMethod.toUpperCase(),
                },
                {
                  label: 'Siguiente paso',
                  value: activeOrder?.nextStep || 'Completar perfil y comprar un plan',
                },
              ].map((item) => (
                <View key={item.label} style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: palette.muted }]}>{item.label}</Text>
                  <Text style={[styles.summaryValue, { color: palette.text }]}>{item.value}</Text>
                </View>
              ))}
            </View>
          </View>

          {portalMessage ? (
            <View
              style={[
                styles.messageBanner,
                {
                  backgroundColor:
                    portalTone === 'success'
                      ? `${palette.success}14`
                      : portalTone === 'danger'
                        ? palette.accentSoft
                        : `${palette.info}14`,
                  borderColor:
                    portalTone === 'success'
                      ? palette.success
                      : portalTone === 'danger'
                        ? palette.accent
                        : palette.info,
                },
              ]}>
              <Text
                style={[
                  styles.messageText,
                  {
                    color:
                      portalTone === 'success'
                        ? palette.success
                        : portalTone === 'danger'
                          ? palette.accent
                          : palette.info,
                  },
                ]}>
                {portalMessage}
              </Text>
            </View>
          ) : null}

          {portalLoading ? (
            <View
              style={[
                styles.loadingCard,
                {
                  backgroundColor: palette.panel,
                  borderColor: palette.line,
                },
              ]}>
              <ActivityIndicator color={palette.accent} />
              <Text style={[styles.loadingText, { color: palette.muted }]}>
                Preparando tu portal cliente...
              </Text>
            </View>
          ) : null}

          <View style={[styles.mainGrid, isDesktop && styles.mainGridDesktop]}>
            <SectionCard title="Perfil y facturación" eyebrow="Cuenta" palette={palette}>
              <View style={styles.formGrid}>
                <Field
                  label="Nombre"
                  value={profileForm.name}
                  onChangeText={(value) =>
                    setProfileForm((current) => ({ ...current, name: value }))
                  }
                  palette={palette}
                />
                <Field
                  label="Correo"
                  value={profileForm.email}
                  onChangeText={(value) =>
                    setProfileForm((current) => ({ ...current, email: value }))
                  }
                  palette={palette}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <Field
                  label="Teléfono"
                  value={profileForm.phone}
                  onChangeText={(value) =>
                    setProfileForm((current) => ({ ...current, phone: value }))
                  }
                  palette={palette}
                  keyboardType="phone-pad"
                />
                <Field
                  label="Empresa"
                  value={profileForm.companyName}
                  onChangeText={(value) =>
                    setProfileForm((current) => ({ ...current, companyName: value }))
                  }
                  palette={palette}
                />
                <Field
                  label="Razón social"
                  value={profileForm.legalName}
                  onChangeText={(value) =>
                    setProfileForm((current) => ({ ...current, legalName: value }))
                  }
                  palette={palette}
                />
                <Field
                  label="RFC o ID fiscal"
                  value={profileForm.taxId}
                  onChangeText={(value) =>
                    setProfileForm((current) => ({ ...current, taxId: value }))
                  }
                  palette={palette}
                  autoCapitalize="characters"
                />
                <Field
                  label="Correo de facturación"
                  value={profileForm.billingEmail}
                  onChangeText={(value) =>
                    setProfileForm((current) => ({ ...current, billingEmail: value }))
                  }
                  palette={palette}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <Field
                  label="Domicilio fiscal"
                  value={profileForm.billingAddress}
                  onChangeText={(value) =>
                    setProfileForm((current) => ({ ...current, billingAddress: value }))
                  }
                  palette={palette}
                />
              </View>

              <Text style={[styles.subsectionLabel, { color: palette.text }]}>
                Preferencia de pago
              </Text>
              <View style={styles.chipRow}>
                {COMMERCIAL_PAYMENT_METHODS.map((method) => (
                  <ChoiceChip
                    key={method.id}
                    label={method.label}
                    active={profileForm.preferredMethod === method.id}
                    onPress={() =>
                      setProfileForm((current) => ({
                        ...current,
                        preferredMethod: method.id,
                      }))
                    }
                    palette={palette}
                  />
                ))}
              </View>
              <View style={styles.formGrid}>
                <Field
                  label="Titular"
                  value={profileForm.cardholderName}
                  onChangeText={(value) =>
                    setProfileForm((current) => ({ ...current, cardholderName: value }))
                  }
                  palette={palette}
                />
                <Field
                  label="Marca"
                  value={profileForm.cardBrand}
                  onChangeText={(value) =>
                    setProfileForm((current) => ({ ...current, cardBrand: value }))
                  }
                  palette={palette}
                />
                <View style={[styles.inlineGrid, isTablet && styles.inlineGridTablet]}>
                  <Field
                    label="Últimos 4"
                    value={profileForm.cardLast4}
                    onChangeText={(value) =>
                      setProfileForm((current) => ({
                        ...current,
                        cardLast4: value.replace(/[^\d]/g, '').slice(-4),
                      }))
                    }
                    palette={palette}
                    keyboardType="phone-pad"
                  />
                  <Field
                    label="Mes"
                    value={profileForm.cardExpMonth}
                    onChangeText={(value) =>
                      setProfileForm((current) => ({
                        ...current,
                        cardExpMonth: value.replace(/[^\d]/g, '').slice(0, 2),
                      }))
                    }
                    palette={palette}
                    keyboardType="phone-pad"
                  />
                  <Field
                    label="Año"
                    value={profileForm.cardExpYear}
                    onChangeText={(value) =>
                      setProfileForm((current) => ({
                        ...current,
                        cardExpYear: value.replace(/[^\d]/g, '').slice(-2),
                      }))
                    }
                    palette={palette}
                    keyboardType="phone-pad"
                  />
                </View>
                <Field
                  label="Referencia cliente"
                  value={profileForm.customerReference}
                  onChangeText={(value) =>
                    setProfileForm((current) => ({ ...current, customerReference: value }))
                  }
                  palette={palette}
                />
              </View>

              <ActionRow>
                <PrimaryButton
                  label={isSubmitting ? 'Guardando...' : 'Guardar perfil'}
                  onPress={() => void handleProfileSave()}
                  disabled={isSubmitting}
                />
              </ActionRow>
            </SectionCard>

            <SectionCard title="Seguridad" eyebrow="Contraseña" palette={palette}>
              <Text style={[styles.sectionBody, { color: palette.muted }]}>
                Cambia la contraseña del portal sin salir de tu cuenta. El cambio protege historial,
                facturas y enlaces de descarga asociados.
              </Text>
              <View style={styles.formGrid}>
                <Field
                  label="Nueva contraseña"
                  value={securityPassword}
                  onChangeText={setSecurityPassword}
                  palette={palette}
                  secureTextEntry
                  autoCapitalize="none"
                />
                <Field
                  label="Confirmar contraseña"
                  value={securityConfirm}
                  onChangeText={setSecurityConfirm}
                  palette={palette}
                  secureTextEntry
                  autoCapitalize="none"
                />
              </View>
              <View
                style={[
                  styles.securityBox,
                  {
                    backgroundColor: palette.panelSoft,
                    borderColor: palette.line,
                  },
                ]}>
                <View style={styles.securityBoxHeader}>
                  <Text style={[styles.securityBoxTitle, { color: palette.text }]}>
                    Fortaleza
                  </Text>
                  <Text
                    style={[
                      styles.securityBoxValue,
                      {
                        color:
                          passwordStrength.tone === 'positive'
                            ? palette.success
                            : passwordStrength.tone === 'warning'
                              ? palette.warning
                              : palette.accent,
                      },
                    ]}>
                    {passwordStrength.label}
                  </Text>
                </View>
                <Text style={[styles.securityBoxBody, { color: palette.muted }]}>
                  Usa letras, números y símbolos. Mínimo {PASSWORD_MIN_LENGTH} caracteres.
                </Text>
              </View>
              <ActionRow>
                <PrimaryButton
                  label={isSubmitting ? 'Actualizando...' : 'Actualizar contraseña'}
                  onPress={() => void handleSecuritySave()}
                  disabled={isSubmitting}
                />
              </ActionRow>
            </SectionCard>
          </View>

          <View style={[styles.mainGrid, isDesktop && styles.mainGridDesktop]}>
            <SectionCard title="Descargas activas" eyebrow="Cuenta ligada" palette={palette}>
              {downloadEntries.length ? (
                <View style={styles.downloadGrid}>
                  {downloadEntries.map(({ asset, order }) => (
                    <View
                      key={`${order.id}-${asset.code}`}
                      style={[
                        styles.downloadCard,
                        {
                          backgroundColor: palette.panelSoft,
                          borderColor: palette.line,
                        },
                      ]}>
                      <View style={styles.downloadHeader}>
                        <View
                          style={[styles.downloadIcon, { backgroundColor: palette.accentSoft }]}>
                          <MaterialCommunityIcons
                            name="download-lock-outline"
                            size={20}
                            color={palette.accent}
                          />
                        </View>
                        <View style={styles.downloadCopy}>
                          <Text style={[styles.downloadTitle, { color: palette.text }]}>
                            {asset.title}
                          </Text>
                          <Text style={[styles.downloadBody, { color: palette.muted }]}>
                            {asset.description}
                          </Text>
                        </View>
                      </View>
                      <Text style={[styles.downloadMeta, { color: palette.muted }]}>
                        Orden {order.referenceCode} | {asset.fileName}
                      </Text>
                      <GhostButton
                        label="Descargar"
                        onPress={() => void handleDownload(asset)}
                        palette={palette}
                      />
                    </View>
                  ))}
                </View>
              ) : (
                <EmptyState
                  palette={palette}
                  icon="download-off-outline"
                  title="Sin descargas disponibles"
                  body="Activa una compra o una prueba para habilitar los archivos asociados a tu cuenta."
                />
              )}
            </SectionCard>

            <SectionCard title="Historial, productos y factura" eyebrow="Comprado" palette={palette}>
              {orders.length ? (
                <View style={styles.orderList}>
                  {orders.map((order) => (
                    <View
                      key={order.id}
                      style={[
                        styles.orderCard,
                        {
                          backgroundColor: palette.panelSoft,
                          borderColor: palette.line,
                        },
                      ]}>
                      <View style={[styles.orderHeader, !isTablet && styles.orderHeaderMobile]}>
                        <View style={styles.orderCopy}>
                          <Text style={[styles.orderTitle, { color: palette.text }]}>
                            {order.planName}
                          </Text>
                          <Text style={[styles.orderSubtitle, { color: palette.muted }]}>
                            {order.referenceCode} | {order.companyName}
                          </Text>
                        </View>
                        <StatusTag
                          label={order.activationStatus || order.paymentStatus || order.status}
                          palette={palette}
                        />
                      </View>

                      <View style={styles.orderStats}>
                        <MiniInfo label="Monto" value={formatCurrency(order.totalPrice)} palette={palette} />
                        <MiniInfo label="Pago" value={order.paymentMethod.toUpperCase()} palette={palette} />
                        <MiniInfo
                          label="Factura"
                          value={order.invoiceSummary?.label || 'No disponible'}
                          palette={palette}
                        />
                      </View>

                      <Text style={[styles.orderNextStep, { color: palette.text }]}>
                        {order.nextStep}
                      </Text>
                      <Text style={[styles.orderBody, { color: palette.muted }]}>
                        {order.invoiceSummary?.needsInvoice
                          ? `Facturación ligada a ${order.invoiceSummary.billingEmail}.`
                          : 'Esta orden no solicitó factura, pero mantiene su comprobante comercial.'}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <EmptyState
                  palette={palette}
                  icon="history"
                  title="Aún no hay compras registradas"
                  body="Selecciona un plan en el catálogo para empezar a construir historial, factura y descargas."
                />
              )}
            </SectionCard>
          </View>

          <SectionCard title="Catálogo y compra" eyebrow="Por comprar" palette={palette}>
            <View style={[styles.catalogGrid, isDesktop && styles.catalogGridDesktop]}>
              <View style={styles.planColumn}>
                {plans.map((plan) => {
                  const purchased = purchasedPlanIds.has(plan.id);
                  const selected = selectedPlanId === plan.id;

                  return (
                    <Pressable
                      key={plan.id}
                      onPress={() => setSelectedPlanId(plan.id)}
                      style={({ pressed }) => [
                        styles.catalogPlanCard,
                        {
                          backgroundColor: palette.panelSoft,
                          borderColor: selected ? palette.accent : palette.line,
                        },
                        pressed ? styles.pressed : undefined,
                      ]}>
                      <View style={styles.catalogPlanTop}>
                        <View style={styles.catalogPlanCopy}>
                          <Text style={[styles.catalogPlanName, { color: palette.text }]}>
                            {plan.name}
                          </Text>
                          <Text style={[styles.catalogPlanBody, { color: palette.muted }]}>
                            {plan.subtitle}
                          </Text>
                        </View>
                        {purchased ? (
                          <StatusTag label="Comprado" palette={palette} tone="success" />
                        ) : null}
                      </View>
                      <Text style={[styles.catalogPlanPrice, { color: palette.text }]}>
                        {formatCurrency(plan.price)}
                      </Text>
                      <Text style={[styles.catalogPlanMeta, { color: palette.muted }]}>
                        {plan.units} unidades | {plan.strategy}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View
                style={[
                  styles.checkoutCard,
                  {
                    backgroundColor: palette.panelSoft,
                    borderColor: palette.line,
                  },
                ]}>
                <Text style={[styles.checkoutTitle, { color: palette.text }]}>
                  {selectedPlan?.name || 'Selecciona un plan'}
                </Text>
                <Text style={[styles.checkoutBody, { color: palette.muted }]}>
                  Historial, factura y descargas quedan enlazadas a esta cuenta.
                </Text>

                {selectedPlan ? (
                  <View style={styles.checkoutSummary}>
                    <MiniInfo label="Total" value={formatCurrency(selectedPlan.price)} palette={palette} />
                    <MiniInfo
                      label="Por unidad"
                      value={formatCurrency(selectedPlan.pricePerVehicle)}
                      palette={palette}
                    />
                    <MiniInfo label="Badge" value={selectedPlan.badge} palette={palette} />
                  </View>
                ) : null}

                <Text style={[styles.subsectionLabel, { color: palette.text }]}>
                  Método de cobro
                </Text>
                <View style={styles.chipRow}>
                  {COMMERCIAL_PAYMENT_METHODS.map((method) => (
                    <ChoiceChip
                      key={method.id}
                      label={method.label}
                      active={purchaseForm.paymentMethod === method.id}
                      onPress={() =>
                        setPurchaseForm((current) => ({
                          ...current,
                          paymentMethod: method.id,
                        }))
                      }
                      palette={palette}
                    />
                  ))}
                </View>

                <Text style={[styles.subsectionLabel, { color: palette.text }]}>
                  Preferencias
                </Text>
                <View style={styles.toggleList}>
                  <ToggleRow
                    label="Solicitar factura"
                    value={purchaseForm.needsInvoice}
                    onToggle={() =>
                      setPurchaseForm((current) => ({
                        ...current,
                        needsInvoice: !current.needsInvoice,
                      }))
                    }
                    palette={palette}
                  />
                  <ToggleRow
                    label="Necesito onboarding"
                    value={purchaseForm.needsOnboarding}
                    onToggle={() =>
                      setPurchaseForm((current) => ({
                        ...current,
                        needsOnboarding: !current.needsOnboarding,
                      }))
                    }
                    palette={palette}
                  />
                  {selectedPlan?.trialEligible ? (
                    <ToggleRow
                      label={`Activar prueba de ${selectedPlan.trialDays || 7} días`}
                      value={purchaseForm.requestTrial}
                      onToggle={() =>
                        setPurchaseForm((current) => ({
                          ...current,
                          requestTrial: !current.requestTrial,
                        }))
                      }
                      palette={palette}
                    />
                  ) : null}
                  {selectedPlan?.radioAddonEligible ? (
                    <ToggleRow
                      label="Agregar radio operativo"
                      value={purchaseForm.selectedAddOns.includes('radio_dispatch')}
                      onToggle={() =>
                        setPurchaseForm((current) => ({
                          ...current,
                          selectedAddOns: current.selectedAddOns.includes('radio_dispatch')
                            ? current.selectedAddOns.filter((item) => item !== 'radio_dispatch')
                            : [...current.selectedAddOns, 'radio_dispatch'],
                        }))
                      }
                      palette={palette}
                    />
                  ) : null}
                </View>

                <Field
                  label="Notas de compra"
                  value={purchaseForm.notes}
                  onChangeText={(value) =>
                    setPurchaseForm((current) => ({ ...current, notes: value }))
                  }
                  palette={palette}
                />

                <ActionRow>
                  <PrimaryButton
                    label={purchaseLoading ? 'Procesando...' : 'Comprar plan'}
                    onPress={() => void handlePurchase()}
                    disabled={purchaseLoading}
                  />
                </ActionRow>
              </View>
            </View>
          </SectionCard>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(value);
}

function ActionRow({ children }: { children: ReactNode }) {
  return <View style={styles.actionRow}>{children}</View>;
}

function SectionCard({
  title,
  eyebrow,
  palette,
  children,
}: {
  title: string;
  eyebrow: string;
  palette: {
    panel: string;
    line: string;
    accent: string;
    text: string;
  };
  children: ReactNode;
}) {
  return (
    <View
      style={[
        styles.sectionCard,
        {
          backgroundColor: palette.panel,
          borderColor: palette.line,
        },
      ]}>
      <Text style={[styles.cardEyebrow, { color: palette.accent }]}>{eyebrow}</Text>
      <Text style={[styles.cardTitle, { color: palette.text }]}>{title}</Text>
      {children}
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  palette,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
  secureTextEntry = false,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  palette: {
    panel: string;
    panelSoft: string;
    line: string;
    text: string;
    muted: string;
    accent: string;
  };
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  secureTextEntry?: boolean;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: focused ? palette.accent : palette.muted }]}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        secureTextEntry={secureTextEntry}
        placeholderTextColor={palette.muted}
        style={[
          styles.fieldInput,
          {
            backgroundColor: palette.panelSoft,
            borderColor: focused ? palette.accent : palette.line,
            color: palette.text,
          },
        ]}
      />
    </View>
  );
}

function ChoiceChip({
  label,
  active,
  onPress,
  palette,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  palette: {
    panel: string;
    line: string;
    text: string;
    accent: string;
    accentSoft: string;
  };
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.choiceChip,
        {
          borderColor: active ? palette.accent : palette.line,
          backgroundColor: active ? palette.accentSoft : palette.panel,
        },
        pressed ? styles.pressed : undefined,
      ]}>
      <Text
        style={[
          styles.choiceChipText,
          { color: active ? palette.accent : palette.text },
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

function ToggleRow({
  label,
  value,
  onToggle,
  palette,
}: {
  label: string;
  value: boolean;
  onToggle: () => void;
  palette: {
    panel: string;
    line: string;
    text: string;
    muted: string;
    accent: string;
    accentSoft: string;
  };
}) {
  return (
    <Pressable
      onPress={onToggle}
      style={({ pressed }) => [
        styles.toggleRow,
        {
          borderColor: value ? palette.accent : palette.line,
          backgroundColor: value ? palette.accentSoft : palette.panel,
        },
        pressed ? styles.pressed : undefined,
      ]}>
      <Text style={[styles.toggleLabel, { color: palette.text }]}>{label}</Text>
      <View
        style={[
          styles.togglePill,
          {
            backgroundColor: value ? palette.accent : palette.line,
          },
        ]}>
        <View style={[styles.toggleDot, value ? styles.toggleDotOn : undefined]} />
      </View>
    </Pressable>
  );
}

function MetricChip({
  icon,
  label,
  value,
  palette,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  value: string;
  palette: {
    panelSoft: string;
    line: string;
    text: string;
    muted: string;
    accent: string;
  };
}) {
  return (
    <View
      style={[
        styles.metricChip,
        {
          backgroundColor: palette.panelSoft,
          borderColor: palette.line,
        },
      ]}>
      <MaterialCommunityIcons name={icon} size={18} color={palette.accent} />
      <Text style={[styles.metricChipLabel, { color: palette.muted }]}>{label}</Text>
      <Text style={[styles.metricChipValue, { color: palette.text }]}>{value}</Text>
    </View>
  );
}

function EmptyState({
  icon,
  title,
  body,
  palette,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  body: string;
  palette: {
    panelSoft: string;
    line: string;
    text: string;
    muted: string;
    accent: string;
  };
}) {
  return (
    <View
      style={[
        styles.emptyState,
        {
          backgroundColor: palette.panelSoft,
          borderColor: palette.line,
        },
      ]}>
      <View style={[styles.emptyIcon, { backgroundColor: `${palette.accent}12` }]}>
        <MaterialCommunityIcons name={icon} size={22} color={palette.accent} />
      </View>
      <Text style={[styles.emptyTitle, { color: palette.text }]}>{title}</Text>
      <Text style={[styles.emptyBody, { color: palette.muted }]}>{body}</Text>
    </View>
  );
}

function MiniInfo({
  label,
  value,
  palette,
}: {
  label: string;
  value: string;
  palette: {
    text: string;
    muted: string;
  };
}) {
  return (
    <View style={styles.miniInfo}>
      <Text style={[styles.miniInfoLabel, { color: palette.muted }]}>{label}</Text>
      <Text style={[styles.miniInfoValue, { color: palette.text }]}>{value}</Text>
    </View>
  );
}

function StatusTag({
  label,
  palette,
  tone = 'info',
}: {
  label: string;
  palette: {
    accent: string;
    accentSoft: string;
    success: string;
    info: string;
  };
  tone?: 'info' | 'success';
}) {
  const backgroundColor = tone === 'success' ? `${palette.success}16` : palette.accentSoft;
  const color = tone === 'success' ? palette.success : palette.accent;

  return (
    <View style={[styles.statusTag, { backgroundColor }]}>
      <Text style={[styles.statusTagText, { color }]}>{label}</Text>
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.primaryButton,
        pressed && !disabled ? styles.pressed : undefined,
        disabled ? styles.disabled : undefined,
      ]}>
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function GhostButton({
  label,
  onPress,
  palette,
}: {
  label: string;
  onPress: () => void;
  palette: {
    panel: string;
    line: string;
    text: string;
  };
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.ghostButton,
        {
          backgroundColor: palette.panel,
          borderColor: palette.line,
        },
        pressed ? styles.pressed : undefined,
      ]}>
      <Text style={[styles.ghostButtonText, { color: palette.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingBottom: 56,
  },
  container: {
    width: '100%',
    maxWidth: 1240,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 18,
  },
  navbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  navbarDesktop: {
    alignItems: 'center',
  },
  brandBlock: {
    flex: 1,
    minWidth: 280,
  },
  navActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  hero: {
    gap: 12,
  },
  heroDesktop: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  profileHeroCard: {
    flex: 1.35,
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  profileHeroTop: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'stretch',
  },
  profileHeroTopMobile: {
    flexDirection: 'column',
  },
  profileIdentity: {
    flex: 1,
    flexDirection: 'row',
    gap: 12,
  },
  avatarFrame: {
    alignSelf: 'flex-start',
  },
  identityCopy: {
    flex: 1,
    gap: 5,
  },
  identityEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  identityName: {
    fontFamily: Typography.display,
    fontSize: 27,
    lineHeight: 32,
  },
  profileLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  profileLinkText: {
    fontSize: 13,
    fontWeight: '800',
  },
  identityBody: {
    fontFamily: Typography.body,
    fontSize: 13,
    lineHeight: 20,
    maxWidth: 650,
  },
  statusCard: {
    width: 260,
    borderRadius: 18,
    borderWidth: 1,
    padding: 13,
    gap: 5,
  },
  statusLabel: {
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  statusValue: {
    fontFamily: Typography.display,
    fontSize: 19,
  },
  statusBody: {
    fontFamily: Typography.body,
    fontSize: 12,
    lineHeight: 18,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metricChip: {
    minWidth: 126,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  metricChipLabel: {
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '700',
  },
  metricChipValue: {
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '900',
  },
  summaryCard: {
    flex: 0.9,
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  cardEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  cardTitle: {
    fontFamily: Typography.display,
    fontSize: 24,
    lineHeight: 29,
  },
  summaryRow: {
    gap: 4,
  },
  summaryLabel: {
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.9,
  },
  summaryValue: {
    fontFamily: Typography.body,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
  },
  messageBanner: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  messageText: {
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 20,
  },
  loadingCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '700',
  },
  mainGrid: {
    gap: 14,
  },
  mainGridDesktop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  sectionCard: {
    flex: 1,
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  sectionBody: {
    fontFamily: Typography.body,
    fontSize: 13,
    lineHeight: 20,
  },
  formGrid: {
    gap: 10,
  },
  inlineGrid: {
    gap: 10,
  },
  inlineGridTablet: {
    flexDirection: 'row',
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    marginLeft: 4,
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  fieldInput: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 13,
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '600',
  },
  subsectionLabel: {
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '800',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  choiceChip: {
    minHeight: 36,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceChipText: {
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '800',
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  securityBox: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 13,
    gap: 7,
  },
  securityBoxHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  securityBoxTitle: {
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '800',
  },
  securityBoxValue: {
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '800',
  },
  securityBoxBody: {
    fontFamily: Typography.body,
    fontSize: 13,
    lineHeight: 20,
  },
  downloadGrid: {
    gap: 10,
  },
  downloadCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 13,
    gap: 10,
  },
  downloadHeader: {
    flexDirection: 'row',
    gap: 10,
  },
  downloadIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadCopy: {
    flex: 1,
    gap: 4,
  },
  downloadTitle: {
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '800',
  },
  downloadBody: {
    fontFamily: Typography.body,
    fontSize: 13,
    lineHeight: 20,
  },
  downloadMeta: {
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '700',
  },
  emptyState: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    alignItems: 'flex-start',
    gap: 10,
  },
  emptyIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '800',
  },
  emptyBody: {
    fontFamily: Typography.body,
    fontSize: 13,
    lineHeight: 20,
  },
  orderList: {
    gap: 10,
  },
  orderCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 13,
    gap: 10,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    alignItems: 'center',
  },
  orderHeaderMobile: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  orderCopy: {
    flex: 1,
    gap: 4,
  },
  orderTitle: {
    fontFamily: Typography.display,
    fontSize: 20,
  },
  orderSubtitle: {
    fontFamily: Typography.body,
    fontSize: 13,
    lineHeight: 20,
  },
  orderStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  miniInfo: {
    minWidth: 120,
    gap: 4,
  },
  miniInfoLabel: {
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  miniInfoValue: {
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '700',
  },
  orderNextStep: {
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  orderBody: {
    fontFamily: Typography.body,
    fontSize: 13,
    lineHeight: 20,
  },
  statusTag: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusTagText: {
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  catalogGrid: {
    gap: 12,
  },
  catalogGridDesktop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  planColumn: {
    flex: 1,
    gap: 10,
  },
  catalogPlanCard: {
    borderRadius: 18,
    borderWidth: 1.5,
    padding: 14,
    gap: 8,
  },
  catalogPlanTop: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  catalogPlanCopy: {
    flex: 1,
    gap: 4,
  },
  catalogPlanName: {
    fontFamily: Typography.display,
    fontSize: 21,
  },
  catalogPlanBody: {
    fontFamily: Typography.body,
    fontSize: 13,
    lineHeight: 20,
  },
  catalogPlanPrice: {
    fontFamily: Typography.display,
    fontSize: 26,
  },
  catalogPlanMeta: {
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '700',
  },
  checkoutCard: {
    flex: 0.95,
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  checkoutTitle: {
    fontFamily: Typography.display,
    fontSize: 23,
  },
  checkoutBody: {
    fontFamily: Typography.body,
    fontSize: 13,
    lineHeight: 20,
  },
  checkoutSummary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  toggleList: {
    gap: 10,
  },
  toggleRow: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  toggleLabel: {
    flex: 1,
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '700',
  },
  togglePill: {
    width: 48,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  toggleDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  toggleDotOn: {
    marginLeft: 20,
  },
  primaryButton: {
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: '#D91E18',
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '900',
  },
  ghostButton: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostButtonText: {
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.92,
  },
  disabled: {
    opacity: 0.6,
  },
  glowTop: {
    position: 'absolute',
    top: -100,
    right: -60,
    width: 320,
    height: 320,
    borderRadius: 160,
  },
  glowBottom: {
    position: 'absolute',
    bottom: -120,
    left: -90,
    width: 340,
    height: 340,
    borderRadius: 170,
  },
});
