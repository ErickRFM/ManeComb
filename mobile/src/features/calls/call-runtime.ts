// RC-RTC-FINALIZATION-20260805 — Runtime WebRTC global.
// Es el propietario unico del peer, streams, signaling de media, reconexion y cleanup de una llamada.

import { getRtcIceConfigRequest } from '@/src/api/client';
import {
  RTCPeerConnection as NativeRTCPeerConnection,
  createRTCIceCandidate,
  createRTCSessionDescription,
} from '@/src/native/webrtc';

import { createIdempotentCleanup } from './call-cleanup';
import { resolveIceConfig, type RawIceConfig } from './call-ice';
import {
  acquireLocalMedia,
  setCameraEnabled as setLocalCameraEnabled,
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

export const RTC_JOIN_ACK_TIMEOUT_MS = 10000;
export const RTC_DISCONNECT_GRACE_MS = 15000;

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
  onLocalStream?: (stream: any | null) => void;
  onRemoteStream?: (stream: any | null) => void;
  onConnected: () => void;
  onReconnecting?: () => void;
  onReconnected?: () => void;
  onFailed: (code: string) => void;

  // Dependencias inyectables para probar la glue sin cargar WebRTC nativo.
  fetchIceConfig?: () => Promise<RawIceConfig>;
  acquireMedia?: (mode: CallMode) => Promise<LocalMedia>;
  peerConnectionFactory?: (config: RTCConfiguration) => any;
  schedule?: (handler: () => void, delay: number) => any;
  cancelSchedule?: (timer: any) => void;
  joinAckTimeoutMs?: number;
  disconnectGraceMs?: number;
}

export type CallRuntimeFactory = (params: CallRuntimeParams) => CallRuntime;

export function resolveRtcJoinFailureCode(ack: any): string {
  const reason = String(ack?.reason || ack?.code || '').trim();
  switch (reason) {
    case 'busy':
      return 'rtc_join_busy';
    case 'forbidden':
      return 'rtc_join_forbidden';
    case 'not_accepted':
      return 'rtc_join_not_accepted';
    case 'call_ended':
      return 'rtc_join_call_ended';
    case 'unknown_call':
      return 'rtc_join_unknown_call';
    case 'already_connected_elsewhere':
      return 'rtc_join_connected_elsewhere';
    case 'ack_timeout':
      return 'rtc_join_timeout';
    default:
      return 'rtc_join_failed';
  }
}

export function payloadBelongsToCall(payload: any, callId: string): boolean {
  if (!payload) return false;
  if (payload.callId != null) return String(payload.callId) === callId;
  const roomId = String(payload.roomId || '');
  return roomId === `call:${callId}` || roomId === `rtc:call:${callId}`;
}

function countLogicalParticipants(payload: any): number {
  const participants = Array.isArray(payload?.participants) ? payload.participants : [];
  const logicalIds = new Set(
    participants
      .map((participant: any) => String(participant?.userId || participant?.socketId || '').trim())
      .filter(Boolean)
  );
  return logicalIds.size;
}

function defaultPeerConnectionFactory(config: RTCConfiguration): any {
  if (!NativeRTCPeerConnection) throw new Error('webrtc_unavailable');
  return new NativeRTCPeerConnection(config);
}

export const createNativeCallRuntime: CallRuntimeFactory = (params) => {
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
  const fetchIceConfig =
    params.fetchIceConfig || (() => getRtcIceConfigRequest() as Promise<RawIceConfig>);
  const acquireMedia = params.acquireMedia || acquireLocalMedia;
  const createPeer = params.peerConnectionFactory || defaultPeerConnectionFactory;
  const schedule = params.schedule || ((handler: () => void, delay: number) => setTimeout(handler, delay));
  const cancelSchedule = params.cancelSchedule || ((timer: any) => clearTimeout(timer));
  const joinAckTimeoutMs = Math.max(250, params.joinAckTimeoutMs || RTC_JOIN_ACK_TIMEOUT_MS);
  const disconnectGraceMs = Math.max(1000, params.disconnectGraceMs || RTC_DISCONNECT_GRACE_MS);

  let stopped = false;
  let failureReported = false;
  let joined = false;
  let peer: any = null;
  let media: LocalMedia | null = null;
  let remoteStream: any = null;
  let participantCount = 0;
  let initialConnected = false;
  let reconnecting = false;
  let disconnectTimer: any = null;
  let offerInFlight = false;
  let initialOfferCreated = false;
  let relayReported = false;
  const iceQueue = createIceQueue<RTCIceCandidateInit>(callId);

  const clearDisconnectTimer = (): void => {
    if (disconnectTimer) cancelSchedule(disconnectTimer);
    disconnectTimer = null;
  };

  const emit = (event: string, payload: Record<string, unknown> = {}): void => {
    socket.emit(event, { callId, ...payload });
  };

  const fail = (code: string): void => {
    if (stopped || failureReported) return;
    failureReported = true;
    clearDisconnectTimer();
    onFailed(code);
  };

  const reportRelayUsage = async (): Promise<void> => {
    if (stopped || relayReported || !peer || typeof peer.getStats !== 'function') return;
    relayReported = true;
    try {
      const stats = await peer.getStats();
      if (stopped) return;
      const candidates = new Map<string, any>();
      let selectedPair: any = null;
      stats?.forEach?.((report: any) => {
        if (report?.type === 'local-candidate' || report?.type === 'remote-candidate') {
          candidates.set(report.id, report);
        }
        if (report?.type === 'candidate-pair' && report.state === 'succeeded') {
          if (!selectedPair || report.nominated || report.selected) selectedPair = report;
        }
      });
      if (!selectedPair) return;
      const local = candidates.get(selectedPair.localCandidateId);
      const remote = candidates.get(selectedPair.remoteCandidateId);
      const usedRelay = local?.candidateType === 'relay' || remote?.candidateType === 'relay';
      emit('rtc:stats', { usedRelay: Boolean(usedRelay) });
    } catch {
      // Diagnostico best-effort: nunca rompe una llamada ni expone candidatos/credenciales.
    }
  };

  const maybeConnected = (): void => {
    if (stopped || !peer) return;
    const audio = remoteAudioSignals(remoteStream);
    const connected = evaluateConnected({
      participantCount,
      connectionState: String(peer.connectionState || ''),
      hasRemoteAudioTrack: audio.hasRemoteAudioTrack,
      remoteAudioTrackLive: audio.remoteAudioTrackLive,
    });
    if (!connected) return;

    clearDisconnectTimer();
    if (!initialConnected) {
      initialConnected = true;
      reconnecting = false;
      onConnected();
      reportRelayUsage().catch(() => undefined);
      return;
    }
    if (reconnecting) {
      reconnecting = false;
      onReconnected();
    }
  };

  const beginReconnecting = (): void => {
    if (stopped || failureReported || !initialConnected || reconnecting) return;
    reconnecting = true;
    onReconnecting();
    clearDisconnectTimer();
    disconnectTimer = schedule(() => fail('reconnect_timeout'), disconnectGraceMs);

    if (isCanonicalOfferer(direction)) {
      try {
        peer?.restartIce?.();
      } catch {
        // createOffer({iceRestart:true}) sigue siendo el intento principal.
      }
      createAndSendOffer(true).catch(() => undefined);
    }
  };

  const drainIce = async (): Promise<void> => {
    if (!peer) return;
    for (const candidate of iceQueue.drain()) {
      try {
        await peer.addIceCandidate(createRTCIceCandidate(candidate));
      } catch {
        // Un candidato individual invalido no cancela toda la negociacion.
      }
    }
  };

  const createAndSendOffer = async (iceRestart = false): Promise<void> => {
    if (stopped || !peer || offerInFlight) return;
    if (!iceRestart && initialOfferCreated) return;
    offerInFlight = true;
    if (!iceRestart) initialOfferCreated = true;
    try {
      const offer = await peer.createOffer(iceRestart ? { iceRestart: true } : {});
      if (stopped || !peer) return;
      await peer.setLocalDescription(offer);
      emit('rtc:offer', { offer, mode });
    } catch {
      fail(iceRestart ? 'ice_restart_failed' : 'negotiation_failed');
    } finally {
      offerInFlight = false;
    }
  };

  const onParticipants = (payload: any): void => {
    if (stopped || !payloadBelongsToCall(payload, callId)) return;
    participantCount = countLogicalParticipants(payload);
    if (participantCount === 2 && isCanonicalOfferer(direction)) {
      createAndSendOffer(false).catch(() => undefined);
    }
    if (initialConnected && participantCount < 2) beginReconnecting();
    maybeConnected();
  };

  const onRemoteOffer = async (payload: any): Promise<void> => {
    if (stopped || !payloadBelongsToCall(payload, callId) || !peer || !payload.offer) return;
    try {
      await peer.setRemoteDescription(createRTCSessionDescription(payload.offer));
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

  const onRemoteAnswer = async (payload: any): Promise<void> => {
    if (stopped || !payloadBelongsToCall(payload, callId) || !peer || !payload.answer) return;
    try {
      await peer.setRemoteDescription(createRTCSessionDescription(payload.answer));
      iceQueue.markRemoteReady();
      await drainIce();
    } catch {
      fail('negotiation_failed');
    }
  };

  const onRemoteIce = async (payload: any): Promise<void> => {
    if (
      stopped ||
      !payloadBelongsToCall(payload, callId) ||
      !peer ||
      !payload.candidate
    ) return;
    if (!iceQueue.isRemoteReady()) {
      iceQueue.add(callId, payload.candidate);
      return;
    }
    try {
      await peer.addIceCandidate(createRTCIceCandidate(payload.candidate));
    } catch {
      // Best-effort: otros candidatos pueden establecer el pair.
    }
  };

  const onRoomHangup = (payload: any): void => {
    if (!payloadBelongsToCall(payload, callId)) return;
    fail('peer_left');
  };

  const joinAuthoritativeRoom = (): Promise<{ ok: boolean; reason?: string }> =>
    new Promise((resolve) => {
      let settled = false;
      const timer = schedule(() => {
        if (settled) return;
        settled = true;
        resolve({ ok: false, reason: 'ack_timeout' });
      }, joinAckTimeoutMs);
      socket.emit('rtc:join', { callId }, (ack: any) => {
        if (settled) return;
        settled = true;
        cancelSchedule(timer);
        resolve(ack && typeof ack === 'object' ? ack : { ok: false });
      });
    });

  const rejoinAfterSocketReconnect = async (): Promise<void> => {
    if (stopped || !peer || !joined) return;
    const ack = await joinAuthoritativeRoom();
    if (stopped) return;
    if (!ack.ok) {
      fail(resolveRtcJoinFailureCode(ack));
      return;
    }
    if (isCanonicalOfferer(direction)) {
      createAndSendOffer(true).catch(() => undefined);
    }
  };

  const onSocketDisconnect = (): void => beginReconnecting();
  const onSocketConnect = (): void => {
    if (reconnecting) rejoinAfterSocketReconnect().catch(() => fail('rtc_rejoin_failed'));
  };

  socket.on('rtc:participants', onParticipants);
  socket.on('rtc:offer', onRemoteOffer);
  socket.on('rtc:answer', onRemoteAnswer);
  socket.on('rtc:ice-candidate', onRemoteIce);
  socket.on('rtc:hangup', onRoomHangup);
  socket.on('disconnect', onSocketDisconnect);
  socket.on('connect', onSocketConnect);

  const cleanup = createIdempotentCleanup([
    () => clearDisconnectTimer(),
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
      try {
        peer.close();
      } catch {
        // best-effort
      }
      peer = null;
    },
    () => stopLocalMedia(media),
    () => {
      media = null;
      remoteStream = null;
      onLocalStream(null);
      onRemoteStream(null);
    },
    () => iceQueue.reset(null),
  ]);

  const start = async (): Promise<void> => {
    const ice = await resolveIceConfig(fetchIceConfig);
    if (stopped) return;
    if (!ice.ok) {
      fail('rtc_config_unavailable');
      return;
    }

    let localMedia: LocalMedia;
    try {
      localMedia = await acquireMedia(mode);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      fail(message === 'video_track_unavailable' ? 'camera_unavailable' : 'media_capture_failed');
      return;
    }
    if (stopped) {
      stopLocalMedia(localMedia);
      return;
    }
    media = localMedia;
    onLocalStream(media.stream);

    try {
      peer = createPeer({ iceServers: ice.iceServers as RTCIceServer[] });
    } catch (error) {
      fail(error instanceof Error && error.message === 'webrtc_unavailable'
        ? 'webrtc_unavailable'
        : 'peer_creation_failed');
      return;
    }

    media.allTracks.forEach((track) => {
      peer.addTrack(track as any, media!.stream);
    });

    peer.onicecandidate = (event: { candidate?: RTCIceCandidateInit | null }) => {
      if (stopped || !event?.candidate) return;
      emit('rtc:ice-candidate', { candidate: event.candidate });
    };
    peer.ontrack = (event: { streams?: any[]; track?: any }) => {
      if (stopped) return;
      remoteStream = event?.streams?.[0] || remoteStream;
      if (remoteStream) onRemoteStream(remoteStream);
      maybeConnected();
    };
    peer.onconnectionstatechange = () => {
      if (stopped || !peer) return;
      const state = String(peer.connectionState || '');
      if (state === 'connected') maybeConnected();
      else if (state === 'disconnected') beginReconnecting();
      else if (state === 'failed' || state === 'closed') fail('ice_failed');
    };

    const ack = await joinAuthoritativeRoom();
    if (stopped) return;
    if (!ack.ok) {
      fail(resolveRtcJoinFailureCode(ack));
      return;
    }
    joined = true;
  };

  start().catch(() => fail('runtime_start_failed'));

  return {
    stop(): void {
      if (stopped) return;
      stopped = true;
      cleanup();
    },
    setMicEnabled(enabled: boolean): void {
      setMicEnabled(media, enabled);
    },
    setCameraEnabled(enabled: boolean): void {
      setLocalCameraEnabled(media, enabled);
    },
  };
};
