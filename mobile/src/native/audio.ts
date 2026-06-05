import { PermissionsAndroid, Platform } from 'react-native';
import { useMemo, useRef } from 'react';

export const RecordingPresets = {
  LOW_QUALITY: {
    isMeteringEnabled: false,
  },
};

type PermissionResult = {
  granted: boolean;
  status: 'granted' | 'denied' | 'undetermined';
};

type RecorderStatus = {
  isRecording?: boolean;
  metering?: number;
  durationMillis?: number;
  url?: string | null;
  isLoaded?: boolean;
};

export async function requestRecordingPermissionsAsync(): Promise<PermissionResult> {
  if (Platform.OS !== 'android') {
    return { granted: true, status: 'granted' };
  }

  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
  const granted = result === PermissionsAndroid.RESULTS.GRANTED;

  return {
    granted,
    status: granted ? 'granted' : 'denied',
  };
}

export async function setAudioModeAsync(_options?: Record<string, unknown>) {
  return undefined;
}

export function useAudioRecorder(
  _preset?: Record<string, unknown>,
  onStatusUpdate?: (status: RecorderStatus) => void
) {
  const stateRef = useRef({
    isRecording: false,
    startedAt: 0,
    uri: null as string | null,
  });

  return useMemo(
    () => ({
      get uri() {
        return stateRef.current.uri;
      },
      async prepareToRecordAsync() {
        throw new Error('Native audio recording is not configured for this React Native CLI build.');
      },
      record() {
        stateRef.current.isRecording = true;
        stateRef.current.startedAt = Date.now();
        onStatusUpdate?.({ isRecording: true, metering: -60 });
      },
      async stop() {
        stateRef.current.isRecording = false;
        onStatusUpdate?.({ isRecording: false, durationMillis: 0, url: null });
      },
      getStatus() {
        const durationMillis = stateRef.current.startedAt
          ? Date.now() - stateRef.current.startedAt
          : 0;
        return {
          isRecording: stateRef.current.isRecording,
          durationMillis,
          url: stateRef.current.uri,
        };
      },
    }),
    [onStatusUpdate]
  );
}

export function useAudioPlayer(_source?: unknown, _options?: unknown) {
  return useMemo(
    () => ({
      play: () => undefined,
      pause: () => undefined,
      seekTo: async (_position?: number) => undefined,
    }),
    []
  );
}

export function useAudioPlayerStatus(_player?: unknown) {
  return {
    currentTime: 0,
    duration: 0,
    isBuffering: false,
    isLoaded: true,
    playing: false,
  };
}
