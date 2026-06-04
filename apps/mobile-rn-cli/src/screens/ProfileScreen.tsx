import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { AppButton } from '../components/AppButton';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { StatusPill } from '../components/StatusPill';
import { runtimeConfig } from '../config/env';
import { useSessionStore } from '../store/session-store';
import { colors } from '../theme/colors';

export function ProfileScreen() {
  const { user, signOut } = useSessionStore();

  return (
    <Screen>
      <Card>
        <Text style={styles.title}>Perfil</Text>
        <Text style={styles.copy}>{user?.name}</Text>
        <Text style={styles.copy}>{user?.email}</Text>
        <StatusPill label={user?.role || 'usuario'} tone="info" />
        <StatusPill label={user?.subscriptionStatus || 'active'} tone="success" />
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Entorno</Text>
        <Text style={styles.copy}>APP_ENV: {runtimeConfig.appEnv}</Text>
        <Text style={styles.copy}>API: {runtimeConfig.apiBaseUrl}</Text>
        <Text style={styles.copy}>Socket: {runtimeConfig.socketUrl}</Text>
      </Card>

      <AppButton label="Cerrar sesión" variant="danger" onPress={() => { signOut().catch(() => undefined); }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: 25,
    fontWeight: '900',
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  copy: {
    color: colors.textMuted,
    lineHeight: 21,
  },
});
