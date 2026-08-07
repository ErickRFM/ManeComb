import type {
  RadioLiveOperator,
  RadioLiveRuntimeTransportState,
  RadioLiveState,
} from './radio-live-types';

export type RadioLiveEvent =
  | { type: 'CONFIGURE'; channelId: string }
  | { type: 'TRANSPORT'; state: RadioLiveRuntimeTransportState; errorCode?: string | null }
  | { type: 'RECEIVING'; transmissionId: string; operator: RadioLiveOperator }
  | { type: 'FRAME'; transmissionId: string; receivedAt: number }
  | { type: 'TRANSMISSION_END'; transmissionId: string }
  | { type: 'REQUEST' }
  | { type: 'TX_START'; transmissionId: string; operator: RadioLiveOperator; startedAt: number }
  | { type: 'TX_END'; transmissionId: string }
  | { type: 'BUSY'; operator?: RadioLiveOperator | null }
  | { type: 'SERVICE'; active: boolean }
  | { type: 'PAUSE'; reason: 'call' }
  | { type: 'FAIL'; code: string }
  | { type: 'RESET' };

export function initialRadioLiveState(): RadioLiveState {
  return {
    phase: 'IDLE',
    channelId: null,
    currentTransmissionId: null,
    operator: null,
    foregroundServiceActive: false,
    lastFrameAt: null,
    transmissionStartedAt: null,
    lastErrorCode: null,
  };
}

function transportPhase(state: RadioLiveRuntimeTransportState): RadioLiveState['phase'] {
  if (state === 'ready') return 'LISTENING';
  if (state === 'reconnecting' || state === 'offline') return 'RECONNECTING';
  if (state === 'unauthorized') return 'UNAUTHORIZED';
  if (state === 'error') return 'ERROR';
  return 'JOINING';
}

export function reduceRadioLiveState(
  state: RadioLiveState,
  event: RadioLiveEvent
): RadioLiveState {
  switch (event.type) {
    case 'CONFIGURE':
      return {
        ...initialRadioLiveState(),
        channelId: event.channelId,
        phase: 'JOINING',
      };
    case 'TRANSPORT':
      return {
        ...state,
        phase: transportPhase(event.state),
        currentTransmissionId:
          event.state === 'ready' ? null : state.currentTransmissionId,
        operator: event.state === 'ready' ? null : state.operator,
        transmissionStartedAt: event.state === 'ready' ? null : state.transmissionStartedAt,
        lastErrorCode:
          event.state === 'error' || event.state === 'unauthorized'
            ? event.errorCode || event.state
            : null,
      };
    case 'REQUEST':
      // Solo se solicita el canal desde escucha estable; nunca sobre RECEIVING
      // (el canal ya tiene dueno) ni sobre una transmision propia en curso.
      if (state.phase !== 'LISTENING') return state;
      return { ...state, phase: 'REQUESTING', lastErrorCode: null };
    case 'TX_START':
      if (state.phase !== 'REQUESTING') return state;
      return {
        ...state,
        phase: 'TRANSMITTING',
        currentTransmissionId: event.transmissionId,
        operator: event.operator,
        transmissionStartedAt: event.startedAt,
        lastErrorCode: null,
      };
    case 'TX_END':
      if (state.currentTransmissionId !== event.transmissionId) return state;
      return {
        ...state,
        phase: 'LISTENING',
        currentTransmissionId: null,
        operator: null,
        transmissionStartedAt: null,
      };
    case 'BUSY':
      if (state.phase !== 'REQUESTING') return state;
      return {
        ...state,
        phase: 'CHANNEL_BUSY',
        currentTransmissionId: null,
        operator: event.operator || null,
        transmissionStartedAt: null,
      };
    case 'RECEIVING':
      return {
        ...state,
        phase: 'RECEIVING',
        currentTransmissionId: event.transmissionId,
        operator: event.operator,
        transmissionStartedAt: null,
        lastErrorCode: null,
      };
    case 'FRAME':
      if (state.currentTransmissionId !== event.transmissionId) return state;
      return { ...state, lastFrameAt: event.receivedAt };
    case 'TRANSMISSION_END':
      // CHANNEL_BUSY solo termina cuando el backend libera el canal: no guarda
      // el transmissionId ajeno, asi que se libera con cualquier radio:end.
      if (state.phase === 'CHANNEL_BUSY') {
        return { ...state, phase: 'LISTENING', operator: null };
      }
      if (state.currentTransmissionId !== event.transmissionId) return state;
      return {
        ...state,
        phase: 'LISTENING',
        currentTransmissionId: null,
        operator: null,
        transmissionStartedAt: null,
      };
    case 'SERVICE':
      return { ...state, foregroundServiceActive: event.active };
    case 'PAUSE':
      return {
        ...state,
        phase: 'PAUSED_BY_CALL',
        currentTransmissionId: null,
        operator: null,
        transmissionStartedAt: null,
        foregroundServiceActive: false,
      };
    case 'FAIL':
      return {
        ...state,
        phase: 'ERROR',
        currentTransmissionId: null,
        operator: null,
        transmissionStartedAt: null,
        foregroundServiceActive: false,
        lastErrorCode: event.code,
      };
    case 'RESET':
      return initialRadioLiveState();
    default:
      return state;
  }
}
