import { create } from 'zustand';
import { createRadioLiveRuntime } from './radio-live-runtime';
import {
  initialRadioLiveState,
  type RadioLiveActivation,
  type RadioLiveRuntime,
  type RadioLiveState,
  type RadioLiveTransmissionResult,
} from './radio-live-types';

let runtimeFactory: () => RadioLiveRuntime = createRadioLiveRuntime;
let activationRevision = Date.now();

/** Punto de inyeccion para pruebas. En produccion siempre es el adaptador real. */
export function setRadioLiveRuntimeFactory(factory: (() => RadioLiveRuntime) | null) {
  runtimeFactory = factory || createRadioLiveRuntime;
}

type RadioLiveStore = RadioLiveState & {
  _runtime: RadioLiveRuntime | null;
  _unsubscribe: (() => void) | null;
  _sessionKey: string | null;
  _activationRevision: number;
  activate: (input: RadioLiveActivation) => void;
  setCallActive: (active: boolean) => void;
  setSessionAuthState: (state: 'recovering' | 'unauthorized') => void;
  requestTransmission: () => Promise<RadioLiveTransmissionResult>;
  endTransmission: () => Promise<RadioLiveTransmissionResult>;
  reset: () => void;
};

/**
 * Proyeccion del estado de Radio en React y superficie de comandos. La autoridad
 * operativa es el servicio nativo: este store no decide transiciones, las recibe.
 * Asi no puede existir un estado de React que contradiga al del canal real.
 */
export const useRadioLiveStore = create<RadioLiveStore>()((set, get) => {
  const ensureRuntime = () => {
    const current = get()._runtime;
    if (current) return current;

    const runtime = runtimeFactory();
    const unsubscribe = runtime.subscribe((state) => {
      // Ignore native publications queued before a credential rotation/logout.
      if (get()._runtime === runtime && state.authRevision === get()._activationRevision) set(state);
    });
    set({ _runtime: runtime, _unsubscribe: unsubscribe });
    return runtime;
  };

  return {
    ...initialRadioLiveState(),
    _runtime: null,
    _unsubscribe: null,
    _sessionKey: null,
    _activationRevision: 0,

    activate: (input) => {
      const channelId = String(input.channelId || '').trim();
      const userId = String(input.userId || '').trim();
      const token = String(input.token || '').trim();
      const socketUrl = String(input.socketUrl || '').trim();

      if (!channelId || !userId || !token || !socketUrl) {
        get().reset();
        return;
      }

      const runtime = ensureRuntime();
      const identityKey = `${userId}:${token}:${socketUrl}`;
      const current = get();

      if (current._sessionKey === identityKey) {
        // Misma sesion: cambiar de canal es un comando, no una reconexion.
        if (current.channelId !== channelId) {
          void runtime.selectChannel(channelId);
        }
        return;
      }

      const authRevision = ++activationRevision;
      set({ _sessionKey: identityKey, _activationRevision: authRevision });
      void runtime.activate({ ...input, channelId, userId, token, socketUrl, authRevision });
    },

    setCallActive: (active) => {
      const runtime = get()._runtime;
      if (!runtime) return;
      void runtime.setCallActive(active);
    },

    setSessionAuthState: (state) => {
      void get()._runtime?.setSessionAuthState(state);
    },

    requestTransmission: async () => {
      const runtime = get()._runtime;
      if (!runtime) return { ok: false, error: 'radio_not_ready' };
      return runtime.requestTransmission();
    },

    endTransmission: async () => {
      const runtime = get()._runtime;
      if (!runtime) return { ok: false, error: 'transmission_not_active' };
      return runtime.endTransmission();
    },

    reset: () => {
      const { _runtime: runtime, _unsubscribe: unsubscribe } = get();
      unsubscribe?.();
      void runtime?.deactivate();
      set({
        ...initialRadioLiveState(),
        _runtime: null,
        _unsubscribe: null,
        _sessionKey: null,
      });
    },
  };
});
