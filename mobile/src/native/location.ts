import Geolocation, {
  type GeoCoordinates,
  type GeoPosition,
  type GeoWatchOptions,
} from 'react-native-geolocation-service';
import { PermissionsAndroid, Platform } from 'react-native';
import type { Permission } from 'react-native';

export const PermissionStatus = {
  GRANTED: 'granted',
  DENIED: 'denied',
  UNDETERMINED: 'undetermined',
} as const;

export const Accuracy = {
  BestForNavigation: 6,
  High: 5,
} as const;

export type PermissionStatus = (typeof PermissionStatus)[keyof typeof PermissionStatus];

export type LocationObjectCoords = GeoCoordinates;

export type LocationSubscription = {
  remove: () => void;
};

type LocationOptions = {
  accuracy?: number;
  distanceInterval?: number;
  timeInterval?: number;
  mayShowUserSettingsDialog?: boolean;
};

export type LocationErrorCode =
  | 'permission_denied'
  | 'services_disabled'
  | 'timeout'
  | 'unavailable'
  | 'unknown';

const ANDROID_PERMISSION_SETTLE_MS = 450;

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function readErrorCode(error: unknown) {
  const rawCode = (error as { code?: unknown } | null)?.code;
  const numericCode = typeof rawCode === 'number' ? rawCode : Number(rawCode);
  return Number.isFinite(numericCode) ? numericCode : null;
}

export function getLocationErrorCode(error: unknown): LocationErrorCode {
  const explicitCode = (error as { locationCode?: LocationErrorCode } | null)?.locationCode;

  if (explicitCode) {
    return explicitCode;
  }

  const message = String((error as { message?: unknown } | null)?.message || '').toLowerCase();

  if (message.includes('permission')) {
    return 'permission_denied';
  }

  if (
    message.includes('disabled') ||
    message.includes('settings') ||
    message.includes('provider') ||
    message.includes('gps')
  ) {
    return 'services_disabled';
  }

  if (message.includes('timeout') || message.includes('timed out')) {
    return 'timeout';
  }

  const code = readErrorCode(error);

  if (code === 1) {
    return 'permission_denied';
  }

  if (code === 3) {
    return 'timeout';
  }

  if (code === 5) {
    return 'services_disabled';
  }

  if (code === 2 || code === 4) {
    return 'unavailable';
  }

  return 'unknown';
}

function createLocationError(code: LocationErrorCode, message: string, cause?: unknown) {
  const error = new Error(message) as Error & {
    cause?: unknown;
    locationCode?: LocationErrorCode;
  };

  error.locationCode = code;

  if (cause) {
    error.cause = cause;
  }

  return error;
}

function normalizeLocationError(error: unknown) {
  const code = getLocationErrorCode(error);
  const message =
    String((error as { message?: unknown } | null)?.message || '').trim() ||
    'Location request failed.';

  return createLocationError(code, message, error);
}

async function getAndroidPermissionStatus(permission: Permission) {
  if (Platform.OS !== 'android') {
    return PermissionStatus.GRANTED;
  }

  try {
    return (await PermissionsAndroid.check(permission))
      ? PermissionStatus.GRANTED
      : PermissionStatus.UNDETERMINED;
  } catch {
    return PermissionStatus.UNDETERMINED;
  }
}

async function getAndroidForegroundPermissionStatus() {
  const [fine, coarse] = await Promise.all([
    getAndroidPermissionStatus(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION),
    getAndroidPermissionStatus(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION),
  ]);

  return fine === PermissionStatus.GRANTED || coarse === PermissionStatus.GRANTED
    ? PermissionStatus.GRANTED
    : PermissionStatus.UNDETERMINED;
}

async function requestAndroidForegroundPermission() {
  const current = await getAndroidForegroundPermissionStatus();

  if (current === PermissionStatus.GRANTED) {
    return current;
  }

  const result = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
  ]);

  if (
    result[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED ||
    result[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED
  ) {
    return PermissionStatus.GRANTED;
  }

  await wait(ANDROID_PERMISSION_SETTLE_MS);
  const retry = await getAndroidForegroundPermissionStatus();
  return retry === PermissionStatus.GRANTED ? retry : PermissionStatus.DENIED;
}

export async function hasServicesEnabledAsync() {
  return true;
}

export async function getForegroundPermissionsAsync() {
  if (Platform.OS !== 'android') {
    return { status: PermissionStatus.GRANTED };
  }

  return {
    status: await getAndroidForegroundPermissionStatus(),
  };
}

export async function requestForegroundPermissionsAsync() {
  return {
    status: Platform.OS === 'android'
      ? await requestAndroidForegroundPermission()
      : PermissionStatus.GRANTED,
  };
}

export async function requestBackgroundPermissionsAsync() {
  if (Platform.OS !== 'android') {
    return { status: PermissionStatus.GRANTED };
  }

  const isGranted = await PermissionsAndroid.check(
    PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION
  );

  if (isGranted) {
    return { status: PermissionStatus.GRANTED };
  }

  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION
  );

  return {
    status: result === PermissionsAndroid.RESULTS.GRANTED
      ? PermissionStatus.GRANTED
      : PermissionStatus.DENIED,
  };
}

export async function enableNetworkProviderAsync() {
  return undefined;
}

export async function getCurrentPositionAsync(_options?: LocationOptions) {
  if (Platform.OS === 'android') {
    let permission = await getAndroidForegroundPermissionStatus();

    if (permission !== PermissionStatus.GRANTED) {
      await wait(ANDROID_PERMISSION_SETTLE_MS);
      permission = await getAndroidForegroundPermissionStatus();
    }

    if (permission !== PermissionStatus.GRANTED) {
      throw createLocationError('permission_denied', 'Location foreground permission is not granted.');
    }
  }

  return new Promise<GeoPosition>((resolve, reject) => {
    Geolocation.getCurrentPosition(
      resolve,
      (error) => reject(normalizeLocationError(error)),
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 5000,
        forceRequestLocation: true,
        showLocationDialog: true,
      }
    );
  });
}

export async function watchPositionAsync(
  options: LocationOptions,
  callback: (position: GeoPosition) => void,
  onError?: (error: Error & { locationCode?: LocationErrorCode }) => void
): Promise<LocationSubscription> {
  if (
    Platform.OS === 'android' &&
    (await getAndroidForegroundPermissionStatus()) !== PermissionStatus.GRANTED
  ) {
    return {
      remove: () => undefined,
    };
  }

  const watchOptions: GeoWatchOptions = {
    enableHighAccuracy: true,
    distanceFilter: options.distanceInterval || 0,
    interval: options.timeInterval || 5000,
    fastestInterval: Math.max(1000, Math.floor((options.timeInterval || 5000) / 2)),
    showLocationDialog: options.mayShowUserSettingsDialog,
  };
  const watchId = Geolocation.watchPosition(
    callback,
    (error) => onError?.(normalizeLocationError(error)),
    watchOptions
  );

  return {
    remove: () => Geolocation.clearWatch(watchId),
  };
}
