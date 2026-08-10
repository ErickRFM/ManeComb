import type { RadioLiveOperator, RadioLivePhase } from '@/src/features/radio-live/radio-live-types';

export type RadioConsoleTone = 'danger' | 'warning' | 'info' | 'positive' | 'neutral';
export type RadioConsoleVariant =
  | 'idle'
  | 'recording'
  | 'busy'
  | 'pending'
  | 'error'
  | 'offline';

export type RadioConsoleState = {
  label: string;
  detail: string;
  icon: string;
  tone: RadioConsoleTone;
  variant: RadioConsoleVariant;
  pttTitle: string;
  pttSubtitle: string;
  pttDisabled: boolean;
  /** True mientras el operador esta transmitiendo o grabando una nota. */
  capturing: boolean;
  /** True cuando el control muestra progreso indeterminado. */
  pending: boolean;
};

export type LiveConsoleInput = {
  phase: RadioLivePhase;
  operator: RadioLiveOperator | null;
  /** Canal seleccionado en la pantalla. */
  selectedChannelTitle: string | null;
  /** True cuando el runtime ya esta unido al canal seleccionado. */
  channelSynced: boolean;
  microphoneBlocked: boolean;
  errorMessage: string | null;
};

export function deriveLiveConsole(input: LiveConsoleInput): RadioConsoleState {
  const {
    channelSynced,
    errorMessage,
    microphoneBlocked,
    operator,
    phase,
    selectedChannelTitle,
  } = input;

  if (!selectedChannelTitle) {
    return {
      label: 'Sin canal',
      detail: 'Selecciona un canal para operar',
      icon: 'radio-handheld',
      tone: 'warning',
      variant: 'offline',
      pttTitle: 'Sin canal',
      pttSubtitle: 'Elige un canal',
      pttDisabled: true,
      capturing: false,
      pending: false,
    };
  }

  if (microphoneBlocked) {
    return {
      label: 'Microfono bloqueado',
      detail: 'Concede el permiso de microfono para transmitir',
      icon: 'microphone-off',
      tone: 'warning',
      variant: 'error',
      pttTitle: 'Microfono',
      pttSubtitle: 'Presiona para reintentar',
      pttDisabled: false,
      capturing: false,
      pending: false,
    };
  }

  // Mientras el runtime no confirme el canal seleccionado, ningun estado
  // operativo del canal anterior puede presentarse como si fuera de este.
  const OWN_CHANNEL_PHASES: RadioLivePhase[] = [
    'LISTENING',
    'REQUESTING',
    'TRANSMITTING',
    'RECEIVING',
    'CHANNEL_BUSY',
  ];
  if (!channelSynced && OWN_CHANNEL_PHASES.includes(phase)) {
    return {
      label: 'Cambiando de canal',
      detail: `Uniendose a ${selectedChannelTitle}`,
      icon: 'sync',
      tone: 'info',
      variant: 'pending',
      pttTitle: 'Cambiando',
      pttSubtitle: 'Uniendose al canal',
      pttDisabled: true,
      capturing: false,
      pending: true,
    };
  }

  switch (phase) {
    case 'TRANSMITTING':
      return {
        label: 'Transmitiendo',
        detail: 'Estas al aire',
        icon: 'microphone',
        tone: 'danger',
        variant: 'recording',
        pttTitle: 'Transmitiendo',
        pttSubtitle: 'Suelta para finalizar',
        pttDisabled: false,
        capturing: true,
        pending: false,
      };
    case 'REQUESTING':
      return {
        label: 'Solicitando',
        detail: 'Pidiendo el canal',
        icon: 'sync',
        tone: 'info',
        variant: 'pending',
        pttTitle: 'Solicitando',
        pttSubtitle: 'Esperando el canal',
        pttDisabled: true,
        capturing: false,
        pending: true,
      };
    case 'RECEIVING':
      return {
        label: 'Recibiendo',
        detail: `${operator?.name || 'Operador'} esta hablando`,
        icon: 'volume-high',
        tone: 'info',
        variant: 'busy',
        pttTitle: operator?.name || 'Operador',
        pttSubtitle: 'Canal en uso',
        pttDisabled: true,
        capturing: false,
        pending: false,
      };
    case 'CHANNEL_BUSY':
      return {
        label: 'Canal ocupado',
        detail: `Canal tomado por ${operator?.name || 'otro operador'}`,
        icon: 'account-voice',
        tone: 'warning',
        variant: 'busy',
        pttTitle: 'Ocupado',
        pttSubtitle: operator?.name || 'Otro operador',
        pttDisabled: true,
        capturing: false,
        pending: false,
      };
    case 'PAUSED_BY_CALL':
      return {
        label: 'En llamada',
        detail: 'Radio en pausa mientras dura la llamada',
        icon: 'phone-in-talk',
        tone: 'info',
        variant: 'offline',
        pttTitle: 'En llamada',
        pttSubtitle: 'Radio en pausa',
        pttDisabled: true,
        capturing: false,
        pending: false,
      };
    case 'RECONNECTING':
      return {
        label: 'Reconectando',
        detail: 'Recuperando el canal',
        icon: 'sync',
        tone: 'info',
        variant: 'pending',
        pttTitle: 'Reconectando',
        pttSubtitle: 'Sin canal por ahora',
        pttDisabled: true,
        capturing: false,
        pending: true,
      };
    case 'UNAUTHORIZED':
      return {
        label: 'Sesion expirada',
        detail: 'Vuelve a iniciar sesion para usar Radio',
        icon: 'lock-alert-outline',
        tone: 'danger',
        variant: 'error',
        pttTitle: 'Sin sesion',
        pttSubtitle: 'Vuelve a iniciar sesion',
        pttDisabled: true,
        capturing: false,
        pending: false,
      };
    case 'ERROR':
      return {
        label: 'Error',
        detail: errorMessage || 'Radio no disponible',
        icon: 'alert-circle-outline',
        tone: 'danger',
        variant: 'error',
        pttTitle: 'Error',
        pttSubtitle: errorMessage || 'Reintenta en unos segundos',
        pttDisabled: true,
        capturing: false,
        pending: false,
      };
    case 'LISTENING':
      return {
        label: 'En linea',
        detail: selectedChannelTitle,
        icon: 'access-point-check',
        tone: 'positive',
        variant: 'idle',
        pttTitle: 'Presiona',
        pttSubtitle: 'para transmitir',
        pttDisabled: false,
        capturing: false,
        pending: false,
      };
    case 'JOINING':
      return {
        label: 'Conectando',
        detail: `Uniendose a ${selectedChannelTitle}`,
        icon: 'sync',
        tone: 'info',
        variant: 'pending',
        pttTitle: 'Conectando',
        pttSubtitle: 'Preparando el canal',
        pttDisabled: true,
        capturing: false,
        pending: true,
      };
    case 'IDLE':
    default:
      return {
        label: 'En espera',
        detail: selectedChannelTitle,
        icon: 'radio-handheld',
        tone: 'neutral',
        variant: 'offline',
        pttTitle: 'En espera',
        pttSubtitle: 'Radio no iniciada',
        pttDisabled: true,
        capturing: false,
        pending: false,
      };
  }
}

export type NoteConsolePhase = 'IDLE' | 'RECORDING' | 'UPLOADING';

export type NoteConsoleInput = {
  phase: NoteConsolePhase;
  selectedChannelTitle: string | null;
  microphoneBlocked: boolean;
  supported: boolean;
  errorMessage: string | null;
};

/**
 * Web no dispone del PTT en vivo PCM: transmite notas de voz completas. La
 * consola lo dice explicitamente en lugar de simular un canal en vivo.
 */
export function deriveNoteConsole(input: NoteConsoleInput): RadioConsoleState {
  const { errorMessage, microphoneBlocked, phase, selectedChannelTitle, supported } = input;

  if (!supported) {
    return {
      label: 'No disponible',
      detail: 'Este navegador no permite grabar audio',
      icon: 'microphone-off',
      tone: 'warning',
      variant: 'offline',
      pttTitle: 'No disponible',
      pttSubtitle: 'Sin API de audio',
      pttDisabled: true,
      capturing: false,
      pending: false,
    };
  }

  if (!selectedChannelTitle) {
    return {
      label: 'Sin canal',
      detail: 'Selecciona un canal para enviar una nota',
      icon: 'radio-handheld',
      tone: 'warning',
      variant: 'offline',
      pttTitle: 'Sin canal',
      pttSubtitle: 'Elige un canal',
      pttDisabled: true,
      capturing: false,
      pending: false,
    };
  }

  if (microphoneBlocked) {
    return {
      label: 'Microfono bloqueado',
      detail: 'Permite el microfono en el navegador',
      icon: 'microphone-off',
      tone: 'warning',
      variant: 'error',
      pttTitle: 'Microfono',
      pttSubtitle: 'Presiona para reintentar',
      pttDisabled: false,
      capturing: false,
      pending: false,
    };
  }

  if (phase === 'RECORDING') {
    return {
      label: 'Grabando',
      detail: 'Grabando nota de voz',
      icon: 'microphone',
      tone: 'danger',
      variant: 'recording',
      pttTitle: 'Grabando',
      pttSubtitle: 'Suelta para enviar',
      pttDisabled: false,
      capturing: true,
      pending: false,
    };
  }

  if (phase === 'UPLOADING') {
    return {
      label: 'Enviando',
      detail: 'Subiendo la nota de voz',
      icon: 'cloud-upload-outline',
      tone: 'info',
      variant: 'pending',
      pttTitle: 'Enviando',
      pttSubtitle: 'No cierres la pantalla',
      pttDisabled: true,
      capturing: false,
      pending: true,
    };
  }

  return {
    label: 'Nota de voz',
    detail: errorMessage || selectedChannelTitle,
    icon: 'microphone-message',
    tone: 'neutral',
    variant: 'idle',
    pttTitle: 'Presiona',
    pttSubtitle: 'para grabar',
    pttDisabled: false,
    capturing: false,
    pending: false,
  };
}
