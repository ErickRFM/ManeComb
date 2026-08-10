import { Platform } from 'react-native';
import * as Location from '@/src/native/location';
import { distanceInMeters } from '@/src/hooks/point-to-point-tracker-core';
import {
  LOCATION_HEARTBEAT_INTERVAL_MS,
  MAX_ACCEPTED_ACCURACY_METERS,
  MIN_NATIVE_DISTANCE_METERS,
  MIN_NATIVE_INTERVAL_MS,
} from '../constants/tracking';
import type { LiveLocationPoint, LocationPermissionState } from '../types/location-engine';

export function toPermissionState(status: Location.PermissionStatus): LocationPermissionState {
  if (status === Location.PermissionStatus.GRANTED) {
    return 'granted';
  }

  if (status === Location.PermissionStatus.DENIED) {
    return 'denied';
  }

  return 'undetermined';
}

export function buildLivePoint(coords: Location.LocationObjectCoords): LiveLocationPoint {
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy: typeof coords.accuracy === 'number' ? coords.accuracy : null,
    heading: typeof coords.heading === 'number' ? coords.heading : null,
    speed: typeof coords.speed === 'number' ? coords.speed : null,
  };
}

export function getIssueFromError(error: unknown) {
  const code = Location.getLocationErrorCode(error);

  if (code === 'permission_denied') {
    return 'permission_denied';
  }

  if (code === 'services_disabled') {
    return 'services_disabled';
  }

  if (code === 'timeout') {
    return 'timeout';
  }

  if (code === 'unavailable') {
    return 'unavailable';
  }

  return 'unknown';
}

export function isLowAccuracy(point: LiveLocationPoint) {
  return typeof point.accuracy === 'number' && point.accuracy > MAX_ACCEPTED_ACCURACY_METERS;
}

export function shouldAcceptLocation(
  previous: LiveLocationPoint | null,
  next: LiveLocationPoint,
  elapsedSinceAcceptedMs = 0
) {
  if (isLowAccuracy(next)) {
    return false;
  }

  if (!previous) {
    return true;
  }

  // La distancia filtra jitter cuando el GPS reporta muy seguido. El heartbeat
  // temporal evita el bug inverso: una combi estacionada debe seguir demostrando
  // que su GPS esta vivo aunque no recorra ocho metros.
  return (
    distanceInMeters(previous, next) >= MIN_NATIVE_DISTANCE_METERS ||
    elapsedSinceAcceptedMs >= LOCATION_HEARTBEAT_INTERVAL_MS
  );
}

export function toIsoTimestamp(timestamp: number | undefined) {
  return timestamp ? new Date(timestamp).toISOString() : new Date().toISOString();
}

export async function requestForegroundPermission() {
  return Location.requestForegroundPermissionsAsync();
}

export async function requestBackgroundPermission() {
  return Location.requestBackgroundPermissionsAsync().catch(() => ({
    status: Location.PermissionStatus.UNDETERMINED,
  }));
}

export async function getBackgroundPermission() {
  return Location.getBackgroundPermissionsAsync().catch(() => ({
    status: Location.PermissionStatus.UNDETERMINED,
  }));
}

export async function getForegroundPermission() {
  return Location.getForegroundPermissionsAsync().catch(() => ({
    status: Location.PermissionStatus.UNDETERMINED,
  }));
}

export async function hasLocationServicesEnabled() {
  return Location.hasServicesEnabledAsync().catch(() => true);
}

export async function prepareNativeLocationProvider() {
  if (Platform.OS === 'android') {
    await Location.enableNetworkProviderAsync().catch(() => undefined);
  }
}

export function getCurrentLocation() {
  return Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.BestForNavigation,
    mayShowUserSettingsDialog: true,
  });
}

export function watchNativeLocation(
  onPosition: (position: { coords: Location.LocationObjectCoords; timestamp?: number }) => void,
  onError: (error: unknown) => void
) {
  return Location.watchPositionAsync(
    {
      accuracy: Platform.OS === 'android' ? Location.Accuracy.High : Location.Accuracy.BestForNavigation,
      // El filtro de distancia vive en `shouldAcceptLocation`. Si tambien se
      // aplica aqui, Android puede dejar de entregar callbacks cuando la combi
      // esta estacionada y nunca existiría el heartbeat temporal.
      distanceInterval: 0,
      timeInterval: MIN_NATIVE_INTERVAL_MS,
      mayShowUserSettingsDialog: true,
    },
    onPosition,
    onError
  );
}
