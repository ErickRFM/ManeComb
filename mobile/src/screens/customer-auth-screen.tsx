import { Link, Redirect, router } from '@/src/navigation/router';
import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  StatusBar,
  Text,
  type TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { AppTheme } from '@/constants/theme';
import * as Haptics from '@/src/native/haptics';
import {
  API_URL,
  getApiErrorMessage,
  validateDriverActivationKeyRequest,
} from '@/src/api/client';
import { BrandLogo } from '@/src/components/brand-logo';
import { KeyboardSafeScrollView } from '@/src/components/keyboard-safe-layout';
import { useAppStore } from '@/src/store/use-app-store';
import { getAuthenticatedHome } from '@/src/utils/account-routing';
import { setRecoveryEmail } from '@/src/screens/password-recovery/password-recovery.session';
import type { DriverActivationUnit } from '@/src/types/app';
import { AuthField } from './auth/components/auth-field';
import { ensureLoginBackendReady } from './auth/login-readiness';
import { SegmentButton } from './auth/components/segment-button';
import { UnitSelector } from './auth/components/unit-selector';
import { styles } from './auth/customer-auth-screen.styles';

type CustomerAuthScreenProps = {
  mode: 'login' | 'register';
};

type AuthIdentity = {
  email: string;
  phone?: string;
  displayName: string;
};

const fasterArtwork = require('../../assets/images/faster.png');

function normalizeIdentity(rawValue: string): AuthIdentity {
  const value = rawValue.trim();
  const normalizedEmail = value.toLowerCase();

  if (normalizedEmail.includes('@')) {
    const displayName = normalizedEmail.split('@')[0]?.replace(/[._-]+/g, ' ').trim() || 'Usuario';

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

export function CustomerAuthScreen({ mode }: CustomerAuthScreenProps) {
  const { height, width } = useWindowDimensions();
  const { activateDriverWithKey, authContext, isSubmitting, signIn, user } = useAppStore(
    useShallow((state) => ({
      activateDriverWithKey: state.activateDriverWithKey,
      authContext: state.authContext,
      isSubmitting: state.isSubmitting,
      signIn: state.signIn,
      user: state.user,
    }))
  );

  const [loginIdentity, setLoginIdentity] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [driverActivationKey, setDriverActivationKey] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverUnits, setDriverUnits] = useState<DriverActivationUnit[] | null>(null);
  const [validatedKey, setValidatedKey] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [registerIdentity, setRegisterIdentity] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState('');

  const [rememberSession, setRememberSession] = useState(false);
  const [helperMessage, setHelperMessage] = useState<string | null>(null);
  const [isPreparingLogin, setIsPreparingLogin] = useState(false);
  const [isValidatingDriverKey, setIsValidatingDriverKey] = useState(false);
  const driverNameInputRef = useRef<TextInput>(null);
  const identityInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);
  const confirmPasswordInputRef = useRef<TextInput>(null);

  const isRegister = mode === 'register';

  const isNarrow = width < 390;
  const isShortViewport = height < 720;

  const sizing = useMemo(
    () => ({
      logoSize: isNarrow ? ('md' as const) : ('lg' as const),
      artworkWidth: isShortViewport ? 136 : 156,
      artworkHeight: isShortViewport ? 96 : 110,
      contentPadding: isNarrow ? 16 : 20,
    }),
    [isNarrow, isShortViewport]
  );

  if (user) {
    return <Redirect href={getAuthenticatedHome(user, authContext) as never} />;
  }

  const goToMode = (nextMode: 'login' | 'register') => {
    if (nextMode === mode) {
      return;
    }

    setHelperMessage(null);
    router.replace((nextMode === 'login' ? '/login' : '/registro') as never);
  };

  const validateActivationKey = async (rawKey: string) => {
    const key = rawKey.trim();

    if (!key) {
      return null;
    }

    setIsValidatingDriverKey(true);

    try {
      const validation = await validateDriverActivationKeyRequest(key);
      const units = validation.availableUnits;

      if (!Array.isArray(units)) {
        setDriverUnits(null);
        setValidatedKey('');
        setSelectedUnitId('');
        setHelperMessage('No fue posible consultar las unidades disponibles. Intenta nuevamente.');
        return null;
      }

      setDriverUnits(units);
      setValidatedKey(key);
      setSelectedUnitId((current) => {
        if (units.some((unit) => unit.id === current)) {
          return current;
        }

        return units.length === 1 ? units[0].id : '';
      });

      return validation;
    } catch (error) {
      setDriverUnits(null);
      setValidatedKey('');
      setSelectedUnitId('');
      setHelperMessage(
        getApiErrorMessage(error, 'No se pudo validar la key de activación.', {
          apiUrl: API_URL,
        })
      );
      return null;
    } finally {
      setIsValidatingDriverKey(false);
    }
  };

  const handleActivationKeyBlur = () => {
    const key = driverActivationKey.trim();

    if (!key || key === validatedKey || isValidatingDriverKey) {
      return;
    }

    validateActivationKey(key);
  };

  const handleActivationKeyChange = (value: string) => {
    setDriverActivationKey(value);

    if (value.trim() !== validatedKey) {
      setDriverUnits(null);
      setSelectedUnitId('');
      setValidatedKey('');
    }
  };

  const handleSubmit = async () => {
    setHelperMessage(null);

    if (mode === 'login') {
      if (isPreparingLogin || isSubmitting) {
        return;
      }

      if (!loginIdentity.trim() || !loginPassword.trim()) {
        setHelperMessage('Ingresa correo o número y contraseña.');
        return;
      }

      setIsPreparingLogin(true);

      try {
        // No reintentamos credenciales. Primero comprobamos la radio del
        // dispositivo y despertamos el backend con un GET idempotente. Esto
        // cubre el cambio de cuenta inmediato despues de logout sin obligar a
        // cerrar/abrir ManeComb si Render o la red tuvieron un hueco transitorio.
        const readiness = await ensureLoginBackendReady();
        if (!readiness.ok) {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          setHelperMessage(readiness.message);
          return;
        }

        const identity = normalizeIdentity(loginIdentity);
        const result = await signIn(identity.email, loginPassword, rememberSession);

        if (!result.ok) {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          setHelperMessage(result.message || 'No fue posible iniciar sesión.');
        } else {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
      } finally {
        setIsPreparingLogin(false);
      }

      return;
    }

    if (!driverActivationKey.trim() || !driverName.trim()) {
      setHelperMessage('Ingresa tu key de activación y tu nombre.');
      return;
    }

    if (!registerIdentity.trim() || !registerPassword.trim() || !registerConfirmPassword.trim()) {
      setHelperMessage('Completa correo o número, contraseña y confirmación.');
      return;
    }

    if (registerPassword !== registerConfirmPassword) {
      setHelperMessage('La confirmación de contraseña no coincide.');
      return;
    }

    const activation = await validateActivationKey(driverActivationKey);

    if (!activation) {
      return;
    }

    const units = activation.availableUnits;
    const unitId = units.length === 1 ? units[0].id : selectedUnitId;

    if (units.length === 0) {
      setHelperMessage('No hay unidades disponibles para esta empresa.');
      return;
    }

    if (!units.some((unit) => unit.id === unitId)) {
      setHelperMessage('Selecciona una unidad disponible para continuar.');
      return;
    }

    const identity = normalizeIdentity(registerIdentity);
    const isEmailIdentity = registerIdentity.trim().includes('@');

    const result = await activateDriverWithKey(
      {
        key: driverActivationKey,
        name: driverName.trim(),
        email: isEmailIdentity ? identity.email : undefined,
        phone: identity.phone,
        password: registerPassword,
        unit: { vehicleId: unitId },
      },
      true
    );

    if (!result.ok) {
      setHelperMessage(result.message || 'No se pudo activar la cuenta. Intenta nuevamente.');
      await validateActivationKey(driverActivationKey);
    }
  };

  const scrollContentDynamicStyle = {
    paddingHorizontal: sizing.contentPadding,
    paddingTop: Math.max(18, sizing.contentPadding),
    paddingBottom: 22,
  };
  const authBusy = isSubmitting || isValidatingDriverKey || isPreparingLogin;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <KeyboardSafeScrollView
          // The controller follows the caret; leave room for the whole field.
          bottomOffset={!isRegister ? AppTheme.spacing.lg : undefined}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={Platform.OS === 'web'}
          contentContainerStyle={[
            styles.scrollContent,
            scrollContentDynamicStyle,
          ]}>
          <View style={[styles.panel, !isRegister ? styles.loginPanel : undefined]}>
            <View style={styles.brandRow}>
              <BrandLogo size={sizing.logoSize} tone="dark" plain />
            </View>
            <View style={styles.artworkWrap}>
              <Image
                source={fasterArtwork}
                resizeMode="contain"
                style={{ height: sizing.artworkHeight, width: sizing.artworkWidth }}
              />
              {!isRegister ? (
                <Text style={styles.slogan}>Siguiendo lo importante.</Text>
              ) : null}
            </View>
            <View style={styles.form}>
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
                      label="Key de activación"
                      placeholder="MNCB-XXXXXX-XXXXXX-XXXXXX"
                      value={driverActivationKey}
                      onChangeText={handleActivationKeyChange}
                      onBlur={handleActivationKeyBlur}
                      autoCapitalize="characters"
                      returnKeyType="next"
                      onSubmitEditing={() => driverNameInputRef.current?.focus()}
                    />
                    <AuthField
                      label="Nombre"
                      placeholder="Nombre del conductor"
                      value={driverName}
                      onChangeText={setDriverName}
                      autoCapitalize="words"
                      inputRef={driverNameInputRef}
                      returnKeyType="next"
                      onSubmitEditing={() => identityInputRef.current?.focus()}
                    />
                  </>
                ) : null}
                <AuthField
                  label="Correo o telefono"
                  placeholder="usuario@correo.com"
                  value={isRegister ? registerIdentity : loginIdentity}
                  onChangeText={isRegister ? setRegisterIdentity : setLoginIdentity}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  returnKeyType="next"
                  textContentType="username"
                  inputRef={identityInputRef}
                  onSubmitEditing={() => passwordInputRef.current?.focus()}
                />
                <AuthField
                  label="Contraseña"
                  placeholder="Contraseña"
                  value={isRegister ? registerPassword : loginPassword}
                  onChangeText={isRegister ? setRegisterPassword : setLoginPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  returnKeyType={isRegister ? 'next' : 'done'}
                  textContentType={isRegister ? 'newPassword' : 'password'}
                  inputRef={passwordInputRef}
                  onSubmitEditing={() => {
                    if (isRegister) {
                      confirmPasswordInputRef.current?.focus();
                    } else {
                      handleSubmit();
                    }
                  }}
                />
                {isRegister ? (
                  <AuthField
                    label="Confirmar contraseña"
                    placeholder="Repetir contraseña"
                    value={registerConfirmPassword}
                    onChangeText={setRegisterConfirmPassword}
                    secureTextEntry
                    autoCapitalize="none"
                    autoComplete="new-password"
                    returnKeyType="done"
                    textContentType="newPassword"
                    inputRef={confirmPasswordInputRef}
                    onSubmitEditing={() => { handleSubmit(); }}
                  />
                ) : null}
                {isRegister ? (
                  <UnitSelector
                    units={driverUnits}
                    isLoading={isValidatingDriverKey}
                    selectedUnitId={selectedUnitId}
                    onSelect={setSelectedUnitId}
                  />
                ) : null}
              </View>

              {!isRegister ? (
                <View style={styles.sessionRow}>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityLabel="Recordarme"
                    accessibilityState={{ checked: rememberSession }}
                    disabled={authBusy}
                    onPress={() => setRememberSession((current) => !current)}
                    style={styles.rememberButton}>
                    <View style={[styles.checkbox, rememberSession ? styles.checkboxActive : undefined]}>
                      {rememberSession ? <View style={styles.checkboxDot} /> : null}
                    </View>
                    <Text style={styles.smallActionText}>Recordarme</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      if (loginIdentity.includes('@')) {
                        setRecoveryEmail(loginIdentity);
                      }
                      setHelperMessage(null);
                      router.push('/recuperar-contrasena');
                    }}>
                    <Text style={styles.recoveryActionText}>¿Olvidaste tu contraseña?</Text>
                  </Pressable>
                </View>
              ) : null}

              {helperMessage ? (
                <View style={styles.messageBox}>
                  <Text style={styles.messageText}>
                    {helperMessage}
                  </Text>
                </View>
              ) : null}

              <Pressable
                onPress={() => { handleSubmit(); }}
                disabled={authBusy}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && !authBusy ? styles.pressed : undefined,
                  authBusy ? styles.disabled : undefined,
                ]}>
                {authBusy ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {isRegister ? 'Activar cuenta' : 'Iniciar sesión'}
                  </Text>
                )}
              </Pressable>

              <View style={styles.legalBlock}>
                <Text style={styles.legalText}>
                  Al continuar, aceptas los{' '}
                  <Link href="/terminos" style={styles.legalLink}>
                    Terminos
                  </Link>
                  {' '}y la{' '}
                  <Link href="/privacidad" style={styles.legalLink}>
                    Politica de Privacidad
                  </Link>
                  .
                </Text>
              </View>
            </View>
          </View>
      </KeyboardSafeScrollView>
    </SafeAreaView>
  );
}
