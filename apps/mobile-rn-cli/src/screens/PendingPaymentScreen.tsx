import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { AppButton } from '../components/AppButton';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { StatusPill } from '../components/StatusPill';
import { useSessionStore } from '../store/session-store';
import { colors } from '../theme/colors';

export function PendingPaymentScreen() {
  const { user, signOut, initialize, isLoading } = useSessionStore();

  return (
    <Screen>
      <Card>
        <StatusPill label={user?.subscriptionStatus || 'pending_payment'} tone="warning" />
        <Text style={styles.title}>Pago o suscripción pendiente</Text>
        <Text style={styles.copy}>
          La operación queda bloqueada hasta que el backend confirme el pago o reactive el plan. No se habilitan dashboard,
          GPS ni generación de keys en este estado.
        </Text>
        <AppButton label="Revisar estado" loading={isLoading} onPress={() => { initialize().catch(() => undefined); }} />
        <AppButton label="Cerrar sesión" variant="secondary" onPress={() => { signOut().catch(() => undefined); }} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: 25,
    fontWeight: '900',
  },
  copy: {
    color: colors.textMuted,
    lineHeight: 21,
  },
});
