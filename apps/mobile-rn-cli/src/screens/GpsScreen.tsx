import React, { useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { AppButton } from '../components/AppButton';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { StatusPill } from '../components/StatusPill';
import { updateVehicleLocationRequest } from '../api/client';
import { getCurrentLocation, watchLocation } from '../services/location';
import { colors } from '../theme/colors';
import type { LocationPoint } from '../types/app';

export function GpsScreen() {
  const [status, setStatus] = useState('Rastreo detenido.');
  const [point, setPoint] = useState<LocationPoint | null>(null);
  const stopWatchRef = useRef<(() => void) | null>(null);

  async function locateOnce() {
    try {
      setStatus('Solicitando ubicación...');
      const nextPoint = await getCurrentLocation();
      setPoint(nextPoint);
      await updateVehicleLocationRequest(nextPoint).catch(() => undefined);
      setStatus('Ubicación enviada al backend.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'No se pudo obtener la ubicación.');
    }
  }

  async function startTracking() {
    await locateOnce();
    stopWatchRef.current?.();
    stopWatchRef.current = watchLocation(
      (nextPoint) => {
        setPoint(nextPoint);
        setStatus('Rastreo iniciado.');
        updateVehicleLocationRequest(nextPoint).catch(() => undefined);
      },
      (message) => setStatus(message || 'Activa el GPS para continuar.')
    );
  }

  function stopTracking() {
    stopWatchRef.current?.();
    stopWatchRef.current = null;
    setStatus('Rastreo detenido.');
  }

  return (
    <Screen>
      <Card>
        <Text style={styles.title}>GPS operativo</Text>
        <Text style={styles.copy}>Solicita permisos runtime y envía ubicación al backend ManeComb.</Text>
        <StatusPill label={status} tone={status.includes('iniciado') ? 'success' : 'info'} />
        {point ? (
          <Text style={styles.copy}>
            Lat {point.latitude.toFixed(6)} · Lng {point.longitude.toFixed(6)} · Accuracy {Math.round(point.accuracy || 0)}m
          </Text>
        ) : (
          <Text style={styles.copy}>Sin ubicación capturada todavía.</Text>
        )}
        <AppButton label="Obtener ubicación" onPress={() => { locateOnce().catch(() => undefined); }} />
        <AppButton label="Iniciar rastreo" onPress={() => { startTracking().catch(() => undefined); }} />
        <AppButton label="Detener rastreo" variant="secondary" onPress={stopTracking} />
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
