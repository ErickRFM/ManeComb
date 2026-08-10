import {
  __setConnectTimeoutMsForTests,
  __setResultDisplayMsForTests,
  setCallRuntimeFactory,
  useCallStore,
} from './call-store';
import type { CallAck } from './call-types';

function fakeSocket() {
  const handlers = new Map<string, Set<(payload: any) => void>>();
  let nextCallAck: CallAck = { ok: false, code: 'no_ack' };
  let nextAcceptAck: CallAck = { ok: true };

  return {
    emitted: [] as Array<{ event: string; payload: any }>,
    setNextCallAck(ack: CallAck) { nextCallAck = ack; },
    setNextAcceptAck(ack: CallAck) { nextAcceptAck = ack; },
    on(event: string, handler: (payload: any) => void) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
    },
    off(event: string, handler: (payload: any) => void) {
      handlers.get(event)?.delete(handler);
    },
    emit(event: string, payload: any, ack?: (response: CallAck) => void) {
      this.emitted.push({ event, payload });
      if (event === 'rtc:call' && ack) ack(nextCallAck);
      if (event === 'rtc:accept' && ack) ack(nextAcceptAck);
    },
    server(event: string, payload: any) {
      for (const handler of handlers.get(event) || []) handler(payload);
    },
  };
}

const state = () => useCallStore.getState();

beforeEach(() => {
  jest.useFakeTimers();
  __setResultDisplayMsForTests(100000);
  __setConnectTimeoutMsForTests(100000);
  setCallRuntimeFactory(() => ({
    stop() {},
    setMicEnabled() {},
    setCameraEnabled() {},
  }));
  state().unbindSocket();
  state().reset();
});

afterEach(() => {
  state().unbindSocket();
  state().reset();
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

describe('ringing expiry independent of backend node', () => {
  it('termina outgoing en no_answer aunque nunca llegue rtc:call-timeout', async () => {
    const socket = fakeSocket();
    socket.setNextCallAck({
      ok: true,
      callId: 'outgoing-1',
      roomId: 'rtc:call:outgoing-1',
      status: 'ringing',
      ringTimeoutMs: 1000,
    });
    state().bindSocket(socket as any);

    expect(await state().startCall({ conversationId: 'conv-1', mode: 'audio' }))
      .toEqual({ ok: true });
    expect(state().phase).toBe('OUTGOING_RINGING');

    jest.advanceTimersByTime(1000);

    expect(state().phase).toBe('ENDING');
    expect(state().endResult).toBe('no_answer');
    expect(socket.emitted.some((entry) => entry.event === 'rtc:cancel')).toBe(false);
    expect(socket.emitted.some((entry) => entry.event === 'rtc:end')).toBe(false);
  });

  it('termina incoming en no_answer aunque el nodo originador desaparezca', () => {
    const socket = fakeSocket();
    state().bindSocket(socket as any);
    socket.server('rtc:incoming-call', {
      callId: 'incoming-1',
      conversationId: 'conv-1',
      mode: 'video',
      caller: { id: 'user-a', name: 'Ana' },
      ringTimeoutMs: 750,
    });
    expect(state().phase).toBe('INCOMING_RINGING');

    jest.advanceTimersByTime(750);

    expect(state().phase).toBe('ENDING');
    expect(state().endResult).toBe('no_answer');
    expect(socket.emitted.some((entry) => entry.event === 'rtc:reject')).toBe(false);
  });

  it('aceptar cancela el ring timer para no cortar una llamada valida', async () => {
    const socket = fakeSocket();
    state().bindSocket(socket as any);
    socket.server('rtc:incoming-call', {
      callId: 'incoming-accepted',
      conversationId: 'conv-1',
      mode: 'audio',
      caller: { id: 'user-a', name: 'Ana' },
      ringTimeoutMs: 500,
    });

    await state().acceptIncomingCall();
    expect(state().phase).toBe('CONNECTING');

    jest.advanceTimersByTime(1000);

    expect(state().phase).toBe('CONNECTING');
    expect(state().endResult).toBeNull();
  });

  it('accept remoto cancela el ring timer del caller', async () => {
    const socket = fakeSocket();
    socket.setNextCallAck({
      ok: true,
      callId: 'outgoing-accepted',
      roomId: 'rtc:call:outgoing-accepted',
      status: 'ringing',
      ringTimeoutMs: 500,
    });
    state().bindSocket(socket as any);
    await state().startCall({ conversationId: 'conv-1', mode: 'audio' });

    socket.server('rtc:call-accepted', {
      callId: 'outgoing-accepted',
      roomId: 'rtc:call:outgoing-accepted',
    });
    expect(state().phase).toBe('CONNECTING');

    jest.advanceTimersByTime(1000);

    expect(state().phase).toBe('CONNECTING');
    expect(state().endResult).toBeNull();
  });
});
