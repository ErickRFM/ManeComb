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
} from './radio-live-types';

let runtimeFactory: RadioLiveRuntimeFactory | null = null;

export function setRadioLiveRuntimeFactory(factory: RadioLiveRuntimeFactory | null) {
  runtimeFactory = factory;
}

type ActivateInput = {
  channelId: string;
  socket: Socket;
  userId: string;
};

type RadioLiveStore = RadioLiveState & {
  _runtime: RadioLiveRuntime | null;
  _socket: Socket | null;
  _userId: string | null;
  _epoch: number;
  activate: (input: ActivateInput) => void;
  pause: (reason: 'call' | 'screen') => void;
  reset: () => void;
};

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

    activate: ({ channelId, socket, userId }) => {
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
        !['PAUSED_BY_CALL', 'PAUSED_BY_SCREEN', 'ERROR', 'UNAUTHORIZED'].includes(current.phase)
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

    pause: (reason) => {
      const current = get();
      const expectedPhase = reason === 'call' ? 'PAUSED_BY_CALL' : 'PAUSED_BY_SCREEN';
      if (!current._runtime && current.phase === expectedPhase) return;
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
