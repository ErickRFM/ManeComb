import type { RadioOperationalPhase } from '../types';
import { isValidRadioPhaseTransition } from '../utils/radio-format';

export type ConnectionState = {
  phase: RadioOperationalPhase;
  invalidTransitions: number;
};

export type ConnectionAction = {
  type: 'RESOLVE_PHASE';
  phase: RadioOperationalPhase;
};

export const initialConnectionState: ConnectionState = {
  invalidTransitions: 0,
  phase: 'IDLE',
};

export function connectionReducer(
  state: ConnectionState,
  action: ConnectionAction
): ConnectionState {
  if (action.type !== 'RESOLVE_PHASE' || state.phase === action.phase) {
    return state;
  }

  return {
    invalidTransitions: state.invalidTransitions + (isValidRadioPhaseTransition(state.phase, action.phase) ? 0 : 1),
    phase: action.phase,
  };
}
