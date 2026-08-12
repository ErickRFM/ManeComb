export type RealtimeMachineState =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'AUTHENTICATING'
  | 'CONNECTED'
  | 'RADIO_READY'
  | 'TRANSMITTING'
  | 'RECEIVING'
  | 'RECONNECTING'
  | 'UNAUTHORIZED'
  | 'ERROR';

export type RealtimeMachineTone = 'positive' | 'warning' | 'danger' | 'info' | 'neutral';

export const REALTIME_HEARTBEAT_HEALTH_WINDOW_MS = 55000;

type RealtimeHeartbeatInputs = {
  lastPongAt?: string | null;
  missedHeartbeatAcks?: number;
  now?: number;
};

export function isRealtimeHeartbeatHealthy({
  lastPongAt,
  missedHeartbeatAcks = 0,
  now = Date.now(),
}: RealtimeHeartbeatInputs) {
  if (!lastPongAt || missedHeartbeatAcks > 0) {
    return false;
  }

  const lastPongMs = new Date(lastPongAt).getTime();
  return Number.isFinite(lastPongMs) &&
    now - lastPongMs <= REALTIME_HEARTBEAT_HEALTH_WINDOW_MS;
}

export function shouldRestartRealtimeAfterForeground(input: RealtimeHeartbeatInputs & {
  socketConnected: boolean;
  socketStatus: string;
}) {
  return !input.socketConnected ||
    input.socketStatus !== 'connected' ||
    !isRealtimeHeartbeatHealthy(input);
}

type RealtimeInputs = {
  heartbeatHealthy?: boolean;
  hasUser?: boolean;
  isReceiving?: boolean;
  isTransmitting?: boolean;
  networkStatus?: 'unknown' | 'online' | 'offline' | 'recovering' | null;
  pendingSyncCount?: number;
  radioChannelReady?: boolean;
  socketStatus?:
    | 'idle'
    | 'connecting'
    | 'connected'
    | 'reconnecting'
    | 'disconnected'
    | 'unauthorized'
    | 'error'
    | null;
};

export type RealtimeSnapshot = {
  canTransmit: boolean;
  label: string;
  detail: string;
  state: RealtimeMachineState;
  tone: RealtimeMachineTone;
};

export function isRealtimeAuthError(error?: string | null) {
  const value = String(error || '').toLowerCase();
  return (
    value.includes('unauthorized') ||
    value.includes('invalid token') ||
    value.includes('jwt') ||
    value.includes('token expired') ||
    value.includes('authentication failed')
  );
}

export function getRealtimeSnapshot({
  heartbeatHealthy = true,
  hasUser = false,
  isReceiving = false,
  isTransmitting = false,
  networkStatus = 'unknown',
  pendingSyncCount = 0,
  radioChannelReady = false,
  socketStatus = 'idle',
}: RealtimeInputs): RealtimeSnapshot {
  if (networkStatus === 'offline') {
    return {
      canTransmit: false,
      detail: 'Esperando Internet',
      label: 'Sin conexion',
      state: 'DISCONNECTED',
      tone: 'warning',
    };
  }

  if (socketStatus === 'unauthorized') {
    return {
      canTransmit: false,
      detail: 'Sesión expirada. Vuelve a iniciar sesión.',
      label: 'Sesión expirada',
      state: 'UNAUTHORIZED',
      tone: 'danger',
    };
  }

  if (socketStatus === 'error') {
    return {
      canTransmit: false,
      detail: 'Servidor no disponible',
      label: 'Error de conexion',
      state: 'ERROR',
      tone: 'danger',
    };
  }

  if (socketStatus === 'reconnecting' || networkStatus === 'recovering') {
    return {
      canTransmit: false,
      detail: 'Reconectando Socket',
      label: 'Reconectando',
      state: 'RECONNECTING',
      tone: 'warning',
    };
  }

  if (socketStatus === 'connected' && !heartbeatHealthy) {
    return {
      canTransmit: false,
      detail: 'Esperando heartbeat',
      label: 'Reconectando',
      state: 'RECONNECTING',
      tone: 'warning',
    };
  }

  if (socketStatus === 'idle' || socketStatus === 'connecting') {
    return {
      canTransmit: false,
      detail: 'Conectando Socket',
      label: 'Conectando',
      state: 'CONNECTING',
      tone: 'neutral',
    };
  }

  if (socketStatus === 'disconnected') {
    return {
      canTransmit: false,
      detail: 'Socket desconectado',
      label: 'Desconectado',
      state: 'DISCONNECTED',
      tone: 'danger',
    };
  }

  if (!hasUser) {
    return {
      canTransmit: false,
      detail: 'Autenticando sesion',
      label: 'Autenticando',
      state: 'AUTHENTICATING',
      tone: 'neutral',
    };
  }

  if (isTransmitting) {
    return {
      canTransmit: false,
      detail: 'Transmitiendo audio',
      label: 'Transmitiendo',
      state: 'TRANSMITTING',
      tone: 'danger',
    };
  }

  if (isReceiving) {
    return {
      canTransmit: false,
      detail: 'Recibiendo audio',
      label: 'Recibiendo',
      state: 'RECEIVING',
      tone: 'info',
    };
  }

  if (radioChannelReady) {
    return {
      canTransmit: true,
      detail: pendingSyncCount > 0 ? 'Radio lista; sincronizando pendientes' : 'Radio lista',
      label: 'Radio lista',
      state: 'RADIO_READY',
      tone: 'positive',
    };
  }

  return {
    canTransmit: true,
    detail: pendingSyncCount > 0 ? 'Conectado; sincronizando pendientes' : 'Conectado',
    label: 'Conectado',
    state: 'CONNECTED',
    tone: 'positive',
  };
}
