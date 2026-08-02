import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { forgotPasswordRequest } from '@/src/api/client';
import { router, useLocalSearchParams } from '@/src/navigation/router';
import { readCheckoutContext } from '@/src/utils/checkout-context';
import { AuthFeedback } from '@/screens/auth/components/auth-feedback';
import { AuthField } from '@/screens/auth/components/auth-field';
import { AuthSubmitButton } from '@/screens/auth/components/auth-submit-button';
import { authStyles as s } from '@/screens/auth/auth.styles';
import { getRecoveryEmail, setRecoveryEmail } from './password-recovery.session';
import { PasswordRecoveryLayout, useSlowRequest } from './password-recovery-layout';
import { buildRecoveryRoute, getRecoveryError, isValidRecoveryEmail, normalizeRecoveryEmail, resolveRecoveryCheckoutContext } from './password-recovery.utils';

export function PasswordRecoveryRequestScreen() {
  const params = useLocalSearchParams<{ planId?: string | string[]; trial?: string | string[] }>();
  const context = resolveRecoveryCheckoutContext(params.planId, params.trial, readCheckoutContext());
  const [email, setEmail] = useState(getRecoveryEmail());
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  const slow = useSlowRequest(submitting);
  const loginRoute = buildRecoveryRoute('/ventas/login', context);

  const submit = async () => {
    if (inFlight.current) return;
    const normalized = normalizeRecoveryEmail(email);
    if (!isValidRecoveryEmail(normalized)) {
      setMessage('Ingresa un correo electrónico válido.');
      return;
    }
    inFlight.current = true;
    setSubmitting(true);
    setMessage(null);
    try {
      await forgotPasswordRequest(normalized);
      setRecoveryEmail(normalized);
      router.replace(buildRecoveryRoute('/ventas/recuperacion-enviada', context));
    } catch (error) {
      setMessage(getRecoveryError(error, 'request'));
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  return (
    <PasswordRecoveryLayout backTo={loginRoute} title="Recupera tu contraseña" subtitle="Ingresa el correo asociado a tu cuenta. Te enviaremos un enlace para crear una nueva contraseña.">
      <View style={s.fields}>
        <AuthField icon="email-outline" label="Correo electrónico" placeholder="correo@empresa.com" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" autoCorrect={false} returnKeyType="done" textContentType="emailAddress" onSubmitEditing={() => void submit()} />
      </View>
      {slow ? <AuthFeedback tone="info" message="Conectando con ManeComb…" /> : null}
      <AuthFeedback message={message} />
      <AuthSubmitButton label="Enviar enlace" submitting={submitting} disabled={submitting} onSubmit={() => void submit()} />
      <View style={s.recoveryActions}>
        <Pressable accessibilityRole="button" onPress={() => router.replace(loginRoute)}>
          <Text style={s.smallActionText}>Volver a iniciar sesión</Text>
        </Pressable>
      </View>
    </PasswordRecoveryLayout>
  );
}
