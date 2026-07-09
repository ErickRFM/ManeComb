import type { ActivePlaybackState, VoicePlaybackPhase } from '../types';

export type PlaybackAction =
  | { type: 'TRANSITION'; messageId: string; phase: VoicePlaybackPhase }
  | { type: 'CLEAR'; messageId?: string };

export function playbackReducer(
  state: ActivePlaybackState,
  action: PlaybackAction
): ActivePlaybackState {
  switch (action.type) {
    case 'TRANSITION':
      if (action.phase === 'IDLE') {
        return state?.messageId === action.messageId ? null : state;
      }

      if (state?.messageId === action.messageId && state.phase === action.phase) {
        return state;
      }

      return {
        messageId: action.messageId,
        phase: action.phase,
        updatedAt: Date.now(),
      };
    case 'CLEAR':
      return !action.messageId || state?.messageId === action.messageId ? null : state;
    default:
      return state;
  }
}
