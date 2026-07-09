import type { RadioMetrics, RadioOperationalPhase } from '../types';
import { createInitialRadioMetrics } from '../utils/radio-format';

export type RadioEngineState = {
  metrics: RadioMetrics;
  phase: RadioOperationalPhase;
};

export type RadioEngineAction =
  | { type: 'SET_PHASE'; phase: RadioOperationalPhase }
  | { type: 'INCREMENT_METRICS'; patch: Partial<RadioMetrics> }
  | { type: 'RESET_METRICS' };

export const initialRadioEngineState: RadioEngineState = {
  metrics: createInitialRadioMetrics(),
  phase: 'IDLE',
};

export function radioReducer(
  state: RadioEngineState,
  action: RadioEngineAction
): RadioEngineState {
  switch (action.type) {
    case 'SET_PHASE':
      return {
        ...state,
        phase: action.phase,
      };
    case 'INCREMENT_METRICS':
      return {
        ...state,
        metrics: {
          ...state.metrics,
          cancelled: state.metrics.cancelled + (action.patch.cancelled || 0),
          playbackCount: state.metrics.playbackCount + (action.patch.playbackCount || 0),
          playbackTotalMs: state.metrics.playbackTotalMs + (action.patch.playbackTotalMs || 0),
          received: state.metrics.received + (action.patch.received || 0),
          reconnects: state.metrics.reconnects + (action.patch.reconnects || 0),
          sent: state.metrics.sent + (action.patch.sent || 0),
          uploadCount: state.metrics.uploadCount + (action.patch.uploadCount || 0),
          uploadTotalMs: state.metrics.uploadTotalMs + (action.patch.uploadTotalMs || 0),
        },
      };
    case 'RESET_METRICS':
      return {
        ...state,
        metrics: createInitialRadioMetrics(),
      };
    default:
      return state;
  }
}
