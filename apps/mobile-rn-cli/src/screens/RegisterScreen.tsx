import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { AppButton } from '../components/AppButton';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { TextField } from '../components/TextField';
import { useSessionStore } from '../store/session-store';
import { colors } from '../theme/colors';

export function RegisterScreen() {
  const register = useSessionStore((state) => state.register);
  const isLoading = useSessionStore((state) => state.isLoading);
  const error = useSessionStore((state) => state.error);
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <Screen>
      <Card>
        <Text style={styles.title}>Registro ManeComb</Text>
        <Text style={styles.copy}>La cuenta nueva queda activa, pero sin plan hasta elegir una suscripción.</Text>
        <TextField label="Nombre" value={name} onChangeText={setName} />
        <TextField label="Empresa" value={companyName} onChangeText={setCompanyName} />
        <TextField label="Teléfono" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <TextField label="Correo" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        <TextField label="Contraseña" value={password} onChangeText={setPassword} secureTextEntry />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <AppButton
          label="Crear cuenta"
          loading={isLoading}
          onPress={() => {
            register({
              name,
              email,
              password,
              companyName,
              phone,
            }).catch(() => undefined);
          }}
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
