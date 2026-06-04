import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppButton } from '../components/AppButton';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { StatusPill } from '../components/StatusPill';
import { useSessionStore } from '../store/session-store';
import { colors, spacing } from '../theme/colors';

export function DashboardScreen() {
  const { dashboard, vehicles, incidents, user, refreshOperationalData, isLoading, error } = useSessionStore();

  useEffect(() => {
    refreshOperationalData().catch(() => undefined);
  }, [refreshOperationalData]);

  const metrics = dashboard?.metrics || [
    { label: 'Unidades', value: String(vehicles.length) },
    { label: 'Incidencias', value: String(incidents.length) },
  ];

  return (
    <Screen>
      <Card>
        <Text style={styles.eyebrow}>Dashboard admin / conductor</Text>
        <Text style={styles.title}>Operación ManeComb</Text>
        <Text style={styles.copy}>Sesión: {user?.name} · {user?.role}</Text>
        <StatusPill label={user?.subscriptionStatus || 'active'} tone="success" />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <AppButton label="Actualizar" loading={isLoading} onPress={() => { refreshOperationalData().catch(() => undefined); }} />
      </Card>

      <View style={styles.grid}>
        {metrics.map((metric) => (
          <Card key={`${metric.label}-${metric.value}`} style={styles.metric}>
            <Text style={styles.metricLabel}>{metric.label}</Text>
            <Text style={styles.metricValue}>{metric.value}</Text>
            {metric.trend ? <Text style={styles.copy}>{metric.trend}</Text> : null}
          </Card>
        ))}
      </View>

      <Card>
        <Text style={styles.sectionTitle}>Alertas recientes</Text>
        {(dashboard?.alerts || []).slice(0, 4).map((alert) => (
          <Text key={alert.id} style={styles.copy}>• {alert.title || alert.message}</Text>
        ))}
        {!dashboard?.alerts?.length ? <Text style={styles.copy}>Sin alertas críticas activas.</Text> : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  title: {
    color: colors.text,
    fontSize: 28,
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
  error: {
    color: colors.danger,
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  metric: {
    minWidth: 140,
    flex: 1,
  },
  metricLabel: {
    color: colors.textMuted,
    fontWeight: '800',
  },
  metricValue: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '900',
  },
});
