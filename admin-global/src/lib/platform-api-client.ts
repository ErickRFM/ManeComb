import axios, { type AxiosError, type AxiosInstance } from 'axios';

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
  });

  instance.interceptors.response.use(
    (response) => response,
    (error: AxiosError<{ ok?: false; message?: string }>) => {
      const message = error.response?.data?.message || error.message || 'Error de conexion';
      return Promise.reject(new Error(message));
    }
  );

  return instance;
}

export function getPlatformTokenHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}
