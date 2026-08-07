import {
  enqueuePttAudioFrame,
  startPttAudioCapture,
  startPttAudioPlayback,
  stopActiveAudioPlaybackAsync,
  stopPttAudioCapture,
  stopPttAudioPlayback,
  subscribeToPttAudioErrors,
  subscribeToPttAudioFrames,
} from '@/src/native/audio';
import { RadioRealtimeService } from './radio-realtime-service';
import {
  acquireRadioForegroundService,
  releaseRadioForegroundService,
  setRadioForegroundServiceMode,
} from './radio-foreground-service';
import type {
  RadioLiveRuntimeFactory,
  RadioLiveRuntimeTransportState,
  RadioLiveTransmissionResult,
} from './radio-live-types';

const PTT_FRAME_BYTES = 640;

export const createNativeRadioLiveRuntime: RadioLiveRuntimeFactory = (params) => {
  const {
    channelId,
    socket,
    userId,
    userName,
    onCaptureLost,
    onError,
    onForegroundServiceChange,
    onFrame,
    onReceiving,
    onTransmissionEnd,
    onTransportState,
  } = params;

  let stopped = false;
  let foregroundServiceActive = false;
  let currentTransmissionId: string | null = null;
  let generation = 0;
  // Transmision propia en curso. Es independiente de currentTransmissionId
  // (recepcion) porque el canal nunca tiene ambos a la vez, pero mantenerlos
  // separados evita que un radio:end ajeno corte la captura local.
  let txTransmissionId: string | null = null;

  const setForegroundService = async (active: boolean) => {
    if (foregroundServiceActive === active) return;

    if (active) {
      try {
        await acquireRadioForegroundService();
        if (stopped) {
          await releaseRadioForegroundService().catch(() => undefined);
          return;
        }
        foregroundServiceActive = true;
        onForegroundServiceChange(true);
      } catch {
        onError('radio_foreground_service_start_failed');
      }
      return;
    }

    foregroundServiceActive = false;
    onForegroundServiceChange(false);
    await releaseRadioForegroundService().catch(() => undefined);
  };

  const finishCurrentTransmission = (reason?: string | null) => {
    const transmissionId = currentTransmissionId;
    if (!transmissionId) return;
    currentTransmissionId = null;
    generation += 1;
    stopPttAudioPlayback().catch(() => undefined);
    onTransmissionEnd({ transmissionId, reason });
  };

  const setForegroundServiceMode = async (mode: 'listening' | 'transmitting') => {
    if (!foregroundServiceActive) return;
    await setRadioForegroundServiceMode(mode).catch(() => undefined);
  };

  // Corta la captura local sin depender de la pantalla: el micro nunca puede
  // quedar abierto porque un consumidor de React se desmonto.
  const abortLocalCapture = (code: string) => {
    const transmissionId = txTransmissionId;
    if (!transmissionId) return;
    txTransmissionId = null;
    void setForegroundServiceMode('listening');
    stopPttAudioCapture().catch(() => undefined);
    void service.endTransmission(transmissionId).catch(() => undefined);
    onCaptureLost(code);
  };

  const handleTransportState = (state: RadioLiveRuntimeTransportState) => {
    if (stopped) return;

    if (state === 'ready') {
      onTransportState(state, null);
      void setForegroundService(true);
      return;
    }

    if (state === 'offline' || state === 'reconnecting' || state === 'unauthorized' || state === 'error') {
      finishCurrentTransmission(`transport_${state}`);
      abortLocalCapture(`transport_${state}`);
    }

    // Once LISTENING was confirmed, keep the foreground service through transient
    // reconnects. It is stopped only for terminal auth/runtime errors or an
    // explicit owner handoff.
    if (state === 'unauthorized' || state === 'error') {
      void setForegroundService(false);
    }

    onTransportState(state, state === 'unauthorized' ? 'radio_unauthorized' : null);
  };

  const service = new RadioRealtimeService({
    onStateChange: handleTransportState,
    onStart: ({ transmissionId, transmitter }) => {
      // La autoridad de la transmision propia es el ACK de radio:start, no el
      // broadcast: ignorar el eco evita entrar en RECEIVING sobre uno mismo.
      if (stopped || transmitter.id === userId) return;

      if (currentTransmissionId && currentTransmissionId !== transmissionId) {
        finishCurrentTransmission('replaced');
      }

      currentTransmissionId = transmissionId;
      const playbackGeneration = ++generation;
      onReceiving({ transmissionId, operator: transmitter });

      void stopActiveAudioPlaybackAsync()
        .then(async () => {
          if (stopped || playbackGeneration !== generation || currentTransmissionId !== transmissionId) return;
          await startPttAudioPlayback(transmissionId);
          if (stopped || playbackGeneration !== generation || currentTransmissionId !== transmissionId) {
            await stopPttAudioPlayback().catch(() => undefined);
          }
        })
        .catch(() => {
          if (stopped || currentTransmissionId !== transmissionId) return;
          onError('radio_playback_start_failed');
          finishCurrentTransmission('playback_failed');
        });
    },
    onFrame: (frame) => {
      if (stopped || frame.transmissionId !== currentTransmissionId) return;
      const receivedAt = Date.now();
      onFrame({ transmissionId: frame.transmissionId, receivedAt });
      void enqueuePttAudioFrame(frame.data, frame.sequence, frame.transmissionId).catch(() => {
        if (stopped || frame.transmissionId !== currentTransmissionId) return;
        onError('radio_frame_playback_failed');
        finishCurrentTransmission('frame_playback_failed');
      });
    },
    onEnd: ({ transmissionId, reason }) => {
      if (stopped) return;
      // El backend puede cerrar la transmision propia (timeout, cadencia,
      // perdida de arbitraje): la captura local debe seguir esa autoridad.
      if (transmissionId === txTransmissionId) {
        txTransmissionId = null;
        void setForegroundServiceMode('listening');
        stopPttAudioCapture().catch(() => undefined);
        onCaptureLost(reason || 'transmission_closed');
        return;
      }
      if (transmissionId !== currentTransmissionId) return;
      finishCurrentTransmission(reason || null);
    },
    onError: () => {
      if (stopped) return;
      onError('radio_realtime_error');
      finishCurrentTransmission('realtime_error');
      abortLocalCapture('radio_realtime_error');
    },
  });

  const removeCaptureFrames = subscribeToPttAudioFrames((frame) => {
    const transmissionId = txTransmissionId;
    if (stopped || !transmissionId || frame.bytes !== PTT_FRAME_BYTES) return;
    const sent = service.sendFrame({
      data: frame.data,
      sequence: frame.sequence,
      sentAt: frame.capturedAt,
      transmissionId,
    });
    if (!sent) abortLocalCapture('radio_frame_transport_lost');
  });

  const removeCaptureErrors = subscribeToPttAudioErrors(() => {
    if (stopped) return;
    abortLocalCapture('radio_capture_failed');
  });

  service.connect(socket, channelId);

  const requestTransmission = async (): Promise<RadioLiveTransmissionResult> => {
    if (stopped) return { ok: false, error: 'radio_runtime_stopped' };
    if (txTransmissionId) return { ok: true, transmissionId: txTransmissionId };

    const ack = await service.requestTransmission();
    if (!ack.ok || !ack.transmissionId) {
      return { ok: false, error: ack.error || 'radio_unavailable', transmitter: ack.transmitter };
    }

    if (stopped) {
      await service.endTransmission(ack.transmissionId).catch(() => undefined);
      return { ok: false, error: 'radio_runtime_stopped' };
    }

    txTransmissionId = ack.transmissionId;
    try {
      await setForegroundServiceMode('transmitting');
      await startPttAudioCapture(ack.transmissionId);
    } catch {
      txTransmissionId = null;
      await setForegroundServiceMode('listening');
      await service.endTransmission(ack.transmissionId).catch(() => undefined);
      return { ok: false, error: 'radio_capture_start_failed' };
    }

    // Un stop() o un radio:end del backend durante el arranque de la captura
    // deja txTransmissionId en null: en ese caso el micro ya se cerro.
    if (stopped || txTransmissionId !== ack.transmissionId) {
      await stopPttAudioCapture().catch(() => undefined);
      await service.endTransmission(ack.transmissionId).catch(() => undefined);
      return { ok: false, error: 'radio_request_stale' };
    }

    return {
      ok: true,
      transmissionId: ack.transmissionId,
      transmitter: { id: userId, name: userName },
    };
  };

  const endTransmission = async (transmissionId: string): Promise<RadioLiveTransmissionResult> => {
    if (txTransmissionId === transmissionId) txTransmissionId = null;
    await setForegroundServiceMode('listening');
    await stopPttAudioCapture().catch(() => undefined);
    const ack = await service.endTransmission(transmissionId);
    return { ok: Boolean(ack.ok), error: ack.error };
  };

  return {
    requestTransmission,
    endTransmission,
    stop() {
      if (stopped) return;
      stopped = true;
      generation += 1;
      currentTransmissionId = null;
      const pendingTransmissionId = txTransmissionId;
      txTransmissionId = null;
      removeCaptureFrames();
      removeCaptureErrors();
      stopPttAudioCapture().catch(() => undefined);
      if (pendingTransmissionId) {
        service.endTransmission(pendingTransmissionId).catch(() => undefined);
      }
      service.disconnect();
      stopPttAudioPlayback().catch(() => undefined);
      foregroundServiceActive = false;
      onForegroundServiceChange(false);
      releaseRadioForegroundService().catch(() => undefined);
    },
  };
};
