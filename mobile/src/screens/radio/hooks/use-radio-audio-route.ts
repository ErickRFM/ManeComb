import { useCallback, useEffect, useRef, useState } from 'react';
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
  const switchingRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      switchingRef.current = false;
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
      switchingRef.current = false;
      removeListener();
    };
  }, [enabled]);

  const cycleRoute = useCallback(async () => {
    if (switchingRef.current) return;

    const nextRoute = getNextRadioRoute(status);
    if (!nextRoute) return;

    switchingRef.current = true;
    try {
      setStatus(await setRadioAudioRoute(nextRoute));
    } catch {
      // La salida desaparecio entre el render y el toque: releemos la autoridad
      // nativa en lugar de dejar una seleccion fantasma en pantalla.
      setStatus(await getRadioAudioRoute().catch(() => status));
    } finally {
      switchingRef.current = false;
    }
  }, [status]);

  return { audioRoute: status, cycleRoute };
}
