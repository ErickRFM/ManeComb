import Config from 'react-native-config';
import { Platform } from 'react-native';
import {
  resolveRuntimeUrl,
  type RuntimeTarget,
} from './runtime-url';

export { apiPath, resolveRuntimeUrl } from './runtime-url';
export type { RuntimeTarget } from './runtime-url';

export const productionApiUrl = 'https://manecomb.onrender.com/api';
export const productionSocketUrl = 'https://manecomb.onrender.com';

export function readRuntimeValue(...keys: string[]) {
  for (const key of keys) {
    const envValue = process.env[key]?.trim();
    if (envValue) return envValue;

    const configValue = Config[key]?.trim();
    if (configValue) return configValue;
  }

  return '';
}

export function isDevRuntime() {
  const runtime = globalThis as typeof globalThis & { __DEV__?: boolean };
  return runtime.__DEV__ ?? process.env.NODE_ENV !== 'production';
}

const allowLocalHttp = isDevRuntime();
const resolvedApi = resolveRuntimeUrl(
  readRuntimeValue('MANECOMB_API_URL', 'apiUrl'),
  productionApiUrl,
  'api',
  { allowLocalHttp }
);
const resolvedSocket = resolveRuntimeUrl(
  readRuntimeValue('MANECOMB_SOCKET_URL', 'socketUrl'),
  productionSocketUrl,
  'socket',
  { allowLocalHttp }
);

export const API_URL = resolvedApi.url;
export const SOCKET_URL = resolvedSocket.url;
export const API_ORIGIN = API_URL.replace(/\/api$/, '');
export const API_TIMEOUT_MS = Number(readRuntimeValue('MANECOMB_API_TIMEOUT_MS') || 15000);

export const runtimeNetworkConfig: {
  apiOrigin: string;
  apiUrl: string;
  environment: string;
  platform: string;
  socketUrl: string;
  target: RuntimeTarget;
} = {
  apiOrigin: API_ORIGIN,
  apiUrl: API_URL,
  environment: readRuntimeValue('MANECOMB_APP_ENV') || resolvedApi.target,
  platform: Platform.OS,
  socketUrl: SOCKET_URL,
  target: resolvedApi.target,
};

export function mobileLog(scope: string, message: string, details?: unknown) {
  if (!isDevRuntime()) return;

  const timestamp = new Date().toISOString();
  const prefix = `[mobile:${scope}] ${timestamp} ${message}`;

  if (typeof details === 'undefined') {
    console.info(prefix);
    return;
  }

  console.info(prefix, details);
}
