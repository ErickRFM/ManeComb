export type CallPhase =
  | 'IDLE'
  | 'OUTGOING_RINGING'
  | 'INCOMING_RINGING'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'ENDING'
  | 'FAILED';

export type CallDirection = 'outgoing' | 'incoming' | null;
export type CallMode = 'audio' | 'video';

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
  roomId: string | null;
  createdAt: number | null;
  acceptedAt: number | null;
  connectedAt: number | null;
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

export interface CallSocket {
  on(event: string, handler: (...args: any[]) => void): unknown;
  off(event: string, handler: (...args: any[]) => void): unknown;
  emit(event: string, payload?: unknown, ack?: (response: any) => void): unknown;
}
