/**
 * Copy unico para el estado de sincronizacion de cuenta. Vive aparte porque lo
 * comparten dos pantallas distintas (`MobileAccountGateScreen` y
 * `MapDataRecovery`), que antes divergian en acentos y redaccion.
 */
export const SYNC_ERROR_TITLE = 'No pudimos sincronizar tu cuenta';
export const SYNC_ERROR_BODY = 'Revisa tu conexión e intenta de nuevo.';
export const SYNC_LOADING_MESSAGE = 'Sincronizando tu cuenta...';
export const SYNC_SLOW_MESSAGE = 'Esto puede tardar un poco, el servidor se está despertando.';
