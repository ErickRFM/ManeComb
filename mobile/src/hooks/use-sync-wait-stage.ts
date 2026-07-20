import { useEffect, useState } from 'react';

/**
 * Ventana de espera antes de degradar a la pantalla de error. Cubre el arranque
 * en frio del backend en el tier gratuito de Render (30-60s en despertar) y va
 * alineada con COLD_START_SESSION_TIMEOUT_MS del cliente HTTP.
 */
export const SYNC_WAIT_TIMEOUT_MS = 80000;
/** A partir de aqui avisamos que el servidor se esta despertando. */
export const SYNC_SLOW_NOTICE_MS = 7000;

export type SyncWaitStage = 'loading' | 'slow' | 'expired';

/**
 * Distingue "cargando" de "fallo". Mientras `active` sea verdadero y no se
 * agote el timeout generoso, la espera es carga; solo despues se considera un
 * fallo que merece la pantalla de error.
 */
export function useSyncWaitStage(active: boolean): SyncWaitStage {
  const [stage, setStage] = useState<SyncWaitStage>('loading');

  useEffect(() => {
    if (!active) {
      setStage('loading');
      return undefined;
    }

    const slowNotice = setTimeout(() => setStage('slow'), SYNC_SLOW_NOTICE_MS);
    const expiry = setTimeout(() => setStage('expired'), SYNC_WAIT_TIMEOUT_MS);

    return () => {
      clearTimeout(slowNotice);
      clearTimeout(expiry);
    };
  }, [active]);

  return stage;
}
