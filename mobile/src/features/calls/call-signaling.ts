// RC-RTC-FINALIZATION-20260805 — Adaptador de signaling sobre el socket compartido.
// Registra listeners puntuales, espera ACKs autoritativos y nunca crea otra conexion.

import type { CallAck, CallSocket, IncomingCallPayload } from './call-types';

export interface CallSocketHandlers {
  onIncoming: (payload: IncomingCallPayload) => void;
  onAccepted: (payload: any) => void;
  onRejected: (payload: any) => void;
  onCancelled: (payload: any) => void;
  onTimeout: (payload: any) => void;
  onEnd: (payload: any) => void;
}

const ACK_TIMEOUT_MS = 12000;

export function bindCallSocket(socket: CallSocket, handlers: CallSocketHandlers): () => void {
  const entries: Array<[string, (...args: any[]) => void]> = [
    ['rtc:incoming-call', handlers.onIncoming as (...args: any[]) => void],
    ['rtc:call-accepted', handlers.onAccepted],
    ['rtc:call-rejected', handlers.onRejected],
    ['rtc:call-cancelled', handlers.onCancelled],
    ['rtc:call-timeout', handlers.onTimeout],
    ['rtc:end', handlers.onEnd],
  ];
  entries.forEach(([event, handler]) => socket.on(event, handler));
  return () => entries.forEach(([event, handler]) => socket.off(event, handler));
}

function emitWithAck(
  socket: CallSocket,
  event: string,
  payload: Record<string, unknown>
): Promise<CallAck> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ ok: false, code: 'ack_timeout' });
    }, ACK_TIMEOUT_MS);

    socket.emit(event, payload, (ack: CallAck) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(ack && typeof ack === 'object' ? ack : { ok: false, code: 'no_ack' });
    });
  });
}

export function emitStartCall(
  socket: CallSocket,
  input: { conversationId: string; mode: 'audio' | 'video' }
): Promise<CallAck> {
  return emitWithAck(socket, 'rtc:call', {
    conversationId: input.conversationId,
    mode: input.mode,
  });
}

// El callee no arranca getUserMedia/peer/join hasta que el backend confirma que la llamada
// ya transiciono a active. Esto elimina la carrera accept -> join(not_accepted).
export function emitAccept(socket: CallSocket, callId: string): Promise<CallAck> {
  return emitWithAck(socket, 'rtc:accept', { callId });
}

export const emitReject = (socket: CallSocket, callId: string): void => {
  socket.emit('rtc:reject', { callId });
};
export const emitCancel = (socket: CallSocket, callId: string): void => {
  socket.emit('rtc:cancel', { callId });
};
export const emitBusy = (socket: CallSocket, callId: string): void => {
  socket.emit('rtc:busy', { callId });
};
export const emitEnd = (socket: CallSocket, callId: string): void => {
  socket.emit('rtc:end', { callId });
};
