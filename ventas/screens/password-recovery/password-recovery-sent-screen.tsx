import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { forgotPasswordRequest } from '@/src/api/client';
import { router, useLocalSearchParams } from '@/src/navigation/router';
import { readCheckoutContext } from '@/src/utils/checkout-context';
import { AuthFeedback } from '@/screens/auth/components/auth-feedback';
import { authStyles as s } from '@/screens/auth/auth.styles';
import { clearRecoverySession, getRecoveryEmail, setRecoveryEmail } from './password-recovery.session';
import { PasswordRecoveryLayout, useSlowRequest } from './password-recovery-layout';
import { PASSWORD_RECOVERY_RESEND_SECONDS, buildRecoveryRoute, getRecoveryError, maskRecoveryEmail, resolveRecoveryCheckoutContext } from './password-recovery.utils';

export function PasswordRecoverySentScreen() {
  const params = useLocalSearchParams<{ planId?: string | string[]; trial?: string | string[] }>();
  const context = resolveRecoveryCheckoutContext(params.planId, params.trial, readCheckoutContext());
  const email = getRecoveryEmail();
  const [remaining, setRemaining] = useState(PASSWORD_RECOVERY_RESEND_SECONDS);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; tone: 'error' | 'info' } | null>(null);
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
      setFeedback({ tone: 'info', message: 'Si la cuenta existe, se procesó una nueva solicitud.' });
    } catch (error) {
      setFeedback({ tone: 'error', message: getRecoveryError(error, 'request') });
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  return (
    <PasswordRecoveryLayout title="Revisa tu correo" subtitle={`Si existe una cuenta asociada a ${maskRecoveryEmail(email)}, recibirás un enlace para crear una nueva contraseña.`}>
      {slow ? <AuthFeedback tone="info" message="Conectando con ManeComb…" /> : null}
      <AuthFeedback tone={feedback?.tone} message={feedback?.message || null} />
      <View style={s.recoveryActions}>
        <Pressable accessibilityRole="button" disabled={remaining > 0 || submitting || !email} onPress={() => void resend()}>
          <Text style={[s.legalLink, remaining > 0 || submitting || !email ? s.disabled : undefined]}>{submitting ? 'Procesando…' : remaining > 0 ? `Reenviar en ${remaining} s` : 'Reenviar enlace'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => { setRecoveryEmail(''); router.replace(buildRecoveryRoute('/ventas/recuperar-contrasena', context)); }}>
          <Text style={s.smallActionText}>Usar otro correo</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => { clearRecoverySession(); router.replace(buildRecoveryRoute('/ventas/login', context)); }}>
          <Text style={s.legalLink}>Volver a iniciar sesión</Text>
        </Pressable>
      </View>
    </PasswordRecoveryLayout>
  );
}
