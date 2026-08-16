/**
 * Traza de diagnostico del transporte realtime. Existe para demostrar en un
 * dispositivo real por que la autoridad compartida deja de propagarse; no
 * participa de ninguna decision.
 *
 * Modulo hoja, deliberadamente SIN imports: cualquier consumidor
 * (root-store, use-app-store, call-store) lo carga sin arrastrar dependencias.
 * Importar `mobileLog` desde `api_config` traeria `react-native-config` a
 * Calls y rompia sus pruebas aisladas, que es exactamente el tipo de efecto
 * colateral que una instrumentacion no debe tener.
 *
 * Por eso la compuerta DEV se evalua aqui con la misma regla que `isDevRuntime`:
 * en produccion no se construye ni se emite la linea.
 *
 * Filtrar en el dispositivo con el tag: MC_REALTIME_DIAG
 */
export const REALTIME_DIAG_TAG = 'MC_REALTIME_DIAG';

/**
 * Claves cuyo valor nunca puede escribirse, aunque un llamador las pase por
 * error. El token se reporta unicamente como booleano de cambio.
 */
const FORBIDDEN_KEYS = new Set([
  'token',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'auth',
  'authorization',
  'password',
  'secret',
  'jwt',
  'credentials',
]);

export function isRealtimeDiagEnabled() {
  const runtime = globalThis as typeof globalThis & { __DEV__?: boolean };
  return runtime.__DEV__ ?? process.env.NODE_ENV !== 'production';
}

export function sanitizeRealtimeDiagFields(
  fields: Record<string, unknown>
): Record<string, unknown> {
  const safe: Record<string, unknown> = {};

  Object.entries(fields).forEach(([key, value]) => {
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) return;
    if (typeof value === 'undefined') return;
    safe[key] = value;
  });

  return safe;
}

export function logRealtimeDiag(event: string, fields: Record<string, unknown> = {}) {
  if (!isRealtimeDiagEnabled()) return;

  console.info(
    `[${REALTIME_DIAG_TAG}] ${new Date().toISOString()} ${event}`,
    sanitizeRealtimeDiagFields(fields)
  );
}
