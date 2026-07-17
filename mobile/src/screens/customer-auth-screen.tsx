import { Link, Redirect, router } from '@/src/navigation/router';
import { useMemo, useRef, useState, type Ref } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  StatusBar,
  Text,
  TextInput,
  type TextInputProps,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { DesignSystem, Typography } from '@/constants/theme';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import * as Haptics from '@/src/native/haptics';
import {
  API_URL,
  getApiErrorMessage,
  validateDriverActivationKeyRequest,
} from '@/src/api/client';
import { BrandLogo } from '@/src/components/brand-logo';
import { KeyboardSafeScrollView } from '@/src/components/keyboard-safe-layout';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { useAppStore } from '@/src/store/use-app-store';
import { getAuthenticatedHome } from '@/src/utils/account-routing';
import { getTextInputProps } from '@/src/utils/text-input-props';

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
  const { activateDriverWithKey, authContext, forgotPassword, isSubmitting, register, resetPassword, signIn, user } = useAppStore(
    useShallow((state) => ({
      activateDriverWithKey: state.activateDriverWithKey,
      authContext: state.authContext,
      forgotPassword: state.forgotPassword,
      isSubmitting: state.isSubmitting,
      register: state.register,
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
  const [registerProfile, setRegisterProfile] = useState<'owner' | 'driver'>('owner');
  const [driverActivationKey, setDriverActivationKey] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverUnitCode, setDriverUnitCode] = useState('');
  const [driverUnitPlate, setDriverUnitPlate] = useState('');
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
  const unitCodeInputRef = useRef<TextInput>(null);
  const unitPlateInputRef = useRef<TextInput>(null);

  const isRegister = mode === 'register';
  const isDriverRegister = isRegister && registerProfile === 'driver';

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

    if (!registerIdentity.trim() || !registerPassword.trim() || !registerConfirmPassword.trim()) {
      setHelperMessage('Completa correo o número, contraseña y confirmación.');
      return;
    }

    if (isDriverRegister && (!driverActivationKey.trim() || !driverName.trim())) {
      setHelperMessage('Ingresa tu key de activación y tu nombre.');
      return;
    }

    if (registerPassword !== registerConfirmPassword) {
      setHelperMessage('La confirmación de contraseña no coincide.');
      return;
    }

    const identity = normalizeIdentity(registerIdentity);

    if (isDriverRegister) {
      const isEmailIdentity = registerIdentity.trim().includes('@');
      setIsValidatingDriverKey(true);

      try {
        await validateDriverActivationKeyRequest(driverActivationKey);
      } catch (error) {
        setHelperMessage(
          getApiErrorMessage(error, 'No se pudo validar la key de activación.', {
            apiUrl: API_URL,
          })
        );
        setIsValidatingDriverKey(false);
        return;
      }

      setIsValidatingDriverKey(false);

      const result = await activateDriverWithKey(
        {
          key: driverActivationKey,
          name: driverName.trim(),
          email: isEmailIdentity ? identity.email : undefined,
          phone: identity.phone,
          password: registerPassword,
          unit: {
            code: driverUnitCode.trim() || undefined,
            plate: driverUnitPlate.trim() || undefined,
          },
        },
        rememberSession
      );

      if (!result.ok) {
        setHelperMessage(result.message || 'No se pudo activar la cuenta. Intenta nuevamente.');
      }

      return;
    }

    const result = await register(
      {
        name: identity.displayName,
        email: identity.email,
        password: registerPassword,
        phone: identity.phone,
        accountType: 'operations',
      },
      rememberSession
    );

    if (!result.ok) {
      setHelperMessage(result.message || 'No fue posible registrar la cuenta.');
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

              {isRegister ? (
                <View style={styles.registerTypeControl}>
                  <SegmentButton
                    label="Cliente"
                    active={!isDriverRegister}
                    onPress={() => setRegisterProfile('owner')}
                  />
                  <SegmentButton
                    label="Soy conductor"
                    active={isDriverRegister}
                    onPress={() => setRegisterProfile('driver')}
                  />
                </View>
              ) : null}

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
                    {isDriverRegister ? (
                  <>
                    <AuthField
                      label="Key de activación"
                      placeholder="MNCB-XXXXXX-XXXXXX-XXXXXX"
                      value={driverActivationKey}
                      onChangeText={setDriverActivationKey}
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
                    returnKeyType={isDriverRegister ? 'next' : 'done'}
                    textContentType="newPassword"
                    inputRef={confirmPasswordInputRef}
                    onSubmitEditing={() => {
                      if (isDriverRegister) {
                        unitCodeInputRef.current?.focus();
                      } else {
                        handleSubmit();
                      }
                    }}
                  />
                ) : null}
                {isDriverRegister ? (
                  <>
                    <AuthField
                      label="Codigo de unidad"
                      placeholder="CB-101"
                      value={driverUnitCode}
                      onChangeText={setDriverUnitCode}
                      autoCapitalize="characters"
                      inputRef={unitCodeInputRef}
                      returnKeyType="next"
                      onSubmitEditing={() => unitPlateInputRef.current?.focus()}
                    />
                    <AuthField
                      label="Placa"
                      placeholder="ABC-123-A"
                      value={driverUnitPlate}
                      onChangeText={setDriverUnitPlate}
                      autoCapitalize="characters"
                      inputRef={unitPlateInputRef}
                      returnKeyType="done"
                      onSubmitEditing={() => { handleSubmit(); }}
                    />
                  </>
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
                      : isDriverRegister ? 'Activar cuenta' : isRegister ? 'Registrarse' : 'Iniciar sesión'}
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
  autoComplete,
  autoCapitalize = 'sentences',
  inputRef,
  keyboardType = 'default',
  label,
  onChangeText,
  onSubmitEditing,
  placeholder,
  returnKeyType,
  secureTextEntry = false,
  textContentType,
  value,
}: {
  autoComplete?: TextInputProps['autoComplete'];
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  inputRef?: Ref<TextInput>;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  label: string;
  onChangeText: (value: string) => void;
  onSubmitEditing?: TextInputProps['onSubmitEditing'];
  placeholder: string;
  returnKeyType?: TextInputProps['returnKeyType'];
  secureTextEntry?: boolean;
  textContentType?: TextInputProps['textContentType'];
  value: string;
}) {
  const { theme } = useAppTheme();
  const [focused, setFocused] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const inputProps = getTextInputProps(theme, { autoComplete, returnKeyType, textContentType });
  const showPasswordToggle = secureTextEntry;
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
      <View
        style={[
          styles.inputShell,
          focused ? { borderColor: theme.colors.accent } : undefined,
        ]}>
        <TextInput
          ref={inputRef}
          {...inputProps}
          value={value}
          onChangeText={onChangeText}
          onBlur={() => setFocused(false)}
          onFocus={() => setFocused(true)}
          onSubmitEditing={onSubmitEditing}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          secureTextEntry={secureTextEntry && !passwordVisible}
          placeholder={placeholder}
          style={[styles.input, showPasswordToggle ? styles.inputWithToggle : undefined, webInputStyle]}
        />
        {showPasswordToggle ? (
          <Pressable
            accessibilityLabel={passwordVisible ? 'Ocultar contrasena' : 'Mostrar contrasena'}
            accessibilityRole="button"
            onPress={() => setPasswordVisible((current) => !current)}
            style={styles.passwordToggle}>
            <MaterialCommunityIcons
              name={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color="#333333"
            />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  panel: {
    width: '100%',
    maxWidth: 420,
    flexGrow: 1,
  },
  loginPanel: {
    justifyContent: 'center',
  },
  brandRow: {
    alignItems: 'flex-start',
  },
  artworkWrap: {
    alignItems: 'center',
    marginTop: 14,
  },
  slogan: {
    marginTop: 2,
    color: '#71788A',
    fontFamily: Typography.body,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
  form: {
    marginTop: 18,
    gap: 18,
  },
  segmentedControl: {
    minHeight: 42,
    borderRadius: 7,
    backgroundColor: '#EAE5DD',
    flexDirection: 'row',
    overflow: 'hidden',
  },
  registerTypeControl: {
    minHeight: 40,
    borderRadius: 7,
    backgroundColor: '#F4F0E9',
    flexDirection: 'row',
    overflow: 'hidden',
  },
  segmentButton: {
    flex: 1,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  segmentButtonActive: {
    backgroundColor: '#EA1F23',
  },
  segmentText: {
    color: '#333333',
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '800',
  },
  segmentTextActive: {
    color: '#FFFFFF',
  },
  fields: {
    gap: 16,
  },
  field: {
    gap: 10,
  },
  fieldLabel: {
    color: '#333333',
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '400',
  },
  inputShell: {
    minHeight: DesignSystem.control.md,
    borderRadius: DesignSystem.radius.input,
    borderWidth: 1.5,
    borderColor: '#2F2F2F',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    minHeight: DesignSystem.control.md,
    flex: 1,
    color: '#333333',
    fontFamily: Typography.body,
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 0,
  },
  inputWithToggle: {
    paddingRight: 44,
  },
  passwordToggle: {
    position: 'absolute',
    right: 6,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
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
    borderRadius: 2,
    borderWidth: 1,
    borderColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: '#EA1F23',
    borderColor: '#EA1F23',
  },
  checkboxDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#FFFFFF',
  },
  smallActionText: {
    color: '#333333',
    fontFamily: Typography.body,
    fontSize: 12,
    lineHeight: 17,
  },
  recoveryActionText: {
    color: '#EA1F23',
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '700',
  },
  recoveryNavigation: {
    alignItems: 'center',
    gap: 10,
  },
  messageBox: {
    borderRadius: 12,
    backgroundColor: '#FDE7E8',
    borderWidth: 1,
    borderColor: '#EA1F23',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  messageText: {
    color: '#C4171C',
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  successBox: {
    backgroundColor: '#EAF7EE',
    borderColor: '#2F9E44',
  },
  successText: {
    color: '#237A35',
  },
  primaryButton: {
    minHeight: 40,
    borderRadius: 7,
    backgroundColor: '#EA1F23',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontFamily: Typography.body,
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  legalBlock: {
    alignItems: 'center',
    gap: 2,
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
    color: '#111111',
    fontFamily: Typography.body,
    fontSize: 10,
    lineHeight: 15,
    textAlign: 'center',
  },
  legalLink: {
    color: '#EA1F23',
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
