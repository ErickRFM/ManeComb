import { initialLocationEngineState, locationReducer } from '../reducers/location-reducer';
import { LOCATION_FIX_WATCHDOG_MS } from '../constants/tracking';
import {
  hasLocationFixTimedOut,
  resolveSilentLocationIssue,
} from './location-watchdog';

describe('location watchdog policy', () => {
  it('does not expire before the configured silent-fix window', () => {
    expect(hasLocationFixTimedOut(null, 20_000)).toBe(false);
    expect(hasLocationFixTimedOut(5_000, 5_000 + LOCATION_FIX_WATCHDOG_MS - 1)).toBe(false);
    expect(hasLocationFixTimedOut(5_000, 5_000 + LOCATION_FIX_WATCHDOG_MS)).toBe(true);
  });

  it('distinguishes permission loss, provider off and generic silent fixes', () => {
    expect(
      resolveSilentLocationIssue({ servicesEnabled: true, permissionGranted: false })
    ).toBe('permission_denied');
    expect(
      resolveSilentLocationIssue({ servicesEnabled: false, permissionGranted: true })
    ).toBe('services_disabled');
    expect(
      resolveSilentLocationIssue({ servicesEnabled: true, permissionGranted: true })
    ).toBe('unavailable');
  });

  it('preserves the last coordinate while stale and clears the issue on the next accepted fix', () => {
    const accepted = locationReducer(initialLocationEngineState, {
      type: 'POINT_ACCEPTED',
      backgroundPermission: 'granted',
      point: {
        latitude: 19.31,
        longitude: -98.24,
        accuracy: 5,
        heading: 0,
        speed: 0,
      },
      servicesEnabled: true,
      timestamp: '2026-08-10T07:30:00.000Z',
    });

    const silent = locationReducer(accepted, {
      type: 'ISSUE',
      backgroundPermission: 'granted',
      issue: 'unavailable',
      permission: 'granted',
      servicesEnabled: true,
    });

    expect(silent.coordinates).toEqual(accepted.coordinates);
    expect(silent.issue).toBe('unavailable');

    const recovered = locationReducer(silent, {
      type: 'POINT_ACCEPTED',
      backgroundPermission: 'granted',
      point: {
        latitude: 19.3101,
        longitude: -98.2401,
        accuracy: 5,
        heading: 0,
        speed: 0,
      },
      servicesEnabled: true,
      timestamp: '2026-08-10T07:30:20.000Z',
    });

    expect(recovered.issue).toBeNull();
    expect(recovered.coordinates).toMatchObject({ latitude: 19.3101, longitude: -98.2401 });
  });
});
