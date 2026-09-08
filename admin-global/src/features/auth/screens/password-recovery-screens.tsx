import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Link, router } from '@/components/router';
import { AdminAuthLayout } from '../components/auth-layout';
import { AdminLoginGuard } from '../components/route-guard';
import { platformForgotPasswordRequest, platformResetPasswordRequest } from '../api';
import { Typography, palette } from '@/styles/theme';

function getApiErrorMessage(error: unknown, fallback: string) {
  const candidate = (error as any)?.response?.data?.message;
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : fallback;
}

function getResetToken() {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('token')?.trim() || '';
}

export function AdminForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent'>('idle');
  const [error, setError] = useState('');
  const canSubmit = Boolean(email.trim() && status !== 'loading');

  const submit = async () => {
    if (!canSubmit) return;
    setStatus('loading');
    setError('');
    try {
      await platformForgotPasswordRequest(email.trim().toLowerCase());
      setStatus('sent');
    } catch (requestError) {
      setStatus('idle');
      setError(getApiErrorMessage(requestError, 'No fue posible enviar la recuperación. Intenta nuevamente.'));
    }
  };

  return (
    <AdminLoginGuard>
      <AdminAuthLayout
        title="Recuperar contraseña"
        subtitle="Te enviaremos un enlace de recuperación al correo de tu cuenta Admin Global"
      >
        {status === 'sent' ? (
          <View style={styles.successBox} accessibilityRole="alert">
            <Text style={styles.successTitle}>Revisa tu correo</Text>
            <Text style={styles.successText}>La solicitud fue recibida. Revisa también la carpeta de spam. El enlace vence en 1 hora.</Text>
          </View>
        ) : (
          <>
            {error ? (
              <View accessibilityRole="alert" style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Correo electrónico</Text>
              <View style={styles.inputShell}>
                <TextInput
                  accessibilityLabel="Correo electrónico"
                  autoCapitalize="none"
                  autoComplete="email"
                  editable={status !== 'loading'}
                  keyboardType="email-address"
                  onChangeText={(value) => { setEmail(value); if (error) setError(''); }}
                  onSubmitEditing={() => { void submit(); }}
                  placeholder="admin@manecomb.com"
                  placeholderTextColor="rgba(216, 226, 245, 0.38)"
                  returnKeyType="send"
                  selectionColor="#E31E24"
                  style={styles.input}
                  textContentType="emailAddress"
                  value={email}
                />
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSubmit, busy: status === 'loading' }}
              disabled={!canSubmit}
              onPress={() => { void submit(); }}
              style={({ pressed }) => [styles.submitButton, pressed && canSubmit ? styles.submitPressed : undefined, !canSubmit ? styles.submitDisabled : undefined]}
            >
              <Text style={styles.submitText}>{status === 'loading' ? 'Enviando…' : 'Enviar enlace de recuperación'}</Text>
            </Pressable>
          </>
        )}

        <Link href="/admin/login" style={styles.linkText}>Volver a iniciar sesión</Link>
      </AdminAuthLayout>
    </AdminLoginGuard>
  );
}

export function AdminResetPasswordScreen() {
  const token = useMemo(getResetToken, []);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle');
  const [error, setError] = useState('');

  const passwordsMatch = password === confirmPassword;
  const canSubmit = Boolean(token && password && confirmPassword && passwordsMatch && status !== 'loading');

  const submit = async () => {
    if (!canSubmit) return;
    setStatus('loading');
    setError('');
    try {
      await platformResetPasswordRequest(token, password);
      setStatus('done');
    } catch (requestError) {
      setStatus('idle');
      setError(getApiErrorMessage(requestError, 'No fue posible actualizar la contraseña.'));
    }
  };

  return (
    <AdminLoginGuard>
      <AdminAuthLayout
        title="Nueva contraseña"
        subtitle="Crea una nueva contraseña para tu cuenta Admin Global"
      >
        {!token ? (
          <View accessibilityRole="alert" style={styles.errorBox}>
            <Text style={styles.errorText}>El enlace de recuperación no contiene un token válido. Solicita uno nuevo.</Text>
          </View>
        ) : status === 'done' ? (
          <View style={styles.successBox} accessibilityRole="alert">
            <Text style={styles.successTitle}>Contraseña actualizada</Text>
            <Text style={styles.successText}>Tus sesiones anteriores fueron cerradas. Ya puedes iniciar sesión con tu nueva contraseña.</Text>
          </View>
        ) : (
          <>
            {error ? (
              <View accessibilityRole="alert" style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Nueva contraseña</Text>
              <View style={styles.inputShell}>
                <TextInput
                  accessibilityLabel="Nueva contraseña"
                  autoCapitalize="none"
                  editable={status !== 'loading'}
                  onChangeText={(value) => { setPassword(value); if (error) setError(''); }}
                  placeholder="••••••••"
                  placeholderTextColor="rgba(216, 226, 245, 0.38)"
                  secureTextEntry={!showPassword}
                  selectionColor="#E31E24"
                  style={styles.input}
                  textContentType="newPassword"
                  value={password}
                />
                <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setShowPassword((current) => !current)} style={styles.toggleButton}>
                  <Text style={styles.toggleText}>{showPassword ? 'Ocultar' : 'Mostrar'}</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Confirmar contraseña</Text>
              <View style={[styles.inputShell, confirmPassword && !passwordsMatch ? styles.inputShellError : undefined]}>
                <TextInput
                  accessibilityLabel="Confirmar contraseña"
                  autoCapitalize="none"
                  editable={status !== 'loading'}
                  onChangeText={setConfirmPassword}
                  onSubmitEditing={() => { void submit(); }}
                  placeholder="••••••••"
                  placeholderTextColor="rgba(216, 226, 245, 0.38)"
                  returnKeyType="done"
                  secureTextEntry={!showPassword}
                  selectionColor="#E31E24"
                  style={styles.input}
                  textContentType="newPassword"
                  value={confirmPassword}
                />
              </View>
              {confirmPassword && !passwordsMatch ? <Text style={styles.validationText}>Las contraseñas no coinciden.</Text> : null}
            </View>

            <Text style={styles.hintText}>Usa una contraseña fuerte; se aplican las mismas reglas de seguridad que en el resto de ManeComb.</Text>

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSubmit, busy: status === 'loading' }}
              disabled={!canSubmit}
              onPress={() => { void submit(); }}
              style={({ pressed }) => [styles.submitButton, pressed && canSubmit ? styles.submitPressed : undefined, !canSubmit ? styles.submitDisabled : undefined]}
            >
              <Text style={styles.submitText}>{status === 'loading' ? 'Actualizando…' : 'Actualizar contraseña'}</Text>
            </Pressable>
          </>
        )}

        {status === 'done' ? (
          <Pressable accessibilityRole="button" onPress={() => router.replace('/admin/login')} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Ir a iniciar sesión</Text>
          </Pressable>
        ) : (
          <Link href="/admin/login" style={styles.linkText}>Volver a iniciar sesión</Link>
        )}
      </AdminAuthLayout>
    </AdminLoginGuard>
  );
}

const styles = StyleSheet.create({
  field: { gap: 8 },
  fieldLabel: { color: 'rgba(248, 250, 252, 0.82)', fontFamily: Typography.body, fontSize: 12, fontWeight: '800' },
  inputShell: { alignItems: 'center', backgroundColor: 'rgba(8, 13, 27, 0.78)', borderColor: 'rgba(255, 255, 255, 0.12)', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 10, minHeight: 48, paddingHorizontal: 13 },
  inputShellError: { borderColor: 'rgba(240, 106, 106, 0.65)' },
  input: { color: '#F8FAFC', flex: 1, fontFamily: Typography.body, fontSize: 14, minHeight: 46, paddingHorizontal: 0, paddingVertical: 0, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none', outlineWidth: 0, boxShadow: 'none' } as any) : {}) },
  toggleButton: { alignItems: 'center', justifyContent: 'center', minHeight: 46, minWidth: 56 },
  toggleText: { color: palette.muted, fontFamily: Typography.body, fontSize: 12, fontWeight: '800' },
  submitButton: { minHeight: 48, borderRadius: 14, backgroundColor: '#E31E24', alignItems: 'center', justifyContent: 'center', ...(Platform.OS === 'web' ? ({ backgroundImage: 'linear-gradient(135deg, #E31E24, #F0445F 66%, #8B5CF6)', boxShadow: '0 10px 22px rgba(240, 68, 95, 0.2)' } as any) : {}) },
  submitText: { color: '#FFFFFF', fontFamily: Typography.body, fontSize: 15, fontWeight: '900', textAlign: 'center' },
  submitPressed: { opacity: 0.9 },
  submitDisabled: { opacity: 0.48 },
  secondaryButton: { alignItems: 'center', borderColor: 'rgba(255, 255, 255, 0.14)', borderRadius: 12, borderWidth: 1, minHeight: 44, justifyContent: 'center' },
  secondaryButtonText: { color: '#F8FAFC', fontFamily: Typography.body, fontSize: 13, fontWeight: '800' },
  linkText: { color: '#F4A0A0', fontFamily: Typography.body, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  hintText: { color: palette.muted, fontFamily: Typography.body, fontSize: 11, lineHeight: 16, textAlign: 'center' },
  validationText: { color: '#F4A0A0', fontFamily: Typography.body, fontSize: 11, fontWeight: '700' },
  errorBox: { borderRadius: 12, backgroundColor: 'rgba(240, 106, 106, 0.14)', borderWidth: 1, borderColor: 'rgba(240, 106, 106, 0.46)', paddingHorizontal: 12, paddingVertical: 10 },
  errorText: { color: '#F4A0A0', fontFamily: Typography.body, fontSize: 12, fontWeight: '700', lineHeight: 18, textAlign: 'center' },
  successBox: { borderRadius: 12, backgroundColor: 'rgba(77, 208, 164, 0.12)', borderWidth: 1, borderColor: 'rgba(77, 208, 164, 0.4)', gap: 5, paddingHorizontal: 14, paddingVertical: 12 },
  successTitle: { color: '#9BE8CC', fontFamily: Typography.body, fontSize: 13, fontWeight: '900', textAlign: 'center' },
  successText: { color: 'rgba(248, 250, 252, 0.78)', fontFamily: Typography.body, fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
