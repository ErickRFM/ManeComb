import { PermissionsAndroid, Platform } from 'react-native';
import Geolocation, { type GeoPosition } from 'react-native-geolocation-service';
import type { LocationPoint } from '../types/app';

function toLocationPoint(position: GeoPosition): LocationPoint {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
  };
}

export async function requestLocationPermission() {
  if (Platform.OS !== 'android') {
    return true;
  }

  const fine = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
  if (fine !== PermissionsAndroid.RESULTS.GRANTED) {
    return false;
  }

  const coarse = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION);
  return coarse === PermissionsAndroid.RESULTS.GRANTED;
}

export async function getCurrentLocation(): Promise<LocationPoint> {
  const granted = await requestLocationPermission();
  if (!granted) {
    throw new Error('Permiso de ubicación requerido.');
  }

  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(
      (position) => resolve(toLocationPoint(position)),
      (error) => reject(new Error(error.message || 'No se pudo obtener la ubicación.')),
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

export function watchLocation(
  onLocation: (point: LocationPoint) => void,
  onError: (message: string) => void
) {
  const watchId = Geolocation.watchPosition(
    (position) => onLocation(toLocationPoint(position)),
    (error) => onError(error.message || 'No se pudo obtener la ubicación.'),
    {
      enableHighAccuracy: true,
      distanceFilter: 10,
      interval: 8000,
      fastestInterval: 4000,
      showLocationDialog: true,
    }
  );

  return () => Geolocation.clearWatch(watchId);
}
