import type { CallDirection, CallMode, CallSocket } from '@shared/communication';
import {
  createIceQueue,
  createIdempotentCleanup,
  evaluateConnected,
  isCanonicalOfferer,
  remoteAudioSignals,
} from '@shared/communication';
import { getPortalRtcIceConfig } from './api';

export const WEB_RTC_JOIN_ACK_TIMEOUT_MS = 10_000;
export const WEB_RTC_DISCONNECT_GRACE_MS = 15_000;

export interface WebCallRuntime {
  stop(): void;
  setMicEnabled(enabled: boolean): void;
  setCameraEnabled(enabled: boolean): void;
}

export type WebCallRuntimeParams = {
  callId: string;
  direction: CallDirection;
  mode: CallMode;
  socket: CallSocket;
  onLocalStream?: (stream: MediaStream | null) => void;
  onRemoteStream?: (stream: MediaStream | null) => void;
  onConnected: () => void;
  onReconnecting?: () => void;
  onReconnected?: () => void;
  onFailed: (code: string) => void;
};

function payloadBelongsToCall(payload: any, callId: string) {
  if (!payload) return false;
  if (payload.callId != null) return String(payload.callId) === callId;
  const roomId = String(payload.roomId || '');
  return roomId === `call:${callId}` || roomId === `rtc:call:${callId}`;
}

function countLogicalParticipants(payload: any) {
  const participants = Array.isArray(payload?.participants) ? payload.participants : [];
  return new Set(
    participants
      .map((participant: any) => String(participant?.userId || participant?.socketId || '').trim())
      .filter(Boolean)
  ).size;
}

function resolveJoinFailure(ack: any) {
  switch (String(ack?.reason || ack?.code || '').trim()) {
    case 'busy': return 'rtc_join_busy';
    case 'forbidden': return 'rtc_join_forbidden';
    case 'not_accepted': return 'rtc_join_not_accepted';
    case 'call_ended': return 'rtc_join_call_ended';
    case 'unknown_call': return 'rtc_join_unknown_call';
    case 'already_connected_elsewhere': return 'rtc_join_connected_elsewhere';
    case 'ack_timeout': return 'rtc_join_timeout';
    default: return 'rtc_join_failed';
  }
}

function mediaFailureCode(error: unknown) {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'media_permission_denied';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'media_device_unavailable';
  if (name === 'NotReadableError' || name === 'TrackStartError') return 'media_device_busy';
  return 'media_capture_failed';
}

async function acquireBrowserMedia(mode: CallMode) {
  if (!globalThis.navigator?.mediaDevices?.getUserMedia) {
    throw new Error('webrtc_media_unavailable');
  }
  return await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: mode === 'video'
      ? {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        }
      : false,
  });
}

export function createWebCallRuntime(params: WebCallRuntimeParams): WebCallRuntime {
  const {
    callId,
    direction,
    mode,
    socket,
    onConnected,
    onFailed,
    onLocalStream = () => undefined,
    onRemoteStream = () => undefined,
    onReconnecting = () => undefined,
    onReconnected = () => undefined,
  } = params;

  let stopped = false;
  let failureReported = false;
  let joined = false;
  let peer: RTCPeerConnection | null = null;
  let localStream: MediaStream | null = null;
  let remoteStream: MediaStream | null = null;
  let participantCount = 0;
  let initiallyConnected = false;
  let reconnecting = false;
  let disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let offerInFlight = false;
  let initialOfferCreated = false;
  let relayReported = false;
  const iceQueue = createIceQueue<RTCIceCandidateInit>(callId);

  const clearDisconnectTimer = () => {
    if (disconnectTimer) clearTimeout(disconnectTimer);
    disconnectTimer = null;
  };

  const emit = (event: string, payload: Record<string, unknown> = {}) => {
    socket.emit(event, { callId, ...payload });
  };

  const fail = (code: string) => {
    if (stopped || failureReported) return;
    failureReported = true;
    clearDisconnectTimer();
    onFailed(code);
  };

  const reportRelayUsage = async () => {
    if (stopped || relayReported || !peer) return;
    relayReported = true;
    try {
      const reports = await peer.getStats();
      const candidates = new Map<string, any>();
      let selectedPair: any = null;
      reports.forEach((report: any) => {
        if (report.type === 'local-candidate' || report.type === 'remote-candidate') {
          candidates.set(report.id, report);
        }
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          if (!selectedPair || report.nominated || report.selected) selectedPair = report;
        }
      });
      if (!selectedPair) return;
      const local = candidates.get(selectedPair.localCandidateId);
      const remote = candidates.get(selectedPair.remoteCandidateId);
      emit('rtc:stats', {
        usedRelay: local?.candidateType === 'relay' || remote?.candidateType === 'relay',
      });
    } catch {
      // Diagnóstico best-effort. Nunca se exponen candidatos, IPs ni credenciales.
    }
  };

  const maybeConnected = () => {
    if (stopped || !peer) return;
    const audio = remoteAudioSignals(remoteStream);
    if (!evaluateConnected({
      participantCount,
      connectionState: peer.connectionState,
      hasRemoteAudioTrack: audio.hasRemoteAudioTrack,
      remoteAudioTrackLive: audio.remoteAudioTrackLive,
    })) return;

    clearDisconnectTimer();
    if (!initiallyConnected) {
      initiallyConnected = true;
      reconnecting = false;
      onConnected();
      void reportRelayUsage();
      return;
    }
    if (reconnecting) {
      reconnecting = false;
      onReconnected();
    }
  };

  const createAndSendOffer = async (iceRestart = false) => {
    if (stopped || !peer || offerInFlight) return;
    if (!iceRestart && initialOfferCreated) return;
    offerInFlight = true;
    if (!iceRestart) initialOfferCreated = true;
    try {
      const offer = await peer.createOffer(iceRestart ? { iceRestart: true } : undefined);
      if (stopped || !peer) return;
      await peer.setLocalDescription(offer);
      emit('rtc:offer', { offer, mode });
    } catch {
      fail(iceRestart ? 'ice_restart_failed' : 'negotiation_failed');
    } finally {
      offerInFlight = false;
    }
  };

  const beginReconnecting = () => {
    if (stopped || failureReported || !initiallyConnected || reconnecting) return;
    reconnecting = true;
    onReconnecting();
    clearDisconnectTimer();
    disconnectTimer = setTimeout(() => fail('reconnect_timeout'), WEB_RTC_DISCONNECT_GRACE_MS);
    if (isCanonicalOfferer(direction)) {
      try {
        peer?.restartIce?.();
      } catch {
        // createOffer({ iceRestart:true }) remains the authoritative retry.
      }
      void createAndSendOffer(true);
    }
  };

  const drainIce = async () => {
    if (!peer) return;
    for (const candidate of iceQueue.drain()) {
      try {
        await peer.addIceCandidate(candidate);
      } catch {
        // One invalid candidate does not invalidate all ICE candidates.
      }
    }
  };

  const onParticipants = (payload: any) => {
    if (!payloadBelongsToCall(payload, callId)) return;
    participantCount = countLogicalParticipants(payload);
    if (participantCount === 2 && isCanonicalOfferer(direction)) void createAndSendOffer(false);
    if (initiallyConnected && participantCount < 2) beginReconnecting();
    maybeConnected();
  };

  const onRemoteOffer = async (payload: any) => {
    if (stopped || !peer || !payloadBelongsToCall(payload, callId) || !payload.offer) return;
    try {
      await peer.setRemoteDescription(payload.offer as RTCSessionDescriptionInit);
      iceQueue.markRemoteReady();
      await drainIce();
      const answer = await peer.createAnswer();
      if (stopped || !peer) return;
      await peer.setLocalDescription(answer);
      emit('rtc:answer', { answer, mode });
    } catch {
      fail('negotiation_failed');
    }
  };

  const onRemoteAnswer = async (payload: any) => {
    if (stopped || !peer || !payloadBelongsToCall(payload, callId) || !payload.answer) return;
    try {
      await peer.setRemoteDescription(payload.answer as RTCSessionDescriptionInit);
      iceQueue.markRemoteReady();
      await drainIce();
    } catch {
      fail('negotiation_failed');
    }
  };

  const onRemoteIce = async (payload: any) => {
    if (stopped || !peer || !payloadBelongsToCall(payload, callId) || !payload.candidate) return;
    if (!iceQueue.isRemoteReady()) {
      iceQueue.add(callId, payload.candidate as RTCIceCandidateInit);
      return;
    }
    try {
      await peer.addIceCandidate(payload.candidate as RTCIceCandidateInit);
    } catch {
      // Other candidates may still establish the selected pair.
    }
  };

  const onRoomHangup = (payload: any) => {
    if (payloadBelongsToCall(payload, callId)) fail('peer_left');
  };

  const joinAuthoritativeRoom = () => new Promise<any>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ ok: false, reason: 'ack_timeout' });
    }, WEB_RTC_JOIN_ACK_TIMEOUT_MS);
    socket.emit('rtc:join', { callId }, (ack: any) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(ack && typeof ack === 'object' ? ack : { ok: false });
    });
  });

  const rejoinAfterSocketReconnect = async () => {
    if (stopped || !peer || !joined) return;
    const ack = await joinAuthoritativeRoom();
    if (!ack.ok) {
      fail(resolveJoinFailure(ack));
      return;
    }
    if (isCanonicalOfferer(direction)) void createAndSendOffer(true);
  };

  const onSocketDisconnect = () => beginReconnecting();
  const onSocketConnect = () => {
    if (reconnecting) void rejoinAfterSocketReconnect().catch(() => fail('rtc_rejoin_failed'));
  };

  socket.on('rtc:participants', onParticipants);
  socket.on('rtc:offer', onRemoteOffer);
  socket.on('rtc:answer', onRemoteAnswer);
  socket.on('rtc:ice-candidate', onRemoteIce);
  socket.on('rtc:hangup', onRoomHangup);
  socket.on('disconnect', onSocketDisconnect);
  socket.on('connect', onSocketConnect);

  const cleanup = createIdempotentCleanup([
    clearDisconnectTimer,
    () => socket.off('rtc:participants', onParticipants),
    () => socket.off('rtc:offer', onRemoteOffer),
    () => socket.off('rtc:answer', onRemoteAnswer),
    () => socket.off('rtc:ice-candidate', onRemoteIce),
    () => socket.off('rtc:hangup', onRoomHangup),
    () => socket.off('disconnect', onSocketDisconnect),
    () => socket.off('connect', onSocketConnect),
    () => {
      if (joined) emit('rtc:leave');
      joined = false;
    },
    () => {
      if (!peer) return;
      peer.onicecandidate = null;
      peer.ontrack = null;
      peer.onconnectionstatechange = null;
      try { peer.close(); } catch { /* best effort */ }
      peer = null;
    },
    () => {
      localStream?.getTracks().forEach((track) => track.stop());
      localStream = null;
      remoteStream = null;
      onLocalStream(null);
      onRemoteStream(null);
    },
    () => iceQueue.reset(null),
  ]);

  const start = async () => {
    let iceConfig;
    try {
      iceConfig = await getPortalRtcIceConfig();
    } catch {
      fail('rtc_config_unavailable');
      return;
    }
    if (stopped) return;
    if (!Array.isArray(iceConfig?.iceServers) || !iceConfig.iceServers.length) {
      fail('rtc_config_unavailable');
      return;
    }

    try {
      localStream = await acquireBrowserMedia(mode);
    } catch (error) {
      fail(error instanceof Error && error.message === 'webrtc_media_unavailable'
        ? 'webrtc_unavailable'
        : mediaFailureCode(error));
      return;
    }
    if (stopped) {
      localStream.getTracks().forEach((track) => track.stop());
      return;
    }
    if (!localStream.getAudioTracks().some((track) => track.readyState === 'live')) {
      fail('microphone_unavailable');
      return;
    }
    if (mode === 'video' && !localStream.getVideoTracks().some((track) => track.readyState === 'live')) {
      fail('camera_unavailable');
      return;
    }
    onLocalStream(localStream);

    try {
      peer = new RTCPeerConnection({ iceServers: iceConfig.iceServers });
    } catch {
      fail('peer_creation_failed');
      return;
    }

    localStream.getTracks().forEach((track) => peer?.addTrack(track, localStream!));
    peer.onicecandidate = (event) => {
      if (event.candidate) emit('rtc:ice-candidate', { candidate: event.candidate.toJSON() });
    };
    peer.ontrack = (event) => {
      if (stopped) return;
      if (event.streams?.[0]) {
        remoteStream = event.streams[0];
      } else if (event.track) {
        remoteStream = remoteStream || new MediaStream();
        if (!remoteStream.getTracks().some((track) => track.id === event.track.id)) {
          remoteStream.addTrack(event.track);
        }
      }
      onRemoteStream(remoteStream);
      maybeConnected();
    };
    peer.onconnectionstatechange = () => {
      if (!peer || stopped) return;
      if (peer.connectionState === 'connected') maybeConnected();
      else if (peer.connectionState === 'disconnected') beginReconnecting();
      else if (peer.connectionState === 'failed' || peer.connectionState === 'closed') fail('ice_failed');
    };

    const ack = await joinAuthoritativeRoom();
    if (stopped) return;
    if (!ack.ok) {
      fail(resolveJoinFailure(ack));
      return;
    }
    joined = true;
  };

  void start().catch(() => fail('runtime_start_failed'));

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      cleanup();
    },
    setMicEnabled(enabled) {
      localStream?.getAudioTracks().forEach((track) => { track.enabled = enabled; });
    },
    setCameraEnabled(enabled) {
      localStream?.getVideoTracks().forEach((track) => { track.enabled = enabled; });
    },
  };
}
