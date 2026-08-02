import { useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { resetPasswordRequest } from '@/src/api/client';
import { router, useLocalSearchParams } from '@/src/navigation/router';
import { readCheckoutContext } from '@/src/utils/checkout-context';
import { AuthFeedback } from '@/screens/auth/components/auth-feedback';
import { AuthField } from '@/screens/auth/components/auth-field';
import { AuthSubmitButton } from '@/screens/auth/components/auth-submit-button';
import { authStyles as s } from '@/screens/auth/auth.styles';
import { clearRecoverySession } from '@/screens/password-recovery/password-recovery.session';
import { PasswordRecoveryLayout, useSlowRequest } from '@/screens/password-recovery/password-recovery-layout';
import { buildRecoveryRoute, getPasswordChecks, getRecoveryError, isPasswordAllowed, normalizeRecoveryToken, resolveRecoveryCheckoutContext } from '@/screens/password-recovery/password-recovery.utils';

const REQUIREMENTS = [
  { key: 'minLength', label: 'Al menos 8 caracteres' },
  { key: 'hasLetter', label: 'Una letra' },
  { key: 'hasNumber', label: 'Un número' },
  { key: 'hasSpecial', label: 'Un carácter especial' },
] as const;

export function PasswordResetScreen() {
  const params = useLocalSearchParams<{ token?: string | string[]; planId?: string | string[]; trial?: string | string[] }>();
  const token = normalizeRecoveryToken(params.token);
  const context = resolveRecoveryCheckoutContext(params.planId, params.trial, readCheckoutContext());
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState<string | null>(token ? null : 'El enlace no contiene un token válido. Solicita uno nuevo.');
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  const slow = useSlowRequest(submitting);
  const checks = useMemo(() => getPasswordChecks(password), [password]);

  const submit = async () => {
    if (inFlight.current) return;
    if (!token) {
      setMessage('El enlace no contiene un token válido. Solicita uno nuevo.');
      return;
    }
    if (!isPasswordAllowed(password)) {
      setMessage('La contraseña no cumple todos los requisitos.');
      return;
    }
    if (password !== confirmation) {
      setMessage('Las contraseñas no coinciden.');
      return;
    }
    inFlight.current = true;
    setSubmitting(true);
    setMessage(null);
    try {
      await resetPasswordRequest(token, password);
      setPassword('');
      setConfirmation('');
      clearRecoverySession();
      router.replace(buildRecoveryRoute('/ventas/contrasena-actualizada', context));
    } catch (error) {
      setMessage(getRecoveryError(error, 'reset'));
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  return (
    <PasswordRecoveryLayout title="Crea una nueva contraseña" subtitle="Usa una contraseña segura que no hayas utilizado antes.">
      <View style={s.fields}>
        <AuthField icon="lock-outline" label="Nueva contraseña" placeholder="Nueva contraseña" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="new-password" autoCorrect={false} textContentType="newPassword" />
        <AuthField icon="lock-check-outline" label="Confirmar nueva contraseña" placeholder="Repite la nueva contraseña" value={confirmation} onChangeText={setConfirmation} secureTextEntry autoCapitalize="none" autoComplete="new-password" autoCorrect={false} returnKeyType="done" textContentType="newPassword" onSubmitEditing={() => void submit()} />
      </View>
      <View style={s.recoveryRequirements}>
        {REQUIREMENTS.map((requirement) => (
          <Text key={requirement.key} style={[s.recoveryRequirement, checks[requirement.key] ? s.recoveryRequirementMet : undefined]}>
            {checks[requirement.key] ? '✓' : '○'} {requirement.label}
          </Text>
        ))}
      </View>
      {slow ? <AuthFeedback tone="info" message="Conectando con ManeComb…" /> : null}
      <AuthFeedback message={message} />
      <AuthSubmitButton label="Guardar nueva contraseña" submitting={submitting} disabled={submitting || !token} onSubmit={() => void submit()} />
      <View style={s.recoveryActions}>
        <Pressable accessibilityRole="button" onPress={() => router.replace(buildRecoveryRoute('/ventas/recuperar-contrasena', context))}>
          <Text style={s.legalLink}>Solicitar enlace nuevo</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.replace(buildRecoveryRoute('/ventas/login', context))}>
          <Text style={s.smallActionText}>Volver a iniciar sesión</Text>
        </Pressable>
      </View>
    </PasswordRecoveryLayout>
  );
}
