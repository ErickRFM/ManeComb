// RC-MOBILE-CALLS-PRODUCTION-01 Bloque B — Maquina de estados global (pura).

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
    const s = reduce(initialCallState(), { type: 'OUTGOING_RINGING', callId: 'c', conversationId: 'conv', mode: 'audio', roomId: 'rtc:call:c', now: 1 });
    expect(s.phase).toBe('OUTGOING_RINGING');
    expect(s.direction).toBe('outgoing');
    expect(s.callId).toBe('c');
    // invalido desde otra fase -> sin cambio
    expect(reduce(s, { type: 'OUTGOING_RINGING', callId: 'x', conversationId: 'y', mode: 'audio', roomId: null, now: 2 })).toBe(s);
  });

  it('INCOMING solo desde IDLE', () => {
    const s = reduce(initialCallState(), { type: 'INCOMING', payload: incoming, now: 1 });
    expect(s.phase).toBe('INCOMING_RINGING');
    expect(s.callerName).toBe('Ana');
    expect(s.callId).toBe('call-1');
    // ocupado -> ignora
    expect(reduce(s, { type: 'INCOMING', payload: { ...incoming, callId: 'call-2' }, now: 2 })).toBe(s);
  });

  it('aceptar termina en CONNECTING, nunca CONNECTED (Bloque B)', () => {
    const ringing = reduce(initialCallState(), { type: 'INCOMING', payload: incoming, now: 1 });
    const accepted = reduce(ringing, { type: 'LOCAL_ACCEPT', now: 2 });
    expect(accepted.phase).toBe('CONNECTING');
    expect(accepted.phase).not.toBe('CONNECTED');
    expect(accepted.acceptedAt).toBe(2);
  });

  it('REMOTE_ACCEPTED lleva a CONNECTING desde OUTGOING', () => {
    const out = reduce(initialCallState(), { type: 'OUTGOING_RINGING', callId: 'c', conversationId: 'conv', mode: 'audio', roomId: null, now: 1 });
    const acc = reduce(out, { type: 'REMOTE_ACCEPTED', roomId: 'rtc:call:c', now: 2 });
    expect(acc.phase).toBe('CONNECTING');
    expect(acc.roomId).toBe('rtc:call:c');
  });

  it('END va a ENDING con resultado; RESET vuelve a IDLE', () => {
    const out = reduce(initialCallState(), { type: 'OUTGOING_RINGING', callId: 'c', conversationId: 'conv', mode: 'audio', roomId: null, now: 1 });
    const ending = reduce(out, { type: 'END', result: 'rejected', now: 3 });
    expect(ending.phase).toBe('ENDING');
    expect(ending.endResult).toBe('rejected');
    expect(reduce(ending, { type: 'RESET' }).phase).toBe('IDLE');
  });

  it('isBusyPhase y matchesCall', () => {
    const out = reduce(initialCallState(), { type: 'OUTGOING_RINGING', callId: 'c', conversationId: 'conv', mode: 'audio', roomId: null, now: 1 });
    expect(isBusyPhase(out)).toBe(true);
    expect(isBusyPhase(initialCallState())).toBe(false);
    expect(matchesCall(out, 'c')).toBe(true);
    expect(matchesCall(out, 'z')).toBe(false);
  });
});
