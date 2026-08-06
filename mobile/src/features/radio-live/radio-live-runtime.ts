import {
  enqueuePttAudioFrame,
  startPttAudioPlayback,
  stopActiveAudioPlaybackAsync,
  stopPttAudioPlayback,
} from '@/src/native/audio';
import { RadioRealtimeService } from '@/src/screens/radio/services/radio-realtime-service';
import {
  acquireRadioForegroundService,
  releaseRadioForegroundService,
} from './radio-foreground-service';
import type {
  RadioLiveRuntimeFactory,
  RadioLiveRuntimeTransportState,
} from './radio-live-types';

export const createNativeRadioLiveRuntime: RadioLiveRuntimeFactory = (params) => {
  const {
    channelId,
    socket,
    userId,
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

  const setForegroundService = async (active: boolean) => {
    if (foregroundServiceActive === active) return;

    if (active) {
      try {
        await acquireRadioForegroundService('global');
        if (stopped) {
          await releaseRadioForegroundService('global').catch(() => undefined);
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
    await releaseRadioForegroundService('global').catch(() => undefined);
  };

  const finishCurrentTransmission = (reason?: string | null) => {
    const transmissionId = currentTransmissionId;
    if (!transmissionId) return;
    currentTransmissionId = null;
    generation += 1;
    stopPttAudioPlayback().catch(() => undefined);
    onTransmissionEnd({ transmissionId, reason });
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
      if (stopped || transmissionId !== currentTransmissionId) return;
      finishCurrentTransmission(reason || null);
    },
    onError: () => {
      if (stopped) return;
      onError('radio_realtime_error');
      finishCurrentTransmission('realtime_error');
    },
  });

  service.connect(socket, channelId);

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      generation += 1;
      currentTransmissionId = null;
      service.disconnect();
      stopPttAudioPlayback().catch(() => undefined);
      foregroundServiceActive = false;
      onForegroundServiceChange(false);
      releaseRadioForegroundService('global').catch(() => undefined);
    },
  };
};
