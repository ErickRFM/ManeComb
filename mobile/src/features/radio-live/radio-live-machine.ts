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
  | { type: 'SERVICE'; active: boolean }
  | { type: 'PAUSE'; reason: 'call' | 'screen' }
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
        lastErrorCode:
          event.state === 'error' || event.state === 'unauthorized'
            ? event.errorCode || event.state
            : null,
      };
    case 'RECEIVING':
      return {
        ...state,
        phase: 'RECEIVING',
        currentTransmissionId: event.transmissionId,
        operator: event.operator,
        lastErrorCode: null,
      };
    case 'FRAME':
      if (state.currentTransmissionId !== event.transmissionId) return state;
      return { ...state, lastFrameAt: event.receivedAt };
    case 'TRANSMISSION_END':
      if (state.currentTransmissionId !== event.transmissionId) return state;
      return {
        ...state,
        phase: 'LISTENING',
        currentTransmissionId: null,
        operator: null,
      };
    case 'SERVICE':
      return { ...state, foregroundServiceActive: event.active };
    case 'PAUSE':
      return {
        ...state,
        phase: event.reason === 'call' ? 'PAUSED_BY_CALL' : 'PAUSED_BY_SCREEN',
        currentTransmissionId: null,
        operator: null,
        foregroundServiceActive: false,
      };
    case 'FAIL':
      return {
        ...state,
        phase: 'ERROR',
        currentTransmissionId: null,
        operator: null,
        foregroundServiceActive: false,
        lastErrorCode: event.code,
      };
    case 'RESET':
      return initialRadioLiveState();
    default:
      return state;
  }
}
