import { MAX_ACCEPTED_ACCURACY_METERS, MIN_NATIVE_DISTANCE_METERS } from '../constants/tracking';
import { buildLivePoint, isLowAccuracy, shouldAcceptLocation } from './location-service';
import { shouldSyncVehicleLocation } from './tracking-service';

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
