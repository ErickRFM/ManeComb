import type { Socket } from 'socket.io-client';

// Fase operativa unica de Radio. La consume tanto el overlay global como la
// pantalla /radio: no existe una segunda maquina de estados por consumidor.
export type RadioLivePhase =
  | 'IDLE'
  | 'JOINING'
  | 'LISTENING'
  | 'REQUESTING'
  | 'TRANSMITTING'
  | 'RECEIVING'
  | 'CHANNEL_BUSY'
  | 'RECONNECTING'
  | 'PAUSED_BY_CALL'
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
  /** Quien posee el canal: el receptor remoto en RECEIVING, uno mismo en TRANSMITTING. */
  operator: RadioLiveOperator | null;
  foregroundServiceActive: boolean;
  lastFrameAt: number | null;
  transmissionStartedAt: number | null;
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

export type RadioLiveTransmissionResult = {
  ok: boolean;
  error?: string;
  transmissionId?: string;
  transmitter?: RadioLiveOperator;
};

export type RadioLiveRuntimeParams = {
  channelId: string;
  socket: Socket;
  userId: string;
  userName: string;
  onTransportState: (state: RadioLiveRuntimeTransportState, errorCode?: string | null) => void;
  onReceiving: (payload: {
    transmissionId: string;
    operator: RadioLiveOperator;
  }) => void;
  onFrame: (payload: { transmissionId: string; receivedAt: number }) => void;
  onTransmissionEnd: (payload: { transmissionId: string; reason?: string | null }) => void;
  onForegroundServiceChange: (active: boolean) => void;
  onError: (code: string) => void;
  /** La captura local termino sin que la pantalla lo pidiera (error nativo/transporte). */
  onCaptureLost: (code: string) => void;
};

export type RadioLiveRuntime = {
  /** Pide el canal al backend y arranca la captura nativa si lo concede. */
  requestTransmission: () => Promise<RadioLiveTransmissionResult>;
  /** Detiene la captura nativa y libera el canal. Idempotente. */
  endTransmission: (transmissionId: string) => Promise<RadioLiveTransmissionResult>;
  stop: () => void;
};

export type RadioLiveRuntimeFactory = (
  params: RadioLiveRuntimeParams
) => RadioLiveRuntime;
