import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Redirect } from '@/components/router';
import { useAdminStore } from '../store';
import { AdminAuthLayout } from '../components/auth-layout';
import { AdminLoginGuard } from '../components/route-guard';
import { Typography, palette } from '@/styles/theme';

export function AdminLoginScreen() {
  const { mode, error, login, clearError } = useAdminStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  if (mode === 'mfa_enrollment') return <Redirect href="/admin/mfa/setup" />;
  if (mode === 'mfa_challenge') return <Redirect href="/admin/mfa" />;

  const isSubmitting = mode === 'loading';
  const canSubmit = Boolean(email.trim() && password && !isSubmitting);

  const handleSubmit = () => {
    if (!canSubmit) return;
    login(email.trim(), password);
  };

  return (
    <AdminLoginGuard>
      <AdminAuthLayout
        title="Admin Global"
        subtitle="Acceso privado para el equipo autorizado de ManeComb"
      >
        {error ? (
          <View accessibilityRole="alert" style={styles.feedbackBox}>
            <Text style={styles.feedbackText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Correo electrónico</Text>
          <View style={styles.inputShell}>
            <TextInput
              accessibilityLabel="Correo electrónico"
              autoCapitalize="none"
              autoComplete="email"
              editable={!isSubmitting}
              keyboardType="email-address"
              onChangeText={(value) => { setEmail(value); if (error) clearError(); }}
              placeholder="admin@manecomb.com"
              placeholderTextColor="rgba(216, 226, 245, 0.38)"
              returnKeyType="next"
              selectionColor="#E31E24"
              style={styles.input}
              textContentType="emailAddress"
              value={email}
            />
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Contraseña</Text>
          <View style={styles.inputShell}>
            <TextInput
              accessibilityLabel="Contraseña"
              autoCapitalize="none"
              autoComplete="current-password"
              editable={!isSubmitting}
              onChangeText={(value) => { setPassword(value); if (error) clearError(); }}
              onSubmitEditing={handleSubmit}
              placeholder="••••••••"
              placeholderTextColor="rgba(216, 226, 245, 0.38)"
              returnKeyType="go"
              secureTextEntry={!showPassword}
              selectionColor="#E31E24"
              style={styles.input}
              textContentType="password"
              value={password}
            />
            <Pressable
              accessibilityLabel={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              accessibilityRole="button"
              accessibilityState={{ expanded: showPassword }}
              disabled={isSubmitting}
              hitSlop={8}
              onPress={() => setShowPassword((previous) => !previous)}
              style={styles.toggleButton}
            >
              <Text style={styles.toggleText}>
                {showPassword ? 'Ocultar' : 'Mostrar'}
              </Text>
            </Pressable>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSubmit, busy: isSubmitting }}
          disabled={!canSubmit}
          onPress={handleSubmit}
          style={({ pressed }) => [
            styles.submitButton,
            pressed && canSubmit ? styles.submitPressed : undefined,
            !canSubmit ? styles.submitDisabled : undefined,
          ]}
        >
          <Text style={styles.submitText}>
            {isSubmitting ? 'Iniciando sesión…' : 'Iniciar sesión'}
          </Text>
        </Pressable>
      </AdminAuthLayout>
    </AdminLoginGuard>
  );
}

const styles = StyleSheet.create({
  feedbackBox: {
    borderRadius: 12,
    backgroundColor: 'rgba(240, 106, 106, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(240, 106, 106, 0.46)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  feedbackText: {
    color: '#F4A0A0',
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'center',
  },
  field: { gap: 8 },
  fieldLabel: {
    color: 'rgba(248, 250, 252, 0.82)',
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '800',
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
  input: {
    color: '#F8FAFC',
    flex: 1,
    fontFamily: Typography.body,
    fontSize: 14,
    minHeight: 46,
    paddingHorizontal: 0,
    paddingVertical: 0,
    ...(Platform.OS === 'web'
      ? ({ outlineStyle: 'none', outlineWidth: 0, boxShadow: 'none' } as any)
      : {}),
  },
  toggleButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
    minWidth: 56,
  },
  toggleText: {
    color: palette.muted,
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '800',
  },
  submitButton: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: '#E31E24',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web'
      ? ({ backgroundImage: 'linear-gradient(135deg, #E31E24, #F0445F 66%, #8B5CF6)', boxShadow: '0 10px 22px rgba(240, 68, 95, 0.2)' } as any)
      : {}),
  },
  submitText: {
    color: '#FFFFFF',
    fontFamily: Typography.body,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  submitPressed: { opacity: 0.9 },
  submitDisabled: { opacity: 0.48 },
});
