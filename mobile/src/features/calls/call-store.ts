import { create } from 'zustand';
import {
  initialCallState,
  isBusyPhase,
  isIdle,
  matchesCall,
  reduce,
  type CallEvent,
} from './call-machine';
import {
  bindCallSocket,
  emitAccept,
  emitBusy,
  emitCancel,
  emitEnd,
  emitReject,
  emitStartCall,
} from './call-signaling';
import type { CallMode, CallSocket, CallState, IncomingCallPayload } from './call-types';
import type { CallRuntime, CallRuntimeFactory } from './call-runtime';
import { computeElapsedSeconds } from './call-selectors';

let RESULT_DISPLAY_MS = 1600;
export function __setResultDisplayMsForTests(ms: number): void {
  RESULT_DISPLAY_MS = ms;
}

let CONNECT_TIMEOUT_MS = 20000;
export function __setConnectTimeoutMsForTests(ms: number): void {
  CONNECT_TIMEOUT_MS = ms;
}

let runtimeFactory: CallRuntimeFactory | null = null;
export function setCallRuntimeFactory(factory: CallRuntimeFactory | null): void {
  runtimeFactory = factory;
}

const now = (): number => Date.now();

interface CallStore extends CallState {
  displayName: string | null;
  elapsedSeconds: number;
  isMuted: boolean;
  isCameraEnabled: boolean;
  localStream: any | null;
  remoteStream: any | null;

  _socket: CallSocket | null;
  _unbind: (() => void) | null;
  _resetTimer: ReturnType<typeof setTimeout> | null;
  _starting: boolean;
  _runtime: CallRuntime | null;
  _connectTimeout: ReturnType<typeof setTimeout> | null;
  _elapsedTimer: ReturnType<typeof setInterval> | null;

  bindSocket: (socket: CallSocket | null) => void;
  unbindSocket: () => void;
  startCall: (input: {
    conversationId: string;
    mode: CallMode;
    peerName?: string | null;
  }) => Promise<{ ok: boolean; code?: string }>;
  acceptIncomingCall: () => void;
  rejectIncomingCall: () => void;
  cancelOutgoingCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
  reset: () => void;

  handleIncoming: (payload: IncomingCallPayload) => void;
  handleAccepted: (payload: { callId: string; roomId?: string }) => void;
  handleRejected: (payload: { callId: string; reason?: string }) => void;
  handleCancelled: (payload: { callId: string }) => void;
  handleTimeout: (payload: { callId: string }) => void;
  handleRemoteEnd: (payload: { callId: string; reason?: string }) => void;
}

export const useCallStore = create<CallStore>()((set, get) => {
  const dispatch = (event: CallEvent): void => set((state) => reduce(state, event));

  const clearResetTimer = (): void => {
    const timer = get()._resetTimer;
    if (timer) clearTimeout(timer);
    set({ _resetTimer: null });
  };

  const clearConnectTimeout = (): void => {
    const timer = get()._connectTimeout;
    if (timer) clearTimeout(timer);
    set({ _connectTimeout: null });
  };

  const scheduleReset = (): void => {
    clearResetTimer();
    const timer = setTimeout(() => {
      set({ _resetTimer: null });
      const phase = get().phase;
      if (phase === 'ENDING' || phase === 'FAILED') {
        set({ displayName: null });
        dispatch({ type: 'RESET' });
      }
    }, RESULT_DISPLAY_MS);
    set({ _resetTimer: timer });
  };

  const stopRuntime = (): void => {
    const state = get();
    state._runtime?.stop();
    if (state._elapsedTimer) clearInterval(state._elapsedTimer);
    clearConnectTimeout();
    set({
      _runtime: null,
      _elapsedTimer: null,
      localStream: null,
      remoteStream: null,
      isMuted: false,
      isCameraEnabled: true,
    });
  };

  const armConnectTimeout = (callId: string): void => {
    clearConnectTimeout();
    const timeout = setTimeout(() => {
      const state = get();
      if (state.callId !== callId || !['CONNECTING', 'RECONNECTING'].includes(state.phase)) return;
      if (state._socket) emitEnd(state._socket, callId);
      stopRuntime();
      dispatch({ type: 'FAIL', failureCode: 'ice_timeout', now: now() });
      scheduleReset();
    }, CONNECT_TIMEOUT_MS);
    set({ _connectTimeout: timeout });
  };

  const endWith = (result: CallState['endResult']): void => {
    stopRuntime();
    set({ elapsedSeconds: 0 });
    dispatch({ type: 'END', result, now: now() });
    scheduleReset();
  };

  const onRuntimeConnected = (callId: string): void => {
    const state = get();
    if (state.callId !== callId || !['CONNECTING', 'RECONNECTING'].includes(state.phase)) return;
    clearConnectTimeout();
    dispatch({ type: 'CONNECTED', now: now() });
    if (!get()._elapsedTimer) {
      const elapsedTimer = setInterval(() => {
        set({ elapsedSeconds: computeElapsedSeconds(get().connectedAt, now()) });
      }, 1000);
      set({ _elapsedTimer: elapsedTimer });
    }
    set({ elapsedSeconds: computeElapsedSeconds(get().connectedAt, now()) });
  };

  const onRuntimeReconnecting = (callId: string): void => {
    const state = get();
    if (state.callId !== callId || !['CONNECTING', 'CONNECTED', 'RECONNECTING'].includes(state.phase)) {
      return;
    }
    dispatch({ type: 'RECONNECTING', now: now() });
    armConnectTimeout(callId);
  };

  const onRuntimeFailed = (callId: string, code: string): void => {
    const state = get();
    if (state.callId !== callId) return;
    if (state.phase === 'IDLE' || state.phase === 'ENDING' || state.phase === 'FAILED') return;
    if (state._socket) emitEnd(state._socket, callId);
    stopRuntime();
    set({ elapsedSeconds: 0 });
    dispatch({ type: 'FAIL', failureCode: code, now: now() });
    scheduleReset();
  };

  const startRuntime = (): void => {
    const state = get();
    if (state.phase !== 'CONNECTING' || !state._socket || !state.callId || state._runtime) return;
    const activeCallId = state.callId;
    if (!runtimeFactory) {
      onRuntimeFailed(activeCallId, 'runtime_unavailable');
      return;
    }

    const runtime = runtimeFactory({
      callId: activeCallId,
      direction: state.direction,
      mode: state.mode || 'audio',
      socket: state._socket,
      onConnected: () => onRuntimeConnected(activeCallId),
      onReconnecting: () => onRuntimeReconnecting(activeCallId),
      onFailed: (code) => onRuntimeFailed(activeCallId, code),
      onLocalStream: (stream) => {
        if (get().callId === activeCallId) set({ localStream: stream });
      },
      onRemoteStream: (stream) => {
        if (get().callId === activeCallId) set({ remoteStream: stream });
      },
    });

    set({
      _runtime: runtime,
      isMuted: false,
      isCameraEnabled: true,
      elapsedSeconds: 0,
    });
    armConnectTimeout(activeCallId);
  };

  return {
    ...initialCallState(),
    displayName: null,
    elapsedSeconds: 0,
    isMuted: false,
    isCameraEnabled: true,
    localStream: null,
    remoteStream: null,
    _socket: null,
    _unbind: null,
    _resetTimer: null,
    _starting: false,
    _runtime: null,
    _connectTimeout: null,
    _elapsedTimer: null,

    bindSocket: (socket) => {
      if (get()._socket === socket) return;
      get().unbindSocket();
      if (!socket) return;
      const unbind = bindCallSocket(socket, {
        onIncoming: (payload) => get().handleIncoming(payload),
        onAccepted: (payload) => get().handleAccepted(payload),
        onRejected: (payload) => get().handleRejected(payload),
        onCancelled: (payload) => get().handleCancelled(payload),
        onTimeout: (payload) => get().handleTimeout(payload),
        onEnd: (payload) => get().handleRemoteEnd(payload),
      });
      set({ _socket: socket, _unbind: unbind });
    },

    unbindSocket: () => {
      get()._unbind?.();
      set({ _socket: null, _unbind: null });
    },

    reset: () => {
      clearResetTimer();
      stopRuntime();
      set({
        _starting: false,
        displayName: null,
        elapsedSeconds: 0,
        isMuted: false,
        isCameraEnabled: true,
        localStream: null,
        remoteStream: null,
      });
      dispatch({ type: 'RESET' });
    },

    toggleMute: () => {
      const state = get();
      const nextMuted = !state.isMuted;
      state._runtime?.setMicEnabled(!nextMuted);
      set({ isMuted: nextMuted });
    },

    toggleCamera: () => {
      const state = get();
      if (state.mode !== 'video') return;
      const nextEnabled = !state.isCameraEnabled;
      state._runtime?.setCameraEnabled(nextEnabled);
      set({ isCameraEnabled: nextEnabled });
    },

    startCall: async ({ conversationId, mode, peerName }) => {
      const state = get();
      if (!isIdle(state) || state._starting) return { ok: false, code: 'busy_local' };
      if (!state._socket) return { ok: false, code: 'no_socket' };
      set({ _starting: true });
      try {
        const ack = await emitStartCall(state._socket, { conversationId, mode });
        if (!isIdle(get())) return { ok: false, code: 'busy_local' };
        if (!ack?.ok || !ack.callId) {
          return { ok: false, code: ack?.code || 'call_failed' };
        }
        set({ displayName: peerName?.trim() || 'Contacto' });
        dispatch({
          type: 'OUTGOING_RINGING',
          callId: ack.callId,
          conversationId,
          mode,
          roomId: ack.roomId ?? null,
          now: now(),
        });
        return { ok: true };
      } finally {
        set({ _starting: false });
      }
    },

    acceptIncomingCall: () => {
      const state = get();
      if (state.phase !== 'INCOMING_RINGING' || !state.callId) return;
      dispatch({ type: 'LOCAL_ACCEPT', now: now() });
      state._socket && emitAccept(state._socket, state.callId);
      startRuntime();
    },

    rejectIncomingCall: () => {
      const state = get();
      if (state.phase !== 'INCOMING_RINGING' || !state.callId) return;
      state._socket && emitReject(state._socket, state.callId);
      endWith('rejected');
    },

    cancelOutgoingCall: () => {
      const state = get();
      if (state.phase !== 'OUTGOING_RINGING' || !state.callId) return;
      state._socket && emitCancel(state._socket, state.callId);
      endWith('cancelled');
    },

    endCall: () => {
      const state = get();
      if (!state.callId) return;
      if (state.phase === 'OUTGOING_RINGING') {
        get().cancelOutgoingCall();
        return;
      }
      if (state.phase === 'INCOMING_RINGING') {
        get().rejectIncomingCall();
        return;
      }
      if (['CONNECTING', 'CONNECTED', 'RECONNECTING'].includes(state.phase)) {
        state._socket && emitEnd(state._socket, state.callId);
        endWith('ended');
      }
    },

    handleIncoming: (payload) => {
      if (!payload?.callId || !payload.conversationId || !payload.caller) return;
      const state = get();
      if (matchesCall(state, payload.callId)) return;
      if (isBusyPhase(state)) {
        state._socket && emitBusy(state._socket, payload.callId);
        return;
      }
      set({ displayName: payload.caller.name?.trim() || 'Contacto' });
      dispatch({ type: 'INCOMING', payload, now: now() });
    },

    handleAccepted: (payload) => {
      const state = get();
      if (!matchesCall(state, payload?.callId) || state.phase !== 'OUTGOING_RINGING') return;
      dispatch({ type: 'REMOTE_ACCEPTED', roomId: payload.roomId ?? null, now: now() });
      startRuntime();
    },

    handleRejected: (payload) => {
      const state = get();
      if (!matchesCall(state, payload?.callId)) return;
      endWith(payload?.reason === 'busy' ? 'busy' : 'rejected');
    },

    handleCancelled: (payload) => {
      if (!matchesCall(get(), payload?.callId)) return;
      endWith('cancelled');
    },

    handleTimeout: (payload) => {
      if (!matchesCall(get(), payload?.callId)) return;
      endWith('no_answer');
    },

    handleRemoteEnd: (payload) => {
      if (!matchesCall(get(), payload?.callId)) return;
      endWith('ended');
    },
  };
});
