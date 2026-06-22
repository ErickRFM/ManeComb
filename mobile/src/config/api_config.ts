import Config from 'react-native-config';
import { Platform } from 'react-native';

export const apiPath = '/api';

export const productionApiUrl = 'https://manecomb.onrender.com/api';
export const productionSocketUrl = 'https://manecomb.onrender.com';

type RuntimeUrlKind = 'api' | 'socket';
export type RuntimeTarget = 'production' | 'configured';

export function readRuntimeValue(...keys: string[]) {
  for (const key of keys) {
    const envValue = process.env[key]?.trim();
    if (envValue) {
      return envValue;
    }

    const configValue = Config[key]?.trim();
    if (configValue) {
      return configValue;
    }
  }

  return '';
}

function parseUrl(value: string | undefined | null) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isLocalHostname(hostname: string | null | undefined) {
  if (!hostname) {
    return true;
  }

  const normalizedHostname = hostname.toLowerCase();
  if (
    normalizedHostname === 'localhost' ||
    normalizedHostname === '::1' ||
    normalizedHostname === '0.0.0.0' ||
    normalizedHostname === 'tu_ip_local' ||
    normalizedHostname === '192.168.x.x' ||
    normalizedHostname.startsWith('127.') ||
    normalizedHostname.startsWith('10.') ||
    normalizedHostname.startsWith('192.168.')
  ) {
    return true;
  }

  const match = normalizedHostname.match(/^172\.(\d{1,3})\./);

  if (!match) {
    return false;
  }

  const secondOctet = Number(match[1]);
  return secondOctet >= 16 && secondOctet <= 31;
}

function isRenderProductionHost(hostname: string | null | undefined) {
  return Boolean(hostname && hostname.toLowerCase() === 'manecomb.onrender.com');
}

function isRemoteRuntimeUrl(url: URL) {
  return url.protocol === 'https:' && !isLocalHostname(url.hostname);
}

function inferRuntimeTarget(hostname: string): RuntimeTarget {
  if (isRenderProductionHost(hostname)) {
    return 'production';
  }

  return 'configured';
}

export function resolveRuntimeUrl(
  value: string | undefined,
  fallbackValue: string,
  kind: RuntimeUrlKind = 'api'
) {
  const fallbackUrl = parseUrl(fallbackValue);
  const explicitUrl = parseUrl(value);
  const parsedUrl = explicitUrl && isRemoteRuntimeUrl(explicitUrl)
    ? explicitUrl
    : fallbackUrl;

  if (!parsedUrl || !fallbackUrl) {
    return {
      target: 'production' as RuntimeTarget,
      url: fallbackValue,
    };
  }

  const fallbackPath = kind === 'api' ? apiPath : '';
  const pathname = (
    parsedUrl.pathname && parsedUrl.pathname !== '/'
      ? parsedUrl.pathname
      : fallbackPath
  ).replace(/\/$/, '');
  const url = `${parsedUrl.protocol}//${parsedUrl.host}${pathname}`;

  return {
    target: inferRuntimeTarget(parsedUrl.hostname),
    url,
  };
}

const apiFallbackUrl = productionApiUrl;
const socketFallbackUrl = productionSocketUrl;

const resolvedApi = resolveRuntimeUrl(
  readRuntimeValue('MANECOMB_API_URL', 'apiUrl'),
  apiFallbackUrl,
  'api'
);
const resolvedSocket = resolveRuntimeUrl(
  readRuntimeValue('MANECOMB_SOCKET_URL', 'socketUrl'),
  socketFallbackUrl,
  'socket'
);

export const API_URL = resolvedApi.url;
export const SOCKET_URL = resolvedSocket.url;
export const API_ORIGIN = API_URL.replace(/\/api$/, '');
export const API_TIMEOUT_MS = Number(readRuntimeValue('MANECOMB_API_TIMEOUT_MS') || 15000);

export const runtimeNetworkConfig = {
  apiOrigin: API_ORIGIN,
  apiUrl: API_URL,
  environment: 'production',
  platform: Platform.OS,
  socketUrl: SOCKET_URL,
  target: resolvedApi.target,
};

export function isDevRuntime() {
  const runtime = globalThis as typeof globalThis & { __DEV__?: boolean };
  return runtime.__DEV__ ?? process.env.NODE_ENV !== 'production';
}

export function mobileLog(scope: string, message: string, details?: unknown) {
  const ignored = Boolean(scope || message || details);

  if (ignored) {
    return;
  }
}
