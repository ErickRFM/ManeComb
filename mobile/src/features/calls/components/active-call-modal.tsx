// RC-RTC-FINALIZATION-20260805 — UI global de llamada activa.
// No depende de Chat: puede mostrarse desde Mapa, Checklist, Radio, Perfil o cualquier navegador.

import React, { createElement, useEffect, useRef } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RTCViewComponent } from '@/src/native/webrtc';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { useAppStore } from '@/src/store/use-app-store';
import { useCallStore } from '../call-store';
import type { CallPhase } from '../call-types';

function formatDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function phaseCopy(phase: CallPhase): string {
  switch (phase) {
    case 'OUTGOING_RINGING':
      return 'Llamando...';
    case 'CONNECTING':
      return 'Conectando audio seguro...';
    case 'CONNECTED':
      return 'En llamada';
    case 'RECONNECTING':
      return 'Recuperando conexión...';
    case 'ENDING':
      return 'Llamada finalizada';
    case 'FAILED':
      return 'No se pudo mantener la llamada';
    default:
      return '';
  }
}

function failureCopy(code: string | null): string {
  switch (code) {
    case 'rtc_config_unavailable':
      return 'No se pudo obtener la configuración segura de red.';
    case 'media_capture_failed':
      return 'No fue posible acceder al micrófono.';
    case 'camera_unavailable':
      return 'No fue posible acceder a la cámara.';
    case 'rtc_join_forbidden':
      return 'Tu sesión ya no puede entrar a esta llamada.';
    case 'rtc_join_not_accepted':
      return 'La llamada aún no estaba lista para conectar.';
    case 'rtc_join_call_ended':
    case 'rtc_join_unknown_call':
      return 'La llamada ya terminó.';
    case 'rtc_join_timeout':
      return 'El servidor no confirmó la conexión a tiempo.';
    case 'reconnect_timeout':
      return 'La señal no se recuperó dentro del tiempo permitido.';
    case 'peer_left':
      return 'La otra persona salió de la llamada.';
    case 'ice_failed':
    case 'ice_restart_failed':
      return 'No se pudo establecer una ruta de audio estable.';
    default:
      return 'Verifica tu conexión e inténtalo nuevamente.';
  }
}

function VideoSurface({
  stream,
  muted,
  mirror,
  label,
}: {
  stream: any | null;
  muted: boolean;
  mirror: boolean;
  label: string;
}): React.ReactElement {
  const webVideoRef = useRef<any>(null);
  const videoTracks = stream?.getVideoTracks?.() || [];
  const hasLiveVideo = videoTracks.some((track: any) => track?.readyState !== 'ended');
  const RTCView = Platform.OS === 'web' ? null : RTCViewComponent;

  useEffect(() => {
    if (webVideoRef.current) webVideoRef.current.srcObject = hasLiveVideo ? stream : null;
  }, [hasLiveVideo, stream]);

  return (
    <View style={styles.videoSurface}>
      {Platform.OS === 'web' && hasLiveVideo
        ? createElement('video', {
            autoPlay: true,
            playsInline: true,
            muted,
            ref: webVideoRef,
            style: {
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              backgroundColor: '#070A10',
              transform: mirror ? 'scaleX(-1)' : undefined,
            },
          })
        : RTCView && hasLiveVideo
          ? createElement(RTCView as any, {
              streamURL: stream?.toURL?.() || '',
              objectFit: 'cover',
              mirror,
              zOrder: 0,
              style: StyleSheet.absoluteFillObject,
            })
          : (
            <View style={styles.videoFallback}>
              <MaterialCommunityIcons name="video-off-outline" size={34} color="#AAB2C0" />
              <Text style={styles.videoFallbackText}>Esperando video</Text>
            </View>
          )}
      <View style={styles.videoLabelShell}>
        <Text style={styles.videoLabel}>{label}</Text>
      </View>
    </View>
  );
}

export function ActiveCallModal(): React.ReactElement | null {
  const insets = useSafeAreaInsets();
  const phase = useCallStore((state) => state.phase);
  const mode = useCallStore((state) => state.mode);
  const callerName = useCallStore((state) => state.callerName);
  const conversationId = useCallStore((state) => state.conversationId);
  const conversations = useAppStore((state) => state.conversations);
  const currentUserId = useAppStore((state) => state.user?.id || null);
  const elapsedSeconds = useCallStore((state) => state.elapsedSeconds);
  const failureCode = useCallStore((state) => state.failureCode);
  const isMuted = useCallStore((state) => state.isMuted);
  const isCameraEnabled = useCallStore((state) => state.isCameraEnabled);
  const localStream = useCallStore((state) => state.localStream);
  const remoteStream = useCallStore((state) => state.remoteStream);
  const toggleMute = useCallStore((state) => state.toggleMute);
  const toggleCamera = useCallStore((state) => state.toggleCamera);
  const endCall = useCallStore((state) => state.endCall);

  const visible =
    phase !== 'IDLE' &&
    phase !== 'INCOMING_RINGING';
  if (!visible) return null;

  const isTerminal = phase === 'ENDING' || phase === 'FAILED';
  const isVideo = mode === 'video';
  const conversation = conversations.find((entry) => entry.id === conversationId) || null;
  const peer = conversation?.participants.find((participant) => participant.id !== currentUserId) || null;
  const title = callerName || peer?.name || conversation?.title || 'Contacto operativo';
  const subtitle = phase === 'FAILED' ? failureCopy(failureCode) : phaseCopy(phase);

  return (
    <Modal
      visible
      animationType="fade"
      statusBarTranslucent
      onRequestClose={isTerminal ? undefined : endCall}>
      <View
        style={[
          styles.screen,
          { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 18 },
        ]}>
        <View style={styles.topRow}>
          <View style={styles.securePill}>
            <MaterialCommunityIcons name="shield-lock-outline" size={15} color="#9EE5B0" />
            <Text style={styles.secureText}>ManeComb · llamada segura</Text>
          </View>
          {phase === 'CONNECTED' || phase === 'RECONNECTING' ? (
            <Text style={styles.timer}>{formatDuration(elapsedSeconds)}</Text>
          ) : null}
        </View>

        {isVideo ? (
          <View style={styles.videoStage}>
            <VideoSurface stream={remoteStream} muted={false} mirror={false} label={title} />
            {localStream && isCameraEnabled ? (
              <View style={styles.localPreview}>
                <VideoSurface stream={localStream} muted mirror label="Tú" />
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.audioStage}>
            <View style={styles.avatarHalo}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{title.trim().charAt(0).toUpperCase() || '?'}</Text>
              </View>
            </View>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            <View style={styles.audioBadge}>
              <MaterialCommunityIcons
                name={phase === 'RECONNECTING' ? 'signal-off' : 'waveform'}
                size={18}
                color={phase === 'RECONNECTING' ? '#F6C76D' : '#9EE5B0'}
              />
              <Text style={styles.audioBadgeText}>Audio de cabina</Text>
            </View>
          </View>
        )}

        <View style={styles.statusBlock}>
          <Text style={[styles.status, phase === 'FAILED' ? styles.statusFailed : undefined]}>
            {subtitle}
          </Text>
          {phase === 'RECONNECTING' ? (
            <Text style={styles.helper}>No cuelgues; estamos intentando recuperar el audio.</Text>
          ) : null}
        </View>

        {!isTerminal ? (
          <View style={styles.controls}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isMuted ? 'Activar micrófono' : 'Silenciar micrófono'}
              onPress={toggleMute}
              disabled={phase === 'OUTGOING_RINGING'}
              style={({ pressed }) => [
                styles.control,
                isMuted ? styles.controlActive : undefined,
                phase === 'OUTGOING_RINGING' ? styles.controlDisabled : undefined,
                pressed ? styles.pressed : undefined,
              ]}>
              <MaterialCommunityIcons
                name={isMuted ? 'microphone-off' : 'microphone'}
                size={25}
                color="#FFFFFF"
              />
              <Text style={styles.controlText}>{isMuted ? 'Activar' : 'Silenciar'}</Text>
            </Pressable>

            {isVideo ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={isCameraEnabled ? 'Apagar cámara' : 'Encender cámara'}
                onPress={toggleCamera}
                disabled={phase === 'OUTGOING_RINGING'}
                style={({ pressed }) => [
                  styles.control,
                  !isCameraEnabled ? styles.controlActive : undefined,
                  phase === 'OUTGOING_RINGING' ? styles.controlDisabled : undefined,
                  pressed ? styles.pressed : undefined,
                ]}>
                <MaterialCommunityIcons
                  name={isCameraEnabled ? 'video-outline' : 'video-off-outline'}
                  size={25}
                  color="#FFFFFF"
                />
                <Text style={styles.controlText}>{isCameraEnabled ? 'Cámara' : 'Encender'}</Text>
              </Pressable>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={phase === 'OUTGOING_RINGING' ? 'Cancelar llamada' : 'Colgar llamada'}
              onPress={endCall}
              style={({ pressed }) => [styles.hangup, pressed ? styles.pressed : undefined]}>
              <MaterialCommunityIcons name="phone-hangup" size={27} color="#FFFFFF" />
              <Text style={styles.controlText}>
                {phase === 'OUTGOING_RINGING' ? 'Cancelar' : 'Colgar'}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#080B11',
    paddingHorizontal: 20,
  },
  topRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  securePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 999,
    backgroundColor: '#14221A',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  secureText: { color: '#CDEBD5', fontSize: 12, fontWeight: '700' },
  timer: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', letterSpacing: 0.6 },
  audioStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 10,
  },
  avatarHalo: {
    width: 146,
    height: 146,
    borderRadius: 73,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(227,30,36,0.13)',
    marginBottom: 24,
  },
  avatar: {
    width: 112,
    height: 112,
    borderRadius: 56,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E31E24',
  },
  avatarText: { color: '#FFFFFF', fontSize: 43, fontWeight: '800' },
  title: { color: '#FFFFFF', fontSize: 25, fontWeight: '800', maxWidth: '90%' },
  audioBadge: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    backgroundColor: '#141A24',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  audioBadgeText: { color: '#D8DEE8', fontSize: 13, fontWeight: '700' },
  videoStage: {
    flex: 1,
    marginTop: 14,
    marginBottom: 12,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#0F141D',
  },
  videoSurface: {
    flex: 1,
    minHeight: 150,
    backgroundColor: '#0F141D',
    overflow: 'hidden',
  },
  videoFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  videoFallbackText: { color: '#AAB2C0', fontSize: 13, fontWeight: '700' },
  videoLabelShell: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(5,8,13,0.72)',
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  videoLabel: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  localPreview: {
    position: 'absolute',
    right: 12,
    top: 12,
    width: 112,
    height: 154,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.72)',
    backgroundColor: '#171D27',
  },
  statusBlock: { alignItems: 'center', minHeight: 58, justifyContent: 'center', paddingHorizontal: 8 },
  status: { color: '#DCE2EB', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  statusFailed: { color: '#FF9699' },
  helper: { color: '#9BA4B2', fontSize: 12, marginTop: 5, textAlign: 'center' },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingTop: 14,
  },
  control: {
    width: 76,
    minHeight: 68,
    borderRadius: 22,
    backgroundColor: '#1D2531',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  controlActive: { backgroundColor: '#414B5B' },
  controlDisabled: { opacity: 0.42 },
  hangup: {
    width: 82,
    minHeight: 68,
    borderRadius: 22,
    backgroundColor: '#D83B3B',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  controlText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  pressed: { opacity: 0.82, transform: [{ scale: 0.97 }] },
});
