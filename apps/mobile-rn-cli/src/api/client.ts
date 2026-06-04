import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { API_BASE_URL, isDevelopmentEnv } from '../config/env';
import type {
  ActivationPayload,
  AuthResponse,
  CommercialPlan,
  DashboardData,
  Incident,
  LocationPoint,
  RegisterPayload,
  User,
  Vehicle,
} from '../types/app';

let accessToken: string | null = null;
let refreshToken: string | null = null;
let refreshInFlight: Promise<string | null> | null = null;

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

export function configureApiTokens(nextAccessToken: string | null, nextRefreshToken?: string | null) {
  accessToken = nextAccessToken;
  if (typeof nextRefreshToken !== 'undefined') {
    refreshToken = nextRefreshToken;
  }
}

apiClient.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as
      | (InternalAxiosRequestConfig & { _retry?: boolean })
      | undefined;

    if (!originalRequest || error.response?.status !== 401 || !refreshToken || originalRequest._retry) {
      throw error;
    }

    originalRequest._retry = true;
    refreshInFlight =
      refreshInFlight ||
      apiClient
        .post<AuthResponse>('/auth/refresh', { refreshToken })
        .then((response) => {
          configureApiTokens(response.data.token, response.data.refreshToken || refreshToken);
          return response.data.token;
        })
        .catch(() => null)
        .finally(() => {
          refreshInFlight = null;
        });

    const nextToken = await refreshInFlight;
    if (!nextToken) {
      throw error;
    }

    originalRequest.headers.set('Authorization', `Bearer ${nextToken}`);

    return apiClient(originalRequest);
  }
);

export function getApiErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    const serverMessage = (error.response?.data as { message?: string } | undefined)?.message;
    if (serverMessage) {
      return serverMessage;
    }

    if (error.code === 'ECONNABORTED') {
      return 'El backend tardó demasiado en responder.';
    }

    if (!error.response) {
      return 'No se pudo conectar con el backend.';
    }
  }

  return fallback;
}

export async function loginRequest(email: string, password: string) {
  const response = await apiClient.post<AuthResponse>('/auth/login', { email, password });
  return response.data;
}

export async function registerRequest(payload: RegisterPayload) {
  const response = await apiClient.post<AuthResponse>('/auth/register', payload);
  return response.data;
}

export async function getSessionRequest() {
  const response = await apiClient.get<{ ok: boolean; user: User; dashboard?: DashboardData }>('/auth/session');
  return response.data;
}

export async function logoutRequest(activeRefreshToken?: string | null) {
  await apiClient.post('/auth/logout', { refreshToken: activeRefreshToken || refreshToken });
}

export async function getCommercialPlansRequest() {
  const response = await apiClient.get<{ ok: boolean; data: CommercialPlan[] }>('/commercial/plans');
  return response.data.data || [];
}

export async function checkoutPlanRequest(input: {
  planId: string;
  user: User;
  requestTrial?: boolean;
}) {
  const profile = input.user.companyProfile || {};
  const response = await apiClient.post('/commercial/checkout', {
    companyName: profile.companyName || input.user.name || 'ManeComb',
    contactName: profile.contactName || input.user.name,
    email: input.user.email,
    phone: profile.phone || '0000000000',
    planId: input.planId,
    paymentMethod: input.requestTrial ? 'trial' : 'bank_transfer',
    requestTrial: Boolean(input.requestTrial),
  });
  return response.data;
}

export async function getDashboardRequest() {
  const response = await apiClient.get<{ ok: boolean; data: DashboardData }>('/dashboard/overview');
  return response.data.data;
}

export async function getVehiclesRequest() {
  const response = await apiClient.get<{ ok: boolean; data: Vehicle[] }>('/vehicles');
  return response.data.data || [];
}

export async function getIncidentsRequest() {
  const response = await apiClient.get<{ ok: boolean; data: Incident[] }>('/incidents');
  return response.data.data || [];
}

export async function createIncidentRequest(input: {
  title: string;
  description: string;
  severity: string;
}) {
  const response = await apiClient.post('/incidents', input);
  return response.data;
}

export async function updateVehicleLocationRequest(point: LocationPoint) {
  const response = await apiClient.post('/locations/update', point);
  return response.data;
}

export async function registerDriverActivationRequest(payload: ActivationPayload) {
  const response = await apiClient.post<AuthResponse>('/driver/activation/register', payload);
  return response.data;
}

export async function listActivationKeysRequest() {
  const response = await apiClient.get('/admin/activation-keys');
  return response.data;
}

export async function generateActivationKeyRequest() {
  const response = await apiClient.post('/admin/activation-keys/generate', {});
  return response.data;
}

export function logApiConfig() {
  if (isDevelopmentEnv) {
    console.log(`[ManeCombRN] API ${API_BASE_URL}`);
  }
}
