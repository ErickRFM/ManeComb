import {
  __setConnectTimeoutMsForTests,
  __setResultDisplayMsForTests,
  setCallRuntimeFactory,
  useCallStore,
} from './call-store';
import type { CallAck } from './call-types';

function fakeSocket() {
  const handlers = new Map<string, Set<(payload: any) => void>>();
  let acceptAck: CallAck = { ok: false, code: 'answered_elsewhere' };
  return {
    emitted: [] as Array<{ event: string; payload: any }>,
    setAcceptAck(ack: CallAck) { acceptAck = ack; },
    on(event: string, handler: (payload: any) => void) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
    },
    off(event: string, handler: (payload: any) => void) { handlers.get(event)?.delete(handler); },
    emit(event: string, payload: any, ack?: (response: CallAck) => void) {
      this.emitted.push({ event, payload });
      if (event === 'rtc:accept' && ack) ack(acceptAck);
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
  state().unbindSocket();
  state().reset();
});

afterEach(() => {
  state().unbindSocket();
  state().reset();
  setCallRuntimeFactory(null);
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

describe('RTC multi-device accept ownership', () => {
  it('apaga el timbrado del dispositivo hermano cuando la llamada fue aceptada en otro socket', () => {
    const socket = fakeSocket();
    state().bindSocket(socket as any);
    socket.server('rtc:incoming-call', {
      callId: 'call-multi-1',
      conversationId: 'conv-1',
      mode: 'audio',
      caller: { id: 'caller-1', name: 'Ana' },
      ringTimeoutMs: 35000,
    });
    expect(state().phase).toBe('INCOMING_RINGING');

    socket.server('rtc:call-accepted', { callId: 'call-multi-1', roomId: 'rtc:call:call-multi-1' });

    expect(state().phase).toBe('ENDING');
    expect(state().endResult).toBe('answered_elsewhere');
    expect(state().failureCode).toBeNull();
    expect(socket.emitted.some((entry) => entry.event === 'rtc:end')).toBe(false);
  });

  it('un accept rechazado como answered_elsewhere no abre media ni termina la llamada ganadora', async () => {
    const socket = fakeSocket();
    let runtimeStarts = 0;
    setCallRuntimeFactory(() => {
      runtimeStarts += 1;
      return { stop() {}, setMicEnabled() {}, setCameraEnabled() {} };
    });
    state().bindSocket(socket as any);
    socket.server('rtc:incoming-call', {
      callId: 'call-multi-2',
      conversationId: 'conv-1',
      mode: 'video',
      caller: { id: 'caller-1', name: 'Ana' },
      ringTimeoutMs: 35000,
    });

    await state().acceptIncomingCall();

    expect(state().phase).toBe('ENDING');
    expect(state().endResult).toBe('answered_elsewhere');
    expect(runtimeStarts).toBe(0);
    expect(socket.emitted.filter((entry) => entry.event === 'rtc:accept')).toHaveLength(1);
    expect(socket.emitted.some((entry) => entry.event === 'rtc:end')).toBe(false);
  });
});