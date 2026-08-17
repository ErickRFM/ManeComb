import { useEffect, useMemo, useRef } from 'react';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { useAppStore } from '@/src/store/use-app-store';
import { getPeerParticipant } from '@shared/communication';
import { usePortalCommunicationStore } from './communication-store';
import { usePortalCallStore } from './call-store';
import './communication.css';

function callStatusLabel(phase: string, mode: string | null, endResult: string | null) {
  switch (phase) {
    case 'OUTGOING_RINGING': return mode === 'video' ? 'Videollamando…' : 'Llamando…';
    case 'INCOMING_RINGING': return mode === 'video' ? 'Videollamada entrante' : 'Llamada entrante';
    case 'CONNECTING': return 'Conectando…';
    case 'CONNECTED': return 'Conectada';
    case 'RECONNECTING': return 'Recuperando conexión…';
    case 'FAILED': return 'No fue posible completar la llamada';
    case 'ENDING':
      if (endResult === 'rejected') return 'Llamada rechazada';
      if (endResult === 'busy') return 'Usuario ocupado';
      if (endResult === 'no_answer') return 'Sin respuesta';
      if (endResult === 'answered_elsewhere') return 'Respondida en otro dispositivo';
      return 'Llamada finalizada';
    default: return '';
  }
}

function failureLabel(code: string | null) {
  switch (code) {
    case 'media_permission_denied': return 'Permite micrófono y cámara en el navegador para continuar.';
    case 'media_device_unavailable': return 'No se encontró el micrófono o la cámara necesarios.';
    case 'media_device_busy': return 'El micrófono o la cámara están siendo usados por otra aplicación.';
    case 'microphone_unavailable': return 'No hay una pista de micrófono disponible.';
    case 'camera_unavailable': return 'No hay una pista de cámara disponible.';
    case 'rtc_config_unavailable': return 'No se pudo obtener la configuración segura de llamada.';
    case 'rtc_join_connected_elsewhere': return 'La llamada ya está activa en otro dispositivo.';
    case 'reconnect_timeout': return 'La llamada terminó porque no se recuperó la conexión.';
    case 'ice_timeout': return 'La conexión de audio/video tardó demasiado.';
    default: return code ? 'La llamada no pudo continuar.' : '';
  }
}

function formatElapsed(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function initials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase()).join('') || 'MC';
}

export function PortalCallOverlay() {
  const userId = useAppStore((state) => state.user?.id || null);
  const conversations = usePortalCommunicationStore((state) => state.conversations);
  const {
    acceptIncomingCall,
    callerName,
    cancelOutgoingCall,
    connectedAt,
    conversationId,
    elapsedSeconds,
    endCall,
    endResult,
    failureCode,
    isCameraEnabled,
    isMuted,
    localStream,
    mode,
    phase,
    rejectIncomingCall,
    remoteStream,
    toggleCamera,
    toggleMute,
  } = usePortalCallStore();
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const peer = useMemo(() => {
    const conversation = conversations.find((entry) => entry.id === conversationId) || null;
    return getPeerParticipant(conversation, userId);
  }, [conversationId, conversations, userId]);
  const displayName = callerName || peer?.name || 'Contacto ManeComb';

  useEffect(() => {
    const video = remoteVideoRef.current;
    if (!video) return;
    video.srcObject = remoteStream;
    if (remoteStream) void video.play().catch(() => undefined);
    return () => { video.srcObject = null; };
  }, [remoteStream, mode, phase]);

  useEffect(() => {
    const video = localVideoRef.current;
    if (!video) return;
    video.srcObject = localStream;
    if (localStream) void video.play().catch(() => undefined);
    return () => { video.srcObject = null; };
  }, [localStream, mode, phase]);

  useEffect(() => {
    const audio = remoteAudioRef.current;
    if (!audio) return;
    audio.srcObject = remoteStream;
    if (remoteStream) void audio.play().catch(() => undefined);
    return () => { audio.srcObject = null; };
  }, [remoteStream, mode, phase]);

  if (phase === 'IDLE') return null;

  const isIncoming = phase === 'INCOMING_RINGING';
  const isOutgoing = phase === 'OUTGOING_RINGING';
  const isActive = phase === 'CONNECTED' || phase === 'RECONNECTING';
  const showVideo = mode === 'video' && ['CONNECTING', 'CONNECTED', 'RECONNECTING'].includes(phase);
  const modal = isIncoming || isOutgoing || phase === 'CONNECTING' || showVideo || phase === 'FAILED' || phase === 'ENDING';
  const status = callStatusLabel(phase, mode, endResult);

  return (
    <div className="portal-call-layer" data-modal={modal ? 'true' : 'false'} role="dialog" aria-modal={modal || undefined} aria-label={`${status}: ${displayName}`}>
      <div className="portal-call-card" data-floating={!modal ? 'true' : 'false'}>
        {showVideo ? (
          <div className="portal-call-video-stage">
            {remoteStream ? (
              <video ref={remoteVideoRef} className="portal-call-remote-video" autoPlay playsInline />
            ) : (
              <div className="portal-comms-empty">
                <div className="portal-comms-avatar">{initials(displayName)}</div>
              </div>
            )}
            {localStream && isCameraEnabled ? (
              <video ref={localVideoRef} className="portal-call-local-video" autoPlay muted playsInline />
            ) : null}
          </div>
        ) : null}

        {mode === 'audio' && remoteStream ? <audio ref={remoteAudioRef} autoPlay /> : null}

        <div className="portal-call-copy">
          {!showVideo ? <div className="portal-comms-avatar" style={{ margin: '0 auto 12px' }}>{initials(displayName)}</div> : null}
          <h2 className="portal-call-name">{displayName}</h2>
          <p className="portal-call-status">
            {status}{connectedAt && isActive ? ` · ${formatElapsed(elapsedSeconds)}` : ''}
          </p>
        </div>

        {failureCode ? <p className="portal-call-error">{failureLabel(failureCode)}</p> : null}

        <div className="portal-call-actions">
          {isIncoming ? (
            <>
              <button className="portal-call-button" data-tone="danger" aria-label="Rechazar llamada" onClick={rejectIncomingCall}>
                <MaterialCommunityIcons name="phone-hangup" size={22} color="#FFFFFF" />
              </button>
              <button className="portal-call-button" data-tone="success" aria-label="Responder llamada" onClick={() => void acceptIncomingCall()}>
                <MaterialCommunityIcons name="phone" size={22} color="#FFFFFF" />
              </button>
            </>
          ) : null}

          {isOutgoing ? (
            <button className="portal-call-button" data-tone="danger" aria-label="Cancelar llamada" onClick={cancelOutgoingCall}>
              <MaterialCommunityIcons name="phone-hangup" size={22} color="#FFFFFF" />
            </button>
          ) : null}

          {phase === 'CONNECTING' || isActive ? (
            <>
              <button className="portal-call-button" data-active={isMuted ? 'true' : 'false'} aria-label={isMuted ? 'Activar micrófono' : 'Silenciar micrófono'} onClick={toggleMute}>
                <MaterialCommunityIcons name={isMuted ? 'microphone-off' : 'microphone'} size={21} color="#FFFFFF" />
              </button>
              {mode === 'video' ? (
                <button className="portal-call-button" data-active={!isCameraEnabled ? 'true' : 'false'} aria-label={isCameraEnabled ? 'Apagar cámara' : 'Encender cámara'} onClick={toggleCamera}>
                  <MaterialCommunityIcons name={isCameraEnabled ? 'video' : 'video-off'} size={21} color="#FFFFFF" />
                </button>
              ) : null}
              <button className="portal-call-button" data-tone="danger" aria-label="Colgar" onClick={endCall}>
                <MaterialCommunityIcons name="phone-hangup" size={22} color="#FFFFFF" />
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
