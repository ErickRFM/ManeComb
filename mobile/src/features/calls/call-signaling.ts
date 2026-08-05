// RC-MOBILE-CALLS-PRODUCTION-01 Bloque B — Adaptador de signaling sobre el socket compartido.
// Registra EXACTAMENTE una vez los listeners de llamada y los quita con `off` puntual (nunca
// removeAllListeners; el socket es compartido). No abre conexiones ni es dueno del lifecycle.

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

// Vincula los listeners globales de llamada. Devuelve un unbind que quita SOLO estos handlers.
export function bindCallSocket(socket: CallSocket, handlers: CallSocketHandlers): () => void {
  const entries: Array<[string, (...args: any[]) => void]> = [
    ['rtc:incoming-call', handlers.onIncoming as (...a: any[]) => void],
    ['rtc:call-accepted', handlers.onAccepted],
    ['rtc:call-rejected', handlers.onRejected],
    ['rtc:call-cancelled', handlers.onCancelled],
    ['rtc:call-timeout', handlers.onTimeout],
    ['rtc:end', handlers.onEnd],
  ];
  entries.forEach(([event, handler]) => socket.on(event, handler));
  return () => entries.forEach(([event, handler]) => socket.off(event, handler));
}

// Inicia la llamada y espera el ACK autoritativo del backend (que trae el callId). El cliente
// NUNCA decide el callId ni el destinatario.
export function emitStartCall(
  socket: CallSocket,
  input: { conversationId: string; mode: 'audio' | 'video' }
): Promise<CallAck> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ ok: false, code: 'ack_timeout' });
    }, ACK_TIMEOUT_MS);
    socket.emit('rtc:call', { conversationId: input.conversationId, mode: input.mode }, (ack: CallAck) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(ack && typeof ack === 'object' ? ack : { ok: false, code: 'no_ack' });
    });
  });
}

export const emitAccept = (socket: CallSocket, callId: string): void => { socket.emit('rtc:accept', { callId }); };
export const emitReject = (socket: CallSocket, callId: string): void => { socket.emit('rtc:reject', { callId }); };
export const emitCancel = (socket: CallSocket, callId: string): void => { socket.emit('rtc:cancel', { callId }); };
export const emitBusy = (socket: CallSocket, callId: string): void => { socket.emit('rtc:busy', { callId }); };
export const emitEnd = (socket: CallSocket, callId: string): void => { socket.emit('rtc:end', { callId }); };
