import axios, { isAxiosError, type AxiosError } from 'axios';
import {
  API_ORIGIN as RESOLVED_API_ORIGIN,
  API_TIMEOUT_MS as RESOLVED_API_TIMEOUT_MS,
  API_URL as RESOLVED_API_URL,
  SOCKET_URL as RESOLVED_SOCKET_URL,
  mobileLog,
  runtimeNetworkConfig,
  wait,
} from '@/src/api/mobile-runtime';
import type {
  DriverActivationRegisterPayload,
  DriverActivationValidation,
  GeoPoint,
  ChatDirectoryContact,
  ChatMessage,
  ConversationChannelMode,
  ConversationSummary,
  DocumentItem,
  E2eeBackupRecord,
  Incident,
  IncidentStatus,
  LiveLocationsData,
  LoginResult,
  NavigationPlaceResult,
  NavigationPlan,
  NavigationStop,
  VehicleTripRecord,
  NotificationItem,
  OperationalObservabilitySnapshot,
  ProfileMutationPayload,
  RegisterPayload,
  RouteShape,
  RouteSessionHistoryFilters,
  RouteSession,
  RouteSessionStatus,
  SessionResult,
  User,
  Vehicle,
} from '@/src/types/app';

const REQUEST_TIMEOUT_MS = RESOLVED_API_TIMEOUT_MS;
const MAX_NETWORK_RETRIES = 2;
const IDEMPOTENT_METHODS = new Set(['get', 'head', 'options']);
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
let lastTraceId: string | null = null;
let refreshTokenPromise: Promise<string | null> | null = null;

type SessionRecoveryConfig = {
  getRefreshToken: () => Promise<string | null> | string | null;
  onTokenRefresh: (result: LoginResult) => Promise<void> | void;
  onSessionExpired: () => Promise<void> | void;
  onNetworkSignal?: (signal: 'online' | 'offline' | 'recovering') => void;
};

type RetryableRequestConfig = NonNullable<AxiosError['config']> & {
  _authRetry?: boolean;
  _retryCount?: number;
  _skipAuthRefresh?: boolean;
  _skipNetworkRetry?: boolean;
  _allowRetry?: boolean;
};

type ApiErrorMessageOptions = {
  apiUrl?: string;
  hasInternet?: boolean | null;
};

let sessionRecoveryConfig: SessionRecoveryConfig | null = null;

function generateTraceId() {
  if (typeof globalThis !== 'undefined' && typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return `trace-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function signalNetwork(signal: 'online' | 'offline' | 'recovering') {
  sessionRecoveryConfig?.onNetworkSignal?.(signal);
}

function getRequestMethod(config: RetryableRequestConfig | undefined) {
  return String(config?.method || 'get').toLowerCase();
}

function isNetworkLikeError(error: unknown) {
  if (!isAxiosError(error)) {
    return false;
  }

  return (
    !error.response ||
    error.code === 'ERR_NETWORK' ||
    error.code === 'ECONNABORTED' ||
    error.code === 'ETIMEDOUT' ||
    /network|timeout|aborted/i.test(error.message || '')
  );
}

function isTimeoutError(error: AxiosError) {
  return (
    error.code === 'ECONNABORTED' ||
    error.code === 'ETIMEDOUT' ||
    /timeout|timed out|aborted/i.test(error.message || '')
  );
}

function parseApiUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isLocalBackendUrl(value: string) {
  const url = parseApiUrl(value);
  const hostname = url?.hostname?.toLowerCase() || '';

  return (
    !url ||
    url.protocol === 'http:' ||
    hostname === 'localhost' ||
    hostname === '::1' ||
    hostname.startsWith('127.') ||
    hostname.startsWith('10.') ||
    hostname.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  );
}

function isProductionBackendUrl(value: string) {
  const url = parseApiUrl(value);
  const hostname = url?.hostname?.toLowerCase() || '';

  return Boolean(url && !isLocalBackendUrl(value) && (url.protocol === 'https:' || hostname.includes('onrender.com')));
}

export function getBackendLabel(apiUrl = RESOLVED_API_URL) {
  return isProductionBackendUrl(apiUrl) ? 'backend de produccion' : 'backend configurado';
}

function getRequestUrl(config: AxiosError['config'] | undefined) {
  const baseURL = config?.baseURL || RESOLVED_API_URL;
  const url = config?.url || '';

  try {
    return new URL(url, baseURL.endsWith('/') ? baseURL : `${baseURL}/`).toString();
  } catch {
    return `${baseURL}${url}`;
  }
}

const SENSITIVE_LOG_KEYS = new Set([
  'authorization',
  'password',
  'token',
  'refreshToken',
  'refresh_token',
  'backupCipher',
]);

function sanitizeForLog(value: unknown, depth = 0): unknown {
  if (value === null || typeof value === 'undefined') {
    return value;
  }

  if (typeof value === 'string') {
    return value.length > 600 ? `${value.slice(0, 600)}...` : value;
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (depth > 2) {
    return '[Object]';
  }

  const constructorName = (value as { constructor?: { name?: string } }).constructor?.name;

  if (constructorName === 'FormData') {
    return '[FormData]';
  }

  if (Array.isArray(value)) {
    return value.slice(0, 8).map((entry) => sanitizeForLog(entry, depth + 1));
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => [
      key,
      SENSITIVE_LOG_KEYS.has(key) ? '[redacted]' : sanitizeForLog(entryValue, depth + 1),
    ])
  );
}

function logHttpError(error: AxiosError) {
  mobileLog('http', 'request failed', {
    body: sanitizeForLog(error.response?.data),
    code: error.code,
    message: error.message,
    method: String(error.config?.method || 'GET').toUpperCase(),
    status: error.response?.status || null,
    timeout: error.config?.timeout,
    url: getRequestUrl(error.config),
  });
}

export function getApiErrorMessage(
  error: unknown,
  fallbackMessage = 'No fue posible completar la solicitud.',
  options: ApiErrorMessageOptions = {}
) {
  if (!isAxiosError(error)) {
    return error instanceof Error ? error.message : fallbackMessage;
  }

  const status = error.response?.status;
  const responseData = error.response?.data as { message?: unknown } | undefined;
  const apiMessage = responseData?.message;

  if (options.hasInternet === false && !error.response) {
    return 'Revisa tu conexion e intenta nuevamente.';
  }

  if (isTimeoutError(error)) {
    return 'El servidor no respondio a tiempo. Revisa tu conexion e intenta nuevamente.';
  }

  if (!error.response) {
    return 'No pudimos conectar con el servidor. Revisa tu conexion e intenta nuevamente.';
  }

  if (status === 400 && typeof apiMessage === 'string' && apiMessage.trim()) {
    return apiMessage;
  }

  if (status === 401) {
    return typeof apiMessage === 'string' && apiMessage.trim()
      ? apiMessage
      : 'Credenciales incorrectas o sesion expirada.';
  }

  if (status === 403) {
    return typeof apiMessage === 'string' && apiMessage.trim()
      ? apiMessage
      : 'No tienes permisos para realizar esta accion.';
  }

  if (status === 404) {
    if (typeof apiMessage === 'string' && apiMessage.trim()) {
      return apiMessage;
    }

    return 'No encontramos lo que buscas. Intenta de nuevo mas tarde.';
  }

  if (status === 409 && typeof apiMessage === 'string' && apiMessage.trim()) {
    return apiMessage;
  }

  if (status === 429) {
    return 'Demasiados intentos. Espera un momento e intenta de nuevo.';
  }

  if (status === 502 || status === 503 || status === 504) {
    return 'El servidor esta temporalmente fuera de servicio. Intenta de nuevo en unos segundos.';
  }

  if (status && status >= 500) {
    return 'Ocurrio un error en el servidor. Intenta de nuevo mas tarde.';
  }

  if (typeof apiMessage === 'string' && apiMessage.trim()) {
    return apiMessage;
  }

  return fallbackMessage;
}

function shouldRetryRequest(error: AxiosError) {
  const config = error.config as RetryableRequestConfig | undefined;

  if (!config || config._skipNetworkRetry) {
    return false;
  }

  const retryCount = config._retryCount || 0;

  if (retryCount >= MAX_NETWORK_RETRIES) {
    return false;
  }

  const method = getRequestMethod(config);
  const methodAllowsRetry = IDEMPOTENT_METHODS.has(method) || config._allowRetry === true;
  const retryableStatus = error.response?.status
    ? RETRYABLE_STATUS_CODES.has(error.response.status)
    : false;

  return methodAllowsRetry && (retryableStatus || isNetworkLikeError(error));
}

function isAuthRefreshCandidate(error: AxiosError) {
  const config = error.config as RetryableRequestConfig | undefined;
  const url = String(config?.url || '');

  return (
    error.response?.status === 401 &&
    Boolean(config) &&
    !config?._authRetry &&
    !config?._skipAuthRefresh &&
    !url.includes('/auth/login') &&
    !url.includes('/auth/register') &&
    !url.includes('/auth/logout') &&
    !url.includes('/auth/refresh')
  );
}

async function refreshAccessToken() {
  if (!sessionRecoveryConfig) {
    return null;
  }

  if (!refreshTokenPromise) {
    refreshTokenPromise = Promise.resolve(sessionRecoveryConfig.getRefreshToken())
      .then(async (refreshToken) => {
        if (!refreshToken) {
          return null;
        }

        const response = await apiClient.post<LoginResult>(
          '/auth/refresh',
          { refreshToken },
          {
            _allowRetry: true,
            _skipAuthRefresh: true,
          } as RetryableRequestConfig
        );

        await sessionRecoveryConfig?.onTokenRefresh(response.data);
        setAuthToken(response.data.token);
        return response.data.token;
      })
      .finally(() => {
        refreshTokenPromise = null;
      });
  }

  return refreshTokenPromise;
}

export const API_URL = RESOLVED_API_URL;
export const SOCKET_URL = RESOLVED_SOCKET_URL;
export const API_ORIGIN = RESOLVED_API_ORIGIN;

export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: REQUEST_TIMEOUT_MS,
});

mobileLog('network', 'runtime URLs resolved', runtimeNetworkConfig);

apiClient.interceptors.request.use((config) => {
  const traceId = generateTraceId();
  lastTraceId = traceId;
  config.headers = config.headers || {};
  config.headers['x-trace-id'] = traceId;
  config.headers['x-client-platform'] = runtimeNetworkConfig.platform;
  mobileLog('http', `${String(config.method || 'GET').toUpperCase()} ${getRequestUrl(config)}`, {
    data: sanitizeForLog(config.data),
    params: sanitizeForLog(config.params),
    timeout: config.timeout || REQUEST_TIMEOUT_MS,
    traceId,
  });
  return config;
});

apiClient.interceptors.response.use(
  (response) => {
    const traceId = String(response.headers['x-trace-id'] || '').trim();
    if (traceId) {
      lastTraceId = traceId;
    }
    mobileLog('http', `${response.status} ${String(response.config.method || 'GET').toUpperCase()} ${getRequestUrl(response.config)}`, {
      body: sanitizeForLog(response.data),
      traceId: traceId || lastTraceId,
    });
    signalNetwork('online');
    return response;
  },
  async (error) => {
    const traceId = String(error?.response?.headers?.['x-trace-id'] || '').trim();
    if (traceId) {
      lastTraceId = traceId;
    }

    if (!isAxiosError(error)) {
      return Promise.reject(error);
    }

    const config = error.config as RetryableRequestConfig | undefined;
    logHttpError(error);

    if (isAuthRefreshCandidate(error)) {
      try {
        const nextToken = await refreshAccessToken();

        if (nextToken && config) {
          config._authRetry = true;
          config.headers = config.headers || {};
          config.headers.Authorization = `Bearer ${nextToken}`;
          mobileLog('auth', 'access token refreshed after 401');
          return apiClient(config);
        }
      } catch (refreshError) {
        if (isAxiosError(refreshError) && refreshError.response?.status === 401) {
          await sessionRecoveryConfig?.onSessionExpired();
        }

        return Promise.reject(refreshError);
      }
    }

    if (shouldRetryRequest(error)) {
      const retryConfig = config as RetryableRequestConfig;
      retryConfig._retryCount = (retryConfig._retryCount || 0) + 1;
      signalNetwork('recovering');
      const delayMs = 650 * 2 ** (retryConfig._retryCount - 1);
      mobileLog('network', `retrying request ${retryConfig.method || 'GET'} ${retryConfig.url}`, {
        attempt: retryConfig._retryCount,
        delayMs,
      });
      await wait(delayMs);
      return apiClient(retryConfig);
    }

    if (isNetworkLikeError(error)) {
      signalNetwork('offline');
    }

    return Promise.reject(error);
  }
);

export function configureApiSessionRecovery(config: SessionRecoveryConfig | null) {
  sessionRecoveryConfig = config;
}

export function getLastApiTraceId() {
  return lastTraceId;
}

export function setAuthToken(token: string | null) {
  if (token) {
    apiClient.defaults.headers.common.Authorization = `Bearer ${token}`;
    return;
  }

  delete apiClient.defaults.headers.common.Authorization;
}

export function getAuthHeaderSnapshot(fallbackToken?: string | null) {
  const authorization = apiClient.defaults.headers.common.Authorization;
  const value =
    typeof authorization === 'string'
      ? authorization
      : fallbackToken
        ? `Bearer ${fallbackToken}`
        : '';

  return value ? { Authorization: value } : undefined;
}

export async function loginRequest(email: string, password: string) {
  const response = await apiClient.post<LoginResult>('/auth/login', {
    email,
    password,
  }, {
    _allowRetry: true,
    _skipAuthRefresh: true,
  } as RetryableRequestConfig);

  return response.data;
}

export async function registerRequest(payload: RegisterPayload) {
  const response = await apiClient.post<LoginResult>('/auth/register', payload, {
    _allowRetry: true,
    _skipAuthRefresh: true,
  } as RetryableRequestConfig);
  return response.data;
}

export async function getSessionRequest() {
  const response = await apiClient.get<SessionResult>('/auth/me');
  return response.data;
}

export async function refreshSessionRequest(refreshToken: string) {
  const response = await apiClient.post<LoginResult>('/auth/refresh', {
    refreshToken,
  }, {
    _allowRetry: true,
    _skipAuthRefresh: true,
  } as RetryableRequestConfig);

  return response.data;
}

export async function forgotPasswordRequest(email: string) {
  const response = await apiClient.post<{ ok: boolean; message: string }>('/auth/forgot-password', { email }, {
    _skipAuthRefresh: true,
  } as RetryableRequestConfig);
  return response.data;
}

export async function resetPasswordRequest(token: string, password: string) {
  const response = await apiClient.post<{ ok: boolean; message: string }>('/auth/reset-password', { token, password }, {
    _skipAuthRefresh: true,
  } as RetryableRequestConfig);
  return response.data;
}

export async function healthRequest() {
  const response = await apiClient.get('/health', {
    _allowRetry: true,
    _skipAuthRefresh: true,
  } as RetryableRequestConfig);

  return response.data;
}

export async function logoutRequest(refreshToken?: string | null) {
  await apiClient.post('/auth/logout', {
    refreshToken,
  });
}

export async function getLocationsRequest() {
  const response = await apiClient.get<{ ok: boolean; data: LiveLocationsData }>('/locations/live');
  return response.data.data;
}

export async function getIncidentsRequest() {
  const response = await apiClient.get<{ ok: boolean; data: Incident[] }>('/incidents');
  return response.data.data;
}

export async function createIncidentRequest(payload: {
  title: string;
  type: string;
  description: string;
  severity: string;
  routeId?: string | null;
  vehicleId?: string | null;
  location?: Incident['location'];
}) {
  const response = await apiClient.post<{ ok: boolean; data: Incident }>('/incidents', payload);
  return response.data.data;
}

export async function updateIncidentStatusRequest(incidentId: string, status: IncidentStatus) {
  const response = await apiClient.patch<{ ok: boolean; data: Incident }>(
    `/incidents/${incidentId}/status`,
    { status }
  );
  return response.data.data;
}

export async function getConversationsRequest() {
  const response = await apiClient.get<{ ok: boolean; data: ConversationSummary[] }>(
    '/chat/conversations'
  );
  return response.data.data;
}

export async function getChatContactsRequest() {
  const response = await apiClient.get<{ ok: boolean; data: ChatDirectoryContact[] }>(
    '/chat/contacts'
  );
  return response.data.data;
}

export async function openGeneralConversationRequest(channelMode: ConversationChannelMode = 'chat') {
  const response = await apiClient.post<{ ok: boolean; data: ConversationSummary }>(
    '/chat/conversations/general',
    {
      channelMode,
    }
  );

  return response.data.data;
}

export async function openDirectConversationRequest(
  targetUserId: string,
  channelMode: ConversationChannelMode = 'chat'
) {
  const response = await apiClient.post<{ ok: boolean; data: ConversationSummary }>(
    '/chat/conversations/direct',
    {
      targetUserId,
      channelMode,
    }
  );

  return response.data.data;
}

export async function getMessagesRequest(conversationId: string) {
  const response = await apiClient.get<{ ok: boolean; data: ChatMessage[] }>(
    `/chat/conversations/${conversationId}/messages`
  );
  return response.data.data;
}

export async function sendMessageRequest(
  conversationId: string,
  payload: {
    text?: string;
    textPreview?: string;
    e2eeEnvelope?: {
      version: string;
      nonce: string;
      ciphertext: string;
      recipientId: string;
      senderPublicKey?: string;
    } | null;
  }
) {
  const response = await apiClient.post<{ ok: boolean; data: ChatMessage }>(
    `/chat/conversations/${conversationId}/messages`,
    payload
  );
  return response.data.data;
}

export async function sendVoiceMessageRequest(conversationId: string, formData: FormData) {
  const response = await apiClient.post<{ ok: boolean; data: ChatMessage }>(
    `/chat/conversations/${conversationId}/audio`,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 45000,
      _allowRetry: true,
    } as RetryableRequestConfig
  );

  return response.data.data;
}

export async function sendMediaMessageRequest(conversationId: string, formData: FormData) {
  const response = await apiClient.post<{ ok: boolean; data: ChatMessage }>(
    `/chat/conversations/${conversationId}/media`,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 45000,
      _allowRetry: true,
    } as RetryableRequestConfig
  );

  return response.data.data;
}

export async function getDocumentsRequest() {
  const response = await apiClient.get<{ ok: boolean; data: DocumentItem[] }>('/documents');
  return response.data.data;
}

export async function uploadDocumentRequest(formData: FormData) {
  const response = await apiClient.post<{ ok: boolean; data: DocumentItem }>(
    '/documents',
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 60000,
      _allowRetry: true,
    } as RetryableRequestConfig
  );

  return response.data.data;
}

export function resolveAssetUrl(fileUrl: string | null | undefined) {
  if (!fileUrl) {
    return null;
  }

  if (/^https?:\/\//i.test(fileUrl)) {
    return fileUrl;
  }

  return `${API_ORIGIN}${fileUrl.startsWith('/') ? fileUrl : `/${fileUrl}`}`;
}

export async function getNotificationsRequest() {
  const response = await apiClient.get<{ ok: boolean; data: NotificationItem[] }>('/notifications');
  return response.data.data;
}

export async function markNotificationReadRequest(notificationId: string) {
  const response = await apiClient.post<{ ok: boolean; data: NotificationItem }>(
    `/notifications/${notificationId}/read`
  );
  return response.data.data;
}

export async function registerPushSubscriptionRequest(payload: {
  token: string;
  platform: string;
  deviceName?: string;
}) {
  await apiClient.post('/notifications/push-subscriptions', payload);
}

export async function unregisterPushSubscriptionRequest(token: string) {
  await apiClient.delete(`/notifications/push-subscriptions/${encodeURIComponent(token)}`);
}

export async function getVehiclesRequest() {
  const response = await apiClient.get<{ ok: boolean; data: Vehicle[] }>('/vehicles');
  return response.data.data;
}

export async function getE2eeBackupRequest(deviceId?: string) {
  const response = await apiClient.get<{ ok: boolean; data: E2eeBackupRecord | null }>(
    '/auth/e2ee-backup',
    { params: deviceId ? { deviceId } : undefined }
  );
  return response.data.data;
}

export async function putE2eeBackupRequest(payload: {
  deviceId: string;
  publicKey: string;
  backupCipher: string;
  backupVersion: string;
  platform: string;
  label?: string;
  restoredAt?: string;
}) {
  const response = await apiClient.put<{ ok: boolean; data: E2eeBackupRecord }>(
    '/auth/e2ee-backup',
    payload
  );
  return response.data.data;
}

export async function updateVehicleLocationRequest(payload: {
  vehicleId: string;
  coordinates: GeoPoint;
  heading?: number | null;
  speed?: number | null;
  accuracy?: number | null;
  timestamp?: string | null;
  packetId?: string | null;
  sessionId?: string | null;
}) {
  const response = await apiClient.post<{ ok: boolean; data: Vehicle }>('/locations/update', payload);
  return response.data.data;
}

export async function searchNavigationPlacesRequest(query: string, origin: GeoPoint) {
  const response = await apiClient.get<{ ok: boolean; data: { provider: string; results: NavigationPlaceResult[] } }>(
    '/navigation/search',
    {
      params: {
        q: query,
        latitude: origin.latitude,
        longitude: origin.longitude,
      },
    }
  );

  return response.data.data;
}

export async function reverseNavigationPlaceRequest(point: GeoPoint, options?: { signal?: AbortSignal }) {
  const response = await apiClient.get<{ ok: boolean; data: { provider: string; result: NavigationPlaceResult } }>(
    '/navigation/reverse',
    {
      params: {
        latitude: point.latitude,
        longitude: point.longitude,
      },
      signal: options?.signal,
    }
  );

  return response.data.data;
}

export async function planNavigationRouteRequest(payload: {
  origin: GeoPoint;
  destination: GeoPoint;
  stops?: NavigationStop[];
}, options?: { signal?: AbortSignal }) {
  const response = await apiClient.post<{ ok: boolean; data: NavigationPlan }>('/navigation/plan', payload, {
    signal: options?.signal,
  });
  return response.data.data;
}

export async function createNavigationRouteRequest(payload: {
  name: string;
  origin: GeoPoint;
  destination: GeoPoint;
  route: NavigationPlan['routes'][number];
  stops?: NavigationStop[];
}) {
  const response = await apiClient.post<{ ok: boolean; data: RouteShape }>('/navigation/routes', payload);
  return response.data.data;
}

export async function updateNavigationRouteRequest(routeId: string, payload: {
  name: string;
  origin: GeoPoint;
  destination: GeoPoint;
  route: NavigationPlan['routes'][number];
  stops?: NavigationStop[];
}) {
  const response = await apiClient.patch<{ ok: boolean; data: RouteShape }>(
    `/navigation/routes/${encodeURIComponent(routeId)}`,
    payload
  );
  return response.data.data;
}

export async function deleteNavigationRouteRequest(routeId: string) {
  const response = await apiClient.delete<{ ok: boolean; data: RouteShape }>(
    `/navigation/routes/${encodeURIComponent(routeId)}`
  );
  return response.data.data;
}

export async function assignVehicleRouteRequest(payload: {
  vehicleId: string;
  routeId: string;
}) {
  const response = await apiClient.post<{ ok: boolean; data: Vehicle }>('/navigation/assign', payload);
  return response.data.data;
}

export async function getActiveRouteSessionRequest(vehicleId: string) {
  const response = await apiClient.get<{ ok: boolean; data: RouteSession | null }>('/navigation/sessions/active', {
    params: { vehicleId },
  });
  return response.data.data;
}

export async function startRouteSessionRequest(vehicleId: string) {
  const response = await apiClient.post<{ ok: boolean; data: RouteSession }>('/navigation/sessions/start', { vehicleId });
  return response.data.data;
}

export async function updateRouteSessionStatusRequest(
  sessionId: string,
  vehicleId: string,
  status: Extract<RouteSessionStatus, 'RUNNING' | 'PAUSED' | 'FINISHED' | 'CANCELLED'>,
) {
  const response = await apiClient.patch<{ ok: boolean; data: RouteSession }>(
    `/navigation/sessions/${encodeURIComponent(sessionId)}/status`,
    { vehicleId, status },
  );
  return response.data.data;
}

export async function getRouteSessionHistoryRequest(params?: RouteSessionHistoryFilters) {
  const response = await apiClient.get<{ ok: boolean; data: RouteSession[] }>('/navigation/sessions/history', {
    params,
  });
  return response.data.data;
}

export async function getNavigationTripLogsRequest(params: {
  vehicleId: string;
  date?: string;
  limit?: number;
}) {
  const response = await apiClient.get<{
    ok: boolean;
    data: {
      vehicleId: string;
      serviceDate: string;
      logs: VehicleTripRecord[];
    };
  }>('/navigation/trips', {
    params: {
      vehicleId: params.vehicleId,
      date: params.date,
      limit: params.limit,
    },
  });

  return response.data.data;
}

export async function createNavigationTripLogRequest(payload: {
  vehicleId: string;
  vehicleCode?: string;
  serviceDate?: string;
  originLabel: string;
  destinationLabel: string;
  origin: GeoPoint;
  destination: GeoPoint;
  startedAt: string;
  finishedAt: string;
  durationSeconds: number;
  distanceMeters: number;
  plannedDurationSeconds: number;
  provider?: string;
}) {
  const response = await apiClient.post<{ ok: boolean; data: VehicleTripRecord }>(
    '/navigation/trips',
    payload
  );

  return response.data.data;
}

export async function getUsersRequest() {
  const response = await apiClient.get<{ ok: boolean; data: User[] }>('/users');
  return response.data.data;
}

export async function validateDriverActivationKeyRequest(key: string) {
  const response = await apiClient.post<{ ok: boolean; data: DriverActivationValidation }>(
    '/driver/activation/validate',
    { key },
    {
      _allowRetry: true,
      _skipAuthRefresh: true,
    } as RetryableRequestConfig
  );
  return response.data.data;
}

export async function registerDriverActivationRequest(payload: DriverActivationRegisterPayload) {
  const response = await apiClient.post<LoginResult & { activation?: unknown }>(
    '/driver/activation/register',
    payload,
    {
      _allowRetry: true,
      _skipAuthRefresh: true,
    } as RetryableRequestConfig
  );
  return response.data;
}

export async function updateProfileRequest(payload: ProfileMutationPayload) {
  const response = await apiClient.patch<{ ok: boolean; data: User }>('/users/me', payload);
  return response.data.data;
}

export async function getOperationalObservabilityRequest(params?: {
  hours?: number;
  limit?: number;
}) {
  const response = await apiClient.get<{ ok: boolean; data: OperationalObservabilitySnapshot }>(
    '/ops/observability',
    {
      params,
    }
  );

  return response.data.data;
}
