// RC-MOBILE-CALLS-PRODUCTION-01 Bloque B — Maquina de estados global de llamadas (pura).
// Transicion UNICA y explicita (`reduce`). Sin booleanos contradictorios; el `phase` es la verdad.
// Bloque B NO alcanza CONNECTED (eso requiere media real = Bloque C).

import type { CallState, CallEndResult, IncomingCallPayload, CallMode } from './call-types';

export function initialCallState(): CallState {
  return {
    phase: 'IDLE',
    callId: null,
    conversationId: null,
    callerId: null,
    callerName: null,
    peerUserId: null,
    direction: null,
    mode: null,
    roomId: null,
    createdAt: null,
    acceptedAt: null,
    connectedAt: null,
    endedAt: null,
    endResult: null,
    failureCode: null,
  };
}

export const isIdle = (state: CallState): boolean => state.phase === 'IDLE';

// "Ocupado" para responder busy: cualquier fase distinta de IDLE (y no un cierre ya mostrado).
export const isBusyPhase = (state: CallState): boolean =>
  state.phase !== 'IDLE' && state.phase !== 'ENDING' && state.phase !== 'FAILED';

export const matchesCall = (state: CallState, callId: string | null | undefined): boolean =>
  Boolean(callId) && state.callId === callId;

export type CallEvent =
  | { type: 'OUTGOING_RINGING'; callId: string; conversationId: string; mode: CallMode; roomId: string | null; peerUserId?: string | null; now: number }
  | { type: 'INCOMING'; payload: IncomingCallPayload; now: number }
  | { type: 'LOCAL_ACCEPT'; now: number }
  | { type: 'REMOTE_ACCEPTED'; roomId?: string | null; now: number }
  | { type: 'END'; result: CallEndResult; now: number }
  | { type: 'FAIL'; failureCode: string; now: number }
  | { type: 'RESET' };

// Transiciones permitidas. Un evento invalido para la fase actual NO muta el estado (idempotente/seguro).
export function reduce(state: CallState, event: CallEvent): CallState {
  switch (event.type) {
    case 'OUTGOING_RINGING': {
      if (state.phase !== 'IDLE') return state;
      return {
        ...initialCallState(),
        phase: 'OUTGOING_RINGING',
        direction: 'outgoing',
        callId: event.callId,
        conversationId: event.conversationId,
        mode: event.mode,
        roomId: event.roomId,
        peerUserId: event.peerUserId ?? null,
        createdAt: event.now,
      };
    }
    case 'INCOMING': {
      // Solo desde IDLE. Duplicado del mismo callId o estar ocupado => sin cambio (lo maneja el store).
      if (state.phase !== 'IDLE') return state;
      const { payload } = event;
      return {
        ...initialCallState(),
        phase: 'INCOMING_RINGING',
        direction: 'incoming',
        callId: payload.callId,
        conversationId: payload.conversationId,
        callerId: payload.caller.id,
        callerName: payload.caller.name,
        peerUserId: payload.caller.id,
        mode: payload.mode,
        createdAt: event.now,
      };
    }
    case 'LOCAL_ACCEPT': {
      if (state.phase !== 'INCOMING_RINGING') return state;
      return { ...state, phase: 'CONNECTING', acceptedAt: event.now };
    }
    case 'REMOTE_ACCEPTED': {
      if (state.phase !== 'OUTGOING_RINGING') return state;
      return { ...state, phase: 'CONNECTING', acceptedAt: event.now, roomId: event.roomId ?? state.roomId };
    }
    case 'END': {
      if (state.phase === 'IDLE') return state;
      return { ...state, phase: 'ENDING', endResult: event.result, endedAt: event.now };
    }
    case 'FAIL': {
      if (state.phase === 'IDLE') return state;
      return { ...state, phase: 'FAILED', failureCode: event.failureCode, endResult: 'failed', endedAt: event.now };
    }
    case 'RESET':
      return initialCallState();
    default:
      return state;
  }
}
