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
import type { DriverActivationUnit } from '@/src/types/app';
import { AuthField } from './auth/components/auth-field';
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
  const { activateDriverWithKey, authContext, forgotPassword, isSubmitting, resetPassword, signIn, user } = useAppStore(
    useShallow((state) => ({
      activateDriverWithKey: state.activateDriverWithKey,
      authContext: state.authContext,
      forgotPassword: state.forgotPassword,
      isSubmitting: state.isSubmitting,
      resetPassword: state.resetPassword,
      signIn: state.signIn,
      user: state.user,
    }))
  );

  const [loginIdentity, setLoginIdentity] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryStage, setRecoveryStage] = useState<'request' | 'reset'>('request');
  const [recoveryToken, setRecoveryToken] = useState('');
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoveryPasswordConfirmation, setRecoveryPasswordConfirmation] = useState('');
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
  const [helperTone, setHelperTone] = useState<'error' | 'success'>('error');
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
    setHelperTone('error');
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
    setHelperTone('error');

    if (mode === 'login') {
      if (!loginIdentity.trim() || !loginPassword.trim()) {
        setHelperMessage('Ingresa correo o número y contraseña.');
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
      rememberSession
    );

    if (!result.ok) {
      setHelperMessage(result.message || 'No se pudo activar la cuenta. Intenta nuevamente.');
      await validateActivationKey(driverActivationKey);
    }
  };

  const handleRecovery = async () => {
    setHelperMessage(null);
    setHelperTone('error');
    if (recoveryStage === 'reset') {
      if (!recoveryToken.trim() || !recoveryPassword) {
        setHelperMessage('Ingresa el token recibido y tu nueva contrasena.');
        return;
      }
      if (recoveryPassword !== recoveryPasswordConfirmation) {
        setHelperMessage('La confirmacion de contrasena no coincide.');
        return;
      }

      const result = await resetPassword(recoveryToken.trim(), recoveryPassword);
      setHelperTone(result.ok ? 'success' : 'error');
      setHelperMessage(result.message || (result.ok ? 'Contrasena actualizada.' : 'No fue posible restablecer la contrasena.'));
      if (result.ok) setRecoveryStage('request');
      return;
    }

    const email = recoveryEmail.trim().toLowerCase();

    if (!email || !email.includes('@')) {
      setHelperMessage('Ingresa el correo asociado a tu cuenta.');
      return;
    }

    const result = await forgotPassword(email);
    setHelperTone(result.ok ? 'success' : 'error');
    setHelperMessage(
      result.ok
        ? `${result.message} Si cambias la contrasena en un dispositivo nuevo, conserva acceso a un dispositivo anterior para volver a respaldar la clave de tus mensajes cifrados.`
        : result.message || 'No fue posible procesar la solicitud.'
    );
  };

  const scrollContentDynamicStyle = {
    paddingHorizontal: sizing.contentPadding,
    paddingTop: Math.max(18, sizing.contentPadding),
    paddingBottom: 22,
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <KeyboardSafeScrollView
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
                {showRecovery && !isRegister ? (
                  <>
                    {recoveryStage === 'request' ? (
                      <AuthField
                        label="Correo de recuperacion"
                        placeholder="usuario@correo.com"
                        value={recoveryEmail}
                        onChangeText={setRecoveryEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoComplete="email"
                        returnKeyType="done"
                        textContentType="emailAddress"
                        onSubmitEditing={() => { handleRecovery(); }}
                      />
                    ) : null}
                    {recoveryStage === 'reset' ? (
                      <>
                        <AuthField
                          label="Token de recuperacion"
                          placeholder="Pega el token recibido"
                          value={recoveryToken}
                          onChangeText={setRecoveryToken}
                          autoCapitalize="none"
                          returnKeyType="next"
                        />
                        <AuthField
                          label="Nueva contrasena"
                          placeholder="Nueva contrasena"
                          value={recoveryPassword}
                          onChangeText={setRecoveryPassword}
                          secureTextEntry
                          autoCapitalize="none"
                          autoComplete="new-password"
                          returnKeyType="next"
                          textContentType="newPassword"
                        />
                        <AuthField
                          label="Confirmar nueva contrasena"
                          placeholder="Repite la nueva contrasena"
                          value={recoveryPasswordConfirmation}
                          onChangeText={setRecoveryPasswordConfirmation}
                          secureTextEntry
                          autoCapitalize="none"
                          autoComplete="new-password"
                          returnKeyType="done"
                          textContentType="newPassword"
                          onSubmitEditing={() => { handleRecovery(); }}
                        />
                      </>
                    ) : null}
                  </>
                ) : (
                  <>
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
                  </>
                )}
              </View>

              {!isRegister && !showRecovery ? (
                <View style={styles.sessionRow}>
                  <Pressable
                    onPress={() => setRememberSession((current) => !current)}
                    style={styles.rememberButton}>
                    <View style={[styles.checkbox, rememberSession ? styles.checkboxActive : undefined]}>
                      {rememberSession ? <View style={styles.checkboxDot} /> : null}
                    </View>
                    <Text style={styles.smallActionText}>Recordarme</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setShowRecovery(true);
                      setRecoveryEmail(loginIdentity.includes('@') ? loginIdentity : '');
                      setHelperMessage(null);
                    }}>
                    <Text style={styles.recoveryActionText}>Recuperar acceso</Text>
                  </Pressable>
                </View>
              ) : null}

              {helperMessage ? (
                <View style={[styles.messageBox, helperTone === 'success' ? styles.successBox : undefined]}>
                  <Text
                    style={[
                      styles.messageText,
                      helperTone === 'success' ? styles.successText : undefined,
                    ]}>
                    {helperMessage}
                  </Text>
                </View>
              ) : null}

              <Pressable
                onPress={() => { showRecovery && !isRegister ? handleRecovery() : handleSubmit(); }}
                disabled={isSubmitting || isValidatingDriverKey}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && !isSubmitting && !isValidatingDriverKey ? styles.pressed : undefined,
                  isSubmitting || isValidatingDriverKey ? styles.disabled : undefined,
                ]}>
                {isSubmitting || isValidatingDriverKey ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {showRecovery && !isRegister
                      ? recoveryStage === 'reset' ? 'Cambiar contrasena' : 'Enviar instrucciones'
                      : isRegister ? 'Activar cuenta' : 'Iniciar sesión'}
                  </Text>
                )}
              </Pressable>

              {showRecovery && !isRegister ? (
                <View style={styles.recoveryNavigation}>
                  <Pressable onPress={() => { setRecoveryStage((current) => current === 'request' ? 'reset' : 'request'); setHelperMessage(null); }}>
                    <Text style={styles.recoveryActionText}>
                      {recoveryStage === 'request' ? 'Ya tengo un token' : 'Solicitar otro enlace'}
                    </Text>
                  </Pressable>
                  <Pressable onPress={() => { setShowRecovery(false); setHelperMessage(null); }}>
                    <Text style={styles.smallActionText}>Volver a iniciar sesion</Text>
                  </Pressable>
                </View>
              ) : null}

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
