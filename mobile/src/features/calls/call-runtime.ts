import { getRtcIceConfigRequest } from '@/src/api/client';
import {
  RTCPeerConnection as NativeRTCPeerConnection,
  createRTCIceCandidate,
  createRTCSessionDescription,
} from '@/src/native/webrtc';

import { resolveIceConfig, type RawIceConfig } from './call-ice';
import { createIdempotentCleanup } from './call-cleanup';
import {
  acquireLocalMedia,
  setCameraEnabled,
  setMicEnabled,
  stopLocalMedia,
  type LocalMedia,
} from './call-media';
import {
  createIceQueue,
  evaluateConnected,
  isCanonicalOfferer,
  remoteAudioSignals,
} from './call-peer';
import type { CallDirection, CallMode, CallSocket } from './call-types';

const JOIN_ACK_TIMEOUT_MS = 12000;
const DISCONNECTED_FAIL_MS = 12000;

export interface CallRuntime {
  stop(): void;
  setMicEnabled(enabled: boolean): void;
  setCameraEnabled(enabled: boolean): void;
}

export interface CallRuntimeParams {
  callId: string;
  direction: CallDirection;
  mode: CallMode;
  socket: CallSocket;
  onConnected: () => void;
  onReconnecting: () => void;
  onFailed: (code: string) => void;
  onLocalStream: (stream: any | null) => void;
  onRemoteStream: (stream: any | null) => void;
  fetchIceConfig?: () => Promise<RawIceConfig>;
}

export type CallRuntimeFactory = (params: CallRuntimeParams) => CallRuntime;

export const createNativeCallRuntime: CallRuntimeFactory = (params) => {
  const {
    callId,
    direction,
    mode,
    socket,
    onConnected,
    onReconnecting,
    onFailed,
    onLocalStream,
    onRemoteStream,
  } = params;
  const fetchIceConfig =
    params.fetchIceConfig || (() => getRtcIceConfigRequest() as Promise<RawIceConfig>);
  const canonicalRoomId = `call:${callId}`;

  let stopped = false;
  let started = false;
  let peer: any = null;
  let media: LocalMedia | null = null;
  let iceServers: RTCIceServer[] = [];
  let remoteStream: any = null;
  let connectedReported = false;
  let participantCount = 0;
  let offerCreated = false;
  let peerGeneration = 0;
  let disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  const iceQueue = createIceQueue<RTCIceCandidateInit>(callId);

  const clearDisconnectTimer = () => {
    if (disconnectTimer) clearTimeout(disconnectTimer);
    disconnectTimer = null;
  };

  const fail = (code: string) => {
    if (stopped) return;
    clearDisconnectTimer();
    onFailed(code);
  };

  const emit = (event: string, payload: Record<string, unknown> = {}) => {
    socket.emit(event, { callId, ...payload });
  };

  const reportRelayUsage = async (activePeer: any) => {
    try {
      const stats = await activePeer.getStats?.();
      if (!stats) return;
      const candidates = new Map<string, any>();
      let selectedPair: any = null;
      stats.forEach((report: any) => {
        if (report.type === 'local-candidate' || report.type === 'remote-candidate') {
          candidates.set(report.id, report);
        }
        if (
          report.type === 'candidate-pair' &&
          report.state === 'succeeded' &&
          (!selectedPair || report.nominated || report.selected)
        ) {
          selectedPair = report;
        }
      });
      if (!selectedPair) return;
      const local = candidates.get(selectedPair.localCandidateId);
      const remote = candidates.get(selectedPair.remoteCandidateId);
      emit('rtc:stats', {
        usedRelay: local?.candidateType === 'relay' || remote?.candidateType === 'relay',
      });
    } catch {
      // Las estadisticas son observabilidad best-effort.
    }
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
    if (!connected) return;
    connectedReported = true;
    clearDisconnectTimer();
    onConnected();
    void reportRelayUsage(peer);
  };

  const drainIce = async () => {
    if (!peer) return;
    for (const candidate of iceQueue.drain()) {
      try {
        await peer.addIceCandidate(createRTCIceCandidate(candidate));
      } catch {
        // Un candidato invalido no debe tumbar toda la llamada.
      }
    }
  };

  const createAndSendOffer = async () => {
    if (stopped || offerCreated || !peer) return;
    offerCreated = true;
    const activePeer = peer;
    try {
      const offer = await activePeer.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: mode === 'video',
      });
      if (stopped || peer !== activePeer) return;
      await activePeer.setLocalDescription(offer);
      if (stopped || peer !== activePeer) return;
      emit('rtc:offer', { offer, mode });
    } catch {
      fail('negotiation_failed');
    }
  };

  const closePeer = () => {
    clearDisconnectTimer();
    if (peer) {
      peer.onicecandidate = null;
      peer.ontrack = null;
      peer.onconnectionstatechange = null;
      try {
        peer.close();
      } catch {
        // cleanup best-effort
      }
    }
    peer = null;
  };

  const buildPeer = () => {
    if (!NativeRTCPeerConnection || !media) {
      fail('webrtc_unavailable');
      return false;
    }

    closePeer();
    peerGeneration += 1;
    const generation = peerGeneration;
    connectedReported = false;
    offerCreated = false;
    participantCount = 0;
    remoteStream = null;
    onRemoteStream(null);
    iceQueue.reset(callId);

    const nextPeer = new NativeRTCPeerConnection({ iceServers });
    media.stream.getTracks?.().forEach((track: MediaStreamTrack) => {
      nextPeer.addTrack(track, media!.stream);
    });

    nextPeer.onicecandidate = (event: { candidate?: any | null }) => {
      if (stopped || generation !== peerGeneration || !event?.candidate) return;
      const candidate = event.candidate.toJSON?.() || event.candidate;
      emit('rtc:ice-candidate', { candidate });
    };
    nextPeer.ontrack = (event: { streams?: readonly any[] }) => {
      if (stopped || generation !== peerGeneration) return;
      remoteStream = event.streams?.[0] || remoteStream;
      onRemoteStream(remoteStream);
      maybeConnected();
    };
    nextPeer.onconnectionstatechange = () => {
      if (stopped || generation !== peerGeneration) return;
      const state = String(nextPeer.connectionState || '');
      if (state === 'connected') {
        clearDisconnectTimer();
        maybeConnected();
        return;
      }
      if (state === 'disconnected') {
        onReconnecting();
        clearDisconnectTimer();
        disconnectTimer = setTimeout(() => fail('ice_disconnected'), DISCONNECTED_FAIL_MS);
        return;
      }
      if (state === 'failed' || state === 'closed') {
        fail('ice_failed');
      }
    };

    peer = nextPeer;
    return true;
  };

  const joinCall = () =>
    new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error('join_ack_timeout'));
      }, JOIN_ACK_TIMEOUT_MS);
      socket.emit('rtc:join', { callId }, (ack: { ok?: boolean; reason?: string } = {}) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (!ack.ok) {
          reject(new Error(ack.reason || 'join_rejected'));
          return;
        }
        resolve();
      });
    });

  const rebuildAndJoin = async (reconnecting: boolean) => {
    if (stopped || !started) return;
    if (reconnecting) onReconnecting();
    if (!buildPeer()) return;
    try {
      await joinCall();
    } catch (error) {
      fail(error instanceof Error ? error.message : 'join_failed');
    }
  };

  const onParticipants = (payload: any) => {
    if (stopped || !payload || payload.roomId !== canonicalRoomId) return;
    const list = Array.isArray(payload.participants) ? payload.participants : [];
    participantCount = list.length;
    if (participantCount === 2 && isCanonicalOfferer(direction)) {
      void createAndSendOffer();
    }
    maybeConnected();
  };

  const onRemoteOffer = async (payload: any) => {
    if (stopped || !payload || payload.callId !== callId || !peer || !payload.offer) return;
    const activePeer = peer;
    try {
      await activePeer.setRemoteDescription(createRTCSessionDescription(payload.offer));
      if (stopped || peer !== activePeer) return;
      iceQueue.markRemoteReady();
      await drainIce();
      const answer = await activePeer.createAnswer();
      if (stopped || peer !== activePeer) return;
      await activePeer.setLocalDescription(answer);
      if (stopped || peer !== activePeer) return;
      emit('rtc:answer', { answer, mode });
    } catch {
      fail('negotiation_failed');
    }
  };

  const onRemoteAnswer = async (payload: any) => {
    if (stopped || !payload || payload.callId !== callId || !peer || !payload.answer) return;
    const activePeer = peer;
    try {
      await activePeer.setRemoteDescription(createRTCSessionDescription(payload.answer));
      if (stopped || peer !== activePeer) return;
      iceQueue.markRemoteReady();
      await drainIce();
    } catch {
      fail('negotiation_failed');
    }
  };

  const onRemoteIce = async (payload: any) => {
    if (stopped || !payload || payload.callId !== callId || !peer || !payload.candidate) return;
    if (!iceQueue.isRemoteReady()) {
      iceQueue.add(callId, payload.candidate);
      return;
    }
    try {
      await peer.addIceCandidate(createRTCIceCandidate(payload.candidate));
    } catch {
      // best-effort
    }
  };

  const onSocketConnect = () => {
    if (!started || stopped) return;
    void rebuildAndJoin(true);
  };

  socket.on('rtc:participants', onParticipants);
  socket.on('rtc:offer', onRemoteOffer);
  socket.on('rtc:answer', onRemoteAnswer);
  socket.on('rtc:ice-candidate', onRemoteIce);
  socket.on('connect', onSocketConnect);

  const cleanup = createIdempotentCleanup([
    () => socket.off('rtc:participants', onParticipants),
    () => socket.off('rtc:offer', onRemoteOffer),
    () => socket.off('rtc:answer', onRemoteAnswer),
    () => socket.off('rtc:ice-candidate', onRemoteIce),
    () => socket.off('connect', onSocketConnect),
    () => clearDisconnectTimer(),
    () => closePeer(),
    () => stopLocalMedia(media),
    () => {
      media = null;
      remoteStream = null;
      onLocalStream(null);
      onRemoteStream(null);
    },
    () => iceQueue.reset(null),
  ]);

  const start = async () => {
    const ice = await resolveIceConfig(fetchIceConfig);
    if (stopped) return;
    if (!ice.ok) {
      fail('rtc_config_unavailable');
      return;
    }
    iceServers = ice.iceServers as RTCIceServer[];

    try {
      media = await acquireLocalMedia(mode);
    } catch (error) {
      fail(error instanceof Error ? error.message : 'media_capture_failed');
      return;
    }
    if (stopped) {
      stopLocalMedia(media);
      return;
    }

    started = true;
    onLocalStream(media.stream);
    await rebuildAndJoin(false);
  };

  void start();

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      emit('rtc:leave');
      cleanup();
    },
    setMicEnabled(enabled: boolean) {
      setMicEnabled(media, enabled);
    },
    setCameraEnabled(enabled: boolean) {
      setCameraEnabled(media, enabled);
    },
  };
};
