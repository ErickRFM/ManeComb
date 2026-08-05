// RC-MOBILE-CALLS-PRODUCTION-01 Bloque B — Store global de llamadas (lifecycle de signaling).

// El tsconfig de mobile (RN) no trae tipos de node; jest si los provee en runtime.
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

// Runtime falso: captura params y registra stop/mic sin tocar nativo/red.
let capturedRuntime: { params: CallRuntimeParams; stopped: number; mic: boolean[] } | null = null;
function installFakeRuntime() {
  setCallRuntimeFactory((params) => {
    const entry = { params, stopped: 0, mic: [] as boolean[] };
    capturedRuntime = entry;
    return {
      stop: () => { entry.stopped += 1; },
      setMicEnabled: (enabled: boolean) => { entry.mic.push(enabled); },
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
    emit(event: string, payload: any, ack?: (r: any) => void) {
      this.emitted.push({ event, payload });
      if (event === 'rtc:call' && ack) ack(nextAck);
    },
    // Simula que el backend empuja un evento al cliente por el socket.
    server(event: string, payload: any) {
      (handlers.get(event) ? Array.from(handlers.get(event)!) : []).forEach((h) => h(payload));
    },
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const state = () => useCallStore.getState();

const incoming = { callId: 'call-1', conversationId: 'conv-1', mode: 'audio' as const, caller: { id: 'user-a', name: 'Ana' } };

beforeEach(() => {
  __setResultDisplayMsForTests(0);
  __setConnectTimeoutMsForTests(100000); // grande por defecto; el test de timeout lo baja
  installFakeRuntime();
  capturedRuntime = null;
  const s = state();
  s.unbindSocket();
  s.reset();
});

describe('call-store lifecycle', () => {
  it('1/2. recibe incoming globalmente (independiente de la pantalla)', () => {
    const socket = fakeSocket();
    state().bindSocket(socket as any);
    socket.server('rtc:incoming-call', incoming);
    expect(state().phase).toBe('INCOMING_RINGING');
    expect(state().callerName).toBe('Ana');
  });

  it('3. startCall conserva el callId entregado por el ACK del backend', async () => {
    const socket = fakeSocket();
    socket.setNextAck({ ok: true, callId: 'C-42', roomId: 'rtc:call:C-42', status: 'ringing' });
    state().bindSocket(socket as any);
    const res = await state().startCall({ conversationId: 'conv-1', mode: 'audio' });
    expect(res.ok).toBe(true);
    expect(state().phase).toBe('OUTGOING_RINGING');
    expect(state().callId).toBe('C-42');
    expect(state().roomId).toBe('rtc:call:C-42');
  });

  it('4. busy (ACK) vuelve limpio a IDLE sin crear sesion', async () => {
    const socket = fakeSocket();
    socket.setNextAck({ ok: false, code: 'busy' });
    state().bindSocket(socket as any);
    const res = await state().startCall({ conversationId: 'conv-1', mode: 'audio' });
    expect(res.ok).toBe(false);
    expect(res.code).toBe('busy');
    expect(state().phase).toBe('IDLE');
    expect(state().callId).toBeNull();
  });

  it('5. direct_call_required no crea sesion local', async () => {
    const socket = fakeSocket();
    socket.setNextAck({ ok: false, code: 'direct_call_required' });
    state().bindSocket(socket as any);
    const res = await state().startCall({ conversationId: 'conv-group', mode: 'audio' });
    expect(res.code).toBe('direct_call_required');
    expect(state().phase).toBe('IDLE');
    expect(state().callId).toBeNull();
  });

  it('6. aceptar termina en CONNECTING (no CONNECTED) y emite rtc:accept', () => {
    const socket = fakeSocket();
    state().bindSocket(socket as any);
    socket.server('rtc:incoming-call', incoming);
    state().acceptIncomingCall();
    expect(state().phase).toBe('CONNECTING');
    expect(socket.emitted.some((e) => e.event === 'rtc:accept' && e.payload.callId === 'call-1')).toBe(true);
  });

  it('7. rechazo limpia el modal (vuelve a IDLE)', async () => {
    const socket = fakeSocket();
    state().bindSocket(socket as any);
    socket.server('rtc:incoming-call', incoming);
    state().rejectIncomingCall();
    expect(socket.emitted.some((e) => e.event === 'rtc:reject')).toBe(true);
    expect(state().phase).toBe('ENDING');
    await flush();
    expect(state().phase).toBe('IDLE');
  });

  it('8. cancelacion remota limpia el modal', async () => {
    const socket = fakeSocket();
    state().bindSocket(socket as any);
    socket.server('rtc:incoming-call', incoming);
    socket.server('rtc:call-cancelled', { callId: 'call-1' });
    expect(state().endResult).toBe('cancelled');
    await flush();
    expect(state().phase).toBe('IDLE');
  });

  it('9. timeout limpia ambos estados', async () => {
    const socket = fakeSocket();
    socket.setNextAck({ ok: true, callId: 'C-9', roomId: 'rtc:call:C-9', status: 'ringing' });
    state().bindSocket(socket as any);
    await state().startCall({ conversationId: 'conv-1', mode: 'audio' });
    socket.server('rtc:call-timeout', { callId: 'C-9' });
    expect(state().endResult).toBe('no_answer');
    await flush();
    expect(state().phase).toBe('IDLE');
  });

  it('10. evento duplicado no crea un segundo modal', () => {
    const socket = fakeSocket();
    state().bindSocket(socket as any);
    socket.server('rtc:incoming-call', incoming);
    const createdAt = state().createdAt;
    socket.server('rtc:incoming-call', incoming); // mismo callId
    expect(state().phase).toBe('INCOMING_RINGING');
    expect(state().createdAt).toBe(createdAt); // no se reinicio
    expect(socket.emitted.some((e) => e.event === 'rtc:busy')).toBe(false); // duplicado != busy
  });

  it('11. un nuevo socket reemplaza los listeners del anterior', () => {
    const a = fakeSocket();
    const b = fakeSocket();
    state().bindSocket(a as any);
    state().bindSocket(b as any);
    expect(a.handlerCount('rtc:incoming-call')).toBe(0); // desvinculado
    a.server('rtc:incoming-call', incoming); // ignorado
    expect(state().phase).toBe('IDLE');
    b.server('rtc:incoming-call', incoming); // atendido por el nuevo
    expect(state().phase).toBe('INCOMING_RINGING');
  });

  it('12. logout limpia el estado y suelta el socket', () => {
    const socket = fakeSocket();
    state().bindSocket(socket as any);
    socket.server('rtc:incoming-call', incoming);
    state().unbindSocket();
    state().reset();
    expect(state().phase).toBe('IDLE');
    expect(state()._socket).toBeNull();
  });

  it('13. un login posterior no conserva la llamada vieja', () => {
    const a = fakeSocket();
    state().bindSocket(a as any);
    a.server('rtc:incoming-call', incoming);
    // logout (el overlay desmonta -> unbind + reset)
    state().unbindSocket();
    state().reset();
    // login posterior
    const b = fakeSocket();
    state().bindSocket(b as any);
    expect(state().phase).toBe('IDLE');
    expect(state().callId).toBeNull();
  });

  it('14. conversacion grupal no habilita llamada', () => {
    expect(canConversationStartCall({ kind: 'direct' })).toBe(true);
    expect(canConversationStartCall({ kind: 'group' })).toBe(false);
    expect(canConversationStartCall(null)).toBe(false);
  });

  it('15. no existe una segunda invocacion de io() para RTC en el chat controller', () => {
    const file = path.join(__dirname, '..', '..', 'screens', 'chat', 'hooks', 'use-chat-controller.ts');
    const content = fs.readFileSync(file, 'utf8');
    expect(content.includes('io(SOCKET_URL')).toBe(false);
    expect(content.includes('getSharedRealtimeSocket()')).toBe(true);
  });

  it('20. abrir Chat no ejecuta rtc:join (join solo tras aceptar, en el runtime global)', () => {
    const file = path.join(__dirname, '..', '..', 'screens', 'chat', 'hooks', 'use-chat-controller.ts');
    const content = fs.readFileSync(file, 'utf8');
    expect(content.includes('Join RTC room when entering a conversation')).toBe(false);
    expect(content.includes('abrir una conversacion YA NO ejecuta rtc:join')).toBe(true);
  });
});

describe('call-store runtime (Bloque C)', () => {
  async function acceptFlow() {
    const socket = fakeSocket();
    state().bindSocket(socket as any);
    socket.server('rtc:incoming-call', incoming);
    state().acceptIncomingCall();
    return socket;
  }

  it('C6. aceptar arranca el runtime en CONNECTING; NO conecta sin onConnected', async () => {
    await acceptFlow();
    expect(state().phase).toBe('CONNECTING');
    expect(capturedRuntime).not.toBeNull();
    expect(capturedRuntime!.params.callId).toBe('call-1');
    // ninguna señal por si sola conecta: seguimos en CONNECTING
    expect(state().phase).not.toBe('CONNECTED');
    expect(state().connectedAt).toBeNull();
    expect(state().elapsedSeconds).toBe(0); // C6: timer no corre antes de connectedAt
  });

  it('C6. onConnected del runtime pasa a CONNECTED con connectedAt', async () => {
    await acceptFlow();
    capturedRuntime!.params.onConnected();
    expect(state().phase).toBe('CONNECTED');
    expect(typeof state().connectedAt).toBe('number'); // timer corre desde connectedAt
  });

  it('C7. timeout de conexion sin CONNECTED -> FAILED(ice_timeout) y avisa rtc:end', async () => {
    __setResultDisplayMsForTests(100000); // sin auto-reset durante la espera (test determinista)
    __setConnectTimeoutMsForTests(20);
    const socket = await acceptFlow();
    await new Promise((r) => setTimeout(r, 50));
    expect(state().phase).toBe('FAILED');
    expect(state().failureCode).toBe('ice_timeout');
    expect(socket.emitted.some((e) => e.event === 'rtc:end')).toBe(true);
    state().reset();
    expect(state().phase).toBe('IDLE');
  });

  it('C. onFailed(ice_failed) del runtime -> FAILED y limpia', async () => {
    await acceptFlow();
    capturedRuntime!.params.onFailed('ice_failed');
    expect(state().phase).toBe('FAILED');
    expect(state().failureCode).toBe('ice_failed');
    expect(capturedRuntime!.stopped).toBeGreaterThanOrEqual(1);
  });

  it('C8. mute/unmute cambia setMicEnabled (enabled = !muted)', async () => {
    await acceptFlow();
    state().toggleMute();
    expect(state().isMuted).toBe(true);
    expect(capturedRuntime!.mic[capturedRuntime!.mic.length - 1]).toBe(false);
    state().toggleMute();
    expect(state().isMuted).toBe(false);
    expect(capturedRuntime!.mic[capturedRuntime!.mic.length - 1]).toBe(true);
  });

  it('C9. un onConnected de una llamada VIEJA no conecta una nueva', async () => {
    await acceptFlow();
    const oldConnected = capturedRuntime!.params.onConnected;
    state().reset(); // termina la llamada vieja
    // nueva llamada
    const socket = fakeSocket();
    state().bindSocket(socket as any);
    socket.server('rtc:incoming-call', { ...incoming, callId: 'call-2' });
    state().acceptIncomingCall();
    expect(state().phase).toBe('CONNECTING');
    oldConnected(); // callback viejo (callId call-1)
    expect(state().phase).toBe('CONNECTING'); // NO conecto la nueva
    expect(state().callId).toBe('call-2');
  });

  it('C9. remote end detiene el runtime y vuelve a IDLE', async () => {
    await acceptFlow();
    capturedRuntime!.params.onConnected();
    const runtime = capturedRuntime!;
    state().handleRemoteEnd({ callId: 'call-1' });
    expect(runtime.stopped).toBeGreaterThanOrEqual(1);
    await flush();
    expect(state().phase).toBe('IDLE');
  });

  it('C9. logout/reset detiene el runtime; doble reset es idempotente', async () => {
    await acceptFlow();
    const runtime = capturedRuntime!;
    state().reset();
    state().reset();
    expect(runtime.stopped).toBeGreaterThanOrEqual(1);
    expect(state().phase).toBe('IDLE');
  });
});
