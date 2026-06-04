import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppButton } from '../components/AppButton';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { StatusPill } from '../components/StatusPill';
import { useSessionStore } from '../store/session-store';
import { colors, spacing } from '../theme/colors';

export function PlanSelectionScreen() {
  const { plans, user, isLoading, error, loadPlans, checkoutPlan, signOut } = useSessionStore();

  useEffect(() => {
    loadPlans().catch(() => undefined);
  }, [loadPlans]);

  return (
    <Screen>
      <Card>
        <StatusPill label="Sin plan activo" tone="warning" />
        <Text style={styles.title}>Selecciona un plan para operar</Text>
        <Text style={styles.copy}>
          {user?.name ? `${user.name}, ` : ''}ManeComb bloquea dashboard, GPS y keys hasta tener plan activo.
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </Card>

      {plans.map((plan) => (
        <Card key={plan.id}>
          <View style={styles.planHeader}>
            <Text style={styles.planName}>{plan.name}</Text>
            <Text style={styles.price}>
              {typeof plan.price === 'number' ? `$${plan.price}` : 'Cotizar'}
            </Text>
          </View>
          <Text style={styles.copy}>{plan.description || 'Plan operativo ManeComb'}</Text>
          <Text style={styles.copy}>Unidades incluidas: {plan.maxUnits || 'según contrato'}</Text>
          <AppButton
            label="Iniciar compra"
            loading={isLoading}
            onPress={() => { checkoutPlan(plan.id).catch(() => undefined); }}
          />
          <AppButton
            label="Solicitar prueba"
            variant="secondary"
            loading={isLoading}
            onPress={() => { checkoutPlan(plan.id, true).catch(() => undefined); }}
          />
        </Card>
      ))}

      {!plans.length ? (
        <Card>
          <Text style={styles.copy}>No hay planes cargados todavía. Revisa la conexión al backend local.</Text>
          <AppButton label="Reintentar" onPress={() => { loadPlans().catch(() => undefined); }} />
        </Card>
      ) : null}

      <AppButton label="Cerrar sesión" variant="secondary" onPress={() => { signOut().catch(() => undefined); }} />
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
  error: {
    color: colors.danger,
    fontWeight: '700',
  },
  planHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  planName: {
    color: colors.text,
    flex: 1,
    fontSize: 20,
    fontWeight: '900',
  },
  price: {
    color: colors.accent,
    fontSize: 18,
    fontWeight: '900',
  },
});
