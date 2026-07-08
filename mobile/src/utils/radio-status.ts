import { getRealtimeSnapshot, type RealtimeMachineState } from './realtime-state';

export type RadioSocketStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

export type RadioStatusTone = 'positive' | 'warning' | 'danger' | 'info' | 'neutral';

type RadioConnectionStatus = {
  canTransmit: boolean;
  detail: string;
  label: string;
  state: RealtimeMachineState;
  tone: RadioStatusTone;
};

export function getRadioConnectionStatus(
  socketStatus: RadioSocketStatus | null | undefined,
  options: {
    hasUser?: boolean;
    isReceiving?: boolean;
    isTransmitting?: boolean;
    networkStatus?: 'unknown' | 'online' | 'offline' | 'recovering' | null;
    pendingSyncCount?: number;
    radioChannelReady?: boolean;
  } = {}
): RadioConnectionStatus {
  return getRealtimeSnapshot({
    ...options,
    socketStatus,
  });
}
