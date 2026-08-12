import * as NativeLocation from '@/src/native/location';
import {
  LOCATION_HEARTBEAT_INTERVAL_MS,
  MAX_ACCEPTED_ACCURACY_METERS,
  MIN_NATIVE_DISTANCE_METERS,
  MIN_NATIVE_INTERVAL_MS,
} from '../constants/tracking';
import {
  buildLivePoint,
  isLowAccuracy,
  shouldAcceptLocation,
  watchNativeLocation,
} from './location-service';
import { shouldSyncVehicleLocation } from './tracking-service';

const { GPS_LIVE_MAX_AGE_SECONDS } = require(
  '../../../../../backend/src/domain/operational-unit-snapshot'
) as { GPS_LIVE_MAX_AGE_SECONDS: number };

jest.mock('@/src/native/location', () => ({
  Accuracy: {
    BestForNavigation: 6,
    High: 5,
  },
  PermissionStatus: {
    DENIED: 'denied',
    GRANTED: 'granted',
    UNDETERMINED: 'undetermined',
  },
  enableNetworkProviderAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  getForegroundPermissionsAsync: jest.fn(),
  getLocationErrorCode: jest.fn(() => 'unknown'),
  hasServicesEnabledAsync: jest.fn(),
  requestBackgroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
}));

describe('location engine services', () => {
  it('rejects low accuracy locations and short movements', () => {
    const initial = buildLivePoint({
      accuracy: 20,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      latitude: 19.4326,
      longitude: -99.1332,
      speed: null,
    });
    const noisy = { ...initial, accuracy: MAX_ACCEPTED_ACCURACY_METERS + 1 };
    const tooClose = { ...initial, latitude: initial.latitude + 0.000001 };
    const farEnough = { ...initial, latitude: initial.latitude + 0.001 };

    expect(isLowAccuracy(noisy)).toBe(true);
    expect(shouldAcceptLocation(initial, noisy)).toBe(false);
    expect(shouldAcceptLocation(initial, tooClose)).toBe(false);
    expect(shouldAcceptLocation(initial, farEnough)).toBe(true);
    expect(MIN_NATIVE_DISTANCE_METERS).toBe(8);
  });

  it('keeps the native distance filter open so stationary heartbeat fixes can arrive', async () => {
    await watchNativeLocation(jest.fn(), jest.fn());

    expect(NativeLocation.watchPositionAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        distanceInterval: 0,
        timeInterval: MIN_NATIVE_INTERVAL_MS,
      }),
      expect.any(Function),
      expect.any(Function)
    );
  });

  it('renews GPS liveness even when a stationary unit does not cross the distance filter', () => {
    const stationary = buildLivePoint({
      accuracy: 5,
      altitude: null,
      altitudeAccuracy: null,
      heading: 0,
      latitude: 19.4326,
      longitude: -99.1332,
      speed: 0,
    });

    expect(
      shouldAcceptLocation(
        stationary,
        { ...stationary, latitude: stationary.latitude + 0.000001 },
        LOCATION_HEARTBEAT_INTERVAL_MS - 1
      )
    ).toBe(false);
    expect(
      shouldAcceptLocation(
        stationary,
        { ...stationary, latitude: stationary.latitude + 0.000001 },
        LOCATION_HEARTBEAT_INTERVAL_MS
      )
    ).toBe(true);
    expect(LOCATION_HEARTBEAT_INTERVAL_MS).toBe(4000);
    expect(LOCATION_HEARTBEAT_INTERVAL_MS).toBeLessThan(
      GPS_LIVE_MAX_AGE_SECONDS * 1000
    );
  });

  it('never turns a low-accuracy fix into a heartbeat', () => {
    const initial = buildLivePoint({
      accuracy: 5,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      latitude: 19.4326,
      longitude: -99.1332,
      speed: 0,
    });

    expect(
      shouldAcceptLocation(
        initial,
        { ...initial, accuracy: MAX_ACCEPTED_ACCURACY_METERS + 1 },
        LOCATION_HEARTBEAT_INTERVAL_MS * 2
      )
    ).toBe(false);
  });

  it('keeps sync gated by network, schedule, vehicle and interval', () => {
    const coordinates = {
      latitude: 19.4326,
      longitude: -99.1332,
    };

    expect(
      shouldSyncVehicleLocation({
        connectionMode: 'online',
        coordinates,
        isWithinSchedule: true,
        lastSyncAt: 0,
        now: 5000,
        vehicleId: 'vehicle-1',
      })
    ).toBe(true);
    expect(
      shouldSyncVehicleLocation({
        connectionMode: 'online',
        coordinates,
        isWithinSchedule: true,
        lastSyncAt: 4000,
        now: 5000,
        vehicleId: 'vehicle-1',
      })
    ).toBe(false);
    expect(
      shouldSyncVehicleLocation({
        connectionMode: 'offline',
        coordinates,
        isWithinSchedule: true,
        lastSyncAt: 0,
        now: 5000,
        vehicleId: 'vehicle-1',
      })
    ).toBe(false);
  });
});
