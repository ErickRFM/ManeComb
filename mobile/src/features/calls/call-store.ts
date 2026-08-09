// RC-RTC-FINALIZATION-20260805 — Store global de llamadas.
// Es la unica fuente de verdad para signaling, peer/media expuestos a UI, controles y cronometro.

import { create } from 'zustand';
import {
  initialCallState,
  isBusyPhase,
  isIdle,
  matchesCall,
  reduce,
  type CallEvent,
} from './call-machine';
import { computeElapsedSeconds } from './call-selectors';
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

let RESULT_DISPLAY_MS = 1600;
export function __setResultDisplayMsForTests(ms: number): void {
  RESULT_DISPLAY_MS = ms;
}

let CONNECT_TIMEOUT_MS = 20000;
export function __setConnectTimeoutMsForTests(ms: number): void {
  CONNECT_TIMEOUT_MS = ms;
}

const RING_TIMEOUT_FALLBACK_MS = 35000;

let runtimeFactory: CallRuntimeFactory | null = null;
export function setCallRuntimeFactory(factory: CallRuntimeFactory | null): void {
  runtimeFactory = factory;
}

const now = (): number => Date.now();

interface CallStore extends CallState {
  elapsedSeconds: number;
  isMuted: boolean;
  isCameraEnabled: boolean;
  localStream: any | null;
  remoteStream: any | null;

  _socket: CallSocket | null;
  _unbind: (() => void) | null;
  _resetTimer: ReturnType<typeof setTimeout> | null;
  _ringTimeout: ReturnType<typeof setTimeout> | null;
  _starting: boolean;
  _runtime: CallRuntime | null;
  _connectTimeout: ReturnType<typeof setTimeout> | null;
  _elapsedTimer: ReturnType<typeof setInterval> | null;

  bindSocket: (socket: CallSocket | null) => void;
  unbindSocket: () => void;

  startCall: (input: {
    conversationId: string;
    mode: CallMode;
  }) => Promise<{ ok: boolean; code?: string }>;
  acceptIncomingCall: () => Promise<void>;
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

  const scheduleReset = (): void => {
    clearResetTimer();
    const timer = setTimeout(() => {
      set({ _resetTimer: null });
      const phase = get().phase;
      if (phase === 'ENDING' || phase === 'FAILED') dispatch({ type: 'RESET' });
    }, RESULT_DISPLAY_MS);
    set({ _resetTimer: timer });
  };

  const clearRingTimeout = (): void => {
    const timer = get()._ringTimeout;
    if (timer) clearTimeout(timer);
    set({ _ringTimeout: null });
  };

  const ringDelayMs = (expiresAt?: string, ringTimeoutMs?: number): number => {
    const relativeLimit = Number.isFinite(ringTimeoutMs) && Number(ringTimeoutMs) > 0
      ? Math.floor(Number(ringTimeoutMs))
      : RING_TIMEOUT_FALLBACK_MS;
    if (!expiresAt) return relativeLimit;
    const expiresAtMs = Date.parse(expiresAt);
    if (!Number.isFinite(expiresAtMs)) return relativeLimit;
    return Math.max(0, Math.min(relativeLimit, expiresAtMs - now()));
  };

  const clearConnectTimeout = (): void => {
    const timer = get()._connectTimeout;
    if (timer) clearTimeout(timer);
    set({ _connectTimeout: null });
  };

  const stopElapsedTimer = (): void => {
    const timer = get()._elapsedTimer;
    if (timer) clearInterval(timer);
    set({ _elapsedTimer: null });
  };

  const stopRuntime = (): void => {
    const runtime = get()._runtime;
    if (runtime) runtime.stop();
    clearConnectTimeout();
    stopElapsedTimer();
    set({
      _runtime: null,
      localStream: null,
      remoteStream: null,
      isMuted: false,
      isCameraEnabled: true,
    });
  };

  const endWith = (result: CallState['endResult']): void => {
    clearRingTimeout();
    stopRuntime();
    set({ elapsedSeconds: 0 });
    dispatch({ type: 'END', result, now: now() });
    scheduleReset();
  };

  const scheduleRingTimeout = (
    callId: string,
    expiresAt?: string,
    ringTimeoutMs?: number
  ): void => {
    clearRingTimeout();
    const delay = ringDelayMs(expiresAt, ringTimeoutMs);
    const timer = setTimeout(() => {
      set({ _ringTimeout: null });
      const state = get();
      if (state.callId !== callId) return;
      if (state.phase !== 'OUTGOING_RINGING' && state.phase !== 'INCOMING_RINGING') return;
      endWith('no_answer');
    }, delay);
    set({ _ringTimeout: timer });
  };

  const ensureElapsedTimer = (): void => {
    if (get()._elapsedTimer) return;
    const timer = setInterval(() => {
      set({ elapsedSeconds: computeElapsedSeconds(get().connectedAt, now()) });
    }, 1000);
    set({
      _elapsedTimer: timer,
      elapsedSeconds: computeElapsedSeconds(get().connectedAt, now()),
    });
  };

  const onRuntimeConnected = (callId: string): void => {
    const state = get();
    if (state.callId !== callId) return;
    if (state.phase !== 'CONNECTING' && state.phase !== 'RECONNECTING') return;
    clearConnectTimeout();
    dispatch({ type: 'CONNECTED', now: now() });
    ensureElapsedTimer();
  };

  const onRuntimeReconnecting = (callId: string): void => {
    const state = get();
    if (state.callId !== callId || state.phase !== 'CONNECTED') return;
    dispatch({ type: 'RECONNECTING' });
  };

  const onRuntimeFailed = (callId: string, code: string): void => {
    const state = get();
    if (state.callId !== callId) return;
    if (state.phase === 'IDLE' || state.phase === 'ENDING' || state.phase === 'FAILED') return;
    if (state._socket) emitEnd(state._socket, callId);
    clearRingTimeout();
    stopRuntime();
    set({ elapsedSeconds: 0 });
    dispatch({ type: 'FAIL', failureCode: code, now: now() });
    scheduleReset();
  };

  const startRuntime = (): void => {
    const state = get();
    if (
      state.phase !== 'CONNECTING' ||
      !state._socket ||
      !state.callId ||
      state._runtime
    ) return;

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
      onLocalStream: (stream) => {
        if (get().callId === activeCallId) set({ localStream: stream });
      },
      onRemoteStream: (stream) => {
        if (get().callId === activeCallId) set({ remoteStream: stream });
      },
      onConnected: () => onRuntimeConnected(activeCallId),
      onReconnecting: () => onRuntimeReconnecting(activeCallId),
      onReconnected: () => onRuntimeConnected(activeCallId),
      onFailed: (code) => onRuntimeFailed(activeCallId, code),
    });
    const timeout = setTimeout(
      () => onRuntimeFailed(activeCallId, 'ice_timeout'),
      CONNECT_TIMEOUT_MS
    );
    set({
      _runtime: runtime,
      _connectTimeout: timeout,
      isMuted: false,
      isCameraEnabled: true,
      elapsedSeconds: 0,
    });
  };

  return {
    ...initialCallState(),
    elapsedSeconds: 0,
    isMuted: false,
    isCameraEnabled: true,
    localStream: null,
    remoteStream: null,
    _socket: null,
    _unbind: null,
    _resetTimer: null,
    _ringTimeout: null,
    _starting: false,
    _runtime: null,
    _connectTimeout: null,
    _elapsedTimer: null,

    bindSocket: (socket) => {
      const current = get()._socket;
      if (current === socket) return;
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
      const unbind = get()._unbind;
      if (unbind) unbind();
      set({ _socket: null, _unbind: null });
    },

    reset: () => {
      clearResetTimer();
      clearRingTimeout();
      stopRuntime();
      set({ _starting: false, elapsedSeconds: 0 });
      dispatch({ type: 'RESET' });
    },

    toggleMute: () => {
      const state = get();
      if (!state._runtime) return;
      const nextMuted = !state.isMuted;
      state._runtime.setMicEnabled(!nextMuted);
      set({ isMuted: nextMuted });
    },

    toggleCamera: () => {
      const state = get();
      if (!state._runtime || state.mode !== 'video') return;
      const nextEnabled = !state.isCameraEnabled;
      state._runtime.setCameraEnabled(nextEnabled);
      set({ isCameraEnabled: nextEnabled });
    },

    startCall: async ({ conversationId, mode }) => {
      const state = get();
      if (!isIdle(state) || state._starting) return { ok: false, code: 'busy_local' };
      const socket = state._socket;
      if (!socket) return { ok: false, code: 'no_socket' };
      set({ _starting: true });
      try {
        const ack = await emitStartCall(socket, { conversationId, mode });
        if (!isIdle(get())) return { ok: false, code: 'busy_local' };
        if (!ack?.ok || !ack.callId) {
          return { ok: false, code: ack?.code || ack?.reason || 'call_failed' };
        }
        dispatch({
          type: 'OUTGOING_RINGING',
          callId: ack.callId,
          conversationId,
          mode,
          roomId: ack.roomId ?? null,
          now: now(),
        });
        scheduleRingTimeout(ack.callId, ack.expiresAt, ack.ringTimeoutMs);
        return { ok: true };
      } finally {
        set({ _starting: false });
      }
    },

    acceptIncomingCall: async () => {
      const state = get();
      if (state.phase !== 'INCOMING_RINGING' || !state.callId) return;
      const activeCallId = state.callId;
      clearRingTimeout();
      dispatch({ type: 'LOCAL_ACCEPT', now: now() });
      if (!state._socket) {
        onRuntimeFailed(activeCallId, 'accept_no_socket');
        return;
      }

      const ack = await emitAccept(state._socket, activeCallId);
      const current = get();
      if (current.callId !== activeCallId || current.phase !== 'CONNECTING') return;
      if (!ack.ok) {
        onRuntimeFailed(
          activeCallId,
          ack.code === 'ack_timeout' ? 'accept_timeout' : 'accept_failed'
        );
        return;
      }
      startRuntime();
    },

    rejectIncomingCall: () => {
      const state = get();
      if (state.phase !== 'INCOMING_RINGING' || !state.callId) return;
      if (state._socket) emitReject(state._socket, state.callId);
      endWith('rejected');
    },

    cancelOutgoingCall: () => {
      const state = get();
      if (state.phase !== 'OUTGOING_RINGING' || !state.callId) return;
      if (state._socket) emitCancel(state._socket, state.callId);
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
      if (
        state.phase === 'CONNECTING' ||
        state.phase === 'CONNECTED' ||
        state.phase === 'RECONNECTING'
      ) {
        if (state._socket) emitEnd(state._socket, state.callId);
        endWith('ended');
      }
    },

    handleIncoming: (payload) => {
      if (!payload?.callId || !payload.conversationId || !payload.caller) return;
      const state = get();
      if (matchesCall(state, payload.callId)) return;
      if (isBusyPhase(state)) {
        if (state._socket) emitBusy(state._socket, payload.callId);
        return;
      }
      dispatch({ type: 'INCOMING', payload, now: now() });
      scheduleRingTimeout(payload.callId, payload.expiresAt, payload.ringTimeoutMs);
    },

    handleAccepted: (payload) => {
      const state = get();
      if (!matchesCall(state, payload?.callId) || state.phase !== 'OUTGOING_RINGING') return;
      clearRingTimeout();
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
