import Config from 'react-native-config';
import { Platform } from 'react-native';

const DEFAULT_ANDROID_EMULATOR_API = 'http://10.0.2.2:5000/api';
const DEFAULT_ANDROID_EMULATOR_SOCKET = 'http://10.0.2.2:5000';
const DEFAULT_PHYSICAL_API = 'http://IP_LOCAL_DE_LAPTOP:PUERTO/api';
const DEFAULT_PHYSICAL_SOCKET = 'http://IP_LOCAL_DE_LAPTOP:PUERTO';

function readValue(value: string | undefined, fallback: string) {
  const safeValue = String(value || '').trim();
  return safeValue || fallback;
}

function normalizeApiUrl(value: string) {
  return value.replace(/\/+$/, '');
}

export const APP_ENV = readValue(Config.APP_ENV, __DEV__ ? 'development' : 'production');

export const API_BASE_URL = normalizeApiUrl(
  readValue(
    Config.API_BASE_URL,
    Platform.OS === 'android' ? DEFAULT_ANDROID_EMULATOR_API : DEFAULT_PHYSICAL_API
  )
);

export const SOCKET_URL = readValue(
  Config.SOCKET_URL,
  Platform.OS === 'android' ? DEFAULT_ANDROID_EMULATOR_SOCKET : DEFAULT_PHYSICAL_SOCKET
).replace(/\/+$/, '');

export const isDevelopmentEnv = APP_ENV !== 'production';

export const runtimeConfig = {
  appEnv: APP_ENV,
  apiBaseUrl: API_BASE_URL,
  socketUrl: SOCKET_URL,
};
