import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { stopActiveAudioPlaybackAsync } from '@/src/native/audio';
import type { ActivePlaybackState } from '../types';

type TimerRef<T extends ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>> =
  MutableRefObject<T | null>;

type UseRadioLifecycleParams = {
  idleStatusTimerRef: TimerRef<ReturnType<typeof setTimeout>>;
  nativeRecorder: { stop: () => Promise<unknown> };
  pendingStopAfterStartRef: MutableRefObject<boolean>;
  playbackTerminalTimerRef: TimerRef<ReturnType<typeof setTimeout>>;
  pressToTalkActiveRef: MutableRefObject<boolean>;
  pressToTalkTimerRef: TimerRef<ReturnType<typeof setTimeout>>;
  pressToTalkTriggeredRef: MutableRefObject<boolean>;
  pttBusyRef: MutableRefObject<boolean>;
  recordTimerRef: TimerRef<ReturnType<typeof setInterval>>;
  setActivePlayback: Dispatch<SetStateAction<ActivePlaybackState>>;
  stopWebMetering: () => void;
  uploadStartedAtRef: MutableRefObject<number | null>;
  webRecorderRef: MutableRefObject<any>;
  webStreamRef: MutableRefObject<any>;
};

export function useRadioLifecycle({
  idleStatusTimerRef,
  nativeRecorder,
  pendingStopAfterStartRef,
  playbackTerminalTimerRef,
  pressToTalkActiveRef,
  pressToTalkTimerRef,
  pressToTalkTriggeredRef,
  pttBusyRef,
  recordTimerRef,
  setActivePlayback,
  stopWebMetering,
  uploadStartedAtRef,
  webRecorderRef,
  webStreamRef,
}: UseRadioLifecycleParams) {
  useEffect(
    () => () => {
      if (recordTimerRef.current) {
        clearInterval(recordTimerRef.current);
      }
      if (pressToTalkTimerRef.current) {
        clearTimeout(pressToTalkTimerRef.current);
      }
      if (idleStatusTimerRef.current) {
        clearTimeout(idleStatusTimerRef.current);
      }
      if (playbackTerminalTimerRef.current) {
        clearTimeout(playbackTerminalTimerRef.current);
      }

      stopWebMetering();
      uploadStartedAtRef.current = null;
      pendingStopAfterStartRef.current = false;
      pttBusyRef.current = false;
      pressToTalkActiveRef.current = false;
      pressToTalkTriggeredRef.current = false;
      nativeRecorder.stop().catch(() => undefined);
      stopActiveAudioPlaybackAsync().catch(() => undefined);
      setActivePlayback(null);
      webRecorderRef.current?.stop?.();
      webStreamRef.current?.getTracks?.().forEach((track: any) => track.stop());
    },
    [
      idleStatusTimerRef,
      nativeRecorder,
      pendingStopAfterStartRef,
      playbackTerminalTimerRef,
      pressToTalkActiveRef,
      pressToTalkTimerRef,
      pressToTalkTriggeredRef,
      pttBusyRef,
      recordTimerRef,
      setActivePlayback,
      stopWebMetering,
      uploadStartedAtRef,
      webRecorderRef,
      webStreamRef,
    ]
  );
}
