import type { CallAck, CallSocket, IncomingCallPayload } from './call-types';
import { calibrateRtcServerClock, normalizeRtcDeadline } from './rtc-clock';

export interface CallSocketHandlers {
  onIncoming: (payload: IncomingCallPayload) => void;
  onAccepted: (payload: any) => void;
  onRejected: (payload: any) => void;
  onCancelled: (payload: any) => void;
  onTimeout: (payload: any) => void;
  onEnd: (payload: any) => void;
}

const ACK_TIMEOUT_MS = 12_000;

type TemporalPayload = {
  expiresAt?: string | null;
  serverTime?: string | null;
  [key: string]: unknown;
};

function normalizeTemporalPayload<T extends TemporalPayload>(payload: T): T {
  if (!payload || typeof payload !== 'object') return payload;
  if (payload.serverTime) calibrateRtcServerClock(payload.serverTime);
  if (!payload.expiresAt) return payload;
  const expiresAt = normalizeRtcDeadline(payload.expiresAt);
  return expiresAt && expiresAt !== payload.expiresAt ? { ...payload, expiresAt } : payload;
}

export function bindCallSocket(socket: CallSocket, handlers: CallSocketHandlers): () => void {
  const onIncoming = (payload: IncomingCallPayload & TemporalPayload): void => {
    handlers.onIncoming(normalizeTemporalPayload(payload) as IncomingCallPayload);
  };
  const onServerPong = (payload: TemporalPayload): void => {
    if (payload?.serverTime) calibrateRtcServerClock(payload.serverTime);
  };
  const entries: Array<[string, (...args: any[]) => void]> = [
    ['rtc:incoming-call', onIncoming as (...args: any[]) => void],
    ['rtc:call-accepted', handlers.onAccepted],
    ['rtc:call-rejected', handlers.onRejected],
    ['rtc:call-cancelled', handlers.onCancelled],
    ['rtc:call-timeout', handlers.onTimeout],
    ['rtc:end', handlers.onEnd],
    ['server:pong', onServerPong as (...args: any[]) => void],
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

    socket.emit(event, payload, (ack: CallAck & TemporalPayload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(
        ack && typeof ack === 'object'
          ? (normalizeTemporalPayload(ack) as CallAck)
          : { ok: false, code: 'no_ack' }
      );
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

export const CALL_SIGNALING_ACK_TIMEOUT_MS = ACK_TIMEOUT_MS;
