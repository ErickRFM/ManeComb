// RC-RTC-FINALIZATION-20260805 — Store global de llamadas.

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

function installFakeRuntime(): void {
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
  let nextCallAck: CallAck = { ok: false, code: 'no_ack' };
  let nextAcceptAck: CallAck = { ok: true };
  return {
    emitted: [] as Array<{ event: string; payload: any }>,
    setNextAck(ack: CallAck) { nextCallAck = ack; },
    setNextAcceptAck(ack: CallAck) { nextAcceptAck = ack; },
    handlerCount(event: string) { return handlers.get(event)?.size ?? 0; },
    on(event: string, handler: Handler) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
    },
    off(event: string, handler: Handler) { handlers.get(event)?.delete(handler); },
    emit(event: string, payload: any, ack?: (response: any) => void) {
      this.emitted.push({ event, payload });
      if (event === 'rtc:call' && ack) ack(nextCallAck);
      if (event === 'rtc:accept' && ack) ack(nextAcceptAck);
    },
    server(event: string, payload: any) {
      (handlers.get(event) ? Array.from(handlers.get(event)!) : []).forEach((handler) =>
        handler(payload)
      );
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
  const current = state();
  current.unbindSocket();
  current.reset();
});

describe('call-store signaling global', () => {
  it('recibe incoming independientemente de la pantalla', () => {
    const socket = fakeSocket();
    state().bindSocket(socket as any);
    socket.server('rtc:incoming-call', incoming);
    expect(state().phase).toBe('INCOMING_RINGING');
    expect(state().callerName).toBe('Ana');
  });

  it('startCall conserva el callId autoritativo del backend', async () => {
    const socket = fakeSocket();
    socket.setNextAck({ ok: true, callId: 'C-42', roomId: 'rtc:call:C-42', status: 'ringing' });
    state().bindSocket(socket as any);
    const result = await state().startCall({ conversationId: 'conv-1', mode: 'audio' });
    expect(result.ok).toBe(true);
    expect(state().phase).toBe('OUTGOING_RINGING');
    expect(state().callId).toBe('C-42');
    expect(state().roomId).toBe('rtc:call:C-42');
  });

  it('busy/direct_call_required no crean una sesion local', async () => {
    const socket = fakeSocket();
    state().bindSocket(socket as any);
    socket.setNextAck({ ok: false, code: 'busy' });
    expect((await state().startCall({ conversationId: 'conv-1', mode: 'audio' })).code).toBe('busy');
    expect(state().phase).toBe('IDLE');
    socket.setNextAck({ ok: false, code: 'direct_call_required' });
    expect((await state().startCall({ conversationId: 'group', mode: 'audio' })).code)
      .toBe('direct_call_required');
    expect(state().callId).toBeNull();
  });

  it('aceptar conserva ringing durante preflight y solo despues pasa a CONNECTING', async () => {
    const socket = fakeSocket();
    state().bindSocket(socket as any);
    socket.server('rtc:incoming-call', incoming);

    const accepting = state().acceptIncomingCall();

    // El preflight de permisos es asíncrono. Mientras no termine no se consume
    // el ringing ni se informa aceptación al backend.
    expect(state().phase).toBe('INCOMING_RINGING');
    expect(socket.emitted.some((entry) => entry.event === 'rtc:accept')).toBe(false);

    await accepting;

    expect(state().phase).toBe('CONNECTING');
    expect(socket.emitted.some((entry) =>
      entry.event === 'rtc:accept' && entry.payload.callId === 'call-1'
    )).toBe(true);
    expect(capturedRuntime).not.toBeNull();
  });

  it('un accept rechazado falla sin iniciar peer/media', async () => {
    const socket = fakeSocket();
    socket.setNextAcceptAck({ ok: false, code: 'forbidden' });
    state().bindSocket(socket as any);
    socket.server('rtc:incoming-call', incoming);
    await state().acceptIncomingCall();
    expect(state().phase).toBe('FAILED');
    expect(state().failureCode).toBe('accept_failed');
    expect(capturedRuntime).toBeNull();
  });

  it('rechazo, cancelacion remota y timeout limpian idempotentemente', async () => {
    const socket = fakeSocket();
    state().bindSocket(socket as any);
    socket.server('rtc:incoming-call', incoming);
    state().rejectIncomingCall();
    expect(socket.emitted.some((entry) => entry.event === 'rtc:reject')).toBe(true);
    await flush();
    expect(state().phase).toBe('IDLE');

    socket.server('rtc:incoming-call', { ...incoming, callId: 'call-2' });
    socket.server('rtc:call-cancelled', { callId: 'call-2' });
    await flush();
    expect(state().phase).toBe('IDLE');

    socket.setNextAck({ ok: true, callId: 'call-3' });
    await state().startCall({ conversationId: 'conv-1', mode: 'audio' });
    socket.server('rtc:call-timeout', { callId: 'call-3' });
    await flush();
    expect(state().phase).toBe('IDLE');
  });

  it('incoming duplicado no reinicia el modal y ocupado responde rtc:busy', () => {
    const socket = fakeSocket();
    state().bindSocket(socket as any);
    socket.server('rtc:incoming-call', incoming);
    const createdAt = state().createdAt;
    socket.server('rtc:incoming-call', incoming);
    expect(state().createdAt).toBe(createdAt);
    expect(socket.emitted.some((entry) => entry.event === 'rtc:busy')).toBe(false);
    socket.server('rtc:incoming-call', { ...incoming, callId: 'call-other' });
    expect(socket.emitted.some((entry) =>
      entry.event === 'rtc:busy' && entry.payload.callId === 'call-other'
    )).toBe(true);
  });

  it('un nuevo socket reemplaza listeners y logout no conserva llamada', () => {
    const first = fakeSocket();
    const second = fakeSocket();
    state().bindSocket(first as any);
    state().bindSocket(second as any);
    expect(first.handlerCount('rtc:incoming-call')).toBe(0);
    first.server('rtc:incoming-call', incoming);
    expect(state().phase).toBe('IDLE');
    second.server('rtc:incoming-call', incoming);
    expect(state().phase).toBe('INCOMING_RINGING');
    state().unbindSocket();
    state().reset();
    expect(state().phase).toBe('IDLE');
    expect(state()._socket).toBeNull();
  });

  it('solo las conversaciones directas habilitan llamadas', () => {
    expect(canConversationStartCall({ kind: 'direct' })).toBe(true);
    expect(canConversationStartCall({ kind: 'group' })).toBe(false);
    expect(canConversationStartCall(null)).toBe(false);
  });

  it('Chat usa el socket compartido y no hace rtc:join al abrir una conversacion', () => {
    const file = path.join(
      __dirname,
      '..',
      '..',
      'screens',
      'chat',
      'hooks',
      'use-chat-controller.ts'
    );
    const content = fs.readFileSync(file, 'utf8');
    expect(content.includes('io(SOCKET_URL')).toBe(false);
    expect(content.includes('getSharedRealtimeSocket()')).toBe(false);
    expect(content.includes('useCallStore')).toBe(true);
    expect(content.includes('startCall')).toBe(true);
    expect(content.includes('rtc:join')).toBe(false);
    expect(content.includes('RTCPeerConnection')).toBe(false);
  });
});

describe('call-store runtime y media global', () => {
  async function acceptFlow(mode: 'audio' | 'video' = 'audio') {
    const socket = fakeSocket();
    state().bindSocket(socket as any);
    socket.server('rtc:incoming-call', { ...incoming, mode });
    await state().acceptIncomingCall();
    return socket;
  }

  it('no declara CONNECTED hasta que el runtime lo confirma', async () => {
    await acceptFlow();
    expect(state().phase).toBe('CONNECTING');
    expect(capturedRuntime).not.toBeNull();
    expect(state().connectedAt).toBeNull();
    capturedRuntime!.params.onConnected();
    expect(state().phase).toBe('CONNECTED');
    expect(typeof state().connectedAt).toBe('number');
  });

  it('publica streams del runtime para una UI global', async () => {
    await acceptFlow('video');
    const local = { id: 'local' };
    const remote = { id: 'remote' };
    capturedRuntime!.params.onLocalStream?.(local);
    capturedRuntime!.params.onRemoteStream?.(remote);
    expect(state().localStream).toBe(local);
    expect(state().remoteStream).toBe(remote);
  });

  it('RECONNECTING conserva connectedAt y vuelve a CONNECTED', async () => {
    await acceptFlow();
    capturedRuntime!.params.onConnected();
    const connectedAt = state().connectedAt;
    capturedRuntime!.params.onReconnecting?.();
    expect(state().phase).toBe('RECONNECTING');
    capturedRuntime!.params.onReconnected?.();
    expect(state().phase).toBe('CONNECTED');
    expect(state().connectedAt).toBe(connectedAt);
  });

  it('timeout inicial sin media conectada falla y avisa rtc:end', async () => {
    __setResultDisplayMsForTests(100000);
    __setConnectTimeoutMsForTests(20);
    const socket = await acceptFlow();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(state().phase).toBe('FAILED');
    expect(state().failureCode).toBe('ice_timeout');
    expect(socket.emitted.some((entry) => entry.event === 'rtc:end')).toBe(true);
    state().reset();
  });

  it('onFailed limpia runtime y conserva un codigo sanitizado para la UI', async () => {
    await acceptFlow();
    const runtime = capturedRuntime!;
    runtime.params.onFailed('rtc_join_forbidden');
    expect(state().phase).toBe('FAILED');
    expect(state().failureCode).toBe('rtc_join_forbidden');
    expect(runtime.stopped).toBeGreaterThanOrEqual(1);
  });

  it('mute y camara delegan al runtime sin crear media duplicada', async () => {
    await acceptFlow('video');
    state().toggleMute();
    expect(state().isMuted).toBe(true);
    expect(capturedRuntime!.mic[capturedRuntime!.mic.length - 1]).toBe(false);
    state().toggleMute();
    expect(capturedRuntime!.mic[capturedRuntime!.mic.length - 1]).toBe(true);

    state().toggleCamera();
    expect(state().isCameraEnabled).toBe(false);
    expect(capturedRuntime!.camera[capturedRuntime!.camera.length - 1]).toBe(false);
    state().toggleCamera();
    expect(capturedRuntime!.camera[capturedRuntime!.camera.length - 1]).toBe(true);
  });

  it('endCall en llamada conectada emite rtc:end, detiene runtime y limpia streams', async () => {
    const socket = await acceptFlow();
    capturedRuntime!.params.onLocalStream?.({ id: 'local' });
    capturedRuntime!.params.onRemoteStream?.({ id: 'remote' });
    capturedRuntime!.params.onConnected();
    const runtime = capturedRuntime!;
    state().endCall();
    expect(socket.emitted.some((entry) =>
      entry.event === 'rtc:end' && entry.payload.callId === 'call-1'
    )).toBe(true);
    expect(runtime.stopped).toBeGreaterThanOrEqual(1);
    expect(state().localStream).toBeNull();
    expect(state().remoteStream).toBeNull();
    await flush();
    expect(state().phase).toBe('IDLE');
  });

  it('un callback de llamada vieja no altera la nueva', async () => {
    await acceptFlow();
    const oldConnected = capturedRuntime!.params.onConnected;
    state().reset();
    const socket = fakeSocket();
    state().bindSocket(socket as any);
    socket.server('rtc:incoming-call', { ...incoming, callId: 'call-2' });
    await state().acceptIncomingCall();
    oldConnected();
    expect(state().phase).toBe('CONNECTING');
    expect(state().callId).toBe('call-2');
  });

  it('remote end y doble reset detienen el runtime de forma idempotente', async () => {
    await acceptFlow();
    capturedRuntime!.params.onConnected();
    const runtime = capturedRuntime!;
    state().handleRemoteEnd({ callId: 'call-1' });
    state().reset();
    state().reset();
    expect(runtime.stopped).toBeGreaterThanOrEqual(1);
    await flush();
    expect(state().phase).toBe('IDLE');
  });
});