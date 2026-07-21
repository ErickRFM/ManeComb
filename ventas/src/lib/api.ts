import axios, { AxiosHeaders, isAxiosError, type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type {
  CheckpointVisit,
  DocumentItem,
  Incident,
  PaginatedResult,
  PortalActivationKeysResponse,
  PortalAppInfo,
  PortalAppVersion,
  PortalInvoice,
  PortalOnboarding,
  PortalOverview,
  PortalSession,
  PortalSubscription,
  RouteEvent,
  RouteSession,
  RouteSessionHistoryFilters,
  RouteSessionMetrics,
  RouteSessionPosition,
} from '@/src/types/app';

const DEFAULT_API_URL = 'http://localhost:5000/api';
const REQUEST_TIMEOUT_MS = 20000;

function normalizeUrl(value: string | undefined, fallback: string) {
  const rawValue = String(value || fallback || '').trim();
  const withoutTrailingNoise = rawValue.replace(/\/+$/g, '').replace(/\.+$/g, '').replace(/\/+$/g, '');

  if (!withoutTrailingNoise) {
    return fallback.replace(/\/+$/g, '').replace(/\.+$/g, '').replace(/\/+$/g, '');
  }

  if (withoutTrailingNoise.startsWith('/')) {
    return `/${withoutTrailingNoise
      .replace(/^\/+/, '')
      .replace(/\/{2,}/g, '/')
      .replace(/\/+$/g, '')
      .replace(/\/api\.+$/i, '/api')}`;
  }

  try {
    const url = new URL(withoutTrailingNoise);
    url.pathname = url.pathname
      .replace(/\/{2,}/g, '/')
      .replace(/\/+$/g, '')
      .replace(/\/api\.+$/i, '/api');

    return url.toString().replace(/\/+$/g, '').replace(/\.+$/g, '');
  } catch {
    return withoutTrailingNoise.replace(/\/{2,}/g, '/').replace(/\/+$/g, '').replace(/\.+$/g, '');
  }
}

function getApiOrigin(apiUrl: string) {
  return normalizeUrl(apiUrl, DEFAULT_API_URL).replace(/\/api$/i, '');
}

function getApiErrorPayload(error: AxiosError) {
  return error.response?.data as { message?: unknown; traceId?: unknown } | undefined;
}

const FALLBACK_API_URL = import.meta.env.DEV ? DEFAULT_API_URL : '/api';
if (import.meta.env.PROD && !String(import.meta.env.VITE_API_URL || '').trim()) {
  throw new Error('VITE_API_URL es obligatorio en produccion para conectar ventas con el backend.');
}

export const API_URL = normalizeUrl(import.meta.env.VITE_API_URL, FALLBACK_API_URL);
const FALLBACK_SOCKET_URL = getApiOrigin(API_URL);
export const SOCKET_URL = normalizeUrl(import.meta.env.VITE_SOCKET_URL, FALLBACK_SOCKET_URL);
export const API_ORIGIN = getApiOrigin(API_URL);

export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: REQUEST_TIMEOUT_MS,
});

type AuthSessionPayload = {
  token: string;
  refreshToken?: string | null;
  user?: unknown;
};

type AuthRetryConfig = InternalAxiosRequestConfig & {
  _authRetry?: boolean;
  _skipAuthRefresh?: boolean;
};

type SessionRecoveryConfig = {
  getRefreshToken: () => string | null | Promise<string | null>;
  onTokenRefresh: (session: AuthSessionPayload) => void | Promise<void>;
  onSessionExpired: () => void | Promise<void>;
};

let sessionRecoveryConfig: SessionRecoveryConfig | null = null;
let refreshTokenPromise: Promise<string | null> | null = null;

export function configureApiSessionRecovery(config: SessionRecoveryConfig) {
  sessionRecoveryConfig = config;
}

apiClient.interceptors.request.use((config) => {
  config.headers = AxiosHeaders.from(config.headers);
  config.headers.set('x-client-platform', 'ventas-web');

  if (config.url && !/^[a-z][a-z\d+.-]*:\/\//i.test(config.url)) {
    const [pathPart, ...queryParts] = String(config.url).split('?');
    const normalizedPath = `/${pathPart.replace(/^\/+/, '').replace(/\/{2,}/g, '/')}`;
    config.url = queryParts.length ? `${normalizedPath}?${queryParts.join('?')}` : normalizedPath;
  }

  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!isAxiosError(error) || error.response?.status !== 401 || !error.config) {
      return Promise.reject(error);
    }

    const config = error.config as AuthRetryConfig;
    const url = String(config.url || '');
    const excluded = ['/auth/login', '/auth/register', '/auth/logout', '/auth/refresh', '/auth/forgot-password'];
    if (config._authRetry || config._skipAuthRefresh || excluded.some((path) => url.includes(path))) {
      return Promise.reject(error);
    }

    try {
      if (!refreshTokenPromise) {
        refreshTokenPromise = Promise.resolve(sessionRecoveryConfig?.getRefreshToken() || null)
          .then(async (refreshToken) => {
            if (!refreshToken || !sessionRecoveryConfig) return null;
            const response = await apiClient.post<AuthSessionPayload>(
              '/auth/refresh',
              { refreshToken },
              { _skipAuthRefresh: true } as AuthRetryConfig
            );
            setAuthToken(response.data.token);
            await sessionRecoveryConfig.onTokenRefresh(response.data);
            return response.data.token;
          })
          .finally(() => {
            refreshTokenPromise = null;
          });
      }

      const token = await refreshTokenPromise;
      if (!token) {
        await sessionRecoveryConfig?.onSessionExpired();
        return Promise.reject(error);
      }

      config._authRetry = true;
      config.headers = AxiosHeaders.from(config.headers);
      config.headers.set('Authorization', `Bearer ${token}`);
      return apiClient(config);
    } catch (refreshError) {
      await sessionRecoveryConfig?.onSessionExpired();
      return Promise.reject(refreshError);
    }
  }
);

export function setAuthToken(token: string | null) {
  if (token) {
    apiClient.defaults.headers.common.Authorization = `Bearer ${token}`;
    return;
  }

  delete apiClient.defaults.headers.common.Authorization;
}

export function getApiErrorMessage(error: unknown, fallbackMessage = 'No fue posible completar la solicitud.') {
  if (!isAxiosError(error)) {
    return error instanceof Error ? error.message : fallbackMessage;
  }

  const data = getApiErrorPayload(error);
  const apiMessage = data?.message;

  if (typeof apiMessage === 'string' && apiMessage.trim()) {
    return apiMessage;
  }

  if (!error.response) {
    return 'No pudimos conectar con el servidor. Revisa tu conexion e intenta nuevamente.';
  }

  if ([502, 503, 504].includes(error.response.status)) {
    return 'El servidor esta temporalmente fuera de servicio. Intenta de nuevo en unos segundos.';
  }

  if (error.response.status === 401) {
    return 'Credenciales incorrectas o sesion expirada.';
  }

  if (error.response.status === 403) {
    return 'No tienes permisos para realizar esta accion.';
  }

  if (error.response.status >= 500) {
    return 'Ocurrio un error en el servidor. Intenta de nuevo mas tarde.';
  }

  return fallbackMessage;
}

async function unwrapData<T>(request: Promise<{ data: { data?: T } | T }>) {
  const response = await request;
  const payload = response.data as { data?: T } | T;

  if (typeof payload === 'string') {
    const looksLikeHtml = /<!doctype|<html|<\/html>/i.test(payload);
    throw new Error(
      looksLikeHtml
        ? 'El backend respondio HTML en lugar de JSON. Revisa VITE_API_URL.'
        : 'El backend respondio texto en lugar de JSON.'
    );
  }

  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }

  return payload as T;
}

export async function loginRequest(email: string, password: string) {
  return await unwrapData<any>(apiClient.post('/auth/login', { email, password }));
}

export async function registerRequest(payload: any) {
  return await unwrapData<any>(apiClient.post('/auth/register', payload));
}

export async function getSessionRequest() {
  return await unwrapData<any>(apiClient.get('/auth/session'));
}

export async function logoutRequest(refreshToken?: string | null) {
  await apiClient.post('/auth/logout', { refreshToken });
}

export async function forgotPasswordRequest(email: string) {
  return await unwrapData<{ ok: boolean; message: string }>(
    apiClient.post('/auth/forgot-password', { email })
  );
}

export async function resetPasswordRequest(token: string, password: string) {
  return await unwrapData<{ ok: boolean; message: string }>(
    apiClient.post('/auth/reset-password', { token, password })
  );
}

export async function getCommercialPlansRequest() {
  const plans = await unwrapData<any[]>(apiClient.get('/commercial/plans'));
  if (!Array.isArray(plans)) {
    throw new Error('El backend devolvio un catalogo de planes invalido.');
  }
  return plans;
}

export async function getRuntimeHealthRequest() {
  return await unwrapData<any>(apiClient.get('/health'));
}

export async function createCommercialCheckoutRequest(payload: any) {
  return await unwrapData<any>(apiClient.post('/commercial/checkout', payload));
}

export async function confirmCommercialPaymentRequest(payload: any) {
  return await unwrapData<any>(apiClient.post('/commercial/confirm', payload));
}

export async function getUsersRequest() {
  return await unwrapData<any[]>(apiClient.get('/users'));
}

export async function updateUserRequest(userId: string, payload: any) {
  return await unwrapData<any>(apiClient.patch(`/users/${encodeURIComponent(userId)}`, payload));
}

export async function deleteUserRequest(userId: string) {
  await apiClient.delete(`/users/${encodeURIComponent(userId)}`);
}

export async function updateProfileRequest(payload: any) {
  return await unwrapData<any>(apiClient.patch('/users/me', payload));
}

export async function getVehiclesRequest() {
  return await unwrapData<any[]>(apiClient.get('/vehicles'));
}

export async function getOperationalUnitsRequest() {
  return await unwrapData<any[]>(apiClient.get('/operational-units'));
}

export async function createVehicleRequest(payload: any) {
  return await unwrapData<any>(apiClient.post('/vehicles', payload));
}

export async function updateVehicleRequest(vehicleId: string, payload: any) {
  return await unwrapData<any>(apiClient.patch(`/vehicles/${encodeURIComponent(vehicleId)}`, payload));
}

export async function deleteVehicleRequest(vehicleId: string) {
  return await unwrapData<any>(apiClient.delete(`/vehicles/${encodeURIComponent(vehicleId)}`));
}

export async function assignRouteRequest(payload: any) {
  return await unwrapData<any>(apiClient.post('/navigation/assign', payload));
}

export async function getSavedRoutesRequest() {
  return await unwrapData<any[]>(apiClient.get('/navigation/routes'));
}

export async function createSavedRouteRequest(payload: any) {
  return await unwrapData<any>(apiClient.post('/navigation/routes', payload));
}

export async function updateSavedRouteRequest(routeId: string, payload: any) {
  return await unwrapData<any>(apiClient.patch(`/navigation/routes/${encodeURIComponent(routeId)}`, payload));
}

export async function planSavedRouteRequest(payload: any) {
  return await unwrapData<any>(apiClient.post('/navigation/plan', payload));
}

export async function deleteSavedRouteRequest(routeId: string) {
  return await unwrapData<any>(apiClient.delete(`/navigation/routes/${encodeURIComponent(routeId)}`));
}

export async function clearRouteAssignmentRequest(vehicleId: string) {
  return await unwrapData<any>(apiClient.delete(`/navigation/assign/${encodeURIComponent(vehicleId)}`));
}

export async function getRouteSessionHistoryRequest(params?: RouteSessionHistoryFilters) {
  const data = await unwrapData<RouteSession[] | PaginatedResult<RouteSession>>(apiClient.get('/navigation/sessions/history', { params }));
  return Array.isArray(data)
    ? { items: data, limit: data.length, offset: 0, total: data.length }
    : data;
}

export async function getRouteSessionMetricsRequest(sessionId: string) {
  return await unwrapData<RouteSessionMetrics>(
    apiClient.get(`/navigation/sessions/${encodeURIComponent(sessionId)}/metrics`)
  );
}

export async function getRouteSessionEventsRequest(sessionId: string, params?: { type?: RouteEvent['eventType']; limit?: number }) {
  return await unwrapData<RouteEvent[]>(
    apiClient.get(`/navigation/sessions/${encodeURIComponent(sessionId)}/events`, { params })
  );
}

export async function getRouteSessionCheckpointVisitsRequest(sessionId: string, limit?: number) {
  return await unwrapData<CheckpointVisit[]>(
    apiClient.get(`/navigation/sessions/${encodeURIComponent(sessionId)}/checkpoint-visits`, { params: { limit } })
  );
}

export async function getRouteSessionPositionsRequest(sessionId: string, params?: { limit?: number; offset?: number }) {
  const data = await unwrapData<RouteSessionPosition[] | PaginatedResult<RouteSessionPosition>>(
    apiClient.get(`/navigation/sessions/${encodeURIComponent(sessionId)}/positions`, { params })
  );
  return Array.isArray(data)
    ? { items: data, limit: data.length, offset: 0, total: data.length }
    : data;
}

export async function getPortalOverviewRequest() {
  return await unwrapData<PortalOverview>(apiClient.get('/portal/overview'));
}

export async function getAppInfoRequest() {
  return await unwrapData<PortalAppInfo>(apiClient.get('/app/info'));
}

export async function getPortalOnboardingRequest() {
  return await unwrapData<PortalOnboarding>(apiClient.get('/portal/onboarding'));
}

export async function getAdminActivationKeysRequest() {
  return await unwrapData<PortalActivationKeysResponse>(apiClient.get('/admin/activation-keys'));
}

export async function generateAdminActivationKeyRequest() {
  return await unwrapData<PortalActivationKeysResponse>(apiClient.post('/admin/activation-keys/generate'));
}

export async function revokeAdminActivationKeyRequest(activationKeyId: string) {
  return await unwrapData<PortalActivationKeysResponse>(
    apiClient.patch(`/admin/activation-keys/${encodeURIComponent(activationKeyId)}/revoke`)
  );
}

export async function deleteAdminActivationKeyRequest(activationKeyId: string) {
  return await unwrapData<PortalActivationKeysResponse>(
    apiClient.delete(`/admin/activation-keys/${encodeURIComponent(activationKeyId)}`)
  );
}

export async function shareAdminActivationKeyRequest(activationKeyId: string) {
  return await unwrapData<PortalActivationKeysResponse>(
    apiClient.post(`/admin/activation-keys/${encodeURIComponent(activationKeyId)}/share`)
  );
}

export async function getAccountSubscriptionRequest() {
  return await unwrapData<PortalSubscription>(apiClient.get('/account/subscription'));
}

export async function changeAccountPlanRequest(planId: string, selectedAddOns: string[] = []) {
  return await unwrapData<PortalSubscription>(
    apiClient.patch('/account/subscription/plan', {
      planId,
      selectedAddOns,
    })
  );
}

export async function cancelAccountSubscriptionRequest(reason?: string) {
  return await unwrapData<PortalSubscription>(apiClient.post('/account/subscription/cancel', { reason }));
}

export async function getAccountInvoicesRequest() {
  return await unwrapData<PortalInvoice[]>(apiClient.get('/account/invoices'));
}

export async function getAccountSessionsRequest() {
  return await unwrapData<PortalSession[]>(apiClient.get('/account/sessions'));
}

export async function revokeAccountSessionRequest(sessionId: string) {
  await apiClient.delete(`/account/sessions/${encodeURIComponent(sessionId)}`);
}

export async function getDocumentsRequest() {
  return await unwrapData<DocumentItem[]>(apiClient.get('/documents/admin'));
}

export async function reviewDocumentRequest(documentId: string, payload: { reviewStatus: string; reviewNotes?: string }) {
  return await unwrapData<DocumentItem>(
    apiClient.patch(`/documents/${encodeURIComponent(documentId)}/review`, payload)
  );
}

export function resolveDocumentUrl(storageKey: string) {
  return `${API_URL.replace(/\/api$/i, '')}/api/documents/files/${encodeURIComponent(storageKey)}`;
}

export async function getIncidentsRequest() {
  return await unwrapData<Incident[]>(apiClient.get('/incidents'));
}

export async function updateIncidentStatusRequest(incidentId: string, status: 'open' | 'in_progress' | 'resolved') {
  return await unwrapData<Incident>(
    apiClient.patch(`/incidents/${encodeURIComponent(incidentId)}/status`, { status })
  );
}

export async function updateAppInfoRequest(payload: Partial<PortalAppInfo> & { versionHistory?: PortalAppVersion[] }) {
  return await unwrapData<PortalAppInfo>(apiClient.patch('/app/info', payload));
}
