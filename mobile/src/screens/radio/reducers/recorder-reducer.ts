import type { RecordingState } from '../types';

export type RecorderState = {
  message: string | null;
  seconds: number;
  state: RecordingState;
};

export type RecorderAction =
  | { type: 'SET_STATE'; state: RecordingState; message?: string | null }
  | { type: 'SET_SECONDS'; seconds: number }
  | { type: 'SET_MESSAGE'; message: string | null }
  | { type: 'RESET' };

export const initialRecorderState: RecorderState = {
  message: null,
  seconds: 0,
  state: 'idle',
};

export function recorderReducer(
  state: RecorderState,
  action: RecorderAction
): RecorderState {
  switch (action.type) {
    case 'SET_STATE':
      return {
        ...state,
        message: action.message === undefined ? state.message : action.message,
        state: action.state,
      };
    case 'SET_SECONDS':
      return {
        ...state,
        seconds: action.seconds,
      };
    case 'SET_MESSAGE':
      return {
        ...state,
        message: action.message,
      };
    case 'RESET':
      return initialRecorderState;
    default:
      return state;
  }
}
