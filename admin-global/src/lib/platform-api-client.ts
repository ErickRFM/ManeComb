import axios, { type AxiosError, type AxiosInstance } from 'axios';

const TRANSIENT_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

export class PlatformApiError extends Error {
  status: number | null;
  code: string | null;
  retryable: boolean;

  constructor(message: string, options: { status?: number | null; code?: string | null; retryable?: boolean } = {}) {
    super(message);
    this.name = 'PlatformApiError';
    this.status = options.status ?? null;
    this.code = options.code ?? null;
    this.retryable = options.retryable === true;
  }
}

export function isAuthoritativePlatformAuthError(error: unknown) {
  return error instanceof PlatformApiError && (error.status === 401 || error.status === 403);
}

export function isTransientPlatformApiError(error: unknown) {
  return error instanceof PlatformApiError && error.retryable;
}

function normalizeApiOrigin(value: string) {
  const rawValue = value.trim();
  if (!rawValue) return '';

  let parsed: URL;
  try {
    parsed = new URL(rawValue);
  } catch {
    throw new Error('VITE_API_URL debe ser una URL absoluta valida.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('VITE_API_URL solo admite http o https.');
  }

  if (parsed.username || parsed.password) {
    throw new Error('VITE_API_URL no debe incluir credenciales.');
  }

  parsed.search = '';
  parsed.hash = '';
  parsed.pathname = parsed.pathname.replace(/\/api\/?$/i, '').replace(/\/+$/, '');
  return parsed.toString().replace(/\/+$/, '');
}

function resolveApiBase() {
  const configuredOrigin = normalizeApiOrigin(import.meta.env.VITE_API_URL || '');
  if (configuredOrigin) return configuredOrigin;

  if (import.meta.env.DEV) {
    return '';
  }

  throw new Error('VITE_API_URL es obligatorio para construir Admin Global.');
}

const API_BASE = resolveApiBase();

export function createPlatformApiClient(pathname: string): AxiosInstance {
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const instance = axios.create({
    baseURL: `${API_BASE}${normalizedPath}`,
    headers: { 'Content-Type': 'application/json' },
    timeout: 15000,
    withCredentials: true,
  });

  instance.interceptors.response.use(
    (response) => response,
    (error: AxiosError<{ ok?: false; message?: string; code?: string }>) => {
      const status = error.response?.status ?? null;
      const code = String(error.response?.data?.code || error.code || '').trim() || null;
      const message = error.response?.data?.message || error.message || 'Error de conexion';
      const retryable = status === null || TRANSIENT_STATUS_CODES.has(status);
      return Promise.reject(new PlatformApiError(message, { status, code, retryable }));
    }
  );

  return instance;
}

export function getPlatformTokenHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}
