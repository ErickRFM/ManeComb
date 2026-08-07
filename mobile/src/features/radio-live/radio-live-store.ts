import { create } from 'zustand';
import type { Socket } from 'socket.io-client';
import {
  initialRadioLiveState,
  reduceRadioLiveState,
  type RadioLiveEvent,
} from './radio-live-machine';
import type {
  RadioLiveRuntime,
  RadioLiveRuntimeFactory,
  RadioLiveState,
  RadioLiveTransmissionResult,
} from './radio-live-types';

let runtimeFactory: RadioLiveRuntimeFactory | null = null;

export function setRadioLiveRuntimeFactory(factory: RadioLiveRuntimeFactory | null) {
  runtimeFactory = factory;
}

type ActivateInput = {
  channelId: string;
  socket: Socket;
  userId: string;
  userName?: string;
};

type RadioLiveStore = RadioLiveState & {
  _runtime: RadioLiveRuntime | null;
  _socket: Socket | null;
  _userId: string | null;
  _epoch: number;
  activate: (input: ActivateInput) => void;
  pause: (reason: 'call') => void;
  requestTransmission: () => Promise<RadioLiveTransmissionResult>;
  endTransmission: () => Promise<RadioLiveTransmissionResult>;
  reset: () => void;
};

// Autoridad operativa unica de Radio. La pantalla /radio y el overlay global son
// consumidores: observan este estado y envian comandos, nunca poseen transporte
// ni una segunda maquina de estados.
export const useRadioLiveStore = create<RadioLiveStore>()((set, get) => {
  const dispatch = (event: RadioLiveEvent) => {
    set((state) => reduceRadioLiveState(state, event));
  };

  const stopRuntime = () => {
    get()._runtime?.stop();
    set({ _runtime: null });
  };

  const isCurrentEpoch = (epoch: number, channelId: string) => {
    const state = get();
    return state._epoch === epoch && state.channelId === channelId;
  };

  return {
    ...initialRadioLiveState(),
    _runtime: null,
    _socket: null,
    _userId: null,
    _epoch: 0,

    activate: ({ channelId, socket, userId, userName }) => {
      const normalizedChannelId = String(channelId || '').trim();
      const normalizedUserId = String(userId || '').trim();
      if (!normalizedChannelId || !normalizedUserId) {
        get().reset();
        return;
      }

      const current = get();
      if (
        current._runtime &&
        current._socket === socket &&
        current._userId === normalizedUserId &&
        current.channelId === normalizedChannelId &&
        !['PAUSED_BY_CALL', 'ERROR', 'UNAUTHORIZED'].includes(current.phase)
      ) {
        return;
      }

      stopRuntime();
      const epoch = current._epoch + 1;
      set({ _epoch: epoch, _socket: socket, _userId: normalizedUserId });
      dispatch({ type: 'CONFIGURE', channelId: normalizedChannelId });

      if (!runtimeFactory) {
        dispatch({ type: 'FAIL', code: 'radio_runtime_unavailable' });
        return;
      }

      const runtime = runtimeFactory({
        channelId: normalizedChannelId,
        socket,
        userId: normalizedUserId,
        userName: String(userName || '').trim() || 'Operador',
        onTransportState: (state, errorCode) => {
          if (!isCurrentEpoch(epoch, normalizedChannelId)) return;
          dispatch({ type: 'TRANSPORT', state, errorCode });
        },
        onReceiving: ({ transmissionId, operator }) => {
          if (!isCurrentEpoch(epoch, normalizedChannelId)) return;
          dispatch({ type: 'RECEIVING', transmissionId, operator });
        },
        onFrame: ({ transmissionId, receivedAt }) => {
          if (!isCurrentEpoch(epoch, normalizedChannelId)) return;
          dispatch({ type: 'FRAME', transmissionId, receivedAt });
        },
        onTransmissionEnd: ({ transmissionId }) => {
          if (!isCurrentEpoch(epoch, normalizedChannelId)) return;
          dispatch({ type: 'TRANSMISSION_END', transmissionId });
        },
        onCaptureLost: (code) => {
          if (!isCurrentEpoch(epoch, normalizedChannelId)) return;
          const transmissionId = get().currentTransmissionId;
          if (transmissionId) dispatch({ type: 'TX_END', transmissionId });
          if (code !== 'completed') set({ lastErrorCode: code });
        },
        onForegroundServiceChange: (active) => {
          if (!isCurrentEpoch(epoch, normalizedChannelId)) return;
          dispatch({ type: 'SERVICE', active });
        },
        onError: (code) => {
          if (!isCurrentEpoch(epoch, normalizedChannelId)) return;
          dispatch({ type: 'FAIL', code });
        },
      });

      if (!isCurrentEpoch(epoch, normalizedChannelId)) {
        runtime.stop();
        return;
      }
      set({ _runtime: runtime });
    },

    requestTransmission: async () => {
      const current = get();
      const runtime = current._runtime;
      const channelId = current.channelId;
      if (!runtime || !channelId) return { ok: false, error: 'radio_not_ready' };
      if (current.phase === 'TRANSMITTING' && current.currentTransmissionId) {
        return { ok: true, transmissionId: current.currentTransmissionId };
      }
      if (current.phase !== 'LISTENING') return { ok: false, error: 'radio_not_ready' };

      const epoch = current._epoch;
      dispatch({ type: 'REQUEST' });

      const result = await runtime.requestTransmission();

      // Un cambio de canal, una llamada o un logout durante el arbitraje dejan
      // el ACK obsoleto: el runtime ya libero el canal, aqui solo se descarta.
      if (!isCurrentEpoch(epoch, channelId)) {
        return { ok: false, error: 'radio_request_stale' };
      }

      if (result.ok && result.transmissionId) {
        dispatch({
          type: 'TX_START',
          transmissionId: result.transmissionId,
          operator: result.transmitter || { id: current._userId || '', name: 'Operador' },
          startedAt: Date.now(),
        });
        return result;
      }

      if (result.error === 'channel_busy') {
        dispatch({ type: 'BUSY', operator: result.transmitter || null });
      } else if (result.error === 'forbidden' || result.error === 'unauthorized') {
        dispatch({ type: 'TRANSPORT', state: 'unauthorized', errorCode: 'radio_unauthorized' });
      } else if (result.error === 'radio_disconnected' || result.error === 'radio_ack_timeout') {
        dispatch({ type: 'TRANSPORT', state: 'reconnecting' });
      } else if (get().phase === 'REQUESTING') {
        dispatch({ type: 'FAIL', code: result.error || 'radio_unavailable' });
      }

      return result;
    },

    endTransmission: async () => {
      const current = get();
      const runtime = current._runtime;
      const transmissionId = current.currentTransmissionId;
      if (current.phase !== 'TRANSMITTING' || !runtime || !transmissionId) {
        return { ok: false, error: 'transmission_not_active' };
      }

      const result = await runtime.endTransmission(transmissionId);
      dispatch({ type: 'TX_END', transmissionId });
      if (!result.ok && result.error && result.error !== 'transmission_not_active') {
        set({ lastErrorCode: result.error });
      }
      return result;
    },

    pause: (reason) => {
      const current = get();
      if (!current._runtime && current.phase === 'PAUSED_BY_CALL') return;
      stopRuntime();
      set({ _epoch: current._epoch + 1, _socket: null });
      dispatch({ type: 'PAUSE', reason });
    },

    reset: () => {
      const nextEpoch = get()._epoch + 1;
      stopRuntime();
      set({
        ...initialRadioLiveState(),
        _runtime: null,
        _socket: null,
        _userId: null,
        _epoch: nextEpoch,
      });
    },
  };
});
