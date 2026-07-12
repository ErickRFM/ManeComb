import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { Link, Redirect, router, useLocalSearchParams } from '@/src/navigation/router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  StatusBar,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { Typography } from '@/constants/theme';
import { BrandLogo } from '@/src/components/brand-logo';
import { useAppStore } from '@/src/store/use-app-store';
import { buildCheckoutParams, readCheckoutContext, saveCheckoutContext } from '@/src/utils/checkout-context';
import { getAuthenticatedHome, isCustomerAccount } from '@/src/utils/account-routing';

type SalesAuthScreenProps = {
  mode: 'login' | 'register';
};

type AuthIdentity = {
  email: string;
  phone?: string;
  displayName: string;
};

function getFirstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function buildPaymentRoute(planId: string | undefined, requestTrial: boolean) {
  const params: Record<string, string> = {};

  if (planId) {
    params.planId = planId;
  }

  if (requestTrial) {
    params.trial = '1';
  }

  return Object.keys(params).length ? { pathname: '/ventas/pago', params } : '/portal';
}

function normalizeIdentity(rawValue: string): AuthIdentity {
  const value = rawValue.trim();
  const normalizedEmail = value.toLowerCase();

  if (normalizedEmail.includes('@')) {
    const displayName = normalizedEmail.split('@')[0]?.replace(/[._-]+/g, ' ').trim() || 'Usuario ManeComb';

    return {
      email: normalizedEmail,
      displayName,
    };
  }

  const digits = value.replace(/[^\d]/g, '');
  const phone = digits || value;

  return {
    email: `${phone || 'usuario'}@manecomb.local`.toLowerCase(),
    phone,
    displayName: phone ? `Usuario ${phone.slice(-4)}` : 'Usuario ManeComb',
  };
}

export function SalesAuthScreen({ mode }: SalesAuthScreenProps) {
  const { width, height } = useWindowDimensions();
  const params = useLocalSearchParams<{ planId?: string | string[]; trial?: string | string[] }>();
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
      panelMaxWidth: isRegister ? 460 : 410,
      scrollJustify: isCompactForm ? ('flex-start' as const) : ('center' as const),
    }),
    [isCompactForm, isNarrow, isRegister]
  );

  useEffect(() => {
    if (selectedPlanId) {
      saveCheckoutContext(selectedPlanId, routeRequestsTrial);
    }
  }, [routeRequestsTrial, selectedPlanId]);

  if (user) {
    if (isCustomerAccount(user)) {
      return <Redirect href={buildPaymentRoute(selectedPlanId, routeRequestsTrial) as never} />;
    }

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

  const handleSubmit = async () => {
    setHelperMessage(null);

    if (mode === 'login') {
      if (!loginIdentity.trim() || !loginPassword.trim()) {
        setHelperMessage('Ingresa correo o telefono y contrasena.');
        return;
      }

      const identity = normalizeIdentity(loginIdentity);
      const result = await signIn(identity.email, loginPassword, rememberSession);

      if (!result.ok) {
        setHelperMessage(result.message || 'No pudimos iniciar sesión.');
      }

      return;
    }

    if (!registerIdentity.trim() || !registerPassword.trim() || !registerConfirmPassword.trim()) {
      setHelperMessage('Completa correo o telefono y contrasena.');
      return;
    }

    if (registerPassword !== registerConfirmPassword) {
      setHelperMessage('Las contrasenas no coinciden.');
      return;
    }

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
      rememberSession
    );

    if (!result.ok) {
      setHelperMessage(result.message || 'No pudimos registrar la cuenta.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <View pointerEvents="none" style={styles.backgroundLayer}>
        <View style={styles.backgroundBase} />
        <View style={styles.backgroundGlowTop} />
        <View style={styles.backgroundGlowBottom} />
      </View>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}>
        <ScrollView
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
              ...(Platform.OS === 'web' ? ({ minHeight: '100vh' } as any) : {}),
            },
          ]}>
          <View style={[styles.panel, { maxWidth: sizing.panelMaxWidth }]}>
            <View style={[styles.form, { gap: sizing.formGap, padding: sizing.formPadding }]}>
              <View style={styles.brandRow}>
                <View style={styles.logoWrap}>
                  <BrandLogo size={sizing.logoSize} tone="light" plain />
                </View>
                <View style={styles.portalBadge}>
                  <MaterialCommunityIcons name="shield-lock-outline" size={14} color="#FF4D7D" />
                  <Text style={styles.portalBadgeText}>Portal ManeComb</Text>
                </View>
              </View>

              <View style={styles.headingBlock}>
                <Text style={styles.title}>{isRegister ? 'Crear cuenta' : 'Iniciar sesión'}</Text>
                <Text style={styles.subtitle}>
                  {isRegister ? 'Activa tu portal de flotilla.' : 'Entra a ventas y administracion.'}
                </Text>
              </View>

              <View style={styles.segmentedControl}>
                <SegmentButton
                  label="Iniciar sesión"
                  active={!isRegister}
                  onPress={() => goToMode('login')}
                />
                <SegmentButton
                  label="Registrarse"
                  active={isRegister}
                  onPress={() => goToMode('register')}
                />
              </View>

              <View style={styles.fields}>
                {isRegister ? (
                  <>
                    <AuthField
                      icon="account-outline"
                      label="Nombre"
                      placeholder="Tu nombre"
                      value={registerName}
                      onChangeText={setRegisterName}
                      autoCapitalize="words"
                    />
                    <AuthField
                      icon="office-building-outline"
                      label="Empresa o flotilla"
                      placeholder="Nombre de la flotilla"
                      value={registerCompany}
                      onChangeText={setRegisterCompany}
                      autoCapitalize="words"
                    />
                  </>
                ) : null}
                <AuthField
                  icon="email-outline"
                  label="Correo"
                  placeholder="correo@empresa.com"
                  value={isRegister ? registerIdentity : loginIdentity}
                  onChangeText={isRegister ? setRegisterIdentity : setLoginIdentity}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <AuthField
                  icon="lock-outline"
                  label="Contrasena"
                  placeholder="Contrasena"
                  value={isRegister ? registerPassword : loginPassword}
                  onChangeText={isRegister ? setRegisterPassword : setLoginPassword}
                  secureTextEntry
                  autoCapitalize="none"
                />
                {isRegister ? (
                  <AuthField
                    icon="lock-check-outline"
                    label="Confirmar"
                    placeholder="Repite la contrasena"
                    value={registerConfirmPassword}
                    onChangeText={setRegisterConfirmPassword}
                    secureTextEntry
                    autoCapitalize="none"
                  />
                ) : null}
              </View>

              {!isRegister ? (
                <View style={styles.sessionRow}>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityLabel="Recordarme"
                    accessibilityState={{ checked: rememberSession }}
                    onPress={() => setRememberSession((current) => !current)}
                    style={styles.rememberButton}>
                    <View style={[styles.checkbox, rememberSession ? styles.checkboxActive : undefined]}>
                      {rememberSession ? <View style={styles.checkboxDot} /> : null}
                    </View>
                    <Text style={styles.smallActionText}>Recordarme</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Recuperar acceso"
                    onPress={() =>
                      setHelperMessage('Contacta al administrador para recuperar tu acceso.')
                    }>
                    <Text style={styles.smallActionText}>Recuperar acceso</Text>
                  </Pressable>
                </View>
              ) : null}

              {helperMessage ? (
                <View style={styles.messageBox}>
                  <Text style={styles.messageText}>{helperMessage}</Text>
                </View>
              ) : null}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={isRegister ? 'Crear cuenta' : 'Entrar'}
                onPress={() => void handleSubmit()}
                disabled={isSubmitting}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && !isSubmitting ? styles.pressed : undefined,
                  isSubmitting ? styles.disabled : undefined,
                ]}>
                {isSubmitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryButtonText}>{isRegister ? 'Crear cuenta' : 'Entrar'}</Text>
                )}
              </Pressable>

              <View style={styles.legalBlock}>
                <View style={styles.legalLine}>
                  <Text style={styles.legalText}>Al continuar aceptas</Text>
                  <Link href="/terminos" style={styles.legalLink}>
                    Terminos
                  </Link>
                  <Text style={styles.legalText}>y</Text>
                  <Link href="/privacidad" style={styles.legalLink}>
                    Privacidad.
                  </Link>
                </View>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SegmentButton({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.segmentButton,
        active ? styles.segmentButtonActive : undefined,
        pressed ? styles.pressed : undefined,
      ]}>
      <Text style={[styles.segmentText, active ? styles.segmentTextActive : undefined]}>{label}</Text>
    </Pressable>
  );
}

function AuthField({
  autoCapitalize = 'sentences',
  icon,
  keyboardType = 'default',
  label,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  value,
}: {
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  label: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  value: string;
}) {
  const [isFocused, setFocused] = useState(false);
  const webInputStyle =
    Platform.OS === 'web'
      ? ({
          outlineStyle: 'none',
          outlineWidth: 0,
          boxShadow: 'none',
        } as any)
      : null;

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.inputShell, isFocused ? styles.inputShellFocused : undefined]}>
        <MaterialCommunityIcons
          name={icon}
          size={19}
          color={isFocused ? '#FF4D7D' : 'rgba(216, 226, 245, 0.62)'}
        />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          secureTextEntry={secureTextEntry}
          placeholder={placeholder}
          placeholderTextColor="rgba(216, 226, 245, 0.38)"
          selectionColor="#FF4D7D"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[styles.input, webInputStyle]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#050816',
    ...(Platform.OS === 'web'
      ? ({ minHeight: '100vh', overflow: 'visible' } as any)
      : { overflow: 'hidden' as const }),
  },
  flex: {
    flex: 1,
    ...(Platform.OS === 'web' ? ({ minHeight: '100vh' } as any) : {}),
  },
  scroll: {
    flex: 1,
    ...(Platform.OS === 'web' ? ({ overflow: 'visible' } as any) : {}),
  },
  backgroundLayer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  backgroundBase: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#050816',
  },
  backgroundGlowTop: {
    position: 'absolute',
    top: -150,
    right: -110,
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: 'rgba(255, 36, 92, 0.2)',
  },
  backgroundGlowBottom: {
    position: 'absolute',
    left: -140,
    bottom: -150,
    width: 420,
    height: 420,
    borderRadius: 210,
    backgroundColor: 'rgba(124, 58, 237, 0.18)',
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panel: {
    width: '100%',
  },
  brandRow: {
    alignItems: 'center',
    gap: 8,
  },
  logoWrap: {
    alignItems: 'center',
    maxWidth: '100%',
  },
  portalBadge: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 36, 92, 0.1)',
    borderColor: 'rgba(255, 77, 125, 0.32)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    minHeight: 30,
    paddingHorizontal: 12,
  },
  portalBadgeText: {
    color: '#FF8FB0',
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  form: {
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 20,
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage:
            'linear-gradient(145deg, rgba(12, 18, 36, 0.92), rgba(28, 20, 48, 0.84))',
          backdropFilter: 'blur(18px)',
          boxShadow:
            '0 0 0 1px rgba(255, 77, 125, 0.08), 0 0 34px rgba(255, 36, 92, 0.16), 0 24px 70px rgba(0, 0, 0, 0.45)',
        } as any)
      : {
          backgroundColor: 'rgba(12, 18, 36, 0.94)',
          shadowColor: '#FF245C',
          shadowOpacity: 0.16,
          shadowRadius: 28,
          shadowOffset: { width: 0, height: 18 },
          elevation: 8,
        }),
  },
  headingBlock: {
    alignItems: 'center',
    gap: 5,
  },
  title: {
    color: '#F8FAFC',
    fontFamily: Typography.display,
    fontSize: 26,
    fontWeight: '900',
    lineHeight: 32,
    textAlign: 'center',
  },
  subtitle: {
    color: 'rgba(216, 226, 245, 0.72)',
    fontFamily: Typography.body,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  segmentedControl: {
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    flexDirection: 'row',
    padding: 4,
  },
  segmentButton: {
    flex: 1,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },
  segmentButtonActive: {
    backgroundColor: 'rgba(255, 36, 92, 0.92)',
  },
  segmentText: {
    color: 'rgba(216, 226, 245, 0.68)',
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '800',
  },
  segmentTextActive: {
    color: '#FFFFFF',
  },
  fields: {
    gap: 13,
  },
  field: {
    gap: 8,
  },
  fieldLabel: {
    color: 'rgba(248, 250, 252, 0.82)',
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  inputShell: {
    alignItems: 'center',
    backgroundColor: 'rgba(8, 13, 27, 0.78)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 13,
  },
  inputShellFocused: {
    borderColor: 'rgba(255, 77, 125, 0.72)',
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 0 0 3px rgba(255, 36, 92, 0.16)' } as any)
      : {
          shadowColor: '#FF245C',
          shadowOpacity: 0.18,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
        }),
  },
  input: {
    color: '#F8FAFC',
    flex: 1,
    fontFamily: Typography.body,
    fontSize: 14,
    minHeight: 46,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  sessionRow: {
    minHeight: 22,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rememberButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkbox: {
    width: 16,
    height: 16,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(216, 226, 245, 0.58)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: '#FF245C',
    borderColor: '#FF245C',
  },
  checkboxDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#FFFFFF',
  },
  smallActionText: {
    color: 'rgba(216, 226, 245, 0.76)',
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
  },
  messageBox: {
    borderRadius: 12,
    backgroundColor: 'rgba(255, 36, 92, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255, 77, 125, 0.46)',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  messageText: {
    color: '#FFB4C8',
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: '#FF245C',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage: 'linear-gradient(135deg, #EA1F23, #FF2C7A 55%, #B025F5)',
          boxShadow: '0 16px 34px rgba(255, 36, 92, 0.28), 0 0 20px rgba(176, 37, 245, 0.2)',
        } as any)
      : {
          shadowColor: '#FF245C',
          shadowOpacity: 0.3,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 10 },
          elevation: 5,
        }),
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontFamily: Typography.body,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  legalBlock: {
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingBottom: 4,
  },
  legalLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 3,
  },
  legalText: {
    color: 'rgba(216, 226, 245, 0.58)',
    fontFamily: Typography.body,
    fontSize: 10,
    lineHeight: 15,
    textAlign: 'center',
  },
  legalLink: {
    color: '#FF8FB0',
    fontFamily: Typography.body,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 15,
  },
  pressed: {
    opacity: 0.9,
  },
  disabled: {
    opacity: 0.7,
  },
});
