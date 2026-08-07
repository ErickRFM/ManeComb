import { NativeEventEmitter, NativeModules, PermissionsAndroid, Platform } from 'react-native';
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

export type RadioForegroundServiceMode = 'listening' | 'transmitting';

export type RadioAudioRoute = 'auto' | 'bluetooth' | 'wired' | 'speaker' | 'earpiece';

export type RadioAudioRouteStatus = {
  /** Salida por la que realmente esta sonando Radio ahora mismo. */
  active: Exclude<RadioAudioRoute, 'auto'>;
  /** Preferencia del operador; 'auto' delega en la prioridad del sistema. */
  requested: RadioAudioRoute;
  available: Exclude<RadioAudioRoute, 'auto'>[];
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
  playerId?: string | null;
  messageId?: string | null;
  phase?: 'IDLE' | 'LOADING' | 'PREPARING' | 'READY' | 'PLAYING' | 'PAUSED' | 'SEEKING' | 'FINISHED' | 'RELEASED' | 'ERROR';
  isPrepared?: boolean;
  isPlaying?: boolean;
  currentPosition?: number;
  bufferPosition?: number;
  didFinish?: boolean;
  audioFocus?: string | null;
  outputDevice?: string | null;
  error?: string | null;
  currentTime: number;
  duration: number;
  currentMillis: number;
  durationMillis: number;
  isBuffering: boolean;
  isLoaded: boolean;
  localUri?: string | null;
  playing: boolean;
  level: number;
  didJustFinish: boolean;
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
  startPttCapture: (transmissionId: string) => Promise<{ frameDurationMs: number; sampleRate: number }>;
  stopPttCapture: () => Promise<void>;
  startPttPlayback: (transmissionId: string) => Promise<void>;
  enqueuePttFrame: (base64Data: string, sequence: number, transmissionId: string) => Promise<number>;
  stopPttPlayback: () => Promise<void>;
  startRadioForegroundService: (mode: RadioForegroundServiceMode) => Promise<void>;
  setRadioForegroundServiceState: (mode: RadioForegroundServiceMode) => Promise<void>;
  stopRadioForegroundService: () => Promise<void>;
  getRadioAudioRoute: () => Promise<RadioAudioRouteStatus>;
  setRadioAudioRoute: (route: RadioAudioRoute) => Promise<RadioAudioRouteStatus>;
  startRadioHistoryPlayer: (playerId: string, source: { uri: string; headers?: Record<string, string> }) => Promise<PlayerStatus>;
  pauseRadioHistoryPlayer: (playerId: string) => Promise<PlayerStatus>;
  stopRadioHistoryPlayer: (playerId: string) => Promise<PlayerStatus>;
  seekRadioHistoryPlayer: (playerId: string, positionMillis: number) => Promise<PlayerStatus>;
  getRadioHistoryPlayerStatus: (playerId: string) => Promise<PlayerStatus>;
  stopAllRadioHistoryPlayers: () => Promise<void>;
};

type NativeAudioError = Error & {
  code?: string;
  userInfo?: unknown;
};

const NativeAudio =
  Platform.OS === 'android'
    ? (NativeModules.ManeCombAudio as NativeAudioModule | undefined)
    : undefined;
const pttEventEmitter = NativeAudio ? new NativeEventEmitter(NativeModules.ManeCombAudio) : null;

export type PttAudioFrame = {
  bytes: number;
  capturedAt: number;
  data: string;
  sequence: number;
};

export function subscribeToPttAudioFrames(listener: (frame: PttAudioFrame) => void) {
  const subscription = pttEventEmitter?.addListener('ManeCombPttFrame', listener);
  return () => subscription?.remove();
}

export function subscribeToPttAudioErrors(
  listener: (error: { code?: string; nativeCode?: number }) => void
) {
  const subscription = pttEventEmitter?.addListener('ManeCombPttError', listener);
  return () => subscription?.remove();
}

export function subscribeToPttAudioLevel(listener: (event: { level: number }) => void) {
  const subscription = pttEventEmitter?.addListener('ManeCombPttLevel', listener);
  return () => subscription?.remove();
}

export async function startPttAudioCapture(transmissionId: string) {
  if (!NativeAudio) throw new Error('PTT nativo no disponible.');
  return NativeAudio.startPttCapture(transmissionId);
}

export async function stopPttAudioCapture() {
  await NativeAudio?.stopPttCapture();
}

export async function startPttAudioPlayback(transmissionId: string) {
  if (!NativeAudio) throw new Error('PTT nativo no disponible.');
  await NativeAudio.startPttPlayback(transmissionId);
}

export async function enqueuePttAudioFrame(
  base64Data: string,
  sequence: number,
  transmissionId: string
) {
  if (!NativeAudio) return 0;
  return NativeAudio.enqueuePttFrame(base64Data, sequence, transmissionId);
}

export async function stopPttAudioPlayback() {
  await NativeAudio?.stopPttPlayback();
}

// El tipo de foreground service depende del estado real: escuchar solo necesita
// mediaPlayback, transmitir necesita microphone. Android 14+ rechaza capturar en
// segundo plano sin el tipo declarado, por eso el modo viaja al nativo.
export async function startRadioForegroundService(
  mode: RadioForegroundServiceMode = 'listening'
) {
  await NativeAudio?.startRadioForegroundService(mode);
}

export async function setRadioForegroundServiceState(mode: RadioForegroundServiceMode) {
  await NativeAudio?.setRadioForegroundServiceState(mode);
}

export async function stopRadioForegroundService() {
  await NativeAudio?.stopRadioForegroundService();
}

const IDLE_AUDIO_ROUTE: RadioAudioRouteStatus = {
  active: 'speaker',
  requested: 'auto',
  available: [],
};

export function subscribeToRadioAudioRoute(listener: (route: string) => void) {
  const subscription = pttEventEmitter?.addListener(
    'ManeCombRadioRoute',
    ({ route }: { route: string }) => listener(route)
  );
  return () => subscription?.remove();
}

export async function getRadioAudioRoute(): Promise<RadioAudioRouteStatus> {
  if (!NativeAudio) return IDLE_AUDIO_ROUTE;
  return NativeAudio.getRadioAudioRoute();
}

export async function setRadioAudioRoute(route: RadioAudioRoute): Promise<RadioAudioRouteStatus> {
  if (!NativeAudio) return IDLE_AUDIO_ROUTE;
  return NativeAudio.setRadioAudioRoute(route);
}

const idlePlayerStatus: PlayerStatus = {
  playerId: null,
  messageId: null,
  phase: 'IDLE',
  isPrepared: false,
  isPlaying: false,
  currentPosition: 0,
  bufferPosition: 0,
  didFinish: false,
  audioFocus: 'none',
  outputDevice: null,
  error: null,
  currentTime: 0,
  duration: 0,
  currentMillis: 0,
  durationMillis: 0,
  isBuffering: false,
  isLoaded: false,
  playing: false,
  level: 0,
  didJustFinish: false,
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
    playerId: status?.playerId || null,
    messageId: status?.messageId || null,
    phase: status?.phase || (status?.playing ? 'PLAYING' : status?.isLoaded ? 'READY' : 'IDLE'),
    isPrepared: Boolean(status?.isPrepared ?? status?.isLoaded),
    isPlaying: Boolean(status?.isPlaying ?? status?.playing),
    currentPosition: Number(status?.currentPosition ?? currentMillis),
    bufferPosition: Number(status?.bufferPosition || 0),
    didFinish: Boolean(status?.didFinish ?? status?.didJustFinish),
    audioFocus: status?.audioFocus || 'none',
    outputDevice: status?.outputDevice || null,
    error: status?.error || null,
    currentMillis,
    durationMillis,
    currentTime:
      typeof status?.currentTime === 'number' ? status.currentTime : currentMillis / 1000,
    duration: typeof status?.duration === 'number' ? status.duration : durationMillis / 1000,
    isBuffering: Boolean(status?.isBuffering),
    isLoaded: Boolean(status?.isLoaded),
    localUri: status?.localUri || null,
    playing: Boolean(status?.playing),
    level: Math.max(0, Math.min(1, Number(status?.level || 0))),
    didJustFinish: Boolean(status?.didJustFinish),
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

  if (code === 'radio_channel_active') {
    return 'Finaliza la transmision PTT antes de reproducir el historial.';
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

export async function stopActiveAudioPlaybackAsync() {
  if (!NativeAudio) {
    return;
  }

  await NativeAudio.stopPlayer();
  await serializeRadioPlayerOperation(async () => {
    await NativeAudio.stopAllRadioHistoryPlayers();
    resetManagedRadioPlayer(activeRadioPlayerId);
    activeRadioPlayerId = null;
  });
}

let audioPlayerSequence = 0;
let activeRadioPlayerId: string | null = null;
let radioPlayerOperation: Promise<unknown> = Promise.resolve();
const radioPlayerResetters = new Map<string, () => void>();

function serializeRadioPlayerOperation<T>(operation: () => Promise<T>): Promise<T> {
  const next = radioPlayerOperation.then(operation, operation);
  radioPlayerOperation = next.catch(() => undefined);
  return next;
}

function resetManagedRadioPlayer(playerId: string | null) {
  if (!playerId) return;
  radioPlayerResetters.get(playerId)?.();
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
      clearTimeout(pollTimerRef.current);
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
    independent?: boolean;
    playerId?: string;
  }
) {
  const [status, setStatus] = useState<PlayerStatus>(idlePlayerStatus);
  const sourceRef = useRef<AudioSource>(source || null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollGenerationRef = useRef(0);
  const updateInterval = Math.max(100, Number(options?.updateInterval || 250));
  const independent = Boolean(options?.independent);
  const playerIdRef = useRef(options?.playerId || `radio-history-${++audioPlayerSequence}`);
  const sourceUri = source?.uri || null;
  const sourceHeadersKey = JSON.stringify(source?.headers || {});
  sourceRef.current = source || null;

  useEffect(() => {
    if (!independent) return undefined;
    const playerId = playerIdRef.current;
    radioPlayerResetters.set(playerId, () => {
      pollGenerationRef.current += 1;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
      setStatus({ ...idlePlayerStatus, playerId, messageId: playerId, phase: 'RELEASED' });
    });
    return () => {
      radioPlayerResetters.delete(playerId);
      if (activeRadioPlayerId === playerId) activeRadioPlayerId = null;
    };
  }, [independent]);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    pollGenerationRef.current += 1;
  }, []);

  useEffect(() => {
    stopPolling();
    if (independent && NativeAudio) {
      serializeRadioPlayerOperation(async () => {
        await NativeAudio.stopRadioHistoryPlayer(playerIdRef.current);
        if (activeRadioPlayerId === playerIdRef.current) activeRadioPlayerId = null;
      }).catch(() => undefined);
    }
    setStatus((current) => ({
      ...idlePlayerStatus,
      uri: sourceUri || current.uri || null,
    }));
  }, [independent, sourceHeadersKey, sourceUri, stopPolling]);

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

  const startPolling = useCallback(() => {
    stopPolling();
    const generation = pollGenerationRef.current;
    const poll = async () => {
      if (!NativeAudio || generation !== pollGenerationRef.current) return;
      try {
        const nextStatus = independent
          ? await NativeAudio.getRadioHistoryPlayerStatus(playerIdRef.current)
          : await NativeAudio.getPlayerStatus();
        if (generation !== pollGenerationRef.current) return;
        const normalized = updateStatus(nextStatus);
        const active = normalized.isPlaying || normalized.isBuffering || normalized.phase === 'SEEKING';
        if (active) pollTimerRef.current = setTimeout(poll, updateInterval);
      } catch (error) {
        console.warn('[audio] player status failed', error);
      }
    };
    pollTimerRef.current = setTimeout(poll, updateInterval);
  }, [independent, stopPolling, updateInterval, updateStatus]);

  useEffect(
    () => () => {
      stopPolling();
      if (independent && NativeAudio) {
        serializeRadioPlayerOperation(async () => {
          await NativeAudio.stopRadioHistoryPlayer(playerIdRef.current);
          if (activeRadioPlayerId === playerIdRef.current) activeRadioPlayerId = null;
        }).catch(() => undefined);
      }
    },
    [independent, stopPolling]
  );

  const play = useCallback(async () => {
    const currentSource = sourceRef.current;

    if (!currentSource?.uri || !NativeAudio) {
      return;
    }

    try {
      setStatus((current) => ({
        ...current,
        phase: 'LOADING',
        isBuffering: true,
        uri: currentSource.uri,
      }));

    const dynamicHeaders = currentSource.getHeaders?.() || undefined;
    const headers = {
      ...(currentSource.headers || {}),
      ...(dynamicHeaders || {}),
    };
    const requestHeaders = Object.keys(headers).length ? headers : undefined;

    const playerSource = { uri: currentSource.uri, headers: requestHeaders };
    const nextStatus = independent
      ? await serializeRadioPlayerOperation(async () => {
          const previousPlayerId = activeRadioPlayerId;
          if (previousPlayerId && previousPlayerId !== playerIdRef.current) {
            await NativeAudio.stopAllRadioHistoryPlayers();
            resetManagedRadioPlayer(previousPlayerId);
          }
          activeRadioPlayerId = playerIdRef.current;
          return NativeAudio.startRadioHistoryPlayer(playerIdRef.current, playerSource);
        })
      : await NativeAudio.startPlayer(playerSource);
      updateStatus(nextStatus);
      startPolling();
    } catch (error) {
      stopPolling();
      setStatus((current) => ({
        ...current,
        phase: 'ERROR',
        isBuffering: false,
        isPlaying: false,
        playing: false,
        error: getAudioPlaybackErrorMessage(error),
      }));
      throw error;
    }
  }, [independent, startPolling, stopPolling, updateStatus]);

  const pause = useCallback(async () => {
    if (!NativeAudio) {
      return;
    }

    const nextStatus = independent
      ? await serializeRadioPlayerOperation(() => NativeAudio.pauseRadioHistoryPlayer(playerIdRef.current))
      : await NativeAudio.pausePlayer();
    updateStatus(nextStatus);
    stopPolling();
  }, [independent, stopPolling, updateStatus]);

  const stop = useCallback(async () => {
    if (!NativeAudio) {
      return;
    }

    const nextStatus = independent
      ? await serializeRadioPlayerOperation(async () => {
          const result = await NativeAudio.stopRadioHistoryPlayer(playerIdRef.current);
          if (activeRadioPlayerId === playerIdRef.current) activeRadioPlayerId = null;
          return result;
        })
      : await NativeAudio.stopPlayer();
    updateStatus(nextStatus);
    stopPolling();
  }, [independent, stopPolling, updateStatus]);

  const seekTo = useCallback(
    async (positionSeconds = 0) => {
      if (!NativeAudio) {
        return;
      }

      const positionMillis = Math.max(0, positionSeconds) * 1000;
      const nextStatus = independent
        ? await serializeRadioPlayerOperation(() => NativeAudio.seekRadioHistoryPlayer(playerIdRef.current, positionMillis))
        : await NativeAudio.seekTo(positionMillis);
      const normalized = updateStatus(nextStatus);
      if (normalized.phase === 'SEEKING') startPolling();
    },
    [independent, startPolling, updateStatus]
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
