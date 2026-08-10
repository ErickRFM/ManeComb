import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import * as Location from '@/src/native/location';
import {
  acquireBackgroundLocationServiceAsync,
  releaseBackgroundLocationServiceAsync,
} from '@/src/native/background-location';
import { useAppStore } from '@/src/store/root-store';
import {
  LOCATION_FIX_WATCHDOG_MS,
  LOCATION_FIX_WATCHDOG_POLL_MS,
  MAX_ACCEPTED_ACCURACY_METERS,
} from '../constants/tracking';
import { initialLocationEngineState, locationReducer } from '../reducers/location-reducer';
import {
  buildLivePoint,
  getBackgroundPermission,
  getCurrentLocation,
  getForegroundPermission,
  getIssueFromError,
  hasLocationServicesEnabled,
  prepareNativeLocationProvider,
  requestForegroundPermission,
  shouldAcceptLocation,
  toIsoTimestamp,
  toPermissionState,
  watchNativeLocation,
} from '../services/location-service';
import type { LiveLocationPoint, LocationPosition } from '../types/location-engine';
import {
  canCaptureLocalLocation,
  canOwnVehicleTracking,
} from '../utils/location-eligibility';

const BACKGROUND_OWNER = 'operational-runtime' as const;

export function useLocationEngine({ enabled = true }: { enabled?: boolean } = {}) {
  const {
    activeRouteSession,
    apiUrl,
    authContext,
    isSigningOut,
    refreshToken,
    token,
    user,
  } = useAppStore(
    useShallow((store) => ({
      activeRouteSession: store.activeRouteSession,
      apiUrl: store.apiUrl,
      authContext: store.authContext,
      isSigningOut: store.isSigningOut,
      refreshToken: store.refreshToken,
      token: store.token,
      user: store.user,
    }))
  );
  const localCaptureEligible = canCaptureLocalLocation(user, authContext);
  const operationallyEligible = canOwnVehicleTracking(user, authContext) && !isSigningOut;
  const trackingEnabled = enabled && localCaptureEligible && !isSigningOut;
  const trackingEnabledRef = useRef(trackingEnabled);
  trackingEnabledRef.current = trackingEnabled;

  const watcherRef = useRef<Location.LocationSubscription | null>(null);
  const webWatcherIdRef = useRef<number | null>(null);
  const lastAcceptedPointRef = useRef<LiveLocationPoint | null>(null);
  const lastAcceptedAtRef = useRef<number | null>(null);
  const lastObservedFixAtRef = useRef<number | null>(null);
  const watchdogIssueRef = useRef<string | null>(null);
  const watchdogCheckInFlightRef = useRef(false);
  const requestGenerationRef = useRef(0);
  const [watcherActive, setWatcherActive] = useState(false);
  const [state, dispatch] = useReducer(locationReducer, initialLocationEngineState);

  const releaseTracking = useCallback(() => {
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
    lastAcceptedAtRef.current = null;
    lastObservedFixAtRef.current = null;
    watchdogIssueRef.current = null;
    watchdogCheckInFlightRef.current = false;
    setWatcherActive(false);
  }, []);

  const requestLocation = useCallback(async () => {
    const generation = ++requestGenerationRef.current;
    const isCurrent = () =>
      requestGenerationRef.current === generation && trackingEnabledRef.current;

    if (!trackingEnabled) {
      releaseTracking();
      return;
    }

    dispatch({ type: 'REQUEST_START' });

    try {
      const servicesEnabled = await hasLocationServicesEnabled();
      if (!isCurrent()) return;

      const foreground = await requestForegroundPermission();
      if (!isCurrent()) return;

      if (foreground.status !== Location.PermissionStatus.GRANTED) {
        releaseTracking();
        lastAcceptedPointRef.current = null;
        dispatch({
          type: 'PERMISSION_DENIED',
          permission: toPermissionState(foreground.status),
          servicesEnabled,
        });
        return;
      }

      await prepareNativeLocationProvider();
      if (!isCurrent()) return;

      // La lectura normal nunca abre el dialogo de "Permitir siempre". Ese
      // permiso solo se solicita al confirmar/iniciar una jornada.
      const background = await getBackgroundPermission();
      if (!isCurrent()) return;

      const backgroundPermission = toPermissionState(background.status);
      releaseTracking();

      const applyIssue = (error: unknown) => {
        if (!isCurrent()) return;
        const issue = getIssueFromError(error);

        if (issue === 'permission_denied') {
          lastAcceptedPointRef.current = null;
          lastAcceptedAtRef.current = null;
          lastObservedFixAtRef.current = null;
        }

        watchdogIssueRef.current = issue;
        dispatch({
          type: 'ISSUE',
          backgroundPermission,
          issue,
          permission: issue === 'permission_denied' ? 'denied' : 'granted',
          servicesEnabled: issue === 'services_disabled' ? false : servicesEnabled,
        });
      };

      const acceptPosition = (position: LocationPosition) => {
        if (!isCurrent()) return;
        const receivedAt = Date.now();
        lastObservedFixAtRef.current = receivedAt;
        watchdogIssueRef.current = null;

        const nextPoint = buildLivePoint(position.coords);
        const lastPoint = lastAcceptedPointRef.current;
        const elapsedSinceAcceptedMs = lastAcceptedAtRef.current === null
          ? Number.POSITIVE_INFINITY
          : Math.max(0, receivedAt - lastAcceptedAtRef.current);

        if (!shouldAcceptLocation(lastPoint, nextPoint, elapsedSinceAcceptedMs)) {
          dispatch({
            type: 'POINT_IGNORED',
            backgroundPermission,
            issue:
              typeof nextPoint.accuracy === 'number' &&
              nextPoint.accuracy > MAX_ACCEPTED_ACCURACY_METERS
                ? 'low_accuracy'
                : null,
            servicesEnabled,
          });
          return;
        }

        lastAcceptedPointRef.current = nextPoint;
        lastAcceptedAtRef.current = receivedAt;
        dispatch({
          type: 'POINT_ACCEPTED',
          backgroundPermission,
          point: nextPoint,
          servicesEnabled,
          timestamp: toIsoTimestamp(position.timestamp),
        });
      };

      const startWatching = async () => {
        if (
          Platform.OS === 'web' &&
          typeof navigator !== 'undefined' &&
          navigator.geolocation?.watchPosition
        ) {
          const watchId = navigator.geolocation.watchPosition(
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

          if (!isCurrent()) {
            navigator.geolocation.clearWatch(watchId);
            return;
          }

          webWatcherIdRef.current = watchId;
          lastObservedFixAtRef.current = Date.now();
          setWatcherActive(true);
          return;
        }

        const subscription = await watchNativeLocation(acceptPosition, applyIssue);
        if (!isCurrent()) {
          subscription.remove();
          return;
        }

        watcherRef.current = subscription;
        if (lastObservedFixAtRef.current === null) {
          lastObservedFixAtRef.current = Date.now();
        }
        setWatcherActive(true);
      };

      try {
        const currentPosition = await getCurrentLocation();
        acceptPosition(currentPosition);
      } catch (error) {
        applyIssue(error);
      }

      if (!isCurrent()) return;
      await startWatching().catch(applyIssue);
    } catch {
      if (!isCurrent()) return;
      const foreground = await getForegroundPermission();
      if (!isCurrent()) return;

      releaseTracking();
      dispatch({
        type: 'ISSUE',
        backgroundPermission: 'undetermined',
        issue:
          foreground.status === Location.PermissionStatus.GRANTED
            ? 'unknown'
            : 'permission_denied',
        permission: toPermissionState(foreground.status),
        servicesEnabled: true,
      });
    }
  }, [releaseTracking, trackingEnabled]);

  useEffect(() => {
    if (!trackingEnabled) {
      requestGenerationRef.current += 1;
      releaseTracking();
      return undefined;
    }

    requestLocation().catch(() => undefined);

    return () => {
      requestGenerationRef.current += 1;
      releaseTracking();
    };
  }, [releaseTracking, requestLocation, trackingEnabled]);

  useEffect(() => {
    if (!trackingEnabled || !watcherActive) return undefined;

    const timer = setInterval(() => {
      const lastObservedAt = lastObservedFixAtRef.current;
      if (
        watchdogCheckInFlightRef.current ||
        lastObservedAt === null ||
        Date.now() - lastObservedAt < LOCATION_FIX_WATCHDOG_MS
      ) {
        return;
      }

      watchdogCheckInFlightRef.current = true;
      const observedAtBeforeCheck = lastObservedAt;

      Promise.all([hasLocationServicesEnabled(), getForegroundPermission()])
        .then(([servicesEnabled, foreground]) => {
          if (!trackingEnabledRef.current || !watcherRef.current && Platform.OS !== 'web') {
            return;
          }

          // Si llego un fix mientras consultabamos permiso/proveedor, el watcher
          // sigue sano y no debemos declarar una desconexion fantasma.
          if (lastObservedFixAtRef.current !== observedAtBeforeCheck) {
            return;
          }

          const issue = foreground.status !== Location.PermissionStatus.GRANTED
            ? 'permission_denied'
            : servicesEnabled
              ? 'unavailable'
              : 'services_disabled';

          if (watchdogIssueRef.current === issue) return;
          watchdogIssueRef.current = issue;

          if (issue === 'permission_denied') {
            lastAcceptedPointRef.current = null;
            lastAcceptedAtRef.current = null;
          }

          dispatch({
            type: 'ISSUE',
            backgroundPermission: state.backgroundPermission,
            issue,
            permission: issue === 'permission_denied' ? 'denied' : 'granted',
            servicesEnabled,
          });
        })
        .catch(() => undefined)
        .finally(() => {
          watchdogCheckInFlightRef.current = false;
        });
    }, LOCATION_FIX_WATCHDOG_POLL_MS);

    return () => clearInterval(timer);
  }, [state.backgroundPermission, trackingEnabled, watcherActive]);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;

    let cancelled = false;
    const reconcileBackgroundOwner = async () => {
      const foregroundCaptureUnavailable =
        state.permission === 'denied' || state.servicesEnabled === false;

      if (
        !operationallyEligible ||
        !apiUrl ||
        !token ||
        !user?.vehicleId
      ) {
        await releaseBackgroundLocationServiceAsync(BACKGROUND_OWNER).catch(
          () => undefined
        );
        return;
      }

      // Keep native ownership until React has a watcher or proves foreground
      // capture cannot run. This removes the background -> foreground gap.
      if (enabled) {
        if (watcherActive || foregroundCaptureUnavailable) {
          await releaseBackgroundLocationServiceAsync(BACKGROUND_OWNER).catch(
            () => undefined
          );
        }
        return;
      }

      if (watcherActive) return;

      const [foreground, background] = await Promise.all([
        Location.getForegroundPermissionsAsync().catch(() => ({
          status: Location.PermissionStatus.DENIED,
        })),
        Location.getBackgroundPermissionsAsync().catch(() => ({
          status: Location.PermissionStatus.DENIED,
        })),
      ]);

      if (cancelled) return;

      if (
        foreground.status !== Location.PermissionStatus.GRANTED ||
        background.status !== Location.PermissionStatus.GRANTED
      ) {
        await releaseBackgroundLocationServiceAsync(BACKGROUND_OWNER).catch(
          () => undefined
        );
        return;
      }

      await acquireBackgroundLocationServiceAsync(BACKGROUND_OWNER, {
        apiUrl,
        refreshToken: refreshToken || '',
        schedule: user.operationalSchedule || null,
        sessionId:
          activeRouteSession?.status === 'RUNNING' ? activeRouteSession.id : '',
        token,
        vehicleId: user.vehicleId,
      }).catch(() => undefined);
    };

    reconcileBackgroundOwner().catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [
    activeRouteSession?.id,
    activeRouteSession?.status,
    apiUrl,
    enabled,
    operationallyEligible,
    refreshToken,
    state.permission,
    state.servicesEnabled,
    token,
    user?.operationalSchedule,
    user?.vehicleId,
    watcherActive,
  ]);

  useEffect(
    () => () => {
      releaseBackgroundLocationServiceAsync(BACKGROUND_OWNER).catch(() => undefined);
    },
    []
  );

  return {
    ...state,
    refresh: requestLocation,
    watcherActive,
  };
}
