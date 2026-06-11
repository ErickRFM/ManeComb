import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Location from '@/src/native/location';
import type { GeoPoint } from '@/src/types/app';

type LiveLocationPoint = GeoPoint & {
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
};

type UserLocationState = {
  loading: boolean;
  permission: 'granted' | 'denied' | 'undetermined';
  backgroundPermission: 'granted' | 'denied' | 'undetermined';
  coordinates: LiveLocationPoint | null;
  lastUpdatedAt: string | null;
  servicesEnabled: boolean;
};

const MAX_ACCEPTED_ACCURACY_METERS = 120;
const MIN_NATIVE_DISTANCE_METERS = 8;
const MIN_NATIVE_INTERVAL_MS = 5000;

function distanceInMeters(left: GeoPoint, right: GeoPoint) {
  const radius = 6371000;
  const dLat = ((right.latitude - left.latitude) * Math.PI) / 180;
  const dLon = ((right.longitude - left.longitude) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((left.latitude * Math.PI) / 180) *
      Math.cos((right.latitude * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toPermissionState(status: Location.PermissionStatus) {
  if (status === Location.PermissionStatus.GRANTED) {
    return 'granted';
  }

  if (status === Location.PermissionStatus.DENIED) {
    return 'denied';
  }

  return 'undetermined';
}

function buildLivePoint(coords: Location.LocationObjectCoords): LiveLocationPoint {
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy: typeof coords.accuracy === 'number' ? coords.accuracy : null,
    heading: typeof coords.heading === 'number' ? coords.heading : null,
    speed: typeof coords.speed === 'number' ? coords.speed : null,
  };
}

export function useUserLocation() {
  const watcherRef = useRef<Location.LocationSubscription | null>(null);
  const webWatcherIdRef = useRef<number | null>(null);
  const lastAcceptedPointRef = useRef<LiveLocationPoint | null>(null);
  const [state, setState] = useState<UserLocationState>({
    loading: true,
    permission: 'undetermined',
    backgroundPermission: 'undetermined',
    coordinates: null,
    lastUpdatedAt: null,
    servicesEnabled: true,
  });

  const stopTracking = useCallback(() => {
    if (Platform.OS === 'web' && webWatcherIdRef.current != null) {
      try {
        if (typeof navigator !== 'undefined' && navigator.geolocation?.clearWatch) {
          navigator.geolocation.clearWatch(webWatcherIdRef.current);
        }
      } catch {
        // Cleanup should stay best-effort because native/web subscriptions can throw while detaching.
      }

      webWatcherIdRef.current = null;
    }

    if (watcherRef.current?.remove) {
      try {
        watcherRef.current.remove();
      } catch {
        // Cleanup should stay best-effort because native/web subscriptions can throw while detaching.
      }
    }

    watcherRef.current = null;
  }, []);

  const requestLocation = useCallback(async () => {
    setState((current) => ({
      ...current,
      loading: true,
    }));

    const servicesEnabled = await Location.hasServicesEnabledAsync().catch(() => true);
    const foreground = await Location.requestForegroundPermissionsAsync();

    if (foreground.status !== Location.PermissionStatus.GRANTED) {
      stopTracking();
      setState({
        loading: false,
        permission: toPermissionState(foreground.status),
        backgroundPermission: 'undetermined',
        coordinates: null,
        lastUpdatedAt: null,
        servicesEnabled,
      });
      return;
    }

    if (Platform.OS === 'android') {
      await Location.enableNetworkProviderAsync().catch(() => undefined);
    }

    const background = await Location.requestBackgroundPermissionsAsync().catch(() => ({
      status: Location.PermissionStatus.UNDETERMINED,
    }));

    stopTracking();

    const startWatching = async () => {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation?.watchPosition) {
        webWatcherIdRef.current = navigator.geolocation.watchPosition(
          (position) => {
            setState((current) => ({
              ...current,
              loading: false,
              permission: 'granted',
              backgroundPermission: toPermissionState(background.status),
              coordinates: buildLivePoint({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy,
                heading: position.coords.heading ?? null,
                speed: position.coords.speed ?? null,
                altitude: null,
                altitudeAccuracy: null,
              }),
              lastUpdatedAt: position.timestamp
                ? new Date(position.timestamp).toISOString()
                : new Date().toISOString(),
              servicesEnabled,
            }));
          },
          () => undefined,
          {
            enableHighAccuracy: true,
            maximumAge: 1500,
            timeout: 12000,
          }
        );

        return;
      }

      watcherRef.current = await Location.watchPositionAsync(
        {
          accuracy: Platform.OS === 'android' ? Location.Accuracy.High : Location.Accuracy.BestForNavigation,
          distanceInterval: MIN_NATIVE_DISTANCE_METERS,
          timeInterval: MIN_NATIVE_INTERVAL_MS,
          mayShowUserSettingsDialog: true,
        },
        (position) => {
          const nextPoint = buildLivePoint(position.coords);
          const lastPoint = lastAcceptedPointRef.current;

          if (
            typeof nextPoint.accuracy === 'number' &&
            nextPoint.accuracy > MAX_ACCEPTED_ACCURACY_METERS &&
            lastPoint
          ) {
            return;
          }

          if (lastPoint && distanceInMeters(lastPoint, nextPoint) < MIN_NATIVE_DISTANCE_METERS) {
            return;
          }

          lastAcceptedPointRef.current = nextPoint;
          setState((current) => ({
            ...current,
            loading: false,
            permission: 'granted',
            backgroundPermission: toPermissionState(background.status),
            coordinates: nextPoint,
            lastUpdatedAt: position.timestamp
              ? new Date(position.timestamp).toISOString()
              : new Date().toISOString(),
            servicesEnabled,
          }));
        }
      );
    };

    const currentPosition = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.BestForNavigation,
      mayShowUserSettingsDialog: true,
    }).catch(() => null);

    if (currentPosition) {
      const initialPoint = buildLivePoint(currentPosition.coords);
      lastAcceptedPointRef.current = initialPoint;

      setState({
        loading: false,
        permission: 'granted',
        backgroundPermission: toPermissionState(background.status),
        coordinates: initialPoint,
        lastUpdatedAt: currentPosition.timestamp
          ? new Date(currentPosition.timestamp).toISOString()
          : new Date().toISOString(),
        servicesEnabled,
      });
    } else {
      setState({
        loading: false,
        permission: 'granted',
        backgroundPermission: toPermissionState(background.status),
        coordinates: null,
        lastUpdatedAt: null,
        servicesEnabled: false,
      });
    }

    await startWatching().catch(() => undefined);
  }, [stopTracking]);

  useEffect(() => {
    requestLocation().catch(async () => {
      const foreground = await Location.getForegroundPermissionsAsync().catch(() => ({
        status: Location.PermissionStatus.UNDETERMINED,
      }));

      stopTracking();
      setState({
        loading: false,
        permission: toPermissionState(foreground.status),
        backgroundPermission: 'undetermined',
        coordinates: null,
        lastUpdatedAt: null,
        servicesEnabled: false,
      });
    });

    return () => {
      stopTracking();
    };
  }, [requestLocation, stopTracking]);

  return {
    ...state,
    refresh: requestLocation,
  };
}
