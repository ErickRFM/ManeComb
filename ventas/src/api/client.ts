import { isAxiosError } from 'axios';
import {
  apiClient,
  configureApiSessionRecovery as configureBaseApiSessionRecovery,
} from '@/src/lib/api';

export * from '@/src/lib/api';

type PortalAuthSession = {
  token: string;
  refreshToken?: string | null;
  user?: unknown;
};

type PortalSessionRecoveryConfig = {
  getRefreshToken: () => string | null | Promise<string | null>;
  onTokenRefresh: (session: PortalAuthSession) => void | Promise<void>;
  onSessionExpired: () => void | Promise<void>;
};

const AUTH_ERROR_HANDLED = Symbol('manecomb-portal-auth-error-handled');
const NON_SESSION_AUTH_PATHS = [
  '/auth/login',
  '/auth/register',
  '/auth/logout',
  '/auth/forgot-password',
  '/auth/reset-password',
];

let portalSessionRecoveryConfig: PortalSessionRecoveryConfig | null = null;
let authorityInterceptorInstalled = false;

export function isAuthoritativeSessionError(error: unknown) {
  if (!isAxiosError(error)) return false;
  return error.response?.status === 401 || error.response?.status === 403;
}

function shouldExpirePortalSession(error: unknown) {
  if (!isAxiosError(error)) return false;
  const status = error.response?.status;
  const url = String(error.config?.url || '');

  if (NON_SESSION_AUTH_PATHS.some((path) => url.includes(path))) return false;
  if (status === 401) return true;

  // Un 403 de una pantalla normal es autorización, no autenticación. Sólo el
  // rechazo del refresh confirma que la credencial de sesión ya no es válida.
  return status === 403 && url.includes('/auth/refresh');
}

function installPortalAuthorityInterceptor() {
  if (authorityInterceptorInstalled) return;
  authorityInterceptorInstalled = true;

  apiClient.interceptors.response.use(
    (response) => response,
    async (error: unknown) => {
      if (shouldExpirePortalSession(error) && error && typeof error === 'object') {
        const markedError = error as Record<PropertyKey, unknown>;
        if (!markedError[AUTH_ERROR_HANDLED]) {
          markedError[AUTH_ERROR_HANDLED] = true;
          await portalSessionRecoveryConfig?.onSessionExpired();
        }
      }
      return Promise.reject(error);
    }
  );
}

/**
 * La capa base conserva el refresh single-flight. Esta fachada únicamente
 * decide cuándo una falla constituye autoridad suficiente para destruir la
 * sesión; así un timeout/429/5xx del refresh no se convierte en logout.
 */
export function configureApiSessionRecovery(config: PortalSessionRecoveryConfig) {
  portalSessionRecoveryConfig = config;
  installPortalAuthorityInterceptor();

  configureBaseApiSessionRecovery({
    getRefreshToken: config.getRefreshToken,
    onTokenRefresh: config.onTokenRefresh,
    // La capa base no conoce la causa del fallo de refresh. La clasificación se
    // hace en el interceptor de autoridad de esta fachada.
    onSessionExpired: async () => undefined,
  });
}
