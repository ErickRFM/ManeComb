import { initialCallState, isBusyPhase, matchesCall, reduce } from './call-machine';
import type { IncomingCallPayload } from './call-types';

const incoming: IncomingCallPayload = {
  callId: 'call-1',
  conversationId: 'conv-1',
  mode: 'audio',
  caller: { id: 'user-a', name: 'Ana' },
};

describe('call-machine', () => {
  it('arranca en IDLE limpio', () => {
    expect(initialCallState().phase).toBe('IDLE');
  });

  it('OUTGOING_RINGING solo desde IDLE', () => {
    const state = reduce(initialCallState(), {
      type: 'OUTGOING_RINGING',
      callId: 'c',
      conversationId: 'conv',
      mode: 'audio',
      roomId: 'rtc:call:c',
      now: 1,
    });
    expect(state.phase).toBe('OUTGOING_RINGING');
    expect(state.direction).toBe('outgoing');
    expect(state.callId).toBe('c');
    expect(reduce(state, {
      type: 'OUTGOING_RINGING',
      callId: 'x',
      conversationId: 'y',
      mode: 'audio',
      roomId: null,
      now: 2,
    })).toBe(state);
  });

  it('INCOMING solo desde IDLE', () => {
    const state = reduce(initialCallState(), { type: 'INCOMING', payload: incoming, now: 1 });
    expect(state.phase).toBe('INCOMING_RINGING');
    expect(state.callerName).toBe('Ana');
    expect(state.callId).toBe('call-1');
    expect(reduce(state, {
      type: 'INCOMING',
      payload: { ...incoming, callId: 'call-2' },
      now: 2,
    })).toBe(state);
  });

  it('aceptar termina en CONNECTING', () => {
    const ringing = reduce(initialCallState(), { type: 'INCOMING', payload: incoming, now: 1 });
    const accepted = reduce(ringing, { type: 'LOCAL_ACCEPT', now: 2 });
    expect(accepted.phase).toBe('CONNECTING');
    expect(accepted.acceptedAt).toBe(2);
  });

  it('REMOTE_ACCEPTED lleva a CONNECTING desde OUTGOING', () => {
    const outgoing = reduce(initialCallState(), {
      type: 'OUTGOING_RINGING',
      callId: 'c',
      conversationId: 'conv',
      mode: 'audio',
      roomId: null,
      now: 1,
    });
    const accepted = reduce(outgoing, {
      type: 'REMOTE_ACCEPTED',
      roomId: 'rtc:call:c',
      now: 2,
    });
    expect(accepted.phase).toBe('CONNECTING');
    expect(accepted.roomId).toBe('rtc:call:c');
  });

  it('CONNECTED puede pasar a RECONNECTING y recuperarse sin reiniciar el cronometro', () => {
    const ringing = reduce(initialCallState(), { type: 'INCOMING', payload: incoming, now: 1 });
    const connecting = reduce(ringing, { type: 'LOCAL_ACCEPT', now: 2 });
    const connected = reduce(connecting, { type: 'CONNECTED', now: 3 });
    const reconnecting = reduce(connected, { type: 'RECONNECTING', now: 4 });
    const recovered = reduce(reconnecting, { type: 'CONNECTED', now: 5 });
    expect(reconnecting.phase).toBe('RECONNECTING');
    expect(recovered.phase).toBe('CONNECTED');
    expect(recovered.connectedAt).toBe(3);
  });

  it('END va a ENDING con resultado; RESET vuelve a IDLE', () => {
    const outgoing = reduce(initialCallState(), {
      type: 'OUTGOING_RINGING',
      callId: 'c',
      conversationId: 'conv',
      mode: 'audio',
      roomId: null,
      now: 1,
    });
    const ending = reduce(outgoing, { type: 'END', result: 'rejected', now: 3 });
    expect(ending.phase).toBe('ENDING');
    expect(ending.endResult).toBe('rejected');
    expect(reduce(ending, { type: 'RESET' }).phase).toBe('IDLE');
  });

  it('isBusyPhase y matchesCall', () => {
    const outgoing = reduce(initialCallState(), {
      type: 'OUTGOING_RINGING',
      callId: 'c',
      conversationId: 'conv',
      mode: 'audio',
      roomId: null,
      now: 1,
    });
    expect(isBusyPhase(outgoing)).toBe(true);
    expect(isBusyPhase(initialCallState())).toBe(false);
    expect(matchesCall(outgoing, 'c')).toBe(true);
    expect(matchesCall(outgoing, 'z')).toBe(false);
  });
});
