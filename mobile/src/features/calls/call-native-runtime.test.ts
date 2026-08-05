// RC-RTC-FINALIZATION-20260805 — Integracion del runtime con peer/socket/media inyectados.

jest.mock('@/src/api/client', () => ({
  getRtcIceConfigRequest: jest.fn(),
}));

jest.mock('@/src/native/webrtc', () => ({
  RTCPeerConnection: null,
  createRTCIceCandidate: (value: unknown) => value,
  createRTCSessionDescription: (value: unknown) => value,
}));

import {
  createNativeCallRuntime,
  payloadBelongsToCall,
  resolveRtcJoinFailureCode,
} from './call-runtime';
import type { LocalMedia } from './call-media';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

type Handler = (...args: any[]) => void;

function fakeSocket(joinAck: any = { ok: true }) {
  const handlers = new Map<string, Set<Handler>>();
  return {
    emitted: [] as Array<{ event: string; payload: any }>,
    on(event: string, handler: Handler) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
    },
    off(event: string, handler: Handler) {
      handlers.get(event)?.delete(handler);
    },
    emit(event: string, payload?: any, ack?: (response: any) => void) {
      this.emitted.push({ event, payload });
      if (event === 'rtc:join' && ack) ack(joinAck);
    },
    server(event: string, payload?: any) {
      Array.from(handlers.get(event) || []).forEach((handler) => handler(payload));
    },
  };
}

function fakeMedia(mode: 'audio' | 'video' = 'audio') {
  const audio = { kind: 'audio', enabled: true, readyState: 'live', stop: jest.fn() };
  const video = { kind: 'video', enabled: true, readyState: 'live', stop: jest.fn() };
  const tracks = mode === 'video' ? [audio, video] : [audio];
  const stream = {
    id: 'local-stream',
    getTracks: () => tracks,
    getAudioTracks: () => [audio],
    getVideoTracks: () => mode === 'video' ? [video] : [],
  };
  const media: LocalMedia = {
    stream,
    audioTracks: [audio],
    videoTracks: mode === 'video' ? [video] : [],
    allTracks: tracks,
  };
  return { media, audio, video, stream };
}

function fakePeer() {
  const peer: any = {
    connectionState: 'new',
    addedTracks: [] as any[],
    onicecandidate: null,
    ontrack: null,
    onconnectionstatechange: null,
    close: jest.fn(() => { peer.connectionState = 'closed'; }),
    restartIce: jest.fn(),
    addTrack: jest.fn((track: any) => { peer.addedTracks.push(track); }),
    createOffer: jest.fn(async (options?: any) => ({ type: 'offer', sdp: 'offer', options })),
    createAnswer: jest.fn(async () => ({ type: 'answer', sdp: 'answer' })),
    setLocalDescription: jest.fn(async () => undefined),
    setRemoteDescription: jest.fn(async () => undefined),
    addIceCandidate: jest.fn(async () => undefined),
    getStats: jest.fn(async () => new Map([
      ['local', { id: 'local', type: 'local-candidate', candidateType: 'relay' }],
      ['remote', { id: 'remote', type: 'remote-candidate', candidateType: 'srflx' }],
      ['pair', {
        id: 'pair',
        type: 'candidate-pair',
        state: 'succeeded',
        nominated: true,
        localCandidateId: 'local',
        remoteCandidateId: 'remote',
      }],
    ])),
  };
  return peer;
}

function remoteAudioStream() {
  return {
    id: 'remote-stream',
    getAudioTracks: () => [{ kind: 'audio', readyState: 'live' }],
    getVideoTracks: () => [],
  };
}

describe('runtime policy', () => {
  it('mapea ACKs de join a codigos sanitizados', () => {
    expect(resolveRtcJoinFailureCode({ reason: 'forbidden' })).toBe('rtc_join_forbidden');
    expect(resolveRtcJoinFailureCode({ reason: 'not_accepted' })).toBe('rtc_join_not_accepted');
    expect(resolveRtcJoinFailureCode({ reason: 'ack_timeout' })).toBe('rtc_join_timeout');
    expect(resolveRtcJoinFailureCode({ reason: 'detalle_interno' })).toBe('rtc_join_failed');
  });

  it('filtra participants/signaling por callId o sala canonica', () => {
    expect(payloadBelongsToCall({ callId: 'c1' }, 'c1')).toBe(true);
    expect(payloadBelongsToCall({ callId: 'c2' }, 'c1')).toBe(false);
    expect(payloadBelongsToCall({ roomId: 'call:c1' }, 'c1')).toBe(true);
    expect(payloadBelongsToCall({ roomId: 'rtc:call:c1' }, 'c1')).toBe(true);
    expect(payloadBelongsToCall({ roomId: 'conversation-1' }, 'c1')).toBe(false);
  });
});

describe('createNativeCallRuntime', () => {
  it('espera ACK de rtc:join y falla cerrado si backend rechaza', async () => {
    const socket = fakeSocket({ ok: false, reason: 'forbidden' });
    const peer = fakePeer();
    const { media } = fakeMedia();
    const failed: string[] = [];
    const runtime = createNativeCallRuntime({
      callId: 'call-1',
      direction: 'incoming',
      mode: 'audio',
      socket: socket as any,
      onConnected: jest.fn(),
      onFailed: (code) => failed.push(code),
      fetchIceConfig: async () => ({
        iceServers: [{ urls: 'stun:example.test' }],
        turnEnabled: false,
      }),
      acquireMedia: async () => media,
      peerConnectionFactory: () => peer,
    });

    await flush();
    expect(socket.emitted.some((entry) =>
      entry.event === 'rtc:join' && entry.payload.callId === 'call-1'
    )).toBe(true);
    expect(failed).toEqual(['rtc_join_forbidden']);
    runtime.stop();
  });

  it('agrega audio+video, negocia una offer y conecta solo con audio remoto vivo', async () => {
    const socket = fakeSocket();
    const peer = fakePeer();
    const { media, audio, video, stream } = fakeMedia('video');
    const localStreams: any[] = [];
    const remoteStreams: any[] = [];
    const connected = jest.fn();
    const failed = jest.fn();
    const runtime = createNativeCallRuntime({
      callId: 'call-video',
      direction: 'outgoing',
      mode: 'video',
      socket: socket as any,
      onLocalStream: (value) => localStreams.push(value),
      onRemoteStream: (value) => remoteStreams.push(value),
      onConnected: connected,
      onFailed: failed,
      fetchIceConfig: async () => ({
        iceServers: [{ urls: 'turn:example.test', username: 'u', credential: 'c' }],
        turnEnabled: true,
      }),
      acquireMedia: async () => media,
      peerConnectionFactory: () => peer,
    });

    await flush();
    expect(localStreams[0]).toBe(stream);
    expect(peer.addedTracks).toEqual([audio, video]);

    socket.server('rtc:participants', {
      roomId: 'call:call-video',
      participants: [{ userId: 'a' }, { userId: 'b' }],
    });
    await flush();
    expect(socket.emitted.filter((entry) => entry.event === 'rtc:offer')).toHaveLength(1);

    const remote = remoteAudioStream();
    peer.connectionState = 'connected';
    peer.ontrack?.({ streams: [remote] });
    peer.onconnectionstatechange?.();
    await flush();

    expect(remoteStreams).toContain(remote);
    expect(connected).toHaveBeenCalledTimes(1);
    expect(failed).not.toHaveBeenCalled();
    expect(socket.emitted.some((entry) =>
      entry.event === 'rtc:stats' && entry.payload.usedRelay === true
    )).toBe(true);

    runtime.setMicEnabled(false);
    runtime.setCameraEnabled(false);
    expect(audio.enabled).toBe(false);
    expect(video.enabled).toBe(false);

    runtime.stop();
    runtime.stop();
    expect(socket.emitted.filter((entry) => entry.event === 'rtc:leave')).toHaveLength(1);
    expect(audio.stop).toHaveBeenCalledTimes(1);
    expect(video.stop).toHaveBeenCalledTimes(1);
  });

  it('transiciona a reconectando y recupera sin reiniciar connectedAt del store', async () => {
    const socket = fakeSocket();
    const peer = fakePeer();
    const { media } = fakeMedia();
    const connected = jest.fn();
    const reconnecting = jest.fn();
    const reconnected = jest.fn();
    const failed = jest.fn();
    const timers: Array<{ handler: () => void; cancelled: boolean }> = [];
    const schedule = (handler: () => void) => {
      const timer = { handler, cancelled: false };
      timers.push(timer);
      return timer;
    };
    const runtime = createNativeCallRuntime({
      callId: 'call-reconnect',
      direction: 'outgoing',
      mode: 'audio',
      socket: socket as any,
      onConnected: connected,
      onReconnecting: reconnecting,
      onReconnected: reconnected,
      onFailed: failed,
      fetchIceConfig: async () => ({
        iceServers: [{ urls: 'stun:example.test' }],
        turnEnabled: false,
      }),
      acquireMedia: async () => media,
      peerConnectionFactory: () => peer,
      schedule,
      cancelSchedule: (timer: { cancelled: boolean }) => { timer.cancelled = true; },
    });

    await flush();
    socket.server('rtc:participants', {
      callId: 'call-reconnect',
      participants: [{ userId: 'a' }, { userId: 'b' }],
    });
    peer.connectionState = 'connected';
    peer.ontrack?.({ streams: [remoteAudioStream()] });
    peer.onconnectionstatechange?.();
    expect(connected).toHaveBeenCalledTimes(1);

    peer.connectionState = 'disconnected';
    peer.onconnectionstatechange?.();
    expect(reconnecting).toHaveBeenCalledTimes(1);

    peer.connectionState = 'connected';
    peer.onconnectionstatechange?.();
    expect(reconnected).toHaveBeenCalledTimes(1);
    expect(failed).not.toHaveBeenCalled();
    expect(timers.some((timer) => timer.cancelled)).toBe(true);
    runtime.stop();
  });
});
