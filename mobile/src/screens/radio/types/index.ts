export type AudioPermissionState = 'unknown' | 'granted' | 'denied';
export type AudioFilter = 'all' | 'current' | 'mine';
export type RadioPageIndex = 0 | 1 | 2;

export type RadioOperationalPhase =
  | 'IDLE'
  | 'CONNECTING'
  | 'JOIN_SENT'
  | 'RECONNECTING'
  | 'READY'
  | 'REQUESTING'
  | 'TRANSMITTING'
  | 'RECEIVING'
  | 'CHANNEL_BUSY'
  | 'UNAUTHORIZED'
  | 'UPLOADING'
  | 'ERROR'
  | 'OFFLINE';
