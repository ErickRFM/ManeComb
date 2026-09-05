import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { apiClient } from './client';
import {
  getSessionEpoch,
  subscribeSessionEpoch,
} from '@/src/store/session-epoch';
import {
  resumeSessionCredentialWrites,
  suspendSessionCredentialWrites,
} from '@/src/native/secure-store';

type BoundaryRequestConfig = InternalAxiosRequestConfig & {
  _manecombSessionEpoch?: number;
};

type BoundaryRuntime = typeof globalThis & {
  __MANECOMB_API_SESSION_BOUNDARY_INSTALLED__?: boolean;
  __MANECOMB_API_SESSION_BOUNDARY_SUSPENDED__?: boolean;
};

const runtime = globalThis as BoundaryRuntime;

export class StaleApiSessionError extends Error {
  readonly code = 'MANECOMB_STALE_SESSION';

  constructor(message = 'La operacion pertenece a una sesion que ya termino.') {
    super(message);
    this.name = 'StaleApiSessionError';
  }
}

function normalizePath(config: Pick<InternalAxiosRequestConfig, 'url'> | undefined) {
  const raw = String(config?.url || '').trim();
  if (!raw) return '';

  try {
    return new URL(raw, 'https://manecomb.invalid').pathname;
  } catch {
    return raw.split('?')[0] || raw;
  }
}

function requestMethod(config: Pick<InternalAxiosRequestConfig, 'method'> | undefined) {
  return String(config?.method || 'get').toLowerCase();
}

function isNewSessionRequest(config: InternalAxiosRequestConfig | undefined) {
  if (requestMethod(config) !== 'post') return false;
  const path = normalizePath(config);
  return (
    path === '/auth/login' ||
    path === '/auth/register' ||
    path === '/driver/activation/register'
  );
}

function isPublicAuthRequest(config: InternalAxiosRequestConfig | undefined) {
  const path = normalizePath(config);
  const method = requestMethod(config);

  if (isNewSessionRequest(config)) return true;

  // Interactive login first probes this public endpoint after clearing auth.
  // Health is exempt from teardown, but is NOT a new-session/resume response.
  if (method === 'get' && path === '/health') return true;

  return (
    method === 'post' &&
    (
      path === '/auth/forgot-password' ||
      path === '/auth/reset-password' ||
      path === '/driver/activation/validate'
    )
  );
}

function isTeardownRequest(config: InternalAxiosRequestConfig | undefined) {
  const path = normalizePath(config);
  const method = requestMethod(config);

  return (
    (method === 'post' && path === '/auth/logout') ||
    (method === 'delete' && path.startsWith('/notifications/push-subscriptions/'))
  );
}

function isBoundaryExempt(config: InternalAxiosRequestConfig | undefined) {
  return isPublicAuthRequest(config) || isTeardownRequest(config);
}

function isTransportSuspended() {
  return runtime.__MANECOMB_API_SESSION_BOUNDARY_SUSPENDED__ === true;
}

function configEpoch(config: InternalAxiosRequestConfig | undefined) {
  return (config as BoundaryRequestConfig | undefined)?._manecombSessionEpoch;
}

function responseIsStale(config: InternalAxiosRequestConfig | undefined) {
  const epoch = configEpoch(config);
  return typeof epoch === 'number' && epoch !== getSessionEpoch();
}

function rejectStale(reason?: string): never {
  throw new StaleApiSessionError(reason);
}

/**
 * Invalida transporte y persistencia usando la MISMA sessionEpoch del store.
 * No decide si una cuenta esta autenticada; solo evita que trabajo perteneciente
 * a una identidad anterior pueda completar o iniciar side effects durante el
 * teardown.
 */
function suspendSessionBoundary() {
  runtime.__MANECOMB_API_SESSION_BOUNDARY_SUSPENDED__ = true;
  suspendSessionCredentialWrites();
}

function resumeSessionBoundary() {
  runtime.__MANECOMB_API_SESSION_BOUNDARY_SUSPENDED__ = false;
  resumeSessionCredentialWrites();
}

export function isStaleApiSessionError(error: unknown) {
  return error instanceof StaleApiSessionError ||
    (error instanceof Error && 'code' in error && error.code === 'MANECOMB_STALE_SESSION');
}

/**
 * Instala una sola frontera de sesion para todo el apiClient compartido.
 *
 * - Cada dispatch captura sessionEpoch.
 * - Una respuesta de un epoch anterior nunca llega al store.
 * - Tras beginSessionEpoch no salen requests operativas nuevas.
 * - Logout, DELETE del push y auth publica siguen disponibles para terminar o
 *   establecer una identidad de forma controlada.
 * - Un login/registro confirmado reabre transporte + persistencia antes de que
 *   root-store persista las credenciales nuevas.
 */
export function installApiSessionBoundary() {
  if (runtime.__MANECOMB_API_SESSION_BOUNDARY_INSTALLED__) return;
  runtime.__MANECOMB_API_SESSION_BOUNDARY_INSTALLED__ = true;

  subscribeSessionEpoch(() => {
    suspendSessionBoundary();
  });

  apiClient.interceptors.request.use((config) => {
    const boundaryConfig = config as BoundaryRequestConfig;
    boundaryConfig._manecombSessionEpoch = getSessionEpoch();

    if (isTransportSuspended() && !isBoundaryExempt(config)) {
      rejectStale('La sesion esta terminando; la solicitud fue descartada antes de enviarse.');
    }

    return config;
  });

  apiClient.interceptors.response.use(
    (response: AxiosResponse) => {
      const config = response.config as InternalAxiosRequestConfig;

      if (responseIsStale(config)) {
        rejectStale();
      }

      if (isTransportSuspended() && !isBoundaryExempt(config)) {
        rejectStale();
      }

      if (isNewSessionRequest(config)) {
        resumeSessionBoundary();
      }

      return response;
    },
    (error: unknown) => {
      const config = (
        error &&
        typeof error === 'object' &&
        'config' in error
      ) ? (error as { config?: InternalAxiosRequestConfig }).config : undefined;

      if (responseIsStale(config)) {
        return Promise.reject(new StaleApiSessionError());
      }

      if (isTransportSuspended() && config && !isBoundaryExempt(config)) {
        return Promise.reject(new StaleApiSessionError());
      }

      return Promise.reject(error);
    }
  );
}
