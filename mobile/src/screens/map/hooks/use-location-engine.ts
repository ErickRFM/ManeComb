import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Location from '@/src/native/location';
import { MAX_ACCEPTED_ACCURACY_METERS } from '../constants/tracking';
import { initialLocationEngineState, locationReducer } from '../reducers/location-reducer';
import {
  buildLivePoint,
  getCurrentLocation,
  getForegroundPermission,
  getIssueFromError,
  hasLocationServicesEnabled,
  prepareNativeLocationProvider,
  requestBackgroundPermission,
  requestForegroundPermission,
  shouldAcceptLocation,
  toIsoTimestamp,
  toPermissionState,
  watchNativeLocation,
} from '../services/location-service';
import type { LiveLocationPoint, LocationPosition } from '../types/location-engine';

export function useLocationEngine({ enabled = true }: { enabled?: boolean } = {}) {
  const watcherRef = useRef<Location.LocationSubscription | null>(null);
  const webWatcherIdRef = useRef<number | null>(null);
  const lastAcceptedPointRef = useRef<LiveLocationPoint | null>(null);
  const [watcherActive, setWatcherActive] = useState(false);
  const [state, dispatch] = useReducer(locationReducer, initialLocationEngineState);

  const stopTracking = useCallback(() => {
    if (Platform.OS === 'web' && webWatcherIdRef.current != null) {
      try {
        if (typeof navigator !== 'undefined' && navigator.geolocation?.clearWatch) {
          navigator.geolocation.clearWatch(webWatcherIdRef.current);
        }
      } catch {
        // Cleanup stays best-effort because native/web subscriptions can throw while detaching.
      }

      webWatcherIdRef.current = null;
    }

    if (watcherRef.current?.remove) {
      try {
        watcherRef.current.remove();
      } catch {
        // Cleanup stays best-effort because native/web subscriptions can throw while detaching.
      }
    }

    watcherRef.current = null;
    setWatcherActive(false);
  }, []);

  const requestLocation = useCallback(async () => {
    if (!enabled) {
      stopTracking();
      return;
    }

    dispatch({ type: 'REQUEST_START' });

    const servicesEnabled = await hasLocationServicesEnabled();
    const foreground = await requestForegroundPermission();

    if (foreground.status !== Location.PermissionStatus.GRANTED) {
      stopTracking();
      lastAcceptedPointRef.current = null;
      dispatch({
        type: 'PERMISSION_DENIED',
        permission: toPermissionState(foreground.status),
        servicesEnabled,
      });
      return;
    }

    await prepareNativeLocationProvider();

    const background = await requestBackgroundPermission();
    const backgroundPermission = toPermissionState(background.status);

    stopTracking();

    const applyIssue = (error: unknown) => {
      const issue = getIssueFromError(error);

      if (issue === 'permission_denied') {
        lastAcceptedPointRef.current = null;
      }

      dispatch({
        type: 'ISSUE',
        backgroundPermission,
        issue,
        permission: issue === 'permission_denied' ? 'denied' : 'granted',
        servicesEnabled: issue === 'services_disabled' ? false : servicesEnabled,
      });
    };

    const acceptPosition = (position: LocationPosition) => {
      const nextPoint = buildLivePoint(position.coords);
      const lastPoint = lastAcceptedPointRef.current;

      if (!shouldAcceptLocation(lastPoint, nextPoint)) {
        dispatch({
          type: 'POINT_IGNORED',
          backgroundPermission,
          issue:
            typeof nextPoint.accuracy === 'number' && nextPoint.accuracy > MAX_ACCEPTED_ACCURACY_METERS
              ? 'low_accuracy'
              : null,
          servicesEnabled,
        });
        return;
      }

      lastAcceptedPointRef.current = nextPoint;
      dispatch({
        type: 'POINT_ACCEPTED',
        backgroundPermission,
        point: nextPoint,
        servicesEnabled,
        timestamp: toIsoTimestamp(position.timestamp),
      });
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
        setWatcherActive(true);

        return;
      }

      watcherRef.current = await watchNativeLocation(acceptPosition, applyIssue);
      setWatcherActive(true);
    };

    try {
      const currentPosition = await getCurrentLocation();
      acceptPosition(currentPosition);
    } catch (error) {
      applyIssue(error);
    }

    await startWatching().catch(applyIssue);
  }, [enabled, stopTracking]);

  useEffect(() => {
    if (!enabled) {
      stopTracking();
      return undefined;
    }

    requestLocation().catch(async () => {
      const foreground = await getForegroundPermission();

      stopTracking();
      dispatch({
        type: 'ISSUE',
        backgroundPermission: 'undetermined',
        issue: foreground.status === Location.PermissionStatus.GRANTED ? 'unknown' : 'permission_denied',
        permission: toPermissionState(foreground.status),
        servicesEnabled: false,
      });
    });

    return () => {
      stopTracking();
    };
  }, [enabled, requestLocation, stopTracking]);

  return {
    ...state,
    refresh: requestLocation,
    watcherActive,
  };
}
