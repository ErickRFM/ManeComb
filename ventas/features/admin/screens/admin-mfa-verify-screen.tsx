import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from '@/src/navigation/router';
import { useAdminStore } from '../store';
import { AdminAuthLayout } from '../components/admin-auth-layout';
import { AdminMfaChallengeGuard } from '../components/admin-route-guard';
import { Typography, palette } from '@/constants/theme';

export function AdminMfaVerifyScreen() {
  const { verifyMfa, recoverMfa, mode } = useAdminStore();
  const [token, setToken] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState('');

  const handleVerify = async () => {
    if (isSubmitting || token.length < 6) return;
    setIsSubmitting(true);
    setError(null);

    try {
      await verifyMfa(token.trim());
      router.replace('/admin');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Código inválido');
      setToken('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecovery = async () => {
    if (isSubmitting || !recoveryCode.trim()) return;
    setIsSubmitting(true);
    setError(null);

    try {
      await recoverMfa(recoveryCode.trim());
      router.replace('/admin');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Código de recuperación inválido');
      setRecoveryCode('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AdminMfaChallengeGuard>
      <AdminAuthLayout
        title="Verificación en dos pasos"
        subtitle={
          showRecovery
            ? 'Ingresa uno de tus códigos de recuperación'
            : 'Ingresa el código de 6 dígitos de tu app de autenticación'
        }
      >
        {error ? (
          <View style={styles.feedbackBox}>
            <Text style={styles.feedbackText}>{error}</Text>
          </View>
        ) : null}

        {showRecovery ? (
          <>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Código de recuperación</Text>
              <View style={styles.inputShell}>
                <TextInput
                  value={recoveryCode}
                  onChangeText={setRecoveryCode}
                  autoCapitalize="characters"
                  placeholder="XXXXX-XXXXX"
                  placeholderTextColor="rgba(216, 226, 245, 0.38)"
                  selectionColor="#E31E24"
                  style={styles.input}
                />
              </View>
            </View>

            <Pressable
              onPress={handleRecovery}
              disabled={isSubmitting || !recoveryCode.trim()}
              style={({ pressed }) => [
                styles.submitButton,
                pressed && !isSubmitting ? styles.submitPressed : undefined,
                isSubmitting || !recoveryCode.trim() ? styles.submitDisabled : undefined,
              ]}
            >
              <Text style={styles.submitText}>
                {isSubmitting ? 'Verificando...' : 'Verificar código de recuperación'}
              </Text>
            </Pressable>

            <Pressable onPress={() => { setShowRecovery(false); setError(null); }}>
              <Text style={styles.toggleLink}>Volver al código de 6 dígitos</Text>
            </Pressable>
          </>
        ) : (
          <>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Código de 6 dígitos</Text>
              <View style={styles.inputShell}>
                <TextInput
                  value={token}
                  onChangeText={(v) => { setToken(v); if (error) setError(null); }}
                  keyboardType="number-pad"
                  maxLength={6}
                  placeholder="000000"
                  placeholderTextColor="rgba(216, 226, 245, 0.38)"
                  selectionColor="#E31E24"
                  style={styles.codeInput}
                />
              </View>
            </View>

            <Pressable
              onPress={handleVerify}
              disabled={isSubmitting || token.length < 6}
              style={({ pressed }) => [
                styles.submitButton,
                pressed && !isSubmitting ? styles.submitPressed : undefined,
                isSubmitting || token.length < 6 ? styles.submitDisabled : undefined,
              ]}
            >
              <Text style={styles.submitText}>
                {isSubmitting ? 'Verificando...' : 'Verificar'}
              </Text>
            </Pressable>

            <Pressable onPress={() => setShowRecovery(true)}>
              <Text style={styles.toggleLink}>Usar código de recuperación</Text>
            </Pressable>
          </>
        )}
      </AdminAuthLayout>
    </AdminMfaChallengeGuard>
  );
}

const styles = StyleSheet.create({
  feedbackBox: {
    borderRadius: 12,
    backgroundColor: 'rgba(240, 106, 106, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(240, 106, 106, 0.46)',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  feedbackText: {
    color: '#F4A0A0',
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  field: {
    gap: 8,
  },
  fieldLabel: {
    color: 'rgba(248, 250, 252, 0.82)',
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
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
    fontFamily: Typography.mono,
    fontSize: 14,
    letterSpacing: 2,
    textAlign: 'center',
    minHeight: 46,
    paddingHorizontal: 0,
    paddingVertical: 0,
    ...(Platform.OS === 'web'
      ? ({ outlineStyle: 'none', outlineWidth: 0, boxShadow: 'none' } as any)
      : {}),
  },
  codeInput: {
    color: '#F8FAFC',
    flex: 1,
    fontFamily: Typography.mono,
    fontSize: 24,
    letterSpacing: 10,
    textAlign: 'center',
    minHeight: 46,
    paddingHorizontal: 0,
    paddingVertical: 0,
    ...(Platform.OS === 'web'
      ? ({ outlineStyle: 'none', outlineWidth: 0, boxShadow: 'none' } as any)
      : {}),
  },
  submitButton: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: '#E31E24',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage: 'linear-gradient(135deg, #E31E24, #F0445F 66%, #8B5CF6)',
          boxShadow: '0 10px 22px rgba(240, 68, 95, 0.2)',
        } as any)
      : {}),
  },
  submitText: {
    color: '#FFFFFF',
    fontFamily: Typography.body,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  submitPressed: {
    opacity: 0.9,
  },
  submitDisabled: {
    opacity: 0.7,
  },
  toggleLink: {
    color: '#FF8FB0',
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
});
