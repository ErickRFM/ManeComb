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
  tone: RadioStatusTone;
};

export function getRadioConnectionStatus(
  socketStatus: RadioSocketStatus | null | undefined
): RadioConnectionStatus {
  switch (socketStatus) {
    case 'connected':
      return {
        canTransmit: true,
        detail: 'Conectado a radio',
        label: 'Conectado a radio',
        tone: 'positive',
      };
    case 'connecting':
    case 'reconnecting':
      return {
        canTransmit: false,
        detail: 'Reconectando radio',
        label: 'Reconectando',
        tone: 'warning',
      };
    case 'disconnected':
    case 'error':
      return {
        canTransmit: false,
        detail: 'Audio no disponible hasta recuperar conexion',
        label: 'Radio desconectada',
        tone: 'danger',
      };
    case 'idle':
    default:
      return {
        canTransmit: false,
        detail: 'Conectando radio',
        label: 'Conectando',
        tone: 'neutral',
      };
  }
}
