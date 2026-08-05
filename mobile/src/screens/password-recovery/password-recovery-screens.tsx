import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, StatusBar, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { forgotPasswordRequest, resetPasswordRequest } from '@/src/api/client';
import { BrandLogo } from '@/src/components/brand-logo';
import { KeyboardSafeScrollView } from '@/src/components/keyboard-safe-layout';
import { router, useLocalSearchParams } from '@/src/navigation/router';
import { AuthField } from '@/src/screens/auth/components/auth-field';
import { clearRecoverySession, getRecoveryEmail, setRecoveryEmail } from './password-recovery.session';
import { recoveryStyles as s } from './password-recovery.styles';
import {
  PASSWORD_RECOVERY_RESEND_SECONDS,
  PASSWORD_REQUIREMENTS,
  getPasswordChecks,
  isPasswordAllowed,
  isValidRecoveryEmail,
  maskRecoveryEmail,
  normalizeRecoveryEmail,
  normalizeRecoveryToken,
} from './password-recovery.utils';

type Feedback = { message: string; tone: 'error' | 'info' } | null;

function getRecoveryError(error: unknown, action: 'request' | 'reset') {
  const candidate = error as {
    code?: string;
    message?: string;
    response?: { status?: number; data?: { message?: string } };
  };
  const status = candidate?.response?.status;
  const apiMessage = String(candidate?.response?.data?.message || '');
  const technicalMessage = String(candidate?.message || '');

  if (status === 429) return 'Realizaste varios intentos. Espera antes de volver a intentarlo.';
  if (!candidate?.response && /timeout|timed out|ECONNABORTED/i.test(`${candidate?.code} ${technicalMessage}`)) {
    return 'ManeComb está tardando en responder. Revisa tu conexión e inténtalo nuevamente; la solicitud no se reenviará sola.';
  }
  if (!candidate?.response) return 'No hay conexión con ManeComb. Revisa internet e inténtalo nuevamente.';
  if (action === 'reset' && /expirado|invalido|inválido/i.test(apiMessage)) {
    return 'El enlace es inválido o venció. Solicita uno nuevo.';
  }
  if (action === 'reset' && /contrase/i.test(apiMessage)) return apiMessage;
  return action === 'request'
    ? 'No fue posible procesar la solicitud. Inténtalo nuevamente.'
    : 'No fue posible guardar la nueva contraseña. Inténtalo nuevamente.';
}

function useSlowRequest(active: boolean) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!active) {
      setSlow(false);
      return undefined;
    }
    const timer = setTimeout(() => setSlow(true), 7000);
    return () => clearTimeout(timer);
  }, [active]);
  return slow;
}

function RecoveryScaffold({ backTo, children, subtitle, title }: {
  backTo?: string;
  children: ReactNode;
  subtitle: string;
  title: string;
}) {
  return (
    <SafeAreaView style={s.safeArea}>
      <StatusBar barStyle="dark-content" />
      <KeyboardSafeScrollView
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.content}
        style={s.scroll}>
        <View style={s.panel}>
          <View style={s.topRow}>
            <BrandLogo size="md" tone="dark" plain />
          </View>
          {backTo ? (
            <Pressable accessibilityRole="button" onPress={() => router.replace(backTo)}>
              <Text style={s.backText}>← Volver</Text>
            </Pressable>
          ) : null}
          <View style={s.heading}>
            <Text accessibilityRole="header" style={s.title}>{title}</Text>
            <Text style={s.subtitle}>{subtitle}</Text>
          </View>
          {children}
        </View>
      </KeyboardSafeScrollView>
    </SafeAreaView>
  );
}

function FeedbackBox({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  const info = feedback.tone === 'info';
  return (
    <View accessibilityLiveRegion="polite" style={[s.feedback, info ? s.feedbackInfo : undefined]}>
      <Text style={[s.feedbackText, info ? s.feedbackInfoText : undefined]}>{feedback.message}</Text>
    </View>
  );
}

function PrimaryButton({ disabled, label, loading, onPress }: {
  disabled?: boolean;
  label: string;
  loading?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ busy: Boolean(loading), disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={[s.primaryButton, disabled ? s.disabled : undefined]}>
      {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.primaryButtonText}>{label}</Text>}
    </Pressable>
  );
}

export function PasswordRecoveryRequestScreen() {
  const [email, setEmail] = useState(getRecoveryEmail());
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const inFlight = useRef(false);
  const slow = useSlowRequest(submitting);

  const submit = async () => {
    if (inFlight.current) return;
    const normalized = normalizeRecoveryEmail(email);
    if (!isValidRecoveryEmail(normalized)) {
      setFeedback({ tone: 'error', message: 'Ingresa un correo electrónico válido.' });
      return;
    }

    inFlight.current = true;
    setSubmitting(true);
    setFeedback(null);
    try {
      await forgotPasswordRequest(normalized);
      setRecoveryEmail(normalized);
      router.replace('/recuperacion-enviada');
    } catch (error) {
      setFeedback({ tone: 'error', message: getRecoveryError(error, 'request') });
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  return (
    <RecoveryScaffold
      backTo="/login"
      title="Recupera tu contraseña"
      subtitle="Ingresa el correo asociado a tu cuenta. Te enviaremos un enlace para crear una nueva contraseña.">
      <View style={s.fields}>
        <AuthField
          label="Correo electrónico"
          placeholder="usuario@correo.com"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          returnKeyType="done"
          textContentType="emailAddress"
          onSubmitEditing={() => void submit()}
        />
      </View>
      {slow ? <FeedbackBox feedback={{ tone: 'info', message: 'Conectando con ManeComb…' }} /> : null}
      <FeedbackBox feedback={feedback} />
      <PrimaryButton disabled={submitting} loading={submitting} label="Enviar enlace" onPress={() => void submit()} />
      <Pressable accessibilityRole="button" onPress={() => { clearRecoverySession(); router.replace('/login'); }}>
        <Text style={s.linkText}>Volver a iniciar sesión</Text>
      </Pressable>
    </RecoveryScaffold>
  );
}

export function PasswordRecoverySentScreen() {
  const email = getRecoveryEmail();
  const [remaining, setRemaining] = useState(PASSWORD_RECOVERY_RESEND_SECONDS);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const inFlight = useRef(false);
  const slow = useSlowRequest(submitting);

  useEffect(() => {
    if (remaining <= 0) return undefined;
    const timer = setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [remaining]);

  const resend = async () => {
    if (!email || remaining > 0 || inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setFeedback(null);
    try {
      await forgotPasswordRequest(email);
      setRemaining(PASSWORD_RECOVERY_RESEND_SECONDS);
      setFeedback({ tone: 'info', message: 'Solicitud enviada nuevamente. Revisa tu correo y la carpeta de spam.' });
    } catch (error) {
      setFeedback({ tone: 'error', message: getRecoveryError(error, 'request') });
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  const openMail = async () => {
    const supported = await Linking.canOpenURL('mailto:').catch(() => false);
    if (supported) await Linking.openURL('mailto:').catch(() => undefined);
  };

  return (
    <RecoveryScaffold
      title="Revisa tu correo"
      subtitle={`Solicitud recibida para ${maskRecoveryEmail(email)}. Revisa tu bandeja de entrada y spam para continuar.`}>
      {slow ? <FeedbackBox feedback={{ tone: 'info', message: 'Conectando con ManeComb…' }} /> : null}
      <FeedbackBox feedback={feedback} />
      <PrimaryButton label="Abrir correo" onPress={() => void openMail()} />
      <View style={s.actions}>
        <Pressable accessibilityRole="button" disabled={remaining > 0 || submitting || !email} onPress={() => void resend()}>
          <Text style={[s.linkText, remaining > 0 || submitting || !email ? s.disabled : undefined]}>
            {submitting ? 'Procesando…' : remaining > 0 ? `Reenviar en ${remaining} s` : 'Reenviar enlace'}
          </Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => { setRecoveryEmail(''); router.replace('/recuperar-contrasena'); }}>
          <Text style={s.secondaryText}>Usar otro correo</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push('/nueva-contrasena?manual=1')}>
          <Text style={s.secondaryText}>Ingresar token manualmente</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => { clearRecoverySession(); router.replace('/login'); }}>
          <Text style={s.linkText}>Volver al inicio de sesión</Text>
        </Pressable>
      </View>
    </RecoveryScaffold>
  );
}

export function NewPasswordScreen() {
  const params = useLocalSearchParams<{ token?: string | string[]; manual?: string | string[] }>();
  const linkedToken = normalizeRecoveryToken(params.token);
  const manualMode = normalizeRecoveryToken(params.manual) === '1' || !linkedToken;
  const [manualToken, setManualToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(
    !linkedToken && normalizeRecoveryToken(params.manual) !== '1'
      ? { tone: 'error', message: 'El enlace no contiene un token válido. Ingrésalo manualmente o solicita uno nuevo.' }
      : null
  );
  const inFlight = useRef(false);
  const slow = useSlowRequest(submitting);
  const checks = useMemo(() => getPasswordChecks(password), [password]);

  const submit = async () => {
    if (inFlight.current) return;
    const token = manualMode ? manualToken.trim() : linkedToken;
    if (!token) {
      setFeedback({ tone: 'error', message: 'El enlace no contiene un token válido. Solicita uno nuevo o ingrésalo manualmente.' });
      return;
    }
    if (!isPasswordAllowed(password)) {
      setFeedback({ tone: 'error', message: 'La contraseña no cumple todos los requisitos.' });
      return;
    }
    if (password !== confirmation) {
      setFeedback({ tone: 'error', message: 'Las contraseñas no coinciden.' });
      return;
    }

    inFlight.current = true;
    setSubmitting(true);
    setFeedback(null);
    try {
      await resetPasswordRequest(token, password);
      setPassword('');
      setConfirmation('');
      setManualToken('');
      clearRecoverySession();
      router.replace('/contrasena-actualizada');
    } catch (error) {
      setFeedback({ tone: 'error', message: getRecoveryError(error, 'reset') });
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  return (
    <RecoveryScaffold
      title="Crea una nueva contraseña"
      subtitle="Usa una contraseña segura que no hayas utilizado antes.">
      <View style={s.fields}>
        {manualMode ? (
          <AuthField
            label="Token de recuperación"
            placeholder="Pega el token recibido"
            value={manualToken}
            onChangeText={setManualToken}
            autoCapitalize="none"
            autoCorrect={false}
          />
        ) : null}
        <AuthField
          label="Nueva contraseña"
          placeholder="Nueva contraseña"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          autoCorrect={false}
          textContentType="newPassword"
        />
        <AuthField
          label="Confirmar nueva contraseña"
          placeholder="Repite la nueva contraseña"
          value={confirmation}
          onChangeText={setConfirmation}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          autoCorrect={false}
          returnKeyType="done"
          textContentType="newPassword"
          onSubmitEditing={() => void submit()}
        />
      </View>
      <View style={s.requirementList}>
        {PASSWORD_REQUIREMENTS.map((requirement) => (
          <Text key={requirement.key} style={[s.requirementText, checks[requirement.key] ? s.requirementMet : undefined]}>
            {checks[requirement.key] ? '✓' : '○'} {requirement.label}
          </Text>
        ))}
      </View>
      {slow ? <FeedbackBox feedback={{ tone: 'info', message: 'Conectando con ManeComb…' }} /> : null}
      <FeedbackBox feedback={feedback} />
      <PrimaryButton disabled={submitting} loading={submitting} label="Guardar nueva contraseña" onPress={() => void submit()} />
      <View style={s.actions}>
        <Pressable accessibilityRole="button" onPress={() => router.replace('/recuperar-contrasena')}>
          <Text style={s.linkText}>Solicitar enlace nuevo</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => { clearRecoverySession(); router.replace('/login'); }}>
          <Text style={s.secondaryText}>Volver a iniciar sesión</Text>
        </Pressable>
      </View>
    </RecoveryScaffold>
  );
}

export function PasswordUpdatedScreen() {
  return (
    <RecoveryScaffold
      title="Contraseña actualizada"
      subtitle="Tu contraseña se cambió correctamente. Por seguridad, se cerraron tus sesiones anteriores.">
      <View style={s.successIcon}><Text style={s.successIconText}>✓</Text></View>
      <FeedbackBox feedback={{
        tone: 'info',
        message: 'En un dispositivo nuevo, los mensajes cifrados anteriores pueden requerir que vuelvas a respaldar la clave desde un dispositivo donde ya tenías sesión.',
      }} />
      <PrimaryButton label="Iniciar sesión" onPress={() => router.replace('/login')} />
    </RecoveryScaffold>
  );
}
