import { useEffect, type MutableRefObject } from 'react';
import { stopActiveAudioPlaybackAsync } from '@/src/native/audio';

type TimerRef<T extends ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>> =
  MutableRefObject<T | null>;

type UseRadioLifecycleParams = {
  idleStatusTimerRef: TimerRef<ReturnType<typeof setTimeout>>;
  pendingStopAfterStartRef: MutableRefObject<boolean>;
  pressToTalkActiveRef: MutableRefObject<boolean>;
  pressToTalkTimerRef: TimerRef<ReturnType<typeof setTimeout>>;
  pressToTalkTriggeredRef: MutableRefObject<boolean>;
  pttBusyRef: MutableRefObject<boolean>;
  recordTimerRef: TimerRef<ReturnType<typeof setInterval>>;
  stopWebMetering: () => void;
  uploadStartedAtRef: MutableRefObject<number | null>;
  webRecorderRef: MutableRefObject<any>;
  webStreamRef: MutableRefObject<any>;
};

export function useRadioLifecycle({
  idleStatusTimerRef,
  pendingStopAfterStartRef,
  pressToTalkActiveRef,
  pressToTalkTimerRef,
  pressToTalkTriggeredRef,
  pttBusyRef,
  recordTimerRef,
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
      stopWebMetering();
      uploadStartedAtRef.current = null;
      pendingStopAfterStartRef.current = false;
      pttBusyRef.current = false;
      pressToTalkActiveRef.current = false;
      pressToTalkTriggeredRef.current = false;
      stopActiveAudioPlaybackAsync().catch(() => undefined);
      webRecorderRef.current?.stop?.();
      webStreamRef.current?.getTracks?.().forEach((track: any) => track.stop());
    },
    [
      idleStatusTimerRef,
      pendingStopAfterStartRef,
      pressToTalkActiveRef,
      pressToTalkTimerRef,
      pressToTalkTriggeredRef,
      pttBusyRef,
      recordTimerRef,
      stopWebMetering,
      uploadStartedAtRef,
      webRecorderRef,
      webStreamRef,
    ]
  );
}
