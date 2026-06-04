import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { AppButton } from '../components/AppButton';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { TextField } from '../components/TextField';
import { createIncidentRequest } from '../api/client';
import { useSessionStore } from '../store/session-store';
import { colors } from '../theme/colors';

export function IncidentsScreen() {
  const { incidents, refreshOperationalData } = useSessionStore();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  async function createIncident() {
    await createIncidentRequest({
      title,
      description,
      severity: 'medium',
    });
    setTitle('');
    setDescription('');
    await refreshOperationalData();
  }

  return (
    <Screen>
      <Card>
        <Text style={styles.title}>Alertas / Bitácora</Text>
        <Text style={styles.copy}>Registra incidencias sin cambiar endpoints ni estructura de datos.</Text>
        <TextField label="Título" value={title} onChangeText={setTitle} />
        <TextField label="Descripción" value={description} onChangeText={setDescription} multiline />
        <AppButton label="Crear incidencia" onPress={() => { createIncident().catch(() => undefined); }} />
      </Card>

      {incidents.map((incident) => (
        <Card key={incident.id}>
          <Text style={styles.sectionTitle}>{incident.title || incident.description || incident.id}</Text>
          <Text style={styles.copy}>Severidad: {incident.severity || 'medium'}</Text>
          <Text style={styles.copy}>Estado: {incident.status || 'open'}</Text>
        </Card>
      ))}

      {!incidents.length ? (
        <Card>
          <Text style={styles.copy}>Sin incidencias abiertas.</Text>
        </Card>
      ) : null}
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
