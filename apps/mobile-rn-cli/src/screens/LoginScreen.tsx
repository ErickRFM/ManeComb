import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppButton } from '../components/AppButton';
import { BrandLogo } from '../components/BrandLogo';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { TextField } from '../components/TextField';
import { useSessionStore } from '../store/session-store';
import { colors, spacing } from '../theme/colors';
import type { RootParamList } from '../navigation/navigation-ref';

type Props = NativeStackScreenProps<RootParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const signIn = useSessionStore((state) => state.signIn);
  const isLoading = useSessionStore((state) => state.isLoading);
  const error = useSessionStore((state) => state.error);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <Screen>
      <BrandLogo />
      <Card>
        <Text style={styles.title}>Inicia sesión</Text>
        <Text style={styles.copy}>Conecta con tu backend ManeComb, conserva roles, planes y operación.</Text>
        <TextField label="Correo" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        <TextField label="Contraseña" value={password} onChangeText={setPassword} secureTextEntry />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <AppButton label="Entrar" loading={isLoading} onPress={() => { signIn(email, password).catch(() => undefined); }} />
        <View style={styles.links}>
          <Pressable onPress={() => navigation.navigate('Register')}>
            <Text style={styles.link}>Crear cuenta</Text>
          </Pressable>
          <Pressable onPress={() => navigation.navigate('Activation')}>
            <Text style={styles.link}>Activar con key</Text>
          </Pressable>
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: 26,
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
  links: {
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  link: {
    color: colors.accent,
    fontWeight: '800',
  },
});
