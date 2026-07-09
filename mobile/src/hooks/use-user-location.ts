import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Location from '@/src/native/location';
import { distanceInMeters } from '@/src/hooks/point-to-point-tracker-core';
import type { GeoPoint } from '@/src/types/app';
import type { UserLocationIssue } from '@/src/utils/location-status';

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
  issue: UserLocationIssue;
  retryCount: number;
};

const MAX_ACCEPTED_ACCURACY_METERS = 120;
const MIN_NATIVE_DISTANCE_METERS = 8;
const MIN_NATIVE_INTERVAL_MS = 5000;

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

function getIssueFromError(error: unknown): Exclude<UserLocationIssue, null> {
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

function isLowAccuracy(point: LiveLocationPoint) {
  return typeof point.accuracy === 'number' && point.accuracy > MAX_ACCEPTED_ACCURACY_METERS;
}

function toIsoTimestamp(timestamp: number | undefined) {
  return timestamp ? new Date(timestamp).toISOString() : new Date().toISOString();
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
    issue: null,
    retryCount: 0,
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
      issue: null,
      retryCount: current.retryCount + 1,
    }));

    const servicesEnabled = await Location.hasServicesEnabledAsync().catch(() => true);
    const foreground = await Location.requestForegroundPermissionsAsync();

    if (foreground.status !== Location.PermissionStatus.GRANTED) {
      stopTracking();
      lastAcceptedPointRef.current = null;
      setState((current) => ({
        loading: false,
        permission: toPermissionState(foreground.status),
        backgroundPermission: 'undetermined',
        coordinates: null,
        lastUpdatedAt: null,
        servicesEnabled,
        issue: 'permission_denied',
        retryCount: current.retryCount,
      }));
      return;
    }

    if (Platform.OS === 'android') {
      await Location.enableNetworkProviderAsync().catch(() => undefined);
    }

    const background = await Location.requestBackgroundPermissionsAsync().catch(() => ({
      status: Location.PermissionStatus.UNDETERMINED,
    }));

    stopTracking();
    const backgroundPermission = toPermissionState(background.status);

    const applyIssue = (error: unknown) => {
      const issue = getIssueFromError(error);

      if (issue === 'permission_denied') {
        lastAcceptedPointRef.current = null;
      }

      setState((current) => ({
        ...current,
        loading: false,
        permission: issue === 'permission_denied' ? 'denied' : 'granted',
        backgroundPermission,
        coordinates: issue === 'permission_denied' ? null : current.coordinates,
        lastUpdatedAt: issue === 'permission_denied' ? null : current.lastUpdatedAt,
        servicesEnabled: issue === 'services_disabled' ? false : servicesEnabled,
        issue,
      }));
    };

    const acceptPosition = (position: { coords: Location.LocationObjectCoords; timestamp?: number }) => {
      const nextPoint = buildLivePoint(position.coords);
      const lastPoint = lastAcceptedPointRef.current;

      if (isLowAccuracy(nextPoint)) {
        setState((current) => ({
          ...current,
          loading: false,
          permission: 'granted',
          backgroundPermission,
          servicesEnabled,
          issue: 'low_accuracy',
        }));
        return;
      }

      if (lastPoint && distanceInMeters(lastPoint, nextPoint) < MIN_NATIVE_DISTANCE_METERS) {
        setState((current) => ({
          ...current,
          loading: false,
          permission: 'granted',
          backgroundPermission,
          servicesEnabled,
          issue: null,
        }));
        return;
      }

      lastAcceptedPointRef.current = nextPoint;
      setState((current) => ({
        ...current,
        loading: false,
        permission: 'granted',
        backgroundPermission,
        coordinates: nextPoint,
        lastUpdatedAt: toIsoTimestamp(position.timestamp),
        servicesEnabled,
        issue: null,
      }));
    };

    const startWatching = async () => {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation?.watchPosition) {
        webWatcherIdRef.current = navigator.geolocation.watchPosition(
          (position) => {
            acceptPosition({
              coords: {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy,
                heading: position.coords.heading ?? null,
                speed: position.coords.speed ?? null,
                altitude: null,
                altitudeAccuracy: null,
              },
              timestamp: position.timestamp,
            });
          },
          applyIssue,
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
          acceptPosition(position);
        },
        applyIssue
      );
    };

    try {
      const currentPosition = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
        mayShowUserSettingsDialog: true,
      });
      acceptPosition(currentPosition);
    } catch (error) {
      applyIssue(error);
    }

    await startWatching().catch(applyIssue);
  }, [stopTracking]);

  useEffect(() => {
    requestLocation().catch(async () => {
      const foreground = await Location.getForegroundPermissionsAsync().catch(() => ({
        status: Location.PermissionStatus.UNDETERMINED,
      }));

      stopTracking();
      setState((current) => ({
        loading: false,
        permission: toPermissionState(foreground.status),
        backgroundPermission: 'undetermined',
        coordinates: foreground.status === Location.PermissionStatus.GRANTED ? current.coordinates : null,
        lastUpdatedAt: foreground.status === Location.PermissionStatus.GRANTED ? current.lastUpdatedAt : null,
        servicesEnabled: false,
        issue:
          foreground.status === Location.PermissionStatus.GRANTED
            ? 'unknown'
            : 'permission_denied',
        retryCount: current.retryCount,
      }));
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
