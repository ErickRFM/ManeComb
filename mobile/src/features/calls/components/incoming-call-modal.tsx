// RC-MOBILE-CALLS-PRODUCTION-01 Bloque B — Modal global de llamada entrante.
// Se monta en el root de la app (por encima de los navegadores). Accesible desde cualquier
// pantalla. NO abre la conversacion, NO crea peer; el permiso de media se resuelve antes de aceptar.

import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCallStore } from '../call-store';

export function IncomingCallModal(): React.ReactElement | null {
  const insets = useSafeAreaInsets();
  const phase = useCallStore((s) => s.phase);
  const callerName = useCallStore((s) => s.callerName);
  const mode = useCallStore((s) => s.mode);
  const acceptIncomingCall = useCallStore((s) => s.acceptIncomingCall);
  const rejectIncomingCall = useCallStore((s) => s.rejectIncomingCall);

  const [acting, setActing] = useState(false);
  const actingRef = useRef(false);

  const visible = phase === 'INCOMING_RINGING';

  useEffect(() => {
    if (!visible) {
      actingRef.current = false;
      setActing(false);
    }
  }, [visible]);

  if (!visible) return null;

  const reject = () => {
    if (actingRef.current) return;
    actingRef.current = true;
    setActing(true);
    rejectIncomingCall();
  };

  const accept = async () => {
    if (actingRef.current) return;
    actingRef.current = true;
    setActing(true);

    try {
      // call-store es la única puerta de permisos. Si Android deniega o bloquea,
      // la fase permanece INCOMING_RINGING y no se emite accept al backend.
      await acceptIncomingCall();
    } finally {
      if (useCallStore.getState().phase === 'INCOMING_RINGING') {
        actingRef.current = false;
        setActing(false);
      }
    }
  };

  const modeLabel = mode === 'video' ? 'Videollamada' : 'Llamada de audio';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={reject} statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={[styles.card, { marginTop: insets.top + 24, marginBottom: insets.bottom + 24 }]}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(callerName || '?').trim().charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.name} numberOfLines={1}>
            {callerName || 'Llamada entrante'}
          </Text>
          <Text style={styles.subtitle}>{modeLabel}</Text>

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Rechazar llamada"
              disabled={acting}
              onPress={reject}
              style={({ pressed }) => [styles.button, styles.reject, pressed && styles.pressed]}>
              <Text style={styles.buttonText}>Rechazar</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Aceptar llamada"
              disabled={acting}
              onPress={() => { void accept(); }}
              style={({ pressed }) => [styles.button, styles.accept, pressed && styles.pressed]}>
              <Text style={styles.buttonText}>Aceptar</Text>
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
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    borderRadius: 20,
    backgroundColor: '#111827',
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#1f2937',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  avatarText: { color: '#f9fafb', fontSize: 30, fontWeight: '700' },
  name: { color: '#f9fafb', fontSize: 20, fontWeight: '700', textAlign: 'center' },
  subtitle: { color: '#9ca3af', fontSize: 14, marginTop: 4, marginBottom: 24 },
  actions: { flexDirection: 'row', gap: 14, width: '100%' },
  button: {
    flex: 1,
    minHeight: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reject: { backgroundColor: '#dc2626' },
  accept: { backgroundColor: '#16a34a' },
  pressed: { opacity: 0.85 },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
});
