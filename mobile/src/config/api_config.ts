import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { NativeModules, Platform } from 'react-native';

// Cambia esta IP cuando la laptop cambie de red Wi-Fi.
// En Windows puedes verla con: ipconfig -> Adaptador Wi-Fi -> Direccion IPv4.
export const localIp = '192.168.21.254';
export const localBackendPort = 5000;
export const apiPath = '/api';

// Cambia estos valores cuando publiques el backend con HTTPS.
export const productionApiUrl = 'https://api.tu-dominio.com/api';
export const productionSocketUrl = 'https://api.tu-dominio.com';

export const androidEmulatorHost = '10.0.2.2';
export const iosSimulatorHost = 'localhost';

const defaultLocalApiUrl = `http://${localIp}:${localBackendPort}${apiPath}`;
const defaultLocalSocketUrl = `http://${localIp}:${localBackendPort}`;
const placeholderHosts = new Set(['localhost', '127.0.0.1', '0.0.0.0', 'tu_ip_local', '192.168.x.x']);

type RuntimeUrlKind = 'api' | 'socket';
export type RuntimeTarget =
  | 'android-emulator'
  | 'ios-simulator'
  | 'physical-device'
  | 'web'
  | 'production'
  | 'configured';

function readExtraValue(key: string) {
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const value = extra?.[key];
  return typeof value === 'string' ? value.trim() : '';
}

function readRuntimeValue(...keys: string[]) {
  for (const key of keys) {
    const envValue = process.env[key]?.trim();
    if (envValue) {
      return envValue;
    }

    const extraValue = readExtraValue(key);
    if (extraValue) {
      return extraValue;
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

function isProductionEnvironment() {
  const value = readRuntimeValue('EXPO_PUBLIC_APP_ENV', 'APP_ENV') || process.env.NODE_ENV || '';
  return value.toLowerCase() === 'production';
}

function shouldReplaceHost(hostname: string | null | undefined) {
  if (!hostname) {
    return true;
  }

  return placeholderHosts.has(hostname.toLowerCase());
}

function isLoopbackHost(hostname: string | null | undefined) {
  if (!hostname) {
    return false;
  }

  const normalizedHostname = hostname.toLowerCase();

  return (
    normalizedHostname === 'localhost' ||
    normalizedHostname === '::1' ||
    normalizedHostname.startsWith('127.')
  );
}

function isPrivateIpv4Host(hostname: string | null | undefined) {
  if (!hostname) {
    return false;
  }

  if (/^10\./.test(hostname) || /^192\.168\./.test(hostname)) {
    return true;
  }

  const match = hostname.match(/^172\.(\d{1,3})\./);

  if (!match) {
    return false;
  }

  const secondOctet = Number(match[1]);
  return secondOctet >= 16 && secondOctet <= 31;
}

function isLocalNetworkHost(hostname: string | null | undefined) {
  return shouldReplaceHost(hostname) || isLoopbackHost(hostname) || isPrivateIpv4Host(hostname);
}

function getWebRuntimeHost() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return null;
  }

  return window.location.hostname || null;
}

function getExpoRuntimeHost() {
  const expoUrl = parseUrl(Linking.createURL('/'));

  if (!expoUrl?.hostname || shouldReplaceHost(expoUrl.hostname)) {
    return null;
  }

  return expoUrl.hostname;
}

function isProbablyAndroidEmulator() {
  if (Platform.OS !== 'android') {
    return false;
  }

  const constants = {
    ...(NativeModules.PlatformConstants || {}),
    ...(Platform.constants || {}),
  } as Record<string, unknown>;
  const fingerprint = [
    constants.Brand,
    constants.Manufacturer,
    constants.Model,
    constants.Fingerprint,
    constants.ServerHost,
  ]
    .filter(Boolean)
    .join(' ');

  return /emulator|sdk_gphone|sdk_phone|generic|genymotion|goldfish|ranchu|vbox/i.test(
    fingerprint
  );
}

function getNativeBundleHost() {
  if (Platform.OS === 'web') {
    return null;
  }

  if (isProbablyAndroidEmulator()) {
    return androidEmulatorHost;
  }

  const scriptUrl = parseUrl(NativeModules.SourceCode?.scriptURL);

  if (!scriptUrl?.hostname) {
    return null;
  }

  const hostname = scriptUrl.hostname.toLowerCase();

  if (Platform.OS === 'android' && isLoopbackHost(hostname)) {
    return androidEmulatorHost;
  }

  if (hostname === '0.0.0.0' || hostname === 'tu_ip_local') {
    return null;
  }

  if (!isLocalNetworkHost(hostname)) {
    return null;
  }

  return scriptUrl.hostname;
}

function getExplicitLanHost() {
  return (
    readRuntimeValue('EXPO_PUBLIC_LAN_HOST', 'EXPO_PUBLIC_DEV_SERVER_HOST', 'MANECOMB_LAN_HOST') ||
    readExtraValue('lanHost') ||
    localIp
  ).trim();
}

function inferDevelopmentHost() {
  const webRuntimeHost = getWebRuntimeHost();

  if (webRuntimeHost) {
    return webRuntimeHost;
  }

  const nativeBundleHost = getNativeBundleHost();

  if (nativeBundleHost) {
    return nativeBundleHost;
  }

  const expoRuntimeHost = getExpoRuntimeHost();

  if (expoRuntimeHost && isLocalNetworkHost(expoRuntimeHost)) {
    return expoRuntimeHost;
  }

  if (Platform.OS === 'android') {
    return androidEmulatorHost;
  }

  if (Platform.OS === 'ios') {
    return iosSimulatorHost;
  }

  return getExplicitLanHost();
}

function inferRuntimeTarget(hostname: string): RuntimeTarget {
  if (isProductionEnvironment() && !isLocalNetworkHost(hostname)) {
    return 'production';
  }

  if (Platform.OS === 'web') {
    return 'web';
  }

  if (Platform.OS === 'android' && hostname === androidEmulatorHost) {
    return 'android-emulator';
  }

  if (Platform.OS === 'ios' && isLoopbackHost(hostname)) {
    return 'ios-simulator';
  }

  if (isPrivateIpv4Host(hostname)) {
    return 'physical-device';
  }

  return 'configured';
}

export function resolveRuntimeUrl(
  value: string | undefined,
  fallbackValue: string,
  kind: RuntimeUrlKind = 'api'
) {
  const fallbackUrl = parseUrl(fallbackValue);
  const parsedUrl = parseUrl(value) ?? fallbackUrl;

  if (!parsedUrl || !fallbackUrl) {
    return {
      target: 'configured' as RuntimeTarget,
      url: fallbackValue,
    };
  }

  const configuredHost = parsedUrl.hostname;
  const runtimeHost = inferDevelopmentHost();
  const shouldUseRuntimeHost = !isProductionEnvironment() && isLocalNetworkHost(configuredHost);
  const hostname =
    shouldUseRuntimeHost && Platform.OS === 'android' && isProbablyAndroidEmulator()
      ? androidEmulatorHost
      : shouldUseRuntimeHost
        ? runtimeHost
        : shouldReplaceHost(configuredHost)
          ? getExplicitLanHost()
          : configuredHost;
  const protocol = parsedUrl.protocol || fallbackUrl.protocol || 'http:';
  const port = parsedUrl.port || fallbackUrl.port || (kind === 'api' ? String(localBackendPort) : '');
  const fallbackPath = kind === 'api' ? apiPath : '';
  const pathname = (parsedUrl.pathname || fallbackUrl.pathname || fallbackPath).replace(/\/$/, '');
  const url = `${protocol}//${hostname}${port ? `:${port}` : ''}${pathname}`;

  return {
    target: inferRuntimeTarget(hostname),
    url,
  };
}

const apiFallbackUrl = isProductionEnvironment() ? productionApiUrl : defaultLocalApiUrl;
const socketFallbackUrl = isProductionEnvironment() ? productionSocketUrl : defaultLocalSocketUrl;

const resolvedApi = resolveRuntimeUrl(
  readRuntimeValue('EXPO_PUBLIC_API_URL', 'apiUrl'),
  apiFallbackUrl,
  'api'
);
const resolvedSocket = resolveRuntimeUrl(
  readRuntimeValue('EXPO_PUBLIC_SOCKET_URL', 'socketUrl'),
  socketFallbackUrl,
  'socket'
);

export const API_URL = resolvedApi.url;
export const SOCKET_URL = resolvedSocket.url;
export const API_ORIGIN = API_URL.replace(/\/api$/, '');

export const runtimeNetworkConfig = {
  apiOrigin: API_ORIGIN,
  apiUrl: API_URL,
  backendPort: localBackendPort,
  configuredLocalIp: localIp,
  environment: isProductionEnvironment() ? 'production' : 'local',
  platform: Platform.OS,
  socketUrl: SOCKET_URL,
  target: resolvedApi.target,
};

export function isDevRuntime() {
  const runtime = globalThis as typeof globalThis & { __DEV__?: boolean };
  return runtime.__DEV__ ?? process.env.NODE_ENV !== 'production';
}

export function mobileLog(scope: string, message: string, details?: unknown) {
  if (!isDevRuntime()) {
    return;
  }

  if (typeof details === 'undefined') {
    console.log(`[mobile:${scope}] ${message}`);
    return;
  }

  console.log(`[mobile:${scope}] ${message}`, details);
}
