import { Link, Redirect, router } from '@/src/navigation/router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
import {
  API_URL,
  getApiErrorMessage,
  getBackendLabel,
  healthRequest,
  validateDriverActivationKeyRequest,
} from '@/src/api/client';
import { BrandLogo } from '@/src/components/brand-logo';
import { useAppStore } from '@/src/store/use-app-store';
import { getAuthenticatedHome } from '@/src/utils/account-routing';

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

export function CustomerAuthScreen({ mode }: CustomerAuthScreenProps) {
  const { width, height } = useWindowDimensions();
  const { activateDriverWithKey, isSubmitting, register, signIn, user } = useAppStore(
    useShallow((state) => ({
      activateDriverWithKey: state.activateDriverWithKey,
      isSubmitting: state.isSubmitting,
      register: state.register,
      signIn: state.signIn,
      user: state.user,
    }))
  );

  const [loginIdentity, setLoginIdentity] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
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
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isValidatingDriverKey, setIsValidatingDriverKey] = useState(false);

  const isRegister = mode === 'register';
  const isDriverRegister = isRegister && registerProfile === 'driver';
  const isShortViewport = height < 720;
  const isNarrow = width < 390;

  const sizing = useMemo(
    () => ({
      logoSize: isNarrow ? ('md' as const) : ('lg' as const),
      artworkWidth: isShortViewport ? 142 : 166,
      artworkHeight: isShortViewport ? 100 : 118,
      topGap: isShortViewport ? 26 : 70,
      formGap: isShortViewport ? 16 : 24,
      contentPadding: isNarrow ? 16 : 20,
    }),
    [isNarrow, isShortViewport]
  );

  if (user) {
    return <Redirect href={getAuthenticatedHome(user) as never} />;
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
        setHelperMessage(result.message || 'No fue posible iniciar sesión.');
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

  const handleTestConnection = async () => {
    setHelperMessage(null);
    setHelperTone('error');
    setIsTestingConnection(true);
    const startedAt = Date.now();

    try {
      const health = (await healthRequest()) as {
        mode?: string;
        status?: string;
      };
      const pingMs = Date.now() - startedAt;
      const backendLabel = getBackendLabel(API_URL);
      setHelperTone('success');
      setHelperMessage(
        `Conexion OK (${pingMs} ms). ${backendLabel}: ${health.status || 'ok'} / ${health.mode || 'online'}. URL: ${API_URL}`
      );
    } catch (error) {
      setHelperMessage(
        `${getApiErrorMessage(error, 'No fue posible probar la conexión.', {
          apiUrl: API_URL,
        })} URL actual: ${API_URL}`
      );
    } finally {
      setIsTestingConnection(false);
    }
  };
  const scrollContentDynamicStyle = {
    paddingHorizontal: sizing.contentPadding,
    paddingTop: Math.max(18, sizing.contentPadding),
    paddingBottom: isShortViewport ? 18 : 30,
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}>
        <ScrollView
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={Platform.OS === 'web'}
          contentContainerStyle={[
            styles.scrollContent,
            scrollContentDynamicStyle,
          ]}>
          <View style={styles.panel}>
            <View style={styles.brandRow}>
              <BrandLogo size={sizing.logoSize} tone="dark" plain />
            </View>

            <View style={[styles.artworkWrap, { marginTop: sizing.topGap }]}>
              <Image
                source={fasterArtwork}
                resizeMode="contain"
                style={[
                  styles.artwork,
                  {
                    width: sizing.artworkWidth,
                    height: sizing.artworkHeight,
                  },
                ]}
              />
            </View>

            <View style={[styles.form, { gap: sizing.formGap }]}>
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
                {isDriverRegister ? (
                  <>
                    <AuthField
                      label="Key de activación"
                      placeholder="MNCB-XXXXXX-XXXXXX-XXXXXX"
                      value={driverActivationKey}
                      onChangeText={setDriverActivationKey}
                      autoCapitalize="characters"
                    />
                    <AuthField
                      label="Nombre"
                      placeholder="Nombre del conductor"
                      value={driverName}
                      onChangeText={setDriverName}
                      autoCapitalize="words"
                    />
                  </>
                ) : null}
                <AuthField
                  label={isDriverRegister ? 'Correo o teléfono' : 'Correo electrónico o número'}
                  placeholder="User@correo.com"
                  value={isRegister ? registerIdentity : loginIdentity}
                  onChangeText={isRegister ? setRegisterIdentity : setLoginIdentity}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <AuthField
                  label="Contraseña"
                  placeholder="Ingreso de contraseña"
                  value={isRegister ? registerPassword : loginPassword}
                  onChangeText={isRegister ? setRegisterPassword : setLoginPassword}
                  secureTextEntry
                  autoCapitalize="none"
                />
                {isRegister ? (
                  <AuthField
                    label="Confirmar contraseña"
                    placeholder="Ingresa nuevamente tu contraseña"
                    value={registerConfirmPassword}
                    onChangeText={setRegisterConfirmPassword}
                    secureTextEntry
                    autoCapitalize="none"
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
                    />
                    <AuthField
                      label="Placa"
                      placeholder="ABC-123-A"
                      value={driverUnitPlate}
                      onChangeText={setDriverUnitPlate}
                      autoCapitalize="characters"
                    />
                  </>
                ) : null}
              </View>

              {!isRegister ? (
                <View style={styles.sessionRow}>
                  <Pressable
                    onPress={() => setRememberSession((current) => !current)}
                    style={styles.rememberButton}>
                    <View style={[styles.checkbox, rememberSession ? styles.checkboxActive : undefined]}>
                      {rememberSession ? <View style={styles.checkboxDot} /> : null}
                    </View>
                    <Text style={styles.smallActionText}>Recordar contraseña</Text>
                  </Pressable>
                  <Pressable
                    onPress={() =>
                      setHelperMessage('Contacta al administrador para recuperar tu acceso.')
                    }>
                    <Text style={styles.smallActionText}>¿Olvidó la contraseña?</Text>
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
                onPress={() => { handleSubmit(); }}
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
                    {isDriverRegister ? 'Activar cuenta' : isRegister ? 'Registrarse' : 'Iniciar sesión'}
                  </Text>
                )}
              </Pressable>

              <Pressable
                onPress={() => { handleTestConnection(); }}
                disabled={isSubmitting || isValidatingDriverKey || isTestingConnection}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && !isSubmitting && !isValidatingDriverKey && !isTestingConnection ? styles.pressed : undefined,
                  isSubmitting || isValidatingDriverKey || isTestingConnection ? styles.disabled : undefined,
                ]}>
                {isTestingConnection ? (
                  <ActivityIndicator color="#EA1F23" />
                ) : (
                  <Text style={styles.secondaryButtonText}>Probar conexión</Text>
                )}
              </Pressable>

              <View style={styles.legalBlock}>
                <View style={styles.legalLine}>
                  <Text style={styles.legalText}>Al iniciar sesión, aceptas nuestros</Text>
                  <Link href="/terminos" style={styles.legalLink}>
                    Terminos y Condiciones
                  </Link>
                  <Text style={styles.legalText}>ademas de</Text>
                </View>
                <View style={styles.legalLine}>
                  <Text style={styles.legalText}>nuestra</Text>
                  <Link href="/privacidad" style={styles.legalLink}>
                    Politica de Privacidad.
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
  keyboardType = 'default',
  label,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  value,
}: {
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  label: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  value: string;
}) {
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
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        secureTextEntry={secureTextEntry}
        placeholder={placeholder}
        placeholderTextColor="#9A9A9A"
        selectionColor="#EA1F23"
        style={[styles.input, webInputStyle]}
      />
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
  brandRow: {
    alignItems: 'flex-start',
  },
  artworkWrap: {
    alignItems: 'center',
  },
  artwork: {
    overflow: 'visible',
  },
  form: {
    marginTop: 'auto',
    paddingTop: 24,
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
  input: {
    minHeight: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#2F2F2F',
    color: '#333333',
    fontFamily: Typography.body,
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 0,
    backgroundColor: '#FFFFFF',
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
  secondaryButton: {
    minHeight: 38,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#EA1F23',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#EA1F23',
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '700',
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
