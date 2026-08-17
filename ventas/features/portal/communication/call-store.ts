import { create } from 'zustand';
import {
  bindCallSocket,
  emitAccept,
  emitBusy,
  emitCancel,
  emitEnd,
  emitReject,
  emitStartCall,
  initialCallState,
  isBusyPhase,
  isIdle,
  matchesCall,
  reduce,
  type CallEvent,
  type CallMode,
  type CallSocket,
  type CallState,
  type IncomingCallPayload,
} from '@shared/communication';
import { preflightBrowserCallMedia } from './browser-call-permissions';
import { createWebCallRuntime, type WebCallRuntime } from './web-call-runtime';

const RESULT_DISPLAY_MS = 1_600;
const CONNECT_TIMEOUT_MS = 20_000;
const RING_TIMEOUT_FALLBACK_MS = 35_000;

type PortalCallStore = CallState & {
  elapsedSeconds: number;
  isMuted: boolean;
  isCameraEnabled: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  _socket: CallSocket | null;
  _unbind: (() => void) | null;
  _runtime: WebCallRuntime | null;
  _resetTimer: ReturnType<typeof setTimeout> | null;
  _ringTimer: ReturnType<typeof setTimeout> | null;
  _connectTimer: ReturnType<typeof setTimeout> | null;
  _elapsedTimer: ReturnType<typeof setInterval> | null;
  _starting: boolean;
  _accepting: boolean;

  bindSocket(socket: CallSocket | null): void;
  reset(): void;
  startCall(input: { conversationId: string; mode: CallMode; peerUserId?: string | null }): Promise<{ ok: boolean; code?: string }>;
  acceptIncomingCall(): Promise<{ ok: boolean; code?: string }>;
  rejectIncomingCall(): void;
  cancelOutgoingCall(): void;
  endCall(): void;
  toggleMute(): void;
  toggleCamera(): void;
};

const now = () => Date.now();

function ringDelayMs(expiresAt?: string, ringTimeoutMs?: number) {
  const relative = Number.isFinite(Number(ringTimeoutMs)) && Number(ringTimeoutMs) > 0
    ? Math.floor(Number(ringTimeoutMs))
    : RING_TIMEOUT_FALLBACK_MS;
  if (!expiresAt) return relative;
  const deadline = Date.parse(expiresAt);
  if (!Number.isFinite(deadline)) return relative;
  return Math.max(0, Math.min(relative, deadline - now()));
}

function safeCallResult(reason: string | null | undefined): CallState['endResult'] {
  switch (String(reason || '').trim()) {
    case 'busy': return 'busy';
    case 'rejected': return 'rejected';
    case 'timeout': return 'no_answer';
    case 'cancelled': return 'cancelled';
    case 'answered_elsewhere': return 'answered_elsewhere';
    default: return 'ended';
  }
}

export const usePortalCallStore = create<PortalCallStore>((set, get) => {
  const dispatch = (event: CallEvent) => set((state) => reduce(state, event));

  const clearTimer = (key: '_resetTimer' | '_ringTimer' | '_connectTimer' | '_elapsedTimer') => {
    const timer = get()[key];
    if (timer) {
      if (key === '_elapsedTimer') clearInterval(timer as ReturnType<typeof setInterval>);
      else clearTimeout(timer as ReturnType<typeof setTimeout>);
    }
    set({ [key]: null } as Partial<PortalCallStore>);
  };

  const stopRuntime = () => {
    get()._runtime?.stop();
    clearTimer('_connectTimer');
    clearTimer('_elapsedTimer');
    set({
      _runtime: null,
      localStream: null,
      remoteStream: null,
      elapsedSeconds: 0,
      isMuted: false,
      isCameraEnabled: true,
    });
  };

  const scheduleReset = () => {
    clearTimer('_resetTimer');
    const timer = setTimeout(() => {
      set({ _resetTimer: null });
      if (get().phase === 'ENDING' || get().phase === 'FAILED') dispatch({ type: 'RESET' });
    }, RESULT_DISPLAY_MS);
    set({ _resetTimer: timer });
  };

  const endWith = (result: CallState['endResult']) => {
    clearTimer('_ringTimer');
    stopRuntime();
    set({ _starting: false, _accepting: false });
    dispatch({ type: 'END', result, now: now() });
    scheduleReset();
  };

  const fail = (callId: string, code: string) => {
    const state = get();
    if (state.callId !== callId || state.phase === 'IDLE' || state.phase === 'ENDING' || state.phase === 'FAILED') return;
    if (state._socket) emitEnd(state._socket, callId);
    clearTimer('_ringTimer');
    stopRuntime();
    dispatch({ type: 'FAIL', failureCode: code, now: now() });
    scheduleReset();
  };

  const ensureElapsedTimer = () => {
    if (get()._elapsedTimer) return;
    const update = () => {
      const connectedAt = get().connectedAt;
      set({ elapsedSeconds: connectedAt ? Math.max(0, Math.floor((now() - connectedAt) / 1000)) : 0 });
    };
    update();
    set({ _elapsedTimer: setInterval(update, 1_000) });
  };

  const startRuntime = () => {
    const state = get();
    if (state.phase !== 'CONNECTING' || !state.callId || !state._socket || state._runtime) return;
    const activeCallId = state.callId;
    const runtime = createWebCallRuntime({
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
      onConnected: () => {
        if (get().callId !== activeCallId) return;
        clearTimer('_connectTimer');
        dispatch({ type: 'CONNECTED', now: now() });
        ensureElapsedTimer();
      },
      onReconnecting: () => {
        if (get().callId === activeCallId && get().phase === 'CONNECTED') {
          dispatch({ type: 'RECONNECTING' });
        }
      },
      onReconnected: () => {
        if (get().callId !== activeCallId) return;
        dispatch({ type: 'CONNECTED', now: now() });
        ensureElapsedTimer();
      },
      onFailed: (code) => fail(activeCallId, code),
    });
    const timer = setTimeout(() => fail(activeCallId, 'ice_timeout'), CONNECT_TIMEOUT_MS);
    set({ _runtime: runtime, _connectTimer: timer });
  };

  const scheduleRing = (callId: string, expiresAt?: string, ringTimeoutMs?: number) => {
    clearTimer('_ringTimer');
    const timer = setTimeout(() => {
      if (get().callId !== callId) return;
      if (get().phase === 'OUTGOING_RINGING' || get().phase === 'INCOMING_RINGING') {
        endWith('no_answer');
      }
    }, ringDelayMs(expiresAt, ringTimeoutMs));
    set({ _ringTimer: timer });
  };

  const handleIncoming = (payload: IncomingCallPayload) => {
    const socket = get()._socket;
    if (!socket || !payload?.callId) return;
    if (isBusyPhase(get())) {
      emitBusy(socket, payload.callId);
      return;
    }
    dispatch({ type: 'INCOMING', payload, now: now() });
    scheduleRing(payload.callId, payload.expiresAt, payload.ringTimeoutMs);
  };

  const handleAccepted = (payload: { callId?: string; roomId?: string }) => {
    if (!matchesCall(get(), payload.callId) || get().phase !== 'OUTGOING_RINGING') return;
    clearTimer('_ringTimer');
    dispatch({ type: 'REMOTE_ACCEPTED', roomId: payload.roomId || null, now: now() });
    startRuntime();
  };

  const handleRejected = (payload: { callId?: string; reason?: string }) => {
    if (matchesCall(get(), payload.callId)) endWith(safeCallResult(payload.reason || 'rejected'));
  };
  const handleCancelled = (payload: { callId?: string }) => {
    if (matchesCall(get(), payload.callId)) endWith('cancelled');
  };
  const handleTimeout = (payload: { callId?: string }) => {
    if (matchesCall(get(), payload.callId)) endWith('no_answer');
  };
  const handleRemoteEnd = (payload: { callId?: string; reason?: string }) => {
    if (matchesCall(get(), payload.callId)) endWith(safeCallResult(payload.reason));
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
    _runtime: null,
    _resetTimer: null,
    _ringTimer: null,
    _connectTimer: null,
    _elapsedTimer: null,
    _starting: false,
    _accepting: false,

    bindSocket: (socket) => {
      if (get()._socket === socket) return;
      get()._unbind?.();
      if (get().phase !== 'IDLE') {
        stopRuntime();
        dispatch({ type: 'FAIL', failureCode: 'socket_replaced', now: now() });
        scheduleReset();
      }
      if (!socket) {
        set({ _socket: null, _unbind: null });
        return;
      }
      const unbind = bindCallSocket(socket, {
        onIncoming: handleIncoming,
        onAccepted: handleAccepted,
        onRejected: handleRejected,
        onCancelled: handleCancelled,
        onTimeout: handleTimeout,
        onEnd: handleRemoteEnd,
      });
      set({ _socket: socket, _unbind: unbind });
    },

    reset: () => {
      const state = get();
      if (state.callId && state._socket && state.phase !== 'IDLE') emitEnd(state._socket, state.callId);
      state._unbind?.();
      stopRuntime();
      clearTimer('_ringTimer');
      clearTimer('_resetTimer');
      set({
        ...initialCallState(),
        elapsedSeconds: 0,
        isMuted: false,
        isCameraEnabled: true,
        localStream: null,
        remoteStream: null,
        _socket: null,
        _unbind: null,
        _runtime: null,
        _resetTimer: null,
        _ringTimer: null,
        _connectTimer: null,
        _elapsedTimer: null,
        _starting: false,
        _accepting: false,
      });
    },

    startCall: async ({ conversationId, mode, peerUserId = null }) => {
      const state = get();
      if (!isIdle(state) || state._starting) return { ok: false, code: 'busy' };
      if (!state._socket) return { ok: false, code: 'socket_unavailable' };

      set({ _starting: true, failureCode: null });
      const preflight = await preflightBrowserCallMedia(mode);
      if (!get()._starting) return { ok: false, code: 'cancelled' };
      if (!preflight.ok) {
        set({ _starting: false, failureCode: preflight.code || 'media_capture_failed' });
        return { ok: false, code: preflight.code || 'media_capture_failed' };
      }

      const ack = await emitStartCall(state._socket, { conversationId, mode });
      if (!get()._starting) return { ok: false, code: 'cancelled' };
      set({ _starting: false });
      if (!ack.ok || !ack.callId) return { ok: false, code: ack.code || ack.reason || 'call_failed' };
      dispatch({
        type: 'OUTGOING_RINGING',
        callId: ack.callId,
        conversationId,
        mode,
        roomId: ack.roomId || null,
        peerUserId,
        now: now(),
      });
      scheduleRing(ack.callId, ack.expiresAt, ack.ringTimeoutMs);
      return { ok: true };
    },

    acceptIncomingCall: async () => {
      const state = get();
      if (state.phase !== 'INCOMING_RINGING' || !state.callId || !state._socket || state._accepting) {
        return { ok: false, code: 'not_ringing' };
      }

      set({ _accepting: true, failureCode: null });
      const preflight = await preflightBrowserCallMedia(state.mode || 'audio');
      if (!matchesCall(get(), state.callId)) {
        set({ _accepting: false });
        return { ok: false, code: 'call_changed' };
      }
      if (!preflight.ok) {
        set({ _accepting: false, failureCode: preflight.code || 'media_capture_failed' });
        return { ok: false, code: preflight.code || 'media_capture_failed' };
      }

      const ack = await emitAccept(state._socket, state.callId);
      if (!matchesCall(get(), state.callId)) {
        set({ _accepting: false });
        return { ok: false, code: 'call_changed' };
      }
      set({ _accepting: false });
      if (!ack.ok) {
        if (ack.code === 'answered_elsewhere') endWith('answered_elsewhere');
        return { ok: false, code: ack.code || ack.reason || 'accept_failed' };
      }
      clearTimer('_ringTimer');
      dispatch({ type: 'LOCAL_ACCEPT', now: now() });
      set({ roomId: ack.roomId || get().roomId, failureCode: null });
      startRuntime();
      return { ok: true };
    },

    rejectIncomingCall: () => {
      const state = get();
      if (state.phase !== 'INCOMING_RINGING' || !state.callId || !state._socket) return;
      emitReject(state._socket, state.callId);
      endWith('rejected');
    },

    cancelOutgoingCall: () => {
      const state = get();
      if (state.phase !== 'OUTGOING_RINGING' || !state.callId || !state._socket) return;
      emitCancel(state._socket, state.callId);
      endWith('cancelled');
    },

    endCall: () => {
      const state = get();
      if (!state.callId || !state._socket || state.phase === 'IDLE') return;
      emitEnd(state._socket, state.callId);
      endWith('ended');
    },

    toggleMute: () => {
      const nextMuted = !get().isMuted;
      get()._runtime?.setMicEnabled(!nextMuted);
      set({ isMuted: nextMuted });
    },

    toggleCamera: () => {
      if (get().mode !== 'video') return;
      const enabled = !get().isCameraEnabled;
      get()._runtime?.setCameraEnabled(enabled);
      set({ isCameraEnabled: enabled });
    },
  };
});