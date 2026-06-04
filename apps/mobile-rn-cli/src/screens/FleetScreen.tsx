import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { AppButton } from '../components/AppButton';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { StatusPill } from '../components/StatusPill';
import { generateActivationKeyRequest } from '../api/client';
import { useSessionStore } from '../store/session-store';
import { colors } from '../theme/colors';
import { isAdmin } from '../utils/access';

export function FleetScreen() {
  const { user, vehicles, activationKeys, refreshOperationalData, isLoading, error } = useSessionStore();

  async function generateKey() {
    await generateActivationKeyRequest();
    await refreshOperationalData();
  }

  return (
    <Screen>
      <Card>
        <Text style={styles.title}>Conductores y combis</Text>
        <Text style={styles.copy}>Las keys se generan desde el backend y respetan cupos del plan activo.</Text>
        {isAdmin(user) ? (
          <AppButton label="Generar key de activación" loading={isLoading} onPress={() => { generateKey().catch(() => undefined); }} />
        ) : (
          <StatusPill label="Solo admin genera keys" tone="info" />
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Keys</Text>
        {activationKeys.slice(0, 8).map((entry, index) => (
          <Text key={String((entry as { id?: string }).id || index)} style={styles.copy}>
            • {String((entry as { key?: string; status?: string }).key || 'key')} · {String((entry as { status?: string }).status || 'available')}
          </Text>
        ))}
        {!activationKeys.length ? <Text style={styles.copy}>Sin keys cargadas o sin permiso para listarlas.</Text> : null}
      </Card>

      {vehicles.map((vehicle) => (
        <Card key={vehicle.id}>
          <Text style={styles.sectionTitle}>{vehicle.code || vehicle.name || vehicle.id}</Text>
          <Text style={styles.copy}>Estado: {vehicle.status || 'operativa'}</Text>
          <Text style={styles.copy}>Conductor: {vehicle.driverName || 'Sin asignar'}</Text>
          <Text style={styles.copy}>Ruta: {vehicle.routeName || 'Sin ruta'}</Text>
        </Card>
      ))}
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
  error: {
    color: colors.danger,
    fontWeight: '700',
  },
});
