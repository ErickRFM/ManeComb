import React, { useEffect, useMemo, useRef } from 'react';
import { AppState, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  callPermissionFailureNeedsSettings,
  getCallPermissionFailureCopy,
  openCallPermissionSettings,
} from '../call-permissions';
import { useCallStore } from '../call-store';

function statusCopy(status: string): string {
  switch (status) {
    case 'granted':
      return 'Permitido';
    case 'denied':
      return 'Denegado';
    case 'blocked':
      return 'Bloqueado en Ajustes';
    case 'not_required':
      return 'No requerido';
    case 'not_requested':
      return 'Se solicitará después';
    default:
      return 'Pendiente';
  }
}

export function CallPermissionModal(): React.ReactElement | null {
  const prompt = useCallStore((state) => state.permissionPrompt);
  const retrying = useCallStore((state) => state.permissionRetrying);
  const retry = useCallStore((state) => state.retryPermissionPrompt);
  const dismiss = useCallStore((state) => state.dismissPermissionPrompt);
  const settingsOpenedRef = useRef(false);

  const needsSettings = callPermissionFailureNeedsSettings(prompt?.failureCode);
  const title = prompt?.intent.mode === 'video'
    ? 'Permisos para videollamada'
    : 'Permiso para llamada';
  const message = getCallPermissionFailureCopy(prompt?.failureCode);

  const resources = useMemo(() => {
    if (!prompt) return [];
    const rows = [
      { label: 'Micrófono', value: statusCopy(prompt.permissions.microphone) },
    ];
    if (prompt.intent.mode === 'video') {
      rows.push({ label: 'Cámara', value: statusCopy(prompt.permissions.camera) });
    }
    return rows;
  }, [prompt]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active' || !settingsOpenedRef.current) return;
      settingsOpenedRef.current = false;
      retry().catch(() => undefined);
    });
    return () => subscription.remove();
  }, [retry]);

  if (!prompt) return null;

  const primaryAction = async () => {
    if (needsSettings) {
      settingsOpenedRef.current = true;
      await openCallPermissionSettings();
      return;
    }
    await retry();
  };

  return (
    <Modal
      visible
      transparent
      statusBarTranslucent
      animationType="fade"
      onRequestClose={retrying ? undefined : dismiss}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconShell}>
            <Text style={styles.icon}>{prompt.intent.mode === 'video' ? '◉' : '●'}</Text>
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          <View style={styles.resourceList}>
            {resources.map((resource) => (
              <View key={resource.label} style={styles.resourceRow}>
                <Text style={styles.resourceLabel}>{resource.label}</Text>
                <Text style={styles.resourceValue}>{resource.value}</Text>
              </View>
            ))}
          </View>

          {needsSettings ? (
            <Text style={styles.helper}>
              Android ya no mostrará el cuadro de permiso automáticamente. Abre Ajustes, habilita el recurso y vuelve a ManeComb; lo comprobaremos al regresar.
            </Text>
          ) : (
            <Text style={styles.helper}>
              ManeComb solicita estos permisos antes de señalizar o aceptar la llamada. Si cancelas, no se inicia ninguna conexión de audio o video.
            </Text>
          )}

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancelar recuperación de permisos"
              disabled={retrying}
              onPress={dismiss}
              style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
              <Text style={styles.secondaryText}>Cancelar</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={needsSettings ? 'Abrir ajustes de ManeComb' : 'Volver a solicitar permisos'}
              disabled={retrying}
              onPress={() => void primaryAction()}
              style={({ pressed }) => [styles.primary, pressed && styles.pressed, retrying && styles.disabled]}>
              <Text style={styles.primaryText}>
                {retrying ? 'Comprobando…' : needsSettings ? 'Abrir ajustes' : 'Permitir'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  card: {
    width: '100%',
    maxWidth: 430,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#303846',
    backgroundColor: '#111722',
    padding: 22,
  },
  iconShell: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(227,30,36,0.14)',
    marginBottom: 16,
  },
  icon: { color: '#FF6F73', fontSize: 24, fontWeight: '900' },
  title: { color: '#FFFFFF', fontSize: 21, fontWeight: '900' },
  message: { color: '#D7DDE7', fontSize: 14, lineHeight: 21, marginTop: 8 },
  resourceList: { gap: 8, marginTop: 18 },
  resourceRow: {
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: '#1A2230',
    paddingHorizontal: 13,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  resourceLabel: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  resourceValue: { color: '#AEB8C7', fontSize: 12, fontWeight: '700', textAlign: 'right' },
  helper: { color: '#98A3B3', fontSize: 12, lineHeight: 18, marginTop: 16 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 22 },
  secondary: {
    flex: 1,
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#394252',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    flex: 1,
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: '#E31E24',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { color: '#E4E9F0', fontSize: 14, fontWeight: '800' },
  primaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  pressed: { opacity: 0.84 },
  disabled: { opacity: 0.55 },
});
