import type { Socket } from 'socket.io-client';

export type RadioLivePhase =
  | 'IDLE'
  | 'JOINING'
  | 'LISTENING'
  | 'RECEIVING'
  | 'RECONNECTING'
  | 'PAUSED_BY_CALL'
  | 'PAUSED_BY_SCREEN'
  | 'UNAUTHORIZED'
  | 'ERROR';

export type RadioLiveOperator = {
  id: string;
  name: string;
};

export type RadioLiveState = {
  phase: RadioLivePhase;
  channelId: string | null;
  currentTransmissionId: string | null;
  operator: RadioLiveOperator | null;
  foregroundServiceActive: boolean;
  lastFrameAt: number | null;
  lastErrorCode: string | null;
};

export type RadioLiveRuntimeTransportState =
  | 'connecting'
  | 'join_sent'
  | 'ready'
  | 'reconnecting'
  | 'offline'
  | 'unauthorized'
  | 'error';

export type RadioLiveRuntimeParams = {
  channelId: string;
  socket: Socket;
  userId: string;
  onTransportState: (state: RadioLiveRuntimeTransportState, errorCode?: string | null) => void;
  onReceiving: (payload: {
    transmissionId: string;
    operator: RadioLiveOperator;
  }) => void;
  onFrame: (payload: { transmissionId: string; receivedAt: number }) => void;
  onTransmissionEnd: (payload: { transmissionId: string; reason?: string | null }) => void;
  onForegroundServiceChange: (active: boolean) => void;
  onError: (code: string) => void;
};

export type RadioLiveRuntime = {
  stop: () => void;
};

export type RadioLiveRuntimeFactory = (
  params: RadioLiveRuntimeParams
) => RadioLiveRuntime;
