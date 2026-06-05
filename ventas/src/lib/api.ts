import axios, { isAxiosError, type AxiosError } from 'axios';

const DEFAULT_API_URL = 'http://localhost:5000/api';
const REQUEST_TIMEOUT_MS = 20000;

function normalizeUrl(value: string | undefined, fallback: string) {
  const resolved = (value || fallback).trim();
  return resolved.replace(/\/+$/, '');
}

function getApiOrigin(apiUrl: string) {
  return apiUrl.replace(/\/api\/?$/, '');
}

function getApiErrorPayload(error: AxiosError) {
  return error.response?.data as { message?: unknown; traceId?: unknown } | undefined;
}

const FALLBACK_API_URL = import.meta.env.DEV ? DEFAULT_API_URL : '/api';
export const API_URL = normalizeUrl(import.meta.env.VITE_API_URL, FALLBACK_API_URL);
const FALLBACK_SOCKET_URL =
  import.meta.env.DEV ? getApiOrigin(API_URL) : typeof window === 'undefined' ? '' : window.location.origin;
export const SOCKET_URL = normalizeUrl(import.meta.env.VITE_SOCKET_URL, FALLBACK_SOCKET_URL);
export const API_ORIGIN = getApiOrigin(API_URL);

export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: REQUEST_TIMEOUT_MS,
});

apiClient.interceptors.request.use((config) => {
  config.headers = config.headers || {};
  config.headers['x-client-platform'] = 'ventas-web';
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
    return `No se pudo conectar con el backend en ${API_URL}.`;
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
  return await unwrapData<any[]>(apiClient.get('/commercial/plans'));
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

export async function getPortalOverviewRequest() {
  return await unwrapData<any>(apiClient.get('/portal/overview'));
}

export async function getPortalOnboardingRequest() {
  return await unwrapData<any>(apiClient.get('/portal/onboarding'));
}

export async function updatePortalOnboardingStepRequest(stepId: string, status: string) {
  return await unwrapData<any>(
    apiClient.patch(`/portal/onboarding/${encodeURIComponent(stepId)}`, { status })
  );
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
