import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { Redirect, router, useLocalSearchParams } from '@/src/navigation/router';
import { StatusBar } from '@/src/native/status-bar';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardSafeScrollView } from '@/src/components/keyboard-safe-layout';
import { useAppStore } from '@/src/store/use-app-store';
import { usePublicCommercialFlow } from '@/features/commercial';
import { trackSalesEvent } from '@/features/commercial/analytics/sales-analytics';
import { buildCheckoutParams, readCheckoutContext, saveCheckoutContext } from '@/src/utils/checkout-context';
import { getAuthenticatedHome, isCustomerAccount } from '@/src/utils/account-routing';

import { AuthBackground } from './auth/components/auth-shell';
import { AuthHeader } from './auth/components/auth-header';
import { AuthModeSelector } from './auth/components/auth-mode-selector';
import { AuthField } from './auth/components/auth-field';
import { AuthPasswordRequirements } from './auth/components/auth-password-requirements';
import { AuthSessionBar } from './auth/components/auth-session-bar';
import { AuthFeedback } from './auth/components/auth-feedback';
import { AuthSubmitButton } from './auth/components/auth-submit-button';
import { AuthLegalLinks } from './auth/components/auth-legal-links';

import {
  buildPaymentRoute,
  getFirstParam,
  getRegistrationPasswordChecks,
  normalizeIdentity,
  validateRegistrationPassword,
} from './auth/auth.utils';
import { authStyles as styles } from './auth/auth.styles';
import { formatCurrency } from './shared/utils';
import { setRecoveryEmail } from './password-recovery/password-recovery.session';
import { buildRecoveryRoute } from './password-recovery/password-recovery.utils';

type Props = {
  mode: 'login' | 'register';
};

export function SalesAuthScreen({ mode }: Props) {
  const { width, height } = useWindowDimensions();
  const params = useLocalSearchParams<{ planId?: string | string[]; trial?: string | string[] }>();
  const { plans } = usePublicCommercialFlow({});
  const { isSubmitting, register, signIn, user } = useAppStore(
    useShallow((state) => ({
      isSubmitting: state.isSubmitting,
      register: state.register,
      signIn: state.signIn,
      user: state.user,
    }))
  );

  const [loginIdentity, setLoginIdentity] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [registerName, setRegisterName] = useState('');
  const [registerCompany, setRegisterCompany] = useState('');
  const [registerIdentity, setRegisterIdentity] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState('');
  const [rememberSession, setRememberSession] = useState(false);
  const [helperMessage, setHelperMessage] = useState<string | null>(null);

  const storedCheckout = readCheckoutContext();
  const selectedPlanId = getFirstParam(params.planId) || storedCheckout?.planId;
  const routeTrialParam = getFirstParam(params.trial);
  const routeRequestsTrial =
    typeof routeTrialParam === 'string'
      ? routeTrialParam === '1'
      : Boolean(storedCheckout?.requestTrial && storedCheckout.planId === selectedPlanId);
  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === selectedPlanId) || null,
    [plans, selectedPlanId]
  );
  const registrationPasswordChecks = useMemo(
    () => getRegistrationPasswordChecks(registerPassword),
    [registerPassword]
  );
  const isRegister = mode === 'register';
  const isShortViewport = height < 720;
  const isCompactForm = isShortViewport || (isRegister && height < 860);
  const isNarrow = width < 390;

  const sizing = useMemo(
    () => ({
      logoSize: isNarrow || isCompactForm ? ('sm' as const) : ('md' as const),
      formGap: isCompactForm ? 11 : 14,
      formPadding: isNarrow ? 16 : isCompactForm ? 18 : 20,
      contentPadding: isNarrow ? 16 : 20,
      panelMaxWidth: isRegister ? 480 : 430,
      scrollJustify: isRegister && isCompactForm ? ('flex-start' as const) : ('center' as const),
    }),
    [isCompactForm, isNarrow, isRegister]
  );

  useEffect(() => {
    if (selectedPlanId) {
      saveCheckoutContext(selectedPlanId, routeRequestsTrial);
    }
  }, [routeRequestsTrial, selectedPlanId]);

  if (user) {
    // La COMPRA manda: si hay un checkout pendiente, cualquier cuenta autenticada continúa al pago
    // (antes solo lo hacían las cuentas de cliente y el resto perdía la compra en curso).
    if (selectedPlanId) {
      return <Redirect href={buildPaymentRoute(selectedPlanId, routeRequestsTrial) as never} />;
    }

    if (isCustomerAccount(user)) {
      return <Redirect href="/portal" />;
    }

    // Sin compra pendiente, la cuenta operativa cae en el handoff de acceso operativo (#45).
    return <Redirect href={getAuthenticatedHome(user) as never} />;
  }

  const goToMode = (nextMode: 'login' | 'register') => {
    if (nextMode === mode) {
      return;
    }

    setHelperMessage(null);
    router.replace({
      pathname: nextMode === 'login' ? '/ventas/login' : '/ventas/registro',
      params: {
        ...(selectedPlanId ? buildCheckoutParams(selectedPlanId, routeRequestsTrial) : {}),
      },
    } as never);
  };

  const updateRegisterPassword = (value: string) => {
    setRegisterPassword(value);
    if (helperMessage) setHelperMessage(null);
  };

  const updateRegisterConfirmation = (value: string) => {
    setRegisterConfirmPassword(value);
    if (helperMessage) setHelperMessage(null);
  };

  const handleSubmit = async () => {
    setHelperMessage(null);

    if (mode === 'login') {
      if (!loginIdentity.trim() || !loginPassword.trim()) {
        setHelperMessage('Ingresa correo o teléfono y contraseña.');
        trackSalesEvent('login_failed', { outcome: 'client_validation', route: '/ventas/login' });
        return;
      }

      trackSalesEvent('login_started', {
        planId: selectedPlanId,
        requestTrial: routeRequestsTrial,
        route: '/ventas/login',
      });
      const identity = normalizeIdentity(loginIdentity);
      const result = await signIn(identity.email, loginPassword, rememberSession);

      if (!result.ok) {
        trackSalesEvent('login_failed', {
          planId: selectedPlanId,
          requestTrial: routeRequestsTrial,
          outcome: 'request_rejected',
          route: '/ventas/login',
        });
        setHelperMessage(result.message || 'No pudimos iniciar sesión.');
        return;
      }

      trackSalesEvent('login_completed', {
        planId: selectedPlanId,
        requestTrial: routeRequestsTrial,
        route: '/ventas/login',
      });
      return;
    }

    if (!registerIdentity.trim() || !registerPassword || !registerConfirmPassword) {
      setHelperMessage('Completa correo o teléfono, contraseña y confirmación.');
      trackSalesEvent('registration_failed', { outcome: 'client_validation', route: '/ventas/registro' });
      return;
    }

    const passwordValidationMessage = validateRegistrationPassword(registerPassword);
    if (passwordValidationMessage) {
      setHelperMessage(passwordValidationMessage);
      trackSalesEvent('registration_failed', { outcome: 'password_policy', route: '/ventas/registro' });
      return;
    }

    if (registerPassword !== registerConfirmPassword) {
      setHelperMessage('Las contraseñas no coinciden. Revisa la confirmación.');
      trackSalesEvent('registration_failed', { outcome: 'password_confirmation', route: '/ventas/registro' });
      return;
    }

    trackSalesEvent('registration_started', {
      planId: selectedPlanId,
      requestTrial: routeRequestsTrial,
      route: '/ventas/registro',
    });
    const identity = normalizeIdentity(registerIdentity);
    const cleanName = registerName.trim() || identity.displayName;
    const cleanCompany = registerCompany.trim() || cleanName;
    const result = await register(
      {
        name: cleanName,
        email: identity.email,
        password: registerPassword,
        phone: identity.phone,
        companyName: cleanCompany,
        accountType: 'company_owner',
        customerReference: cleanCompany,
      },
      true
    );

    if (!result.ok) {
      trackSalesEvent('registration_failed', {
        planId: selectedPlanId,
        requestTrial: routeRequestsTrial,
        outcome: 'request_rejected',
        route: '/ventas/registro',
      });
      setHelperMessage(result.message || 'No pudimos registrar la cuenta.');
      return;
    }

    trackSalesEvent('registration_completed', {
      planId: selectedPlanId,
      requestTrial: routeRequestsTrial,
      route: '/ventas/registro',
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <AuthBackground />
      <KeyboardSafeScrollView
        style={styles.scroll}
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={Platform.OS === 'web'}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingHorizontal: sizing.contentPadding,
            paddingTop: isCompactForm ? 14 : Math.max(22, sizing.contentPadding),
            paddingBottom: isCompactForm ? 18 : 30,
            justifyContent: sizing.scrollJustify,
            ...(Platform.OS === 'web' ? ({ minHeight: '100dvh' } as any) : {}),
          },
        ]}>
        <View style={[styles.panel, { maxWidth: sizing.panelMaxWidth }]}>
          <View style={[styles.form, { gap: sizing.formGap, padding: sizing.formPadding }]}>
            <AuthHeader isRegister={isRegister} logoSize={sizing.logoSize} />

            {selectedPlanId ? (
              <View style={checkoutContextStyles.card}>
                <View style={checkoutContextStyles.icon}>
                  <MaterialCommunityIcons name="bus-electric" size={20} color="#7A3CFF" />
                </View>
                <View style={checkoutContextStyles.copy}>
                  <Text style={checkoutContextStyles.eyebrow}>TU SELECCIÓN SE CONSERVA</Text>
                  <Text style={checkoutContextStyles.title}>
                    {selectedPlan ? `${selectedPlan.name} · ${selectedPlan.units} unidades` : 'Plan ManeComb seleccionado'}
                  </Text>
                  <Text style={checkoutContextStyles.meta}>
                    {selectedPlan
                      ? `${formatCurrency(selectedPlan.price)} MXN / mes${routeRequestsTrial ? ` · prueba ${selectedPlan.trialDays || 7} días` : ''}`
                      : 'Confirmaremos capacidad y precio antes del checkout.'}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Cambiar plan antes de continuar"
                  onPress={() => router.push('/ventas' as never)}
                  style={({ pressed }) => [checkoutContextStyles.changeButton, pressed ? { opacity: 0.7 } : undefined]}>
                  <Text style={checkoutContextStyles.changeText}>Cambiar</Text>
                </Pressable>
              </View>
            ) : null}

            <AuthModeSelector currentMode={mode} onSelectMode={goToMode} />

            <View style={styles.fields}>
              {isRegister ? (
                <>
                  <AuthField
                    icon="account-outline"
                    label="Nombre (opcional)"
                    placeholder="Tu nombre"
                    value={registerName}
                    onChangeText={setRegisterName}
                    autoCapitalize="words"
                  />
                  <AuthField
                    icon="office-building-outline"
                    label="Empresa o flotilla (opcional)"
                    placeholder="Nombre de la flotilla"
                    value={registerCompany}
                    onChangeText={setRegisterCompany}
                    autoCapitalize="words"
                  />
                </>
              ) : null}
              <AuthField
                icon="email-outline"
                label="Correo o teléfono"
                placeholder="correo@empresa.com o 55 1234 5678"
                value={isRegister ? registerIdentity : loginIdentity}
                onChangeText={isRegister ? setRegisterIdentity : setLoginIdentity}
                keyboardType="default"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <AuthField
                icon="lock-outline"
                label="Contraseña"
                placeholder="Contraseña"
                value={isRegister ? registerPassword : loginPassword}
                onChangeText={isRegister ? updateRegisterPassword : setLoginPassword}
                secureTextEntry
                autoCapitalize="none"
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                autoCorrect={false}
                textContentType={isRegister ? 'newPassword' : 'password'}
              />
              {isRegister ? (
                <>
                  <AuthField
                    icon="lock-check-outline"
                    label="Confirmar contraseña"
                    placeholder="Repite la contraseña"
                    value={registerConfirmPassword}
                    onChangeText={updateRegisterConfirmation}
                    secureTextEntry
                    autoCapitalize="none"
                    autoComplete="new-password"
                    autoCorrect={false}
                    textContentType="newPassword"
                  />
                  <AuthPasswordRequirements
                    checks={registrationPasswordChecks}
                    password={registerPassword}
                    confirmation={registerConfirmPassword}
                  />
                </>
              ) : null}
            </View>

            {!isRegister ? (
              <AuthSessionBar
                rememberSession={rememberSession}
                disabled={isSubmitting}
                onToggleRemember={() => setRememberSession((current) => !current)}
                onForgotPassword={() => {
                  if (!loginIdentity.includes('@')) {
                    setHelperMessage(
                      'La recuperación automática utiliza correo. Si tu cuenta fue creada solo con teléfono, contacta a ventas@manecomb.com.'
                    );
                    return;
                  }
                  setRecoveryEmail(loginIdentity);
                  router.push(buildRecoveryRoute('/ventas/recuperar-contrasena', {
                    planId: selectedPlanId,
                    requestTrial: routeRequestsTrial,
                  }));
                }}
              />
            ) : null}

            <AuthFeedback message={helperMessage} />

            <AuthSubmitButton
              isRegister={isRegister}
              label={isRegister && selectedPlanId ? 'Crear cuenta y continuar' : undefined}
              submitting={isSubmitting}
              disabled={isSubmitting}
              onSubmit={() => void handleSubmit()}
            />

            <AuthLegalLinks />
          </View>
        </View>
      </KeyboardSafeScrollView>
    </SafeAreaView>
  );
}

const checkoutContextStyles = StyleSheet.create({
  card: {
    alignItems: 'center',
    backgroundColor: 'rgba(122, 60, 255, 0.08)',
    borderColor: 'rgba(122, 60, 255, 0.3)',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minWidth: 0,
    padding: 11,
  },
  icon: {
    alignItems: 'center',
    backgroundColor: 'rgba(122, 60, 255, 0.14)',
    borderRadius: 10,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  copy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  eyebrow: {
    color: '#A78BFA',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  title: {
    color: '#F5F7FF',
    fontSize: 12.5,
    fontWeight: '900',
  },
  meta: {
    color: '#B7BED8',
    fontSize: 10.5,
    lineHeight: 15,
  },
  changeButton: {
    alignItems: 'center',
    borderColor: 'rgba(245, 247, 255, 0.14)',
    borderRadius: 9,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 9,
  },
  changeText: {
    color: '#F5F7FF',
    fontSize: 10.5,
    fontWeight: '900',
  },
});