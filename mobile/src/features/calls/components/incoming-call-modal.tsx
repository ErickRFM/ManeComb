// RC-MOBILE-CALLS-PRODUCTION-01 Bloque B — Modal global de llamada entrante.
// Se monta en el root de la app (por encima de los navegadores). Accesible desde cualquier
// pantalla. NO abre la conversacion, NO crea peer; el permiso de media se resuelve antes de aceptar.

import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { useCallStore } from '../call-store';
import { CallAmbientBackground } from './call-ambient-background';

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
      // call-store es la unica puerta de permisos. Si Android deniega o bloquea,
      // la fase permanece INCOMING_RINGING y no se emite accept al backend.
      await acceptIncomingCall();
    } finally {
      if (useCallStore.getState().phase === 'INCOMING_RINGING') {
        actingRef.current = false;
        setActing(false);
      }
    }
  };

  const safeName = callerName?.trim() || 'Contacto operativo';
  const initial = safeName.charAt(0).toUpperCase() || '?';
  const isVideo = mode === 'video';
  const modeLabel = isVideo ? 'Videollamada entrante' : 'Llamada de audio entrante';

  return (
    <Modal visible animationType="fade" onRequestClose={reject} statusBarTranslucent>
      <View
        style={[
          styles.screen,
          { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 22 },
        ]}>
        <CallAmbientBackground />

        <View style={styles.topRow}>
          <View style={styles.securePill}>
            <MaterialCommunityIcons name="shield-lock-outline" size={15} color="#9EE5B0" />
            <Text style={styles.secureText}>ManeComb · llamada segura</Text>
          </View>
          <View style={styles.incomingPill}>
            <View style={styles.liveDot} />
            <Text style={styles.incomingText}>ENTRANTE</Text>
          </View>
        </View>

        <View style={styles.identityStage}>
          <View style={styles.avatarHalo}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
          </View>

          <Text style={styles.name} numberOfLines={1}>{safeName}</Text>

          <View style={styles.modeBadge}>
            <MaterialCommunityIcons
              name={isVideo ? 'video-outline' : 'phone-in-talk-outline'}
              size={18}
              color="#9EE5B0"
            />
            <Text style={styles.modeText}>{modeLabel}</Text>
          </View>

          <Text style={styles.helper}>
            {isVideo ? 'La cámara se activa solo después de responder.' : 'El micrófono se activa solo después de responder.'}
          </Text>
        </View>

        <View style={styles.actionBlock}>
          <Text style={styles.actionHint}>¿Qué quieres hacer?</Text>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Rechazar llamada"
              disabled={acting}
              onPress={reject}
              style={({ pressed }) => [
                styles.actionButton,
                styles.reject,
                acting ? styles.disabled : undefined,
                pressed ? styles.pressed : undefined,
              ]}>
              <MaterialCommunityIcons name="phone-hangup" size={28} color="#FFFFFF" />
              <Text style={styles.actionText}>Rechazar</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Responder llamada"
              disabled={acting}
              onPress={() => { accept().catch(() => undefined); }}
              style={({ pressed }) => [
                styles.actionButton,
                styles.accept,
                acting ? styles.disabled : undefined,
                pressed ? styles.pressed : undefined,
              ]}>
              <MaterialCommunityIcons name={isVideo ? 'video' : 'phone'} size={28} color="#FFFFFF" />
              <Text style={styles.actionText}>Responder</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#070A10',
    paddingHorizontal: 20,
  },
  topRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  securePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(158,229,176,0.12)',
    backgroundColor: 'rgba(20,34,26,0.92)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  secureText: { color: '#CDEBD5', fontSize: 12, fontWeight: '700' },
  incomingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.055)',
    backgroundColor: 'rgba(16,22,31,0.82)',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#55D98B',
  },
  incomingText: {
    color: '#B8C1CE',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.9,
  },
  identityStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  avatarHalo: {
    width: 166,
    height: 166,
    borderRadius: 83,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(236,70,74,0.22)',
    backgroundColor: 'rgba(227,30,36,0.12)',
    marginBottom: 26,
  },
  avatar: {
    width: 122,
    height: 122,
    borderRadius: 61,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E31E24',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 46,
    fontWeight: '800',
  },
  name: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    maxWidth: '92%',
  },
  modeBadge: {
    marginTop: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    backgroundColor: 'rgba(20,26,36,0.92)',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  modeText: {
    color: '#D8DEE8',
    fontSize: 13,
    fontWeight: '700',
  },
  helper: {
    color: '#8F99A8',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 14,
    maxWidth: 290,
  },
  actionBlock: {
    alignItems: 'center',
    paddingTop: 10,
  },
  actionHint: {
    color: '#AEB6C2',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 12,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    width: '100%',
  },
  actionButton: {
    flex: 1,
    maxWidth: 164,
    minHeight: 78,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  reject: { backgroundColor: '#D83B3B' },
  accept: { backgroundColor: '#169B55' },
  disabled: { opacity: 0.48 },
  pressed: { opacity: 0.84, transform: [{ scale: 0.97 }] },
  actionText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
});
