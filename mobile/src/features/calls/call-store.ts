// RC-MOBILE-CALLS-PRODUCTION-01 Bloque B — Store global de llamadas (zustand). Vive cerca del
// socket compartido, NO dentro de una pantalla. Orquesta la maquina de estados + el signaling.
// Bloque B: solo lifecycle de signaling; NO join, NO microfono, NO peer, NO CONNECTED.

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

// Tiempo que se muestra el resultado (Rechazada/Ocupado/…) antes de volver a IDLE.
let RESULT_DISPLAY_MS = 1600;
export function __setResultDisplayMsForTests(ms: number): void {
  RESULT_DISPLAY_MS = ms;
}

// C.7: timeout de conexion tras aceptar. Si no llega a CONNECTED -> FAILED.
let CONNECT_TIMEOUT_MS = 20000;
export function __setConnectTimeoutMsForTests(ms: number): void {
  CONNECT_TIMEOUT_MS = ms;
}

// El runtime nativo es el propietario del peer/media. Se INYECTA (call-overlay lo wirea con el
// runtime nativo en la app; las pruebas inyectan un doble). Asi call-store no acopla lo nativo.
let runtimeFactory: CallRuntimeFactory | null = null;
export function setCallRuntimeFactory(factory: CallRuntimeFactory | null): void {
  runtimeFactory = factory;
}

const now = (): number => Date.now();

interface CallStore extends CallState {
  // C: media/peer/tiempo
  elapsedSeconds: number;
  isMuted: boolean;
  toggleMute: () => void;

  // internos (no UI)
  _socket: CallSocket | null;
  _unbind: (() => void) | null;
  _resetTimer: ReturnType<typeof setTimeout> | null;
  _starting: boolean;
  _runtime: CallRuntime | null;
  _connectTimeout: ReturnType<typeof setTimeout> | null;
  _elapsedTimer: ReturnType<typeof setInterval> | null;

  // enlace al socket compartido
  bindSocket: (socket: CallSocket | null) => void;
  unbindSocket: () => void;

  // acciones de UI
  startCall: (input: { conversationId: string; mode: CallMode }) => Promise<{ ok: boolean; code?: string }>;
  acceptIncomingCall: () => void;
  rejectIncomingCall: () => void;
  cancelOutgoingCall: () => void;
  reset: () => void;

  // handlers de eventos del backend
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
      // Solo resetea si sigue en un estado terminal (evita pisar una llamada nueva).
      const phase = get().phase;
      if (phase === 'ENDING' || phase === 'FAILED') dispatch({ type: 'RESET' });
    }, RESULT_DISPLAY_MS);
    set({ _resetTimer: timer });
  };

  const stopRuntime = (): void => {
    const s = get();
    if (s._runtime) s._runtime.stop();
    if (s._connectTimeout) clearTimeout(s._connectTimeout);
    if (s._elapsedTimer) clearInterval(s._elapsedTimer);
    set({ _runtime: null, _connectTimeout: null, _elapsedTimer: null });
  };

  const endWith = (result: CallState['endResult']): void => {
    stopRuntime();
    set({ isMuted: false, elapsedSeconds: 0 });
    dispatch({ type: 'END', result, now: now() });
    scheduleReset();
  };

  // C.6/C.7/C.9: el runtime reporta CONNECTED o falla. Se guarda con el callId capturado para que
  // un callback de una llamada VIEJA no altere una nueva.
  const onRuntimeConnected = (callId: string): void => {
    const s = get();
    if (s.callId !== callId || s.phase !== 'CONNECTING') return; // evento tardio / llamada vieja
    if (s._connectTimeout) clearTimeout(s._connectTimeout);
    dispatch({ type: 'CONNECTED', now: now() });
    // C.6: cronometro desde connectedAt.
    const elapsedTimer = setInterval(() => {
      set({ elapsedSeconds: computeElapsedSeconds(get().connectedAt, now()) });
    }, 1000);
    set({ _connectTimeout: null, _elapsedTimer: elapsedTimer, elapsedSeconds: 0 });
  };

  const onRuntimeFailed = (callId: string, code: string): void => {
    const s = get();
    if (s.callId !== callId) return; // llamada vieja
    if (s.phase === 'IDLE' || s.phase === 'ENDING' || s.phase === 'FAILED') return;
    if (s._socket && s.callId) emitEnd(s._socket, s.callId); // avisa al otro extremo
    stopRuntime();
    set({ isMuted: false, elapsedSeconds: 0 });
    dispatch({ type: 'FAIL', failureCode: code, now: now() });
    scheduleReset();
  };

  // Arranca el runtime al entrar en CONNECTING (tras aceptar / call-accepted). Media/ICE/peer/join
  // viven en el runtime; si el micrófono o la config fallan -> onRuntimeFailed limpia y avisa.
  const startRuntime = (): void => {
    const s = get();
    if (s.phase !== 'CONNECTING' || !s._socket || !s.callId || s._runtime) return;
    const activeCallId = s.callId;
    if (!runtimeFactory) {
      onRuntimeFailed(activeCallId, 'runtime_unavailable');
      return;
    }
    const runtime = runtimeFactory({
      callId: activeCallId,
      direction: s.direction,
      mode: s.mode || 'audio',
      socket: s._socket,
      onConnected: () => onRuntimeConnected(activeCallId),
      onFailed: (code) => onRuntimeFailed(activeCallId, code),
    });
    const timeout = setTimeout(() => onRuntimeFailed(activeCallId, 'ice_timeout'), CONNECT_TIMEOUT_MS);
    set({ _runtime: runtime, _connectTimeout: timeout, isMuted: false, elapsedSeconds: 0 });
  };

  return {
    ...initialCallState(),
    elapsedSeconds: 0,
    isMuted: false,
    _socket: null,
    _unbind: null,
    _resetTimer: null,
    _starting: false,
    _runtime: null,
    _connectTimeout: null,
    _elapsedTimer: null,

    bindSocket: (socket) => {
      const current = get()._socket;
      if (current === socket) return; // ya vinculado a esta instancia
      // Quitar listeners del socket anterior (evita acumulacion tras reconnect/login/Fast Refresh).
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
      stopRuntime();
      set({ _starting: false, isMuted: false, elapsedSeconds: 0 });
      dispatch({ type: 'RESET' });
    },

    toggleMute: () => {
      const state = get();
      const next = !state.isMuted;
      if (state._runtime) state._runtime.setMicEnabled(!next); // enabled = !muted
      set({ isMuted: next });
    },

    startCall: async ({ conversationId, mode }) => {
      const state = get();
      if (!isIdle(state) || state._starting) return { ok: false, code: 'busy_local' };
      const socket = state._socket;
      if (!socket) return { ok: false, code: 'no_socket' };
      set({ _starting: true });
      try {
        const ack = await emitStartCall(socket, { conversationId, mode });
        // Podria haber entrado una llamada mientras esperabamos el ACK.
        if (!isIdle(get())) return { ok: false, code: 'busy_local' };
        if (!ack || !ack.ok || !ack.callId) {
          return { ok: false, code: (ack && ack.code) || 'call_failed' };
        }
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
      // C.3: transicion a CONNECTING, emite accept y arranca el runtime (ICE config -> media ->
      // peer -> join -> negociacion). Orden documentado: si la config/media fallan tras el accept,
      // onRuntimeFailed limpia y avisa al caller con rtc:end(reason), evitando "conectando" eterno.
      dispatch({ type: 'LOCAL_ACCEPT', now: now() });
      if (state._socket) emitAccept(state._socket, state.callId);
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

    handleIncoming: (payload) => {
      if (!payload || !payload.callId || !payload.conversationId || !payload.caller) return;
      const state = get();
      if (matchesCall(state, payload.callId)) return; // duplicado: no crear un segundo modal
      if (isBusyPhase(state)) {
        // Ya en otra llamada: declinar por ocupado sin reemplazar la actual.
        if (state._socket) emitBusy(state._socket, payload.callId);
        return;
      }
      dispatch({ type: 'INCOMING', payload, now: now() });
    },

    handleAccepted: (payload) => {
      const state = get();
      if (!matchesCall(state, payload && payload.callId)) return;
      if (state.phase !== 'OUTGOING_RINGING') return;
      dispatch({ type: 'REMOTE_ACCEPTED', roomId: payload.roomId ?? null, now: now() });
      startRuntime(); // caller = offerer; el runtime hace media -> peer -> join -> offer.
    },

    handleRejected: (payload) => {
      const state = get();
      if (!matchesCall(state, payload && payload.callId)) return;
      endWith(payload && payload.reason === 'busy' ? 'busy' : 'rejected');
    },

    handleCancelled: (payload) => {
      const state = get();
      if (!matchesCall(state, payload && payload.callId)) return;
      endWith('cancelled');
    },

    handleTimeout: (payload) => {
      const state = get();
      if (!matchesCall(state, payload && payload.callId)) return;
      endWith('no_answer');
    },

    handleRemoteEnd: (payload) => {
      const state = get();
      if (!matchesCall(state, payload && payload.callId)) return;
      endWith('ended');
    },
  };
});
