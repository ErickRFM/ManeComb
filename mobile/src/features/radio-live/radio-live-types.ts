import type { RadioNativeSnapshot } from '@/src/native/audio';

/**
 * Fase operativa unica de Radio. El vocabulario es exactamente el de la maquina
 * nativa (`RadioSessionState.kt`): React proyecta ese estado sin traducirlo, de
 * modo que no existe una segunda interpretacion del mismo hecho.
 */
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
  authRevision: number;
  phase: RadioLivePhase;
  channelId: string | null;
  transmissionId: string | null;
  /** Quien posee el canal: el operador remoto en RECEIVING, uno mismo en TRANSMITTING. */
  operator: RadioLiveOperator | null;
  transmissionStartedAt: number | null;
  /** Transporte de Radio conectado, segun el servicio nativo. */
  connected: boolean;
  lastErrorCode: string | null;
};

export type RadioLiveActivation = {
  authRevision?: number;
  channelId: string;
  token: string;
  userId: string;
  userName: string;
  socketUrl: string;
};

export type RadioLiveTransmissionResult = {
  ok: boolean;
  error?: string;
};

/**
 * Adaptador de plataforma. Android lo implementa contra el servicio nativo; el
 * resto de plataformas no tienen PTT en vivo y usan el adaptador inactivo.
 */
export type RadioLiveRuntime = {
  activate: (input: RadioLiveActivation) => Promise<void>;
  selectChannel: (channelId: string) => Promise<void>;
  requestTransmission: () => Promise<RadioLiveTransmissionResult>;
  endTransmission: () => Promise<RadioLiveTransmissionResult>;
  setCallActive: (active: boolean) => Promise<void>;
  setSessionAuthState: (state: 'recovering' | 'unauthorized') => Promise<void>;
  deactivate: () => Promise<void>;
  subscribe: (listener: (state: RadioLiveState) => void) => () => void;
  readSnapshot: () => Promise<RadioLiveState>;
};

export function initialRadioLiveState(): RadioLiveState {
  return {
    authRevision: 0,
    phase: 'IDLE',
    channelId: null,
    transmissionId: null,
    operator: null,
    transmissionStartedAt: null,
    connected: false,
    lastErrorCode: null,
  };
}

/** Proyeccion 1:1 de la instantanea nativa. No reinterpreta ningun hecho. */
export function projectNativeSnapshot(snapshot: RadioNativeSnapshot): RadioLiveState {
  return {
    authRevision: snapshot.authRevision || 0,
    phase: snapshot.phase,
    channelId: snapshot.channelId || null,
    transmissionId: snapshot.transmissionId || null,
    operator: snapshot.operatorId
      ? { id: snapshot.operatorId, name: snapshot.operatorName || 'Operador' }
      : null,
    transmissionStartedAt: snapshot.transmissionStartedAt ?? null,
    connected: Boolean(snapshot.connected),
    lastErrorCode: snapshot.errorCode || null,
  };
}
