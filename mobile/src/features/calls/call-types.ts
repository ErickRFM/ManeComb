// RC-MOBILE-CALLS-PRODUCTION-01 Bloque B — Tipos del lifecycle global de llamadas (mobile).
// Sin dependencias de React Native: se prueba en node como los demas utils.

export type CallPhase =
  | 'IDLE'
  | 'OUTGOING_RINGING'
  | 'INCOMING_RINGING'
  | 'CONNECTING'
  | 'CONNECTED' // definido para el contrato; NO alcanzable en Bloque B (media = Bloque C)
  | 'ENDING'
  | 'FAILED';

export type CallDirection = 'outgoing' | 'incoming' | null;
export type CallMode = 'audio' | 'video';

// Resultado breve mostrado antes de volver a IDLE.
export type CallEndResult =
  | 'rejected'
  | 'busy'
  | 'no_answer'
  | 'cancelled'
  | 'ended'
  | 'failed'
  | null;

export interface CallState {
  phase: CallPhase;
  callId: string | null;
  conversationId: string | null;
  callerId: string | null;
  callerName: string | null;
  peerUserId: string | null;
  direction: CallDirection;
  mode: CallMode | null;
  roomId: string | null; // rtc:call:{callId} (autoritativo backend); lo usa el join del Bloque C
  createdAt: number | null;
  acceptedAt: number | null;
  connectedAt: number | null; // solo Bloque C
  endedAt: number | null;
  endResult: CallEndResult;
  failureCode: string | null;
}

export interface IncomingCallPayload {
  callId: string;
  conversationId: string;
  mode: CallMode;
  caller: { id: string; name: string | null };
}

export interface CallAck {
  ok: boolean;
  callId?: string;
  roomId?: string;
  status?: string;
  code?: string;
}

// Contrato minimo del socket compartido que consume el modulo (evita acoplar socket.io-client
// y permite pruebas con un doble). El socket real de root-store cumple esta forma.
export interface CallSocket {
  on(event: string, handler: (...args: any[]) => void): unknown;
  off(event: string, handler: (...args: any[]) => void): unknown;
  emit(event: string, payload?: unknown, ack?: (response: any) => void): unknown;
}
