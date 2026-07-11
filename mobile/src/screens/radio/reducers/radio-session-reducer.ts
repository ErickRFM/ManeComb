import type { RadioLiveIdentity } from '../services/radio-realtime-service';
import type { RadioOperationalPhase } from '../types';

export type RadioSessionState = {
  message: string | null;
  operator: RadioLiveIdentity | null;
  phase: RadioOperationalPhase;
  transmissionId: string | null;
};

export type RadioSessionAction = {
  type: 'TRANSITION';
  phase: RadioOperationalPhase;
  message?: string | null;
  operator?: RadioLiveIdentity | null;
  transmissionId?: string | null;
};

export const initialRadioSessionState: RadioSessionState = {
  message: null,
  operator: null,
  phase: 'IDLE',
  transmissionId: null,
};

export function radioSessionReducer(
  state: RadioSessionState,
  action: RadioSessionAction
): RadioSessionState {
  if (action.type !== 'TRANSITION') return state;
  return {
    message: action.message === undefined ? state.message : action.message,
    operator: action.operator === undefined ? state.operator : action.operator,
    phase: action.phase,
    transmissionId:
      action.transmissionId === undefined ? state.transmissionId : action.transmissionId,
  };
}
