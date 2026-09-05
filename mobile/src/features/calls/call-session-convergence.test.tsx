import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Linking } from 'react-native';
import { CallOverlay } from './call-overlay';
import { createNativeCallRuntime } from './call-runtime';
import { useCallStore, setCallRuntimeFactory, __setCallPermissionRequesterForTests } from './call-store';
import { useAppStore } from '@/src/store/use-app-store';

jest.mock('@/src/api/client', () => ({ getRtcIceConfigRequest: jest.fn() }));
jest.mock('@/src/native/webrtc', () => ({ RTCPeerConnection: null, createRTCIceCandidate: (v: unknown) => v, createRTCSessionDescription: (v: unknown) => v }));
jest.mock('@/src/features/radio-live/radio-live-overlay', () => ({ RadioLiveOverlay: () => null }));
jest.mock('./components/active-call-modal', () => ({ ActiveCallModal: () => null }));
jest.mock('./components/incoming-call-modal', () => ({ IncomingCallModal: () => null }));
jest.mock('./components/call-permission-modal', () => ({ CallPermissionModal: () => null }));
jest.mock('@/src/native/call-service', () => ({ setCallFeedbackMode: jest.fn(async () => {}), setIncomingCallWindowActive: jest.fn(async () => {}) }));
jest.mock('./call-foreground-service', () => ({ resetCallForegroundService: jest.fn(async () => {}), setCallForegroundServiceMode: jest.fn(async () => {}) }));
jest.mock('@/src/store/use-app-store', () => {
  const { create: makeStore } = jest.requireActual('zustand');
  const useMockAppStore = makeStore(() => ({ socketStatus: 'connected', sharedSocket: null }));
  return { useAppStore: useMockAppStore, useSharedRealtimeSocket: () => useMockAppStore((state: any) => state.sharedSocket) };
});

function socket() {
  const handlers = new Map<string, Set<(...args: any[]) => void>>();
  return {
    emitted: [] as string[],
    on(event: string, handler: (...args: any[]) => void) { if (!handlers.has(event)) handlers.set(event, new Set()); handlers.get(event)!.add(handler); },
    off(event: string, handler: (...args: any[]) => void) { handlers.get(event)?.delete(handler); },
    emit(event: string, _payload?: unknown, ack?: (value: unknown) => void) { this.emitted.push(event); ack?.({ ok: true }); },
    server(event: string, payload: unknown) { handlers.get(event)?.forEach(handler => handler(payload)); },
    removeAllListeners() { handlers.clear(); },
  };
}

function peerAndMedia() {
  const audio = { kind: 'audio', enabled: true, readyState: 'live', stop: jest.fn() };
  const video = { kind: 'video', enabled: true, readyState: 'live', stop: jest.fn() };
  const stream = { getAudioTracks: () => [audio], getVideoTracks: () => [video], getTracks: () => [audio, video] };
  const peer: any = {
    connectionState: 'new', addTrack: jest.fn(), close: jest.fn(),
    setRemoteDescription: jest.fn(async () => {}), setLocalDescription: jest.fn(async () => {}),
    createAnswer: jest.fn(async () => ({ type: 'answer', sdp: 'test' })),
  };
  return { peer, audio, video, stream, media: { stream, audioTracks: [audio], videoTracks: [video], allTracks: [audio, video] } };
}

let tree: ReactTestRenderer | undefined;
let runtimes: ReturnType<typeof peerAndMedia>[];
const state = () => useCallStore.getState();
const settle = async () => { for (let index = 0; index < 30; index += 1) await Promise.resolve(); };
const publishSocket = (sharedSocket: ReturnType<typeof socket> | null, socketStatus: string) => {
  useAppStore.setState({ sharedSocket, socketStatus } as any);
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
  runtimes = [];
  state().reset(); state().unbindSocket();
  __setCallPermissionRequesterForTests(async () => ({ microphone: 'granted', camera: 'granted' }));
  setCallRuntimeFactory(params => {
    // The former capture must already be stopped before any replacement starts.
    if (runtimes.length) expect(runtimes.at(-1)!.audio.stop).toHaveBeenCalledTimes(1);
    const entry = peerAndMedia();
    runtimes.push(entry);
    return createNativeCallRuntime({ ...params,
      fetchIceConfig: async () => ({ iceServers: [{ urls: 'stun:example.test' }], turnEnabled: false }),
      acquireMedia: async () => entry.media,
      peerConnectionFactory: () => entry.peer,
    });
  });
});

afterEach(async () => {
  await act(async () => { tree?.unmount(); tree = undefined; await settle(); });
  state().reset(); state().unbindSocket();
  setCallRuntimeFactory(null); __setCallPermissionRequesterForTests(null);
  jest.clearAllTimers(); jest.useRealTimers(); jest.restoreAllMocks();
});

async function connectedCall() {
  const first = socket();
  await act(async () => {
    publishSocket(first, 'connected');
    tree = create(<CallOverlay />);
    await settle();
  });
  await act(async () => {
    state().handleIncoming({ callId: 'test-call', conversationId: 'test-conversation', mode: 'video', caller: { id: 'test-user', name: 'Test' } });
    await state().acceptIncomingCall();
    await settle();
    first.server('rtc:participants', { callId: 'test-call', participants: [{ userId: 'a' }, { userId: 'b' }] });
    runtimes[0].peer.connectionState = 'connected';
    runtimes[0].peer.ontrack({ streams: [runtimes[0].stream] });
    await settle();
  });
  expect(state().phase).toBe('CONNECTED');
  return first;
}

it('rotates the shared socket with one capture, new authorized join and preserved controls', async () => {
  const first = await connectedCall();
  const next = socket();
  const connectedAt = state().connectedAt;
  const oldIce = runtimes[0].peer.onicecandidate;
  await act(async () => {
    state().toggleMute(); state().toggleCamera();
    first.removeAllListeners(); // root removes old listeners before disconnect.
    publishSocket(null, 'reconnecting');
    await settle();
  });
  expect(state().phase).toBe('RECONNECTING');
  expect(runtimes[0].peer.close).toHaveBeenCalledTimes(1);
  await act(async () => { publishSocket(next, 'connected'); await settle(); });
  expect(next.emitted.filter(event => event === 'rtc:join')).toHaveLength(1);
  expect(state().phase).toBe('RECONNECTING'); // Namespace connection is not RTC media.
  expect(runtimes[1].audio.enabled).toBe(false);
  expect(runtimes[1].video.enabled).toBe(false);
  oldIce({ candidate: { candidate: 'test-stale' } });
  expect(first.emitted).not.toContain('rtc:ice-candidate');
  await act(async () => {
    next.server('rtc:participants', { callId: 'test-call', participants: [{ userId: 'a' }, { userId: 'b' }] });
    runtimes[1].peer.connectionState = 'connected';
    runtimes[1].peer.ontrack({ streams: [runtimes[1].stream] });
    await settle();
  });
  expect(state().phase).toBe('CONNECTED');
  expect(state().connectedAt).toBe(connectedAt);
  expect(state().isMuted).toBe(true);
  expect(state().isCameraEnabled).toBe(false);
});

it('terminal session stops RTC capture and timers instead of remaining connected', async () => {
  const first = await connectedCall();
  const oldIce = runtimes[0].peer.onicecandidate;
  await act(async () => { publishSocket(null, 'unauthorized'); await settle(); });
  expect(state().phase).toBe('IDLE');
  expect(state()._runtime).toBeNull();
  expect(runtimes[0].peer.close).toHaveBeenCalledTimes(1);
  expect(runtimes[0].audio.stop).toHaveBeenCalledTimes(1);
  const before = first.emitted.length;
  await act(async () => { oldIce({ candidate: { candidate: 'test-stale' } }); jest.advanceTimersByTime(180000); await settle(); });
  expect(first.emitted).toHaveLength(before);
  expect(runtimes).toHaveLength(1);
  expect(state()._connectTimeout).toBeNull();
});

it('missing replacement ends recovery within the existing timeout without recreating a producer', async () => {
  await connectedCall();
  await act(async () => { publishSocket(null, 'reconnecting'); await settle(); });
  expect(state().phase).toBe('RECONNECTING');
  await act(async () => { jest.advanceTimersByTime(20000); await settle(); });
  expect(state().phase).toBe('FAILED');
  expect(state().failureCode).toBe('reconnect_timeout');
  await act(async () => { jest.advanceTimersByTime(180000); publishSocket(socket(), 'connected'); await settle(); });
  expect(runtimes).toHaveLength(1);
  expect(state().phase).toBe('IDLE');
});
