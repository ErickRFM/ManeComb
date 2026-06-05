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

async function requestAndroidPermission(permission: Permission) {
  if (Platform.OS !== 'android') {
    return PermissionStatus.GRANTED;
  }

  const result = await PermissionsAndroid.request(permission);
  return result === PermissionsAndroid.RESULTS.GRANTED
    ? PermissionStatus.GRANTED
    : PermissionStatus.DENIED;
}

export async function hasServicesEnabledAsync() {
  return true;
}

export async function requestForegroundPermissionsAsync() {
  return {
    status: await requestAndroidPermission(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION),
  };
}

export async function requestBackgroundPermissionsAsync() {
  if (Platform.OS !== 'android') {
    return { status: PermissionStatus.GRANTED };
  }

  return {
    status: await requestAndroidPermission(PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION),
  };
}

export async function enableNetworkProviderAsync() {
  return undefined;
}

export function getCurrentPositionAsync(_options?: LocationOptions) {
  return new Promise<GeoPosition>((resolve, reject) => {
    Geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 5000,
      forceRequestLocation: true,
      showLocationDialog: true,
    });
  });
}

export async function watchPositionAsync(
  options: LocationOptions,
  callback: (position: GeoPosition) => void
): Promise<LocationSubscription> {
  const watchOptions: GeoWatchOptions = {
    enableHighAccuracy: true,
    distanceFilter: options.distanceInterval || 0,
    interval: options.timeInterval || 5000,
    fastestInterval: Math.max(1000, Math.floor((options.timeInterval || 5000) / 2)),
    showLocationDialog: options.mayShowUserSettingsDialog,
  };
  const watchId = Geolocation.watchPosition(callback, () => undefined, watchOptions);

  return {
    remove: () => Geolocation.clearWatch(watchId),
  };
}
