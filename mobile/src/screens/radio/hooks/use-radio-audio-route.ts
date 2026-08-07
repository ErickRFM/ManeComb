import { useCallback, useEffect, useState } from 'react';
import {
  getRadioAudioRoute,
  setRadioAudioRoute,
  subscribeToRadioAudioRoute,
  type RadioAudioRouteStatus,
} from '@/src/native/audio';
import { getNextRadioRoute } from '../utils/radio-audio-route';

/**
 * Lee la autoridad nativa de ruta de audio. La pantalla nunca decide por donde
 * sale el audio: solo muestra la salida real y pide un cambio.
 */
export function useRadioAudioRoute(enabled: boolean) {
  const [status, setStatus] = useState<RadioAudioRouteStatus | null>(null);

  useEffect(() => {
    if (!enabled) {
      setStatus(null);
      return undefined;
    }

    let cancelled = false;
    const sync = () => {
      getRadioAudioRoute()
        .then((next) => {
          if (!cancelled) setStatus(next);
        })
        .catch(() => undefined);
    };

    sync();
    const removeListener = subscribeToRadioAudioRoute(sync);
    return () => {
      cancelled = true;
      removeListener();
    };
  }, [enabled]);

  const cycleRoute = useCallback(async () => {
    const nextRoute = getNextRadioRoute(status);
    if (!nextRoute) return;
    try {
      setStatus(await setRadioAudioRoute(nextRoute));
    } catch {
      // La salida desaparecio entre el render y el toque: la proxima
      // notificacion del nativo repone el estado real.
      setStatus(await getRadioAudioRoute().catch(() => status));
    }
  }, [status]);

  return { audioRoute: status, cycleRoute };
}
