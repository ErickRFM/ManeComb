import axios, { AxiosHeaders, isAxiosError, type AxiosError } from 'axios';
import type {
  CheckpointVisit,
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
    return `No se pudo conectar con el backend: ${API_URL}`;
  }

  if ([502, 503, 504].includes(error.response.status)) {
    return 'El servidor esta iniciando o tardo demasiado. Intenta de nuevo en unos segundos.';
  }

  if (error.response.status === 401) {
    return 'Credenciales incorrectas o sesion expirada.';
  }

  if (error.response.status === 403) {
    return 'No tienes permisos para realizar esta accion.';
  }

  if (error.response.status >= 500) {
    return `Error interno del servidor (${error.response.status}).`;
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

export async function refreshSessionRequest(refreshToken: string) {
  return await unwrapData<any>(apiClient.post('/auth/refresh', { refreshToken }));
}

export async function logoutRequest(refreshToken?: string | null) {
  await apiClient.post('/auth/logout', { refreshToken });
}

export async function getCommercialPlansRequest() {
  const plans = await unwrapData<any[]>(apiClient.get('/commercial/plans'));
  return Array.isArray(plans) ? plans : [];
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

export async function createUserRequest(payload: any) {
  return await unwrapData<any>(apiClient.post('/users', payload));
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

export async function createVehicleRequest(payload: any) {
  return await unwrapData<any>(apiClient.post('/vehicles', payload));
}

export async function updateVehicleRequest(vehicleId: string, payload: any) {
  return await unwrapData<any>(apiClient.patch(`/vehicles/${encodeURIComponent(vehicleId)}`, payload));
}

export async function assignRouteRequest(payload: any) {
  return await unwrapData<any>(apiClient.post('/navigation/assign', payload));
}

export async function clearRouteAssignmentRequest(vehicleId: string) {
  return await unwrapData<any>(apiClient.delete(`/navigation/assign/${encodeURIComponent(vehicleId)}`));
}

export async function getRouteSessionHistoryRequest(params?: RouteSessionHistoryFilters) {
  return await unwrapData<RouteSession[]>(apiClient.get('/navigation/sessions/history', { params }));
}

export async function getRouteSessionMetricsRequest(sessionId: string) {
  return await unwrapData<RouteSessionMetrics>(
    apiClient.get(`/navigation/sessions/${encodeURIComponent(sessionId)}/metrics`)
  );
}

export async function recalculateRouteSessionMetricsRequest(sessionId: string) {
  return await unwrapData<RouteSession>(
    apiClient.post(`/navigation/sessions/${encodeURIComponent(sessionId)}/recalculate`)
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

export async function getRouteSessionPositionsRequest(sessionId: string, limit?: number) {
  return await unwrapData<RouteSessionPosition[]>(
    apiClient.get(`/navigation/sessions/${encodeURIComponent(sessionId)}/positions`, { params: { limit } })
  );
}

export async function getPortalOverviewRequest() {
  return await unwrapData<any>(apiClient.get('/portal/overview'));
}

export async function getPortalOnboardingRequest() {
  return await unwrapData<any>(apiClient.get('/portal/onboarding'));
}

export async function getAdminActivationKeysRequest() {
  return await unwrapData<any>(apiClient.get('/admin/activation-keys'));
}

export async function generateAdminActivationKeyRequest() {
  return await unwrapData<any>(apiClient.post('/admin/activation-keys/generate'));
}

export async function revokeAdminActivationKeyRequest(activationKeyId: string) {
  return await unwrapData<any>(
    apiClient.patch(`/admin/activation-keys/${encodeURIComponent(activationKeyId)}/revoke`)
  );
}

export async function getAccountSubscriptionRequest() {
  return await unwrapData<any>(apiClient.get('/account/subscription'));
}

export async function changeAccountPlanRequest(planId: string, selectedAddOns: string[] = []) {
  return await unwrapData<any>(
    apiClient.patch('/account/subscription/plan', {
      planId,
      selectedAddOns,
    })
  );
}

export async function cancelAccountSubscriptionRequest(reason?: string) {
  return await unwrapData<any>(apiClient.post('/account/subscription/cancel', { reason }));
}

export async function getAccountInvoicesRequest() {
  return await unwrapData<any[]>(apiClient.get('/account/invoices'));
}

export async function getAccountPaymentMethodsRequest() {
  return await unwrapData<any[]>(apiClient.get('/account/payment-methods'));
}

export async function createAccountPaymentMethodRequest(payload: any) {
  return await unwrapData<any[]>(apiClient.post('/account/payment-methods', payload));
}

export async function updateAccountPaymentMethodRequest(paymentMethodId: string, payload: any) {
  return await unwrapData<any[]>(
    apiClient.patch(`/account/payment-methods/${encodeURIComponent(paymentMethodId)}`, payload)
  );
}

export async function deleteAccountPaymentMethodRequest(paymentMethodId: string) {
  return await unwrapData<any[]>(
    apiClient.delete(`/account/payment-methods/${encodeURIComponent(paymentMethodId)}`)
  );
}

export async function setDefaultAccountPaymentMethodRequest(paymentMethodId: string) {
  return await unwrapData<any[]>(
    apiClient.post(`/account/payment-methods/${encodeURIComponent(paymentMethodId)}/default`)
  );
}

export async function getAccountSessionsRequest() {
  return await unwrapData<any[]>(apiClient.get('/account/sessions'));
}

export async function revokeAccountSessionRequest(sessionId: string) {
  await apiClient.delete(`/account/sessions/${encodeURIComponent(sessionId)}`);
}
