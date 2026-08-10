import { bindCallSocket, emitStartCall } from './call-signaling';
import { __resetRtcServerClockForTests } from './rtc-clock';
import type { CallAck } from './call-types';

function fakeSocket(startAck?: CallAck) {
  const handlers = new Map<string, Set<(payload: any) => void>>();
  return {
    on(event: string, handler: (payload: any) => void) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
    },
    off(event: string, handler: (payload: any) => void) {
      handlers.get(event)?.delete(handler);
    },
    emit(event: string, _payload: any, ack?: (response: CallAck) => void) {
      if (event === 'rtc:call' && ack) ack(startAck || { ok: false, code: 'missing_ack' });
    },
    server(event: string, payload: any) {
      for (const handler of handlers.get(event) || []) handler(payload);
    },
  };
}

beforeEach(() => __resetRtcServerClockForTests());
afterEach(() => {
  __resetRtcServerClockForTests();
  jest.restoreAllMocks();
});

describe('call signaling clock skew normalization', () => {
  it('normaliza incoming con telefono dos minutos adelantado', () => {
    const localNow = Date.parse('2026-08-10T01:02:00.000Z');
    const serverNow = '2026-08-10T01:00:00.000Z';
    jest.spyOn(Date, 'now').mockReturnValue(localNow);
    let incoming: any = null;
    const socket = fakeSocket();
    const unbind = bindCallSocket(socket as any, {
      onIncoming: (payload) => { incoming = payload; },
      onAccepted() {},
      onRejected() {},
      onCancelled() {},
      onTimeout() {},
      onEnd() {},
    });

    socket.server('server:pong', { serverTime: serverNow });
    socket.server('rtc:incoming-call', {
      callId: 'clock-incoming',
      conversationId: 'conv-1',
      caller: { id: 'user-a', name: 'Ana' },
      mode: 'audio',
      expiresAt: '2026-08-10T01:00:35.000Z',
      ringTimeoutMs: 35_000,
    });

    expect(incoming).not.toBeNull();
    expect(Date.parse(incoming.expiresAt) - localNow).toBeGreaterThanOrEqual(34_900);
    expect(Date.parse(incoming.expiresAt) - localNow).toBeLessThanOrEqual(35_000);
    unbind();
  });

  it('normaliza el ACK outgoing con la misma calibracion', async () => {
    const localNow = Date.parse('2026-08-10T00:58:00.000Z');
    jest.spyOn(Date, 'now').mockReturnValue(localNow);
    const socket = fakeSocket({
      ok: true,
      callId: 'clock-outgoing',
      roomId: 'rtc:clock-outgoing',
      expiresAt: '2026-08-10T01:00:35.000Z',
      ringTimeoutMs: 35_000,
    });
    const unbind = bindCallSocket(socket as any, {
      onIncoming() {},
      onAccepted() {},
      onRejected() {},
      onCancelled() {},
      onTimeout() {},
      onEnd() {},
    });

    socket.server('server:pong', { serverTime: '2026-08-10T01:00:00.000Z' });
    const ack = await emitStartCall(socket as any, { conversationId: 'conv-1', mode: 'video' });

    expect(ack.ok).toBe(true);
    expect(Date.parse(String(ack.expiresAt)) - localNow).toBeGreaterThanOrEqual(34_900);
    expect(Date.parse(String(ack.expiresAt)) - localNow).toBeLessThanOrEqual(35_000);
    unbind();
  });
});
