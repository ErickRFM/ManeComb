import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import QRCode from 'qrcode';
import { router } from '@/src/navigation/router';
import { useAdminStore } from '../store';
import { AdminAuthLayout } from '../components/admin-auth-layout';
import { AdminMfaEnrollGuard } from '../components/admin-route-guard';
import { Typography, palette } from '@/constants/theme';

export function AdminMfaSetupScreen() {
  const { setupMfa, confirmMfa, mode } = useAdminStore();
  const [secret, setSecret] = useState('');
  const [uri, setUri] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [token, setToken] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codesConfirmed, setCodesConfirmed] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const hasFetched = useRef(false);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;

    setupMfa()
      .then((result) => {
        setSecret(result.secret);
        setUri(result.uri);
        return QRCode.toDataURL(result.uri, {
          width: 280,
          margin: 2,
          color: { dark: '#000000', light: '#FFFFFF' },
        });
      })
      .then((url) => setQrDataUrl(url))
      .catch((err) => setError(err instanceof Error ? err.message : 'Error al generar código QR'));
  }, [setupMfa]);

  const handleConfirm = async () => {
    if (isSubmitting || token.length < 6) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const codes = await confirmMfa(token.trim());
      setBackupCodes(codes);
      setSecret('');
      setUri('');
      setQrDataUrl('');
      setToken('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al confirmar MFA');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyAll = () => {
    if (!backupCodes) return;
    const text = backupCodes.join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopyFeedback('Códigos copiados');
      setTimeout(() => setCopyFeedback(null), 2000);
    }).catch(() => {});
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopyFeedback(`Copiado: ${code}`);
      setTimeout(() => setCopyFeedback(null), 2000);
    }).catch(() => {});
  };

  const handleDone = () => {
    router.push('/admin/login');
  };

  if (backupCodes) {
    return (
      <AdminAuthLayout
        title="MFA Configurado"
        subtitle="Guarda estos códigos de respaldo en un lugar seguro. Cada código solo puede usarse una vez. Confirma haberlos guardado para continuar."
      >
        <View style={styles.codesBox}>
          {backupCodes.map((code) => (
            <Pressable key={code} onPress={() => handleCopyCode(code)} style={styles.codeRow}>
              <Text style={styles.codeText}>{code}</Text>
              <Text style={styles.copyHint}>Copiar</Text>
            </Pressable>
          ))}
        </View>

        <Pressable onPress={handleCopyAll} style={styles.copyAllButton}>
          <Text style={styles.copyAllText}>Copiar todos</Text>
        </Pressable>

        {copyFeedback ? (
          <Text style={styles.copyFeedback}>{copyFeedback}</Text>
        ) : null}

        <Pressable
          onPress={() => setCodesConfirmed((c) => !c)}
          style={styles.confirmRow}
        >
          <View style={[styles.checkbox, codesConfirmed ? styles.checkboxActive : undefined]}>
            {codesConfirmed ? <Text style={styles.checkMark}>✓</Text> : null}
          </View>
          <Text style={styles.confirmText}>He guardado mis códigos de respaldo</Text>
        </Pressable>

        <Pressable
          onPress={handleDone}
          disabled={!codesConfirmed}
          style={({ pressed }) => [
            styles.submitButton,
            pressed && codesConfirmed ? styles.submitPressed : undefined,
            !codesConfirmed ? styles.submitDisabled : undefined,
          ]}
        >
          <Text style={styles.submitText}>Ir a iniciar sesión</Text>
        </Pressable>
      </AdminAuthLayout>
    );
  }

  return (
    <AdminMfaEnrollGuard>
      <AdminAuthLayout
        title="Configurar MFA"
        subtitle="Escanea el código QR con tu app de autenticación (Google Authenticator, Authy, etc.)"
      >
        {error ? (
          <View style={styles.feedbackBox}>
            <Text style={styles.feedbackText}>{error}</Text>
          </View>
        ) : null}

        {qrDataUrl ? (
          <View style={styles.qrContainer}>
            <img
              src={qrDataUrl}
              alt="Código QR para MFA"
              style={{ width: 220, height: 220, display: 'block' } as any}
            />
          </View>
        ) : (
          <View style={styles.qrPlaceholder}>
            <Text style={styles.qrPlaceholderText}>Generando código QR...</Text>
          </View>
        )}

        {secret ? (
          <View style={styles.secretBox}>
            <Text style={styles.secretLabel}>O ingresa esta clave manualmente:</Text>
            <Text style={styles.secretValue} selectable>{secret}</Text>
          </View>
        ) : null}

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Código de verificación</Text>
          <View style={styles.inputShell}>
            <TextInput
              value={token}
              onChangeText={setToken}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="000000"
              placeholderTextColor="rgba(216, 226, 245, 0.38)"
              selectionColor="#E31E24"
              style={styles.input}
            />
          </View>
        </View>

        <Pressable
          onPress={handleConfirm}
          disabled={isSubmitting || token.length < 6}
          style={({ pressed }) => [
            styles.submitButton,
            pressed && !isSubmitting ? styles.submitPressed : undefined,
            isSubmitting || token.length < 6 ? styles.submitDisabled : undefined,
          ]}
        >
          <Text style={styles.submitText}>
            {isSubmitting ? 'Verificando...' : 'Confirmar y activar'}
          </Text>
        </Pressable>
      </AdminAuthLayout>
    </AdminMfaEnrollGuard>
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
  qrContainer: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    alignSelf: 'center',
  },
  qrPlaceholder: {
    width: 220,
    height: 220,
    borderRadius: 16,
    backgroundColor: palette.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  qrPlaceholderText: {
    color: palette.muted,
    fontFamily: Typography.body,
    fontSize: 13,
  },
  secretBox: {
    gap: 6,
    alignItems: 'center',
  },
  secretLabel: {
    color: palette.muted,
    fontFamily: Typography.body,
    fontSize: 12,
  },
  secretValue: {
    color: palette.text,
    fontFamily: Typography.mono,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2,
    backgroundColor: palette.surfaceAlt,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
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
    fontSize: 20,
    letterSpacing: 8,
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
  codesBox: {
    backgroundColor: palette.surfaceAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.line,
    overflow: 'hidden',
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  codeText: {
    color: palette.text,
    fontFamily: Typography.mono,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 3,
  },
  copyHint: {
    color: palette.accent,
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '800',
  },
  copyAllButton: {
    alignItems: 'center',
    minHeight: 40,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 10,
  },
  copyAllText: {
    color: palette.text,
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '800',
  },
  copyFeedback: {
    color: palette.success,
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: palette.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: palette.accent,
    borderColor: palette.accent,
  },
  checkMark: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 18,
  },
  confirmText: {
    color: palette.text,
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
});
