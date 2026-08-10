import {
  __setConnectTimeoutMsForTests,
  __setResultDisplayMsForTests,
  setCallRuntimeFactory,
  useCallStore,
} from './call-store';
import type { CallAck } from './call-types';

function fakeSocket() {
  const handlers = new Map<string, Set<(payload: any) => void>>();
  let acceptAck: CallAck = { ok: false, code: 'call_expired' };

  return {
    emitted: [] as Array<{ event: string; payload: any }>,
    setAcceptAck(ack: CallAck) { acceptAck = ack; },
    on(event: string, handler: (payload: any) => void) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
    },
    off(event: string, handler: (payload: any) => void) {
      handlers.get(event)?.delete(handler);
    },
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

describe('backend ringing deadline authority', () => {
  it.each(['call_expired', 'unknown_call'])(
    'mapea accept terminal %s a no_answer sin arrancar media ni emitir otro lifecycle',
    async (code) => {
      const socket = fakeSocket();
      socket.setAcceptAck({ ok: false, code });
      let runtimeStarts = 0;
      setCallRuntimeFactory(() => {
        runtimeStarts += 1;
        return {
          stop() {},
          setMicEnabled() {},
          setCameraEnabled() {},
        };
      });
      state().bindSocket(socket as any);

      socket.server('rtc:incoming-call', {
        callId: `terminal-${code}`,
        conversationId: 'conv-1',
        mode: 'audio',
        caller: { id: 'user-a', name: 'Ana' },
        ringTimeoutMs: 60000,
      });
      expect(state().phase).toBe('INCOMING_RINGING');

      await state().acceptIncomingCall();

      expect(state().phase).toBe('ENDING');
      expect(state().endResult).toBe('no_answer');
      expect(state().failureCode).toBeNull();
      expect(runtimeStarts).toBe(0);
      expect(socket.emitted.filter((entry) => entry.event === 'rtc:accept')).toHaveLength(1);
      expect(socket.emitted.some((entry) => entry.event === 'rtc:end')).toBe(false);
      expect(socket.emitted.some((entry) => entry.event === 'rtc:reject')).toBe(false);
    }
  );

  it('mantiene accept valido como CONNECTING', async () => {
    const socket = fakeSocket();
    socket.setAcceptAck({ ok: true });
    let runtimeStarts = 0;
    setCallRuntimeFactory(() => {
      runtimeStarts += 1;
      return {
        stop() {},
        setMicEnabled() {},
        setCameraEnabled() {},
      };
    });
    state().bindSocket(socket as any);

    socket.server('rtc:incoming-call', {
      callId: 'still-valid',
      conversationId: 'conv-1',
      mode: 'video',
      caller: { id: 'user-a', name: 'Ana' },
      ringTimeoutMs: 60000,
    });

    await state().acceptIncomingCall();

    expect(state().phase).toBe('CONNECTING');
    expect(state().endResult).toBeNull();
    expect(runtimeStarts).toBe(1);
  });
});
