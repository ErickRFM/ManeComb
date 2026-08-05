declare const require: (id: string) => any;
declare const __dirname: string;
const fs = require('fs');
const path = require('path');

import { canConversationStartCall } from './call-selectors';
import {
  __setConnectTimeoutMsForTests,
  __setResultDisplayMsForTests,
  setCallRuntimeFactory,
  useCallStore,
} from './call-store';
import type { CallAck } from './call-types';
import type { CallRuntimeParams } from './call-runtime';

let capturedRuntime: {
  params: CallRuntimeParams;
  stopped: number;
  mic: boolean[];
  camera: boolean[];
} | null = null;

function installFakeRuntime() {
  setCallRuntimeFactory((params) => {
    const entry = {
      params,
      stopped: 0,
      mic: [] as boolean[],
      camera: [] as boolean[],
    };
    capturedRuntime = entry;
    return {
      stop: () => { entry.stopped += 1; },
      setMicEnabled: (enabled: boolean) => { entry.mic.push(enabled); },
      setCameraEnabled: (enabled: boolean) => { entry.camera.push(enabled); },
    };
  });
}

type Handler = (payload: any) => void;

function fakeSocket() {
  const handlers = new Map<string, Set<Handler>>();
  let nextAck: CallAck = { ok: false, code: 'no_ack' };
  return {
    emitted: [] as Array<{ event: string; payload: any }>,
    setNextAck(ack: CallAck) { nextAck = ack; },
    handlerCount(event: string) { return handlers.get(event)?.size ?? 0; },
    on(event: string, handler: Handler) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
    },
    off(event: string, handler: Handler) { handlers.get(event)?.delete(handler); },
    emit(event: string, payload: any, ack?: (response: any) => void) {
      this.emitted.push({ event, payload });
      if (event === 'rtc:call' && ack) ack(nextAck);
    },
    server(event: string, payload: any) {
      (handlers.get(event) ? Array.from(handlers.get(event)!) : []).forEach((handler) => handler(payload));
    },
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const state = () => useCallStore.getState();
const incoming = {
  callId: 'call-1',
  conversationId: 'conv-1',
  mode: 'audio' as const,
  caller: { id: 'user-a', name: 'Ana' },
};

beforeEach(() => {
  __setResultDisplayMsForTests(0);
  __setConnectTimeoutMsForTests(100000);
  installFakeRuntime();
  capturedRuntime = null;
  state().unbindSocket();
  state().reset();
});

describe('call-store signaling', () => {
  it('recibe una llamada global y deduplica el mismo callId', () => {
    const socket = fakeSocket();
    state().bindSocket(socket as any);
    socket.server('rtc:incoming-call', incoming);
    const createdAt = state().createdAt;
    socket.server('rtc:incoming-call', incoming);
    expect(state().phase).toBe('INCOMING_RINGING');
    expect(state().callerName).toBe('Ana');
    expect(state().displayName).toBe('Ana');
    expect(state().createdAt).toBe(createdAt);
    expect(socket.emitted.some((entry) => entry.event === 'rtc:busy')).toBe(false);
  });

  it('rechaza otra llamada mientras existe una activa', () => {
    const socket = fakeSocket();
    state().bindSocket(socket as any);
    socket.server('rtc:incoming-call', incoming);
    socket.server('rtc:incoming-call', { ...incoming, callId: 'call-2' });
    expect(state().callId).toBe('call-1');
    expect(socket.emitted.some((entry) => entry.event === 'rtc:busy' && entry.payload.callId === 'call-2')).toBe(true);
  });

  it('startCall conserva la identidad autoritativa y el nombre visible', async () => {
    const socket = fakeSocket();
    socket.setNextAck({ ok: true, callId: 'C-42', roomId: 'rtc:call:C-42', status: 'ringing' });
    state().bindSocket(socket as any);
    const result = await state().startCall({
      conversationId: 'conv-1',
      mode: 'audio',
      peerName: 'Luis',
    });
    expect(result.ok).toBe(true);
    expect(state().phase).toBe('OUTGOING_RINGING');
    expect(state().callId).toBe('C-42');
    expect(state().roomId).toBe('rtc:call:C-42');
    expect(state().displayName).toBe('Luis');
  });

  it.each(['busy', 'direct_call_required'] as const)(
    '%s no crea una sesion local',
    async (code) => {
      const socket = fakeSocket();
      socket.setNextAck({ ok: false, code });
      state().bindSocket(socket as any);
      const result = await state().startCall({ conversationId: 'conv-1', mode: 'audio' });
      expect(result).toEqual({ ok: false, code });
      expect(state().phase).toBe('IDLE');
      expect(state().callId).toBeNull();
    }
  );

  it('aceptar crea el runtime y emite rtc:accept', () => {
    const socket = fakeSocket();
    state().bindSocket(socket as any);
    socket.server('rtc:incoming-call', incoming);
    state().acceptIncomingCall();
    expect(state().phase).toBe('CONNECTING');
    expect(capturedRuntime?.params.callId).toBe('call-1');
    expect(socket.emitted.some((entry) => entry.event === 'rtc:accept')).toBe(true);
  });

  it('rechazar, cancelar y timeout limpian el estado', async () => {
    const socket = fakeSocket();
    state().bindSocket(socket as any);
    socket.server('rtc:incoming-call', incoming);
    state().rejectIncomingCall();
    expect(state().phase).toBe('ENDING');
    await flush();
    expect(state().phase).toBe('IDLE');

    socket.setNextAck({ ok: true, callId: 'C-9', roomId: 'rtc:call:C-9' });
    await state().startCall({ conversationId: 'conv-1', mode: 'audio' });
    socket.server('rtc:call-timeout', { callId: 'C-9' });
    expect(state().endResult).toBe('no_answer');
    await flush();
    expect(state().phase).toBe('IDLE');
  });

  it('un socket nuevo reemplaza exactamente los listeners anteriores', () => {
    const first = fakeSocket();
    const second = fakeSocket();
    state().bindSocket(first as any);
    state().bindSocket(second as any);
    expect(first.handlerCount('rtc:incoming-call')).toBe(0);
    first.server('rtc:incoming-call', incoming);
    expect(state().phase).toBe('IDLE');
    second.server('rtc:incoming-call', incoming);
    expect(state().phase).toBe('INCOMING_RINGING');
  });

  it('logout/reset termina media y no conserva la llamada', () => {
    const socket = fakeSocket();
    state().bindSocket(socket as any);
    socket.server('rtc:incoming-call', incoming);
    state().acceptIncomingCall();
    const runtime = capturedRuntime!;
    state().unbindSocket();
    state().reset();
    expect(runtime.stopped).toBeGreaterThanOrEqual(1);
    expect(state().phase).toBe('IDLE');
    expect(state()._socket).toBeNull();
  });

  it('solo una conversacion directa habilita llamadas', () => {
    expect(canConversationStartCall({ kind: 'direct' })).toBe(true);
    expect(canConversationStartCall({ kind: 'group' })).toBe(false);
    expect(canConversationStartCall(null)).toBe(false);
  });

  it('Chat no crea un segundo io()', () => {
    const file = path.join(__dirname, '..', '..', 'screens', 'chat', 'hooks', 'use-chat-controller.ts');
    const content = fs.readFileSync(file, 'utf8');
    expect(content.includes('io(SOCKET_URL')).toBe(false);
  });
});

describe('call-store media runtime', () => {
  function acceptFlow(mode: 'audio' | 'video' = 'audio') {
    const socket = fakeSocket();
    state().bindSocket(socket as any);
    socket.server('rtc:incoming-call', { ...incoming, mode });
    state().acceptIncomingCall();
    return socket;
  }

  it('no declara CONNECTED hasta que el runtime confirma audio remoto', () => {
    acceptFlow();
    expect(state().phase).toBe('CONNECTING');
    expect(state().connectedAt).toBeNull();
    capturedRuntime!.params.onConnected();
    expect(state().phase).toBe('CONNECTED');
    expect(typeof state().connectedAt).toBe('number');
  });

  it('publica stream local/remoto en una sola fuente de UI', () => {
    acceptFlow('video');
    const local = { id: 'local' };
    const remote = { id: 'remote' };
    capturedRuntime!.params.onLocalStream(local);
    capturedRuntime!.params.onRemoteStream(remote);
    expect(state().localStream).toBe(local);
    expect(state().remoteStream).toBe(remote);
  });

  it('RECONNECTING conserva connectedAt y vuelve a CONNECTED', () => {
    acceptFlow();
    capturedRuntime!.params.onConnected();
    const connectedAt = state().connectedAt;
    capturedRuntime!.params.onReconnecting();
    expect(state().phase).toBe('RECONNECTING');
    capturedRuntime!.params.onConnected();
    expect(state().phase).toBe('CONNECTED');
    expect(state().connectedAt).toBe(connectedAt);
  });

  it('mute y camara controlan el mismo runtime', () => {
    acceptFlow('video');
    state().toggleMute();
    state().toggleCamera();
    expect(state().isMuted).toBe(true);
    expect(state().isCameraEnabled).toBe(false);
    expect(capturedRuntime!.mic.at(-1)).toBe(false);
    expect(capturedRuntime!.camera.at(-1)).toBe(false);
  });

  it('endCall emite rtc:end y detiene el runtime', async () => {
    const socket = acceptFlow();
    capturedRuntime!.params.onConnected();
    const runtime = capturedRuntime!;
    state().endCall();
    expect(socket.emitted.some((entry) => entry.event === 'rtc:end')).toBe(true);
    expect(runtime.stopped).toBeGreaterThanOrEqual(1);
    await flush();
    expect(state().phase).toBe('IDLE');
  });

  it('timeout de conexion termina con FAILED(ice_timeout)', async () => {
    __setResultDisplayMsForTests(100000);
    __setConnectTimeoutMsForTests(20);
    const socket = acceptFlow();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(state().phase).toBe('FAILED');
    expect(state().failureCode).toBe('ice_timeout');
    expect(socket.emitted.some((entry) => entry.event === 'rtc:end')).toBe(true);
    state().reset();
  });

  it('un callback viejo no altera una llamada nueva', () => {
    acceptFlow();
    const oldConnected = capturedRuntime!.params.onConnected;
    state().reset();
    const socket = fakeSocket();
    state().bindSocket(socket as any);
    socket.server('rtc:incoming-call', { ...incoming, callId: 'call-2' });
    state().acceptIncomingCall();
    oldConnected();
    expect(state().phase).toBe('CONNECTING');
    expect(state().callId).toBe('call-2');
  });
});
