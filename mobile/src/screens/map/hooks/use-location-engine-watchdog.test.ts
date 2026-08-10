import React from 'react';
import { Platform } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import {
  LOCATION_FIX_WATCHDOG_MS,
  LOCATION_FIX_WATCHDOG_POLL_MS,
} from '../constants/tracking';

const originalPlatform = Platform.OS;
const mockStoreState = {
  activeRouteSession: null as { id: string; status: string } | null,
  apiUrl: 'https://manecomb.test/api',
  authContext: { canAccessMobile: true },
  isSigningOut: false,
  refreshToken: 'refresh-token' as string | null,
  token: 'access-token' as string | null,
  user: {
    accountType: 'operations',
    operationalSchedule: null,
    role: 'driver',
    vehicleId: 'vehicle-1',
  },
};

jest.mock('@/src/store/root-store', () => ({
  useAppStore: (selector: (state: typeof mockStoreState) => unknown) => selector(mockStoreState),
}));

const mockNativeForegroundPermission = jest.fn();
const mockNativeBackgroundPermission = jest.fn();

jest.mock('@/src/native/location', () => ({
  PermissionStatus: {
    DENIED: 'denied',
    GRANTED: 'granted',
    UNDETERMINED: 'undetermined',
  },
  getForegroundPermissionsAsync: (...args: unknown[]) => mockNativeForegroundPermission(...args),
  getBackgroundPermissionsAsync: (...args: unknown[]) => mockNativeBackgroundPermission(...args),
}));

jest.mock('@/src/native/background-location', () => ({
  acquireBackgroundLocationServiceAsync: jest.fn(async () => true),
  releaseBackgroundLocationServiceAsync: jest.fn(async () => true),
}));

const mockHasLocationServicesEnabled = jest.fn();
const mockGetForegroundPermission = jest.fn();
const mockGetCurrentLocation = jest.fn();
let watchedPosition: ((position: {
  coords: { latitude: number; longitude: number; accuracy: number };
  timestamp?: number;
}) => void) | null = null;

jest.mock('../services/location-service', () => ({
  buildLivePoint: (coords: unknown) => coords,
  getBackgroundPermission: jest.fn(async () => ({ status: 'granted' })),
  getCurrentLocation: (...args: unknown[]) => mockGetCurrentLocation(...args),
  getForegroundPermission: (...args: unknown[]) => mockGetForegroundPermission(...args),
  getIssueFromError: jest.fn(() => 'unknown'),
  hasLocationServicesEnabled: (...args: unknown[]) => mockHasLocationServicesEnabled(...args),
  prepareNativeLocationProvider: jest.fn(async () => undefined),
  requestForegroundPermission: jest.fn(async () => ({ status: 'granted' })),
  shouldAcceptLocation: jest.fn(() => true),
  toIsoTimestamp: jest.fn(() => '2026-08-10T07:00:00.000Z'),
  toPermissionState: jest.fn(() => 'granted'),
  watchNativeLocation: jest.fn(async (onPosition: typeof watchedPosition) => {
    watchedPosition = onPosition;
    return { remove: jest.fn() };
  }),
}));

const { useLocationEngine } = require('./use-location-engine') as typeof import('./use-location-engine');
type Snapshot = ReturnType<typeof useLocationEngine>;

function Probe({ onChange }: { onChange: (snapshot: Snapshot) => void }) {
  const snapshot = useLocationEngine({ enabled: true });
  React.useEffect(() => onChange(snapshot), [onChange, snapshot]);
  return null;
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('useLocationEngine foreground GPS watchdog', () => {
  beforeAll(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
  });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-10T07:00:00.000Z'));
    jest.clearAllMocks();
    watchedPosition = null;
    mockHasLocationServicesEnabled.mockResolvedValue(true);
    mockGetForegroundPermission.mockResolvedValue({ status: 'granted' });
    mockNativeForegroundPermission.mockResolvedValue({ status: 'granted' });
    mockNativeBackgroundPermission.mockResolvedValue({ status: 'granted' });
    mockGetCurrentLocation.mockResolvedValue({
      coords: { latitude: 19.43, longitude: -99.13, accuracy: 5 },
      timestamp: Date.now(),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('marks a silent watcher unavailable and clears the warning on the next raw fix', async () => {
    const current: { value: Snapshot | null } = { value: null };
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(Probe, { onChange: (snapshot) => { current.value = snapshot; } })
      );
      await flushPromises();
    });

    expect(current.value?.issue).toBeNull();
    expect(watchedPosition).not.toBeNull();

    await act(async () => {
      jest.advanceTimersByTime(LOCATION_FIX_WATCHDOG_MS + LOCATION_FIX_WATCHDOG_POLL_MS);
      await flushPromises();
    });

    expect(current.value?.issue).toBe('unavailable');
    expect(current.value?.coordinates).toMatchObject({ latitude: 19.43, longitude: -99.13 });

    await act(async () => {
      watchedPosition?.({
        coords: { latitude: 19.43001, longitude: -99.13001, accuracy: 5 },
        timestamp: Date.now(),
      });
      await flushPromises();
    });

    expect(current.value?.issue).toBeNull();

    act(() => renderer.unmount());
  });

  it('distinguishes GPS services being turned off from a generic lack of fixes', async () => {
    const current: { value: Snapshot | null } = { value: null };
    let renderer: TestRenderer.ReactTestRenderer;

    mockHasLocationServicesEnabled
      .mockResolvedValueOnce(true)
      .mockResolvedValue(false);

    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(Probe, { onChange: (snapshot) => { current.value = snapshot; } })
      );
      await flushPromises();
    });

    await act(async () => {
      jest.advanceTimersByTime(LOCATION_FIX_WATCHDOG_MS + LOCATION_FIX_WATCHDOG_POLL_MS);
      await flushPromises();
    });

    expect(current.value?.issue).toBe('services_disabled');
    expect(current.value?.servicesEnabled).toBe(false);

    act(() => renderer.unmount());
  });
});
