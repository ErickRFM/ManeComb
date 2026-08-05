// RC-MOBILE-CALLS-PRODUCTION-01 Bloque C.2/C.3/C.5/C.7/C.8 — Runtime nativo: PROPIETARIO UNICO del
// peer, media, candidatos, negociacion y cleanup de UNA llamada. Vive en features/calls (no en Chat).
// Las DECISIONES deterministas (offerer, cola ICE, CONNECTED, ICE config) estan en los cores puros
// (call-ice/call-peer), aqui probados; esta capa es la glue nativa (se valida en dispositivo).

import { getRtcIceConfigRequest } from '@/src/api/client';
import {
  RTCPeerConnection as NativeRTCPeerConnection,
  createRTCIceCandidate,
  createRTCSessionDescription,
} from '@/src/native/webrtc';

import { resolveIceConfig, type RawIceConfig } from './call-ice';
import { createIdempotentCleanup } from './call-cleanup';
import { acquireLocalMedia, setMicEnabled, stopLocalMedia, type LocalMedia } from './call-media';
import {
  createIceQueue,
  evaluateConnected,
  isCanonicalOfferer,
  remoteAudioSignals,
} from './call-peer';
import type { CallDirection, CallMode, CallSocket } from './call-types';

export interface CallRuntime {
  stop(): void;
  setMicEnabled(enabled: boolean): void;
}

export interface CallRuntimeParams {
  callId: string;
  direction: CallDirection;
  mode: CallMode;
  socket: CallSocket;
  onConnected: () => void;
  onFailed: (code: string) => void;
  // inyectable para pruebas/plataforma
  fetchIceConfig?: () => Promise<RawIceConfig>;
}

export type CallRuntimeFactory = (params: CallRuntimeParams) => CallRuntime;

// Factory nativo por defecto. Secuencia (C.3/C.4/C.5): ICE config -> media -> peer -> join ->
// participants -> offer/answer -> ICE -> CONNECTED. Nunca crea el peer sin ICE config valida.
export const createNativeCallRuntime: CallRuntimeFactory = (params) => {
  const { callId, direction, mode, socket, onConnected, onFailed } = params;
  const fetchIceConfig = params.fetchIceConfig || (() => getRtcIceConfigRequest() as Promise<RawIceConfig>);

  let stopped = false;
  let peer: any = null;
  let media: LocalMedia | null = null;
  let remoteStream: any = null;
  let connectedReported = false;
  let participantCount = 0;
  const iceQueue = createIceQueue<RTCIceCandidateInit>(callId);

  const fail = (code: string) => {
    if (stopped) return;
    onFailed(code);
  };

  const maybeConnected = () => {
    if (stopped || connectedReported || !peer) return;
    const audio = remoteAudioSignals(remoteStream);
    const connected = evaluateConnected({
      participantCount,
      connectionState: String(peer.connectionState || ''),
      hasRemoteAudioTrack: audio.hasRemoteAudioTrack,
      remoteAudioTrackLive: audio.remoteAudioTrackLive,
    });
    if (connected) {
      connectedReported = true;
      onConnected();
    }
  };

  const emit = (event: string, payload: Record<string, unknown>) => {
    socket.emit(event, { callId, ...payload });
  };

  // --- Listeners de signaling (filtrados por callId; otra llamada se ignora) ---
  const onParticipants = (payload: any) => {
    if (stopped || !payload) return;
    const list = Array.isArray(payload.participants) ? payload.participants : [];
    participantCount = list.length;
    // C.5: el CALLER es el offerer canonico; crea la offer al confirmarse los 2 usuarios.
    if (participantCount === 2 && isCanonicalOfferer(direction)) {
      void createAndSendOffer();
    }
    maybeConnected();
  };

  let offerCreated = false;
  const createAndSendOffer = async () => {
    if (stopped || offerCreated || !peer) return;
    offerCreated = true; // evita offers duplicadas por participants repetidos/reconnect
    try {
      const offer = await peer.createOffer({});
      if (stopped) return;
      await peer.setLocalDescription(offer);
      emit('rtc:offer', { offer, mode });
    } catch {
      fail('negotiation_failed');
    }
  };

  const onRemoteOffer = async (payload: any) => {
    if (stopped || !payload || payload.callId !== callId || !peer) return; // otra llamada -> ignora
    try {
      await peer.setRemoteDescription(createRTCSessionDescription(payload.offer));
      iceQueue.markRemoteReady();
      await drainIce();
      const answer = await peer.createAnswer();
      if (stopped) return;
      await peer.setLocalDescription(answer);
      emit('rtc:answer', { answer });
    } catch {
      fail('negotiation_failed');
    }
  };

  const onRemoteAnswer = async (payload: any) => {
    if (stopped || !payload || payload.callId !== callId || !peer) return;
    try {
      await peer.setRemoteDescription(createRTCSessionDescription(payload.answer));
      iceQueue.markRemoteReady();
      await drainIce();
    } catch {
      fail('negotiation_failed');
    }
  };

  const onRemoteIce = async (payload: any) => {
    if (stopped || !payload || payload.callId !== callId || !peer || !payload.candidate) return;
    // encola hasta tener remote description; luego se drena en orden
    if (!iceQueue.isRemoteReady()) {
      iceQueue.add(callId, payload.candidate);
      return;
    }
    try {
      await peer.addIceCandidate(createRTCIceCandidate(payload.candidate));
    } catch {
      // un candidato fallido no cae la llamada
    }
  };

  const drainIce = async () => {
    for (const candidate of iceQueue.drain()) {
      try {
        await peer.addIceCandidate(createRTCIceCandidate(candidate));
      } catch {
        // best-effort
      }
    }
  };

  socket.on('rtc:participants', onParticipants);
  socket.on('rtc:offer', onRemoteOffer);
  socket.on('rtc:answer', onRemoteAnswer);
  socket.on('rtc:ice-candidate', onRemoteIce);

  const cleanup = createIdempotentCleanup([
    () => socket.off('rtc:participants', onParticipants),
    () => socket.off('rtc:offer', onRemoteOffer),
    () => socket.off('rtc:answer', onRemoteAnswer),
    () => socket.off('rtc:ice-candidate', onRemoteIce),
    () => {
      if (peer) {
        peer.onicecandidate = null;
        peer.ontrack = null;
        peer.onconnectionstatechange = null;
        try {
          peer.close();
        } catch {
          // best-effort
        }
      }
      peer = null;
    },
    () => stopLocalMedia(media),
    () => {
      media = null;
      remoteStream = null;
    },
    () => iceQueue.reset(null),
  ]);

  // --- Arranque asincrono: ICE config -> media -> peer ---
  const start = async () => {
    const ice = await resolveIceConfig(fetchIceConfig);
    if (stopped) return;
    if (!ice.ok) {
      fail('rtc_config_unavailable'); // NO fallback silencioso a STUN
      return;
    }

    let localMedia: LocalMedia;
    try {
      localMedia = await acquireLocalMedia(mode);
    } catch {
      fail('media_capture_failed');
      return;
    }
    if (stopped) {
      stopLocalMedia(localMedia);
      return;
    }
    media = localMedia;

    if (!NativeRTCPeerConnection) {
      fail('webrtc_unavailable');
      return;
    }
    peer = new NativeRTCPeerConnection({ iceServers: ice.iceServers as RTCIceServer[] });
    media.audioTracks.forEach((track) => peer.addTrack(track as unknown as MediaStreamTrack, media!.stream));

    peer.onicecandidate = (event: { candidate?: RTCIceCandidateInit | null }) => {
      if (stopped || !event || !event.candidate) return;
      emit('rtc:ice-candidate', { candidate: event.candidate });
    };
    peer.ontrack = (event: { streams: any[] }) => {
      if (stopped) return;
      remoteStream = event.streams && event.streams[0] ? event.streams[0] : remoteStream;
      maybeConnected();
    };
    peer.onconnectionstatechange = () => {
      if (stopped || !peer) return;
      const cs = String(peer.connectionState || '');
      if (cs === 'failed') fail('ice_failed');
      else maybeConnected();
    };

    // Unirse a la sala autoritativa por callId (C.1) — solo despues de aceptar.
    emit('rtc:join', {});
  };

  void start();

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      cleanup();
    },
    setMicEnabled(enabled: boolean) {
      setMicEnabled(media, enabled);
    },
  };
};
