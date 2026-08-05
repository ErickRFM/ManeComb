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

// Tiempo que se muestra el resultado (Rechazada/Ocupado/…) antes de volver a IDLE.
let RESULT_DISPLAY_MS = 1600;
export function __setResultDisplayMsForTests(ms: number): void {
  RESULT_DISPLAY_MS = ms;
}

const now = (): number => Date.now();

interface CallStore extends CallState {
  // internos (no UI)
  _socket: CallSocket | null;
  _unbind: (() => void) | null;
  _resetTimer: ReturnType<typeof setTimeout> | null;
  _starting: boolean;

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

  const endWith = (result: CallState['endResult']): void => {
    dispatch({ type: 'END', result, now: now() });
    scheduleReset();
  };

  return {
    ...initialCallState(),
    _socket: null,
    _unbind: null,
    _resetTimer: null,
    _starting: false,

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
      set({ _starting: false });
      dispatch({ type: 'RESET' });
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
      // Bloque B: solo signaling. El microfono/ICE/peer/join son Bloque C.
      dispatch({ type: 'LOCAL_ACCEPT', now: now() });
      if (state._socket) emitAccept(state._socket, state.callId);
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
      // Bloque C tomara desde CONNECTING (obtener ICE/media, join, negociar).
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
