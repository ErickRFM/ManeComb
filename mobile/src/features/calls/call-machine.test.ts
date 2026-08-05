// RC-RTC-FINALIZATION-20260805 — Maquina global de llamadas.

import { initialCallState, isBusyPhase, matchesCall, reduce } from './call-machine';
import type { IncomingCallPayload } from './call-types';

const incoming: IncomingCallPayload = {
  callId: 'call-1',
  conversationId: 'conv-1',
  mode: 'audio',
  caller: { id: 'user-a', name: 'Ana' },
};

function outgoing() {
  return reduce(initialCallState(), {
    type: 'OUTGOING_RINGING',
    callId: 'c',
    conversationId: 'conv',
    mode: 'audio',
    roomId: 'rtc:call:c',
    now: 1,
  });
}

describe('call-machine', () => {
  it('arranca en IDLE limpio', () => {
    expect(initialCallState()).toEqual(expect.objectContaining({
      phase: 'IDLE',
      callId: null,
      connectedAt: null,
    }));
  });

  it('OUTGOING_RINGING e INCOMING solo nacen desde IDLE', () => {
    const out = outgoing();
    expect(out.phase).toBe('OUTGOING_RINGING');
    expect(out.direction).toBe('outgoing');
    expect(reduce(out, {
      type: 'OUTGOING_RINGING',
      callId: 'x',
      conversationId: 'y',
      mode: 'audio',
      roomId: null,
      now: 2,
    })).toBe(out);

    const inc = reduce(initialCallState(), { type: 'INCOMING', payload: incoming, now: 1 });
    expect(inc.phase).toBe('INCOMING_RINGING');
    expect(inc.callerName).toBe('Ana');
    expect(reduce(inc, {
      type: 'INCOMING',
      payload: { ...incoming, callId: 'call-2' },
      now: 2,
    })).toBe(inc);
  });

  it('aceptacion local/remota lleva a CONNECTING, no a CONNECTED', () => {
    const incomingRinging = reduce(initialCallState(), { type: 'INCOMING', payload: incoming, now: 1 });
    const acceptedIncoming = reduce(incomingRinging, { type: 'LOCAL_ACCEPT', now: 2 });
    expect(acceptedIncoming.phase).toBe('CONNECTING');
    expect(acceptedIncoming.acceptedAt).toBe(2);

    const acceptedOutgoing = reduce(outgoing(), {
      type: 'REMOTE_ACCEPTED',
      roomId: 'rtc:call:c',
      now: 2,
    });
    expect(acceptedOutgoing.phase).toBe('CONNECTING');
    expect(acceptedOutgoing.roomId).toBe('rtc:call:c');
  });

  it('CONNECTED solo nace desde CONNECTING y fija connectedAt una vez', () => {
    const connecting = reduce(
      reduce(initialCallState(), { type: 'INCOMING', payload: incoming, now: 1 }),
      { type: 'LOCAL_ACCEPT', now: 2 }
    );
    const connected = reduce(connecting, { type: 'CONNECTED', now: 10 });
    expect(connected.phase).toBe('CONNECTED');
    expect(connected.connectedAt).toBe(10);
    expect(reduce(initialCallState(), { type: 'CONNECTED', now: 99 })).toEqual(initialCallState());
  });

  it('CONNECTED -> RECONNECTING -> CONNECTED conserva el origen del cronometro', () => {
    const connecting = reduce(
      reduce(initialCallState(), { type: 'INCOMING', payload: incoming, now: 1 }),
      { type: 'LOCAL_ACCEPT', now: 2 }
    );
    const connected = reduce(connecting, { type: 'CONNECTED', now: 10 });
    const reconnecting = reduce(connected, { type: 'RECONNECTING' });
    expect(reconnecting.phase).toBe('RECONNECTING');
    const recovered = reduce(reconnecting, { type: 'CONNECTED', now: 50 });
    expect(recovered.phase).toBe('CONNECTED');
    expect(recovered.connectedAt).toBe(10);
  });

  it('END/FAIL son terminales visibles y RESET vuelve a IDLE', () => {
    const ending = reduce(outgoing(), { type: 'END', result: 'rejected', now: 3 });
    expect(ending.phase).toBe('ENDING');
    expect(ending.endResult).toBe('rejected');
    expect(reduce(ending, { type: 'RESET' }).phase).toBe('IDLE');

    const failed = reduce(outgoing(), { type: 'FAIL', failureCode: 'ice_failed', now: 4 });
    expect(failed.phase).toBe('FAILED');
    expect(failed.failureCode).toBe('ice_failed');
  });

  it('isBusyPhase y matchesCall cubren llamada activa', () => {
    const out = outgoing();
    expect(isBusyPhase(out)).toBe(true);
    expect(isBusyPhase(initialCallState())).toBe(false);
    expect(matchesCall(out, 'c')).toBe(true);
    expect(matchesCall(out, 'z')).toBe(false);
  });
});
