import React, { createElement, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { RTCViewComponent } from '@/src/native/webrtc';
import { startCallForegroundService, stopCallForegroundService } from '@/src/native/call-service';
import { selectFailureMessage, selectStatusLabel } from '../call-selectors';
import { useCallStore } from '../call-store';

function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

function VideoTile({
  stream,
  label,
  muted,
  mirror = false,
}: {
  stream: any | null;
  label: string;
  muted: boolean;
  mirror?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hasVideo = Boolean(
    stream?.getVideoTracks?.().some((track: any) => track.readyState === 'live' && track.enabled !== false)
  );

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  const RTCView = Platform.OS === 'web' ? null : RTCViewComponent;

  return (
    <View style={styles.videoTile}>
      {Platform.OS === 'web' && hasVideo
        ? createElement('video', {
            autoPlay: true,
            playsInline: true,
            muted,
            ref: videoRef as any,
            style: styles.webVideo as any,
          })
        : RTCView && hasVideo
          ? createElement(RTCView as any, {
              streamURL: stream?.toURL?.() || '',
              objectFit: 'cover',
              mirror,
              zOrder: mirror ? 1 : 0,
              style: styles.nativeVideo,
            })
          : (
            <View style={styles.videoFallback}>
              <MaterialCommunityIcons name="account" size={42} color="#d1d5db" />
            </View>
          )}
      <View style={styles.videoLabelShell}>
        <Text style={styles.videoLabel}>{label}</Text>
      </View>
    </View>
  );
}

export function IncomingCallModal(): React.ReactElement | null {
  const insets = useSafeAreaInsets();
  const phase = useCallStore((state) => state.phase);
  const callId = useCallStore((state) => state.callId);
  const displayName = useCallStore((state) => state.displayName);
  const mode = useCallStore((state) => state.mode);
  const elapsedSeconds = useCallStore((state) => state.elapsedSeconds);
  const isMuted = useCallStore((state) => state.isMuted);
  const isCameraEnabled = useCallStore((state) => state.isCameraEnabled);
  const localStream = useCallStore((state) => state.localStream);
  const remoteStream = useCallStore((state) => state.remoteStream);
  const acceptIncomingCall = useCallStore((state) => state.acceptIncomingCall);
  const rejectIncomingCall = useCallStore((state) => state.rejectIncomingCall);
  const cancelOutgoingCall = useCallStore((state) => state.cancelOutgoingCall);
  const endCall = useCallStore((state) => state.endCall);
  const toggleMute = useCallStore((state) => state.toggleMute);
  const toggleCamera = useCallStore((state) => state.toggleCamera);
  const statusLabel = useCallStore(selectStatusLabel);
  const failureMessage = useCallStore(selectFailureMessage);

  const [acting, setActing] = useState(false);
  const actingRef = useRef(false);
  const visible = phase !== 'IDLE';
  const isIncoming = phase === 'INCOMING_RINGING';
  const isOutgoing = phase === 'OUTGOING_RINGING';
  const isConnecting = phase === 'CONNECTING' || phase === 'RECONNECTING';
  const isConnected = phase === 'CONNECTED';
  const isTerminal = phase === 'ENDING' || phase === 'FAILED';
  const isVideo = mode === 'video';

  useEffect(() => {
    actingRef.current = false;
    setActing(false);
  }, [callId, phase]);

  useEffect(() => {
    if (!['CONNECTING', 'CONNECTED', 'RECONNECTING'].includes(phase)) return undefined;
    startCallForegroundService(isVideo);
    return () => {
      void stopCallForegroundService();
    };
  }, [isVideo, phase]);

  if (!visible) return null;

  const guard = (action: () => void) => () => {
    if (actingRef.current) return;
    actingRef.current = true;
    setActing(true);
    action();
  };

  const closeAction = isIncoming
    ? rejectIncomingCall
    : isOutgoing
      ? cancelOutgoingCall
      : endCall;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={guard(closeAction)}>
      <View style={styles.backdrop}>
        <View
          style={[
            styles.surface,
            {
              paddingTop: Math.max(insets.top, 16) + 12,
              paddingBottom: Math.max(insets.bottom, 16) + 12,
            },
          ]}>
          <View style={styles.header}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(displayName || '?').trim().charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={styles.name} numberOfLines={1}>
              {displayName || 'Contacto'}
            </Text>
            <Text style={styles.modeLabel}>
              {isVideo ? 'Videollamada' : 'Llamada de audio'}
            </Text>
            <View style={styles.statusRow}>
              {isConnecting ? <ActivityIndicator size="small" color="#ef4444" /> : null}
              <Text style={styles.status}>{statusLabel}</Text>
              {isConnected ? <Text style={styles.timer}>{formatDuration(elapsedSeconds)}</Text> : null}
            </View>
            {failureMessage ? <Text style={styles.failure}>{failureMessage}</Text> : null}
          </View>

          {isVideo && (isConnecting || isConnected) ? (
            <View style={styles.videoStage}>
              <VideoTile stream={remoteStream} label={displayName || 'Contacto'} muted={false} />
              <View style={styles.selfTile}>
                <VideoTile
                  stream={isCameraEnabled ? localStream : null}
                  label="Tú"
                  muted
                  mirror
                />
              </View>
            </View>
          ) : (
            <View style={styles.audioStage}>
              <MaterialCommunityIcons
                name={isConnected ? 'waveform' : 'phone-in-talk-outline'}
                size={64}
                color="#f9fafb"
              />
            </View>
          )}

          <View style={styles.actions}>
            {isIncoming ? (
              <>
                <CallButton
                  label="Rechazar"
                  icon="phone-hangup"
                  danger
                  disabled={acting}
                  onPress={guard(rejectIncomingCall)}
                />
                <CallButton
                  label="Aceptar"
                  icon="phone"
                  positive
                  disabled={acting}
                  onPress={guard(acceptIncomingCall)}
                />
              </>
            ) : null}

            {isOutgoing ? (
              <CallButton
                label="Cancelar"
                icon="phone-hangup"
                danger
                disabled={acting}
                onPress={guard(cancelOutgoingCall)}
              />
            ) : null}

            {(isConnecting || isConnected) ? (
              <>
                <CallButton
                  label={isMuted ? 'Activar' : 'Silenciar'}
                  icon={isMuted ? 'microphone-off' : 'microphone'}
                  active={isMuted}
                  onPress={toggleMute}
                />
                {isVideo ? (
                  <CallButton
                    label={isCameraEnabled ? 'Pausar' : 'Cámara'}
                    icon={isCameraEnabled ? 'video' : 'video-off'}
                    active={!isCameraEnabled}
                    onPress={toggleCamera}
                  />
                ) : null}
                <CallButton
                  label="Colgar"
                  icon="phone-hangup"
                  danger
                  disabled={acting}
                  onPress={guard(endCall)}
                />
              </>
            ) : null}

            {isTerminal ? (
              <View style={styles.resultMark}>
                <MaterialCommunityIcons
                  name={phase === 'FAILED' ? 'alert-circle-outline' : 'check-circle-outline'}
                  size={28}
                  color={phase === 'FAILED' ? '#fca5a5' : '#86efac'}
                />
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function CallButton({
  active = false,
  danger = false,
  disabled = false,
  icon,
  label,
  onPress,
  positive = false,
}: {
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  icon: string;
  label: string;
  onPress: () => void;
  positive?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        danger ? styles.actionDanger : undefined,
        positive ? styles.actionPositive : undefined,
        active ? styles.actionActive : undefined,
        pressed ? styles.pressed : undefined,
        disabled ? styles.disabled : undefined,
      ]}>
      <MaterialCommunityIcons name={icon as any} size={24} color="#ffffff" />
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  surface: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '94%',
    borderRadius: 28,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    paddingHorizontal: 20,
    alignItems: 'center',
    overflow: 'hidden',
  },
  header: { alignItems: 'center', width: '100%' },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#1f2937',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText: { color: '#f9fafb', fontSize: 30, fontWeight: '800' },
  name: { color: '#f9fafb', fontSize: 22, fontWeight: '800', textAlign: 'center' },
  modeLabel: { color: '#94a3b8', fontSize: 14, marginTop: 4 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  status: { color: '#e5e7eb', fontSize: 15, fontWeight: '700' },
  timer: { color: '#94a3b8', fontVariant: ['tabular-nums'], fontSize: 14 },
  failure: { color: '#fca5a5', textAlign: 'center', marginTop: 10, lineHeight: 19 },
  audioStage: {
    minHeight: 190,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoStage: {
    width: '100%',
    aspectRatio: 0.85,
    maxHeight: 480,
    marginTop: 18,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#020617',
  },
  videoTile: { flex: 1, backgroundColor: '#020617', overflow: 'hidden' },
  videoFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  nativeVideo: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, width: '100%', height: '100%' },
  webVideo: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    backgroundColor: '#000000',
  },
  videoLabelShell: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.58)',
  },
  videoLabel: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  selfTile: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    width: '34%',
    aspectRatio: 0.75,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.8)',
  },
  actions: {
    width: '100%',
    minHeight: 96,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingTop: 18,
  },
  actionButton: {
    minWidth: 76,
    minHeight: 68,
    borderRadius: 20,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#334155',
  },
  actionDanger: { backgroundColor: '#dc2626' },
  actionPositive: { backgroundColor: '#16a34a' },
  actionActive: { backgroundColor: '#475569' },
  actionLabel: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  resultMark: { minHeight: 68, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.55 },
});
