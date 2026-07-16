import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from '@/src/navigation/router';
import { resetPasswordRequest } from '@/src/api/client';
import { getApiErrorMessage } from '@/src/lib/api';

export function PasswordResetScreen() {
  const { token = '' } = useLocalSearchParams<{ token?: string }>();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);

  const submit = async () => {
    if (submitting) return;
    if (!token) {
      setMessage('El enlace de recuperacion no es valido.');
      return;
    }
    if (password.length < 8) {
      setMessage('La contrasena debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirmation) {
      setMessage('Las contrasenas no coinciden.');
      return;
    }

    setSubmitting(true);
    setMessage(null);
    try {
      const response = await resetPasswordRequest(token, password);
      setCompleted(true);
      setMessage(response.message || 'Contrasena actualizada correctamente.');
    } catch (error) {
      setMessage(getApiErrorMessage(error, 'No fue posible restablecer la contrasena.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.page}>
      <View style={styles.card}>
        <Text style={styles.title}>Restablecer contrasena</Text>
        <Text style={styles.subtitle}>Define una nueva contrasena para tu cuenta ManeComb.</Text>
        {!completed ? (
          <>
            <TextInput
              accessibilityLabel="Nueva contrasena"
              autoCapitalize="none"
              onChangeText={setPassword}
              placeholder="Nueva contrasena"
              placeholderTextColor="#718096"
              secureTextEntry
              style={styles.input}
              value={password}
            />
            <TextInput
              accessibilityLabel="Confirmar contrasena"
              autoCapitalize="none"
              onChangeText={setConfirmation}
              placeholder="Confirmar contrasena"
              placeholderTextColor="#718096"
              secureTextEntry
              style={styles.input}
              value={confirmation}
            />
          </>
        ) : null}
        {message ? <Text style={styles.message}>{message}</Text> : null}
        <Pressable
          accessibilityRole="button"
          disabled={submitting}
          onPress={completed ? () => router.replace('/ventas/login') : () => void submit()}
          style={[styles.button, submitting ? styles.disabled : undefined]}>
          {submitting ? <ActivityIndicator color="#FFFFFF" /> : (
            <Text style={styles.buttonText}>{completed ? 'Iniciar sesion' : 'Actualizar contrasena'}</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { alignItems: 'center', backgroundColor: '#050816', flex: 1, justifyContent: 'center', padding: 20 },
  card: { backgroundColor: '#11182A', borderColor: '#2D3748', borderRadius: 20, borderWidth: 1, gap: 14, maxWidth: 420, padding: 24, width: '100%' },
  title: { color: '#F8FAFC', fontSize: 25, fontWeight: '900', textAlign: 'center' },
  subtitle: { color: '#A0AEC0', fontSize: 14, lineHeight: 20, textAlign: 'center' },
  input: { backgroundColor: '#090E1D', borderColor: '#334155', borderRadius: 12, borderWidth: 1, color: '#F8FAFC', minHeight: 48, paddingHorizontal: 14 },
  message: { color: '#FFB4C8', fontSize: 13, lineHeight: 19, textAlign: 'center' },
  button: { alignItems: 'center', backgroundColor: '#EA1F23', borderRadius: 12, justifyContent: 'center', minHeight: 48, paddingHorizontal: 16 },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  disabled: { opacity: 0.65 },
});
