import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
  uri?: string | null;
  mimeType?: string;
  size?: number;
  isLoaded?: boolean;
};

type AudioSource = {
  uri: string;
  headers?: Record<string, string>;
  getHeaders?: () => Record<string, string> | null | undefined;
} | null;

type PlayerStatus = {
  currentTime: number;
  duration: number;
  currentMillis: number;
  durationMillis: number;
  isBuffering: boolean;
  isLoaded: boolean;
  localUri?: string | null;
  playing: boolean;
  uri?: string | null;
};

type AudioPlayer = {
  play: () => Promise<void>;
  pause: () => Promise<void>;
  stop: () => Promise<void>;
  seekTo: (positionSeconds?: number) => Promise<void>;
  getStatus: () => PlayerStatus;
  __status: PlayerStatus;
};

type NativeAudioModule = {
  startRecording: (options?: Record<string, unknown>) => Promise<RecorderStatus>;
  stopRecording: () => Promise<RecorderStatus>;
  getRecordingStatus: () => Promise<RecorderStatus>;
  startPlayer: (source: { uri: string; headers?: Record<string, string> }) => Promise<PlayerStatus>;
  pausePlayer: () => Promise<PlayerStatus>;
  stopPlayer: () => Promise<PlayerStatus>;
  seekTo: (positionMillis: number) => Promise<PlayerStatus>;
  getPlayerStatus: () => Promise<PlayerStatus>;
};

type NativeAudioError = Error & {
  code?: string;
  userInfo?: unknown;
};

const NativeAudio =
  Platform.OS === 'android'
    ? (NativeModules.ManeCombAudio as NativeAudioModule | undefined)
    : undefined;

const idlePlayerStatus: PlayerStatus = {
  currentTime: 0,
  duration: 0,
  currentMillis: 0,
  durationMillis: 0,
  isBuffering: false,
  isLoaded: false,
  playing: false,
  uri: null,
};

const idleRecorderStatus: RecorderStatus = {
  isRecording: false,
  metering: -60,
  durationMillis: 0,
  url: null,
  uri: null,
  mimeType: 'audio/mp4',
  size: 0,
};

function normalizeRecorderStatus(status?: RecorderStatus | null): RecorderStatus {
  return {
    ...idleRecorderStatus,
    ...(status || {}),
    url: status?.url || status?.uri || null,
    uri: status?.uri || status?.url || null,
    metering: typeof status?.metering === 'number' ? status.metering : -60,
    durationMillis: Math.max(0, Number(status?.durationMillis || 0)),
    size: Math.max(0, Number(status?.size || 0)),
  };
}

function normalizePlayerStatus(status?: PlayerStatus | null): PlayerStatus {
  const durationMillis = Math.max(0, Number(status?.durationMillis || 0));
  const currentMillis = Math.max(0, Number(status?.currentMillis || 0));

  return {
    ...idlePlayerStatus,
    ...(status || {}),
    currentMillis,
    durationMillis,
    currentTime:
      typeof status?.currentTime === 'number' ? status.currentTime : currentMillis / 1000,
    duration: typeof status?.duration === 'number' ? status.duration : durationMillis / 1000,
    isBuffering: Boolean(status?.isBuffering),
    isLoaded: Boolean(status?.isLoaded),
    localUri: status?.localUri || null,
    playing: Boolean(status?.playing),
    uri: status?.uri || null,
  };
}

export function getAudioPlaybackErrorMessage(error: unknown) {
  const nativeError = error as NativeAudioError;
  const code = String(nativeError?.code || '').trim();
  const message = String(nativeError?.message || '').trim();

  if (code === 'audio_url_missing' || code === 'audio_source_missing') {
    return 'URL de audio invalida.';
  }

  if (code === 'audio_download_not_found' || code === 'audio_file_missing') {
    return 'Archivo no encontrado.';
  }

  if (code === 'audio_download_empty' || code === 'audio_file_empty') {
    return 'Error de descarga: archivo vacio.';
  }

  if (code === 'audio_download_auth') {
    return 'No tienes autorizacion para reproducir este audio.';
  }

  if (code === 'audio_download_http') {
    return message || 'Error de descarga del audio.';
  }

  if (code === 'audio_unsupported_format') {
    return message || 'Formato de audio no soportado.';
  }

  if (code === 'audio_focus_denied') {
    return 'Android no permitio reproducir audio en este momento.';
  }

  if (code === 'audio_playback_failed') {
    return message || 'Error del reproductor Android.';
  }

  return message || 'No se pudo reproducir el audio.';
}

export async function requestRecordingPermissionsAsync(): Promise<PermissionResult> {
  if (Platform.OS !== 'android') {
    return { granted: true, status: 'granted' };
  }

  const permission = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
  const alreadyGranted = await PermissionsAndroid.check(permission);

  if (alreadyGranted) {
    return { granted: true, status: 'granted' };
  }

  const result = await PermissionsAndroid.request(permission);
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
  preset?: Record<string, unknown>,
  onStatusUpdate?: (status: RecorderStatus) => void
) {
  const statusRef = useRef<RecorderStatus>(idleRecorderStatus);
  const presetRef = useRef<Record<string, unknown> | undefined>(preset);
  const onStatusUpdateRef = useRef<typeof onStatusUpdate>(onStatusUpdate);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    presetRef.current = preset;
    onStatusUpdateRef.current = onStatusUpdate;
  }, [onStatusUpdate, preset]);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const updateStatus = useCallback(
    (status: RecorderStatus) => {
      const normalized = normalizeRecorderStatus(status);
      statusRef.current = normalized;
      onStatusUpdateRef.current?.(normalized);
      return normalized;
    },
    []
  );

  const pollStatus = useCallback(() => {
    if (!NativeAudio) {
      return;
    }

    NativeAudio.getRecordingStatus()
      .then(updateStatus)
      .catch(() => undefined);
  }, [updateStatus]);

  const startPolling = useCallback(() => {
    stopPolling();
    pollTimerRef.current = setInterval(pollStatus, 250);
  }, [pollStatus, stopPolling]);

  useEffect(
    () => () => {
      stopPolling();
    },
    [stopPolling]
  );

  return useMemo(
    () => ({
      get uri() {
        return statusRef.current.uri || statusRef.current.url || null;
      },
      async prepareToRecordAsync() {
        if (!NativeAudio) {
          throw new Error('La grabacion nativa solo esta disponible en Android.');
        }

        const status = await NativeAudio.startRecording(presetRef.current);
        updateStatus(status);
      },
      record() {
        const nextStatus = {
          ...statusRef.current,
          isRecording: true,
        };
        updateStatus(nextStatus);
        startPolling();
      },
      async stop() {
        if (!NativeAudio) {
          updateStatus(idleRecorderStatus);
          return;
        }

        stopPolling();
        const status = await NativeAudio.stopRecording();
        updateStatus({
          ...status,
          isRecording: false,
        });
      },
      getStatus() {
        return statusRef.current;
      },
    }),
    [startPolling, stopPolling, updateStatus]
  );
}

export function useAudioPlayer(
  source?: AudioSource,
  options?: {
    updateInterval?: number;
    keepAudioSessionActive?: boolean;
  }
) {
  const [status, setStatus] = useState<PlayerStatus>(idlePlayerStatus);
  const sourceRef = useRef<AudioSource>(source || null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const updateInterval = Math.max(100, Number(options?.updateInterval || 250));
  const sourceUri = source?.uri || null;
  const sourceHeadersKey = JSON.stringify(source?.headers || {});
  sourceRef.current = source || null;

  useEffect(() => {
    setStatus((current) => ({
      ...idlePlayerStatus,
      uri: sourceUri || current.uri || null,
    }));
  }, [sourceHeadersKey, sourceUri]);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const updateStatus = useCallback((nextStatus?: PlayerStatus | null) => {
    const normalized = normalizePlayerStatus(nextStatus);
    const currentUri = sourceRef.current?.uri || null;
    const effectiveStatus =
      currentUri && normalized.uri && normalized.uri !== currentUri
        ? {
            ...idlePlayerStatus,
            uri: currentUri,
          }
        : normalized;

    setStatus(effectiveStatus);

    return effectiveStatus;
  }, []);

  const pollStatus = useCallback(() => {
    if (!NativeAudio) {
      return;
    }

    NativeAudio.getPlayerStatus()
      .then((nextStatus) => {
        const normalized = updateStatus(nextStatus);

        if (!normalized.playing && !normalized.isBuffering) {
          stopPolling();
        }
      })
      .catch((error) => {
        console.warn('[audio] player status failed', error);
        stopPolling();
      });
  }, [stopPolling, updateStatus]);

  const startPolling = useCallback(() => {
    stopPolling();
    pollTimerRef.current = setInterval(pollStatus, updateInterval);
  }, [pollStatus, stopPolling, updateInterval]);

  useEffect(
    () => () => {
      stopPolling();
    },
    [stopPolling]
  );

  const play = useCallback(async () => {
    const currentSource = sourceRef.current;

    if (!currentSource?.uri || !NativeAudio) {
      return;
    }

    setStatus((current) => ({
      ...current,
      isBuffering: true,
      uri: currentSource.uri,
    }));

    const dynamicHeaders = currentSource.getHeaders?.() || undefined;
    const headers = {
      ...(currentSource.headers || {}),
      ...(dynamicHeaders || {}),
    };
    const requestHeaders = Object.keys(headers).length ? headers : undefined;

    console.info('[audio] playback start', {
      uri: currentSource.uri,
      hasAuthorization: Boolean(requestHeaders?.Authorization),
    });

    const nextStatus = await NativeAudio.startPlayer({
      uri: currentSource.uri,
      headers: requestHeaders,
    });
    console.info('[audio] playback ready', {
      uri: nextStatus.uri,
      localUri: nextStatus.localUri,
      durationMillis: nextStatus.durationMillis,
    });
    updateStatus(nextStatus);
    startPolling();
  }, [startPolling, updateStatus]);

  const pause = useCallback(async () => {
    if (!NativeAudio) {
      return;
    }

    const nextStatus = await NativeAudio.pausePlayer();
    updateStatus(nextStatus);
    stopPolling();
  }, [stopPolling, updateStatus]);

  const stop = useCallback(async () => {
    if (!NativeAudio) {
      return;
    }

    const nextStatus = await NativeAudio.stopPlayer();
    updateStatus(nextStatus);
    stopPolling();
  }, [stopPolling, updateStatus]);

  const seekTo = useCallback(
    async (positionSeconds = 0) => {
      if (!NativeAudio) {
        return;
      }

      const nextStatus = await NativeAudio.seekTo(Math.max(0, positionSeconds) * 1000);
      updateStatus(nextStatus);
    },
    [updateStatus]
  );

  return useMemo<AudioPlayer>(
    () => ({
      play,
      pause,
      stop,
      seekTo,
      getStatus: () => status,
      __status: status,
    }),
    [pause, play, seekTo, status, stop]
  );
}

export function useAudioPlayerStatus(player?: AudioPlayer | null) {
  return player?.__status || idlePlayerStatus;
}
