import {
  getApiErrorMessage,
  healthRequest,
  setAuthToken,
} from '@/src/api/client';
import {
  getMobileNetworkSnapshot,
  isNetworkReachable,
  type MobileNetworkSnapshot,
} from '@/src/api/mobile-runtime';

type LoginReadiness =
  | {
      ok: true;
      snapshot: MobileNetworkSnapshot | null;
    }
  | {
      ok: false;
      message: string;
      snapshot: MobileNetworkSnapshot | null;
    };

/**
 * Prepara un login interactivo sin reintentar nunca las credenciales.
 *
 * Al cerrar sesion, el runtime autenticado desmonta socket/listeners para que
 * no quede autoridad del tenant anterior. Si el usuario cambia de cuenta sin
 * reiniciar la app, no debemos depender de ese estado de red ya desmontado:
 * tomamos un snapshot fresco y despertamos/validamos el backend con GET /health
 * (idempotente y reintentable) antes del POST /auth/login (no reintentable).
 */
export async function ensureLoginBackendReady(): Promise<LoginReadiness> {
  // El login no necesita Authorization. Remover cualquier default residual
  // evita que una cuenta anterior viaje como contexto accidental en el preflight.
  setAuthToken(null);

  const snapshot = await getMobileNetworkSnapshot().catch(() => null);

  if (snapshot && !isNetworkReachable(snapshot)) {
    return {
      ok: false,
      snapshot,
      message: 'Revisa tu conexion e intenta nuevamente.',
    };
  }

  try {
    await healthRequest();
    return { ok: true, snapshot };
  } catch (error) {
    return {
      ok: false,
      snapshot,
      message: getApiErrorMessage(
        error,
        'No pudimos preparar el servidor para iniciar sesion. Intenta nuevamente.',
        {
          hasInternet: snapshot ? isNetworkReachable(snapshot) : null,
        }
      ),
    };
  }
}
