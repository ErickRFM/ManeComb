import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { AppButton } from '../components/AppButton';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { TextField } from '../components/TextField';
import { useSessionStore } from '../store/session-store';
import { colors } from '../theme/colors';

export function ActivationScreen() {
  const activateDriver = useSessionStore((state) => state.activateDriver);
  const isLoading = useSessionStore((state) => state.isLoading);
  const error = useSessionStore((state) => state.error);
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');

  return (
    <Screen>
      <Card>
        <Text style={styles.title}>Activación por key</Text>
        <Text style={styles.copy}>Usa una key disponible, no vencida ni revocada. El cupo del plan se respeta desde backend.</Text>
        <TextField label="Key de activación" value={key} onChangeText={setKey} autoCapitalize="characters" />
        <TextField label="Nombre del conductor" value={name} onChangeText={setName} />
        <TextField label="Correo" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        <TextField label="Teléfono" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <TextField label="Contraseña" value={password} onChangeText={setPassword} secureTextEntry />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <AppButton
          label="Activar conductor"
          loading={isLoading}
          onPress={() => { activateDriver({ key, name, email, password, phone }).catch(() => undefined); }}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900',
  },
  copy: {
    color: colors.textMuted,
    lineHeight: 21,
  },
  error: {
    color: colors.danger,
    fontWeight: '700',
  },
});
