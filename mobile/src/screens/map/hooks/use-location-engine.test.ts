import React from 'react';
import { Platform } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';

const originalPlatform = Platform.OS;
const mockStoreState: {
  activeRouteSession: { id: string; status: string } | null;
  apiUrl: string;
  authContext: { canAccessMobile: boolean } | null;
  refreshToken: string | null;
  token: string | null;
  user: {
    accountType: string;
    operationalSchedule: null;
    role: string;
    vehicleId: string | null;
  } | null;
} = {
  activeRouteSession: null,
  apiUrl: 'https://manecomb.test/api',
  authContext: { canAccessMobile: true },
  refreshToken: 'refresh-token',
  token: 'access-token',
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

const mockAcquireBackground = jest.fn();
const mockReleaseBackground = jest.fn();

jest.mock('@/src/native/background-location', () => ({
  acquireBackgroundLocationServiceAsync: (...args: unknown[]) => mockAcquireBackground(...args),
  releaseBackgroundLocationServiceAsync: (...args: unknown[]) => mockReleaseBackground(...args),
}));

const removeWatcher = jest.fn();
const mockWatchNativeLocation = jest.fn();
const mockRequestForegroundPermission = jest.fn();
const mockGetBackgroundPermission = jest.fn();
const mockGetCurrentLocation = jest.fn();

jest.mock('../services/location-service', () => ({
  buildLivePoint: (coords: unknown) => coords,
  getBackgroundPermission: (...args: unknown[]) => mockGetBackgroundPermission(...args),
  getCurrentLocation: (...args: unknown[]) => mockGetCurrentLocation(...args),
  getForegroundPermission: jest.fn(async () => ({ status: 'granted' })),
  getIssueFromError: jest.fn(() => 'unknown'),
  hasLocationServicesEnabled: jest.fn(async () => true),
  prepareNativeLocationProvider: jest.fn(async () => undefined),
  requestForegroundPermission: (...args: unknown[]) => mockRequestForegroundPermission(...args),
  shouldAcceptLocation: jest.fn(() => true),
  toIsoTimestamp: jest.fn(() => '2023-11-14T22:13:20.000Z'),
  toPermissionState: jest.fn(() => 'granted'),
  watchNativeLocation: (...args: unknown[]) => mockWatchNativeLocation(...args),
}));

const { useLocationEngine } = require('./use-location-engine') as typeof import('./use-location-engine');
type Snapshot = ReturnType<typeof useLocationEngine>;

function Probe({ enabled, onChange }: { enabled: boolean; onChange: (value: Snapshot) => void }) {
  const value = useLocationEngine({ enabled });
  React.useEffect(() => onChange(value), [onChange, value]);
  return null;
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('useLocationEngine capture ownership', () => {
  beforeAll(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: originalPlatform,
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockStoreState.activeRouteSession = null;
    mockStoreState.apiUrl = 'https://manecomb.test/api';
    mockStoreState.authContext = { canAccessMobile: true };
    mockStoreState.refreshToken = 'refresh-token';
    mockStoreState.token = 'access-token';
    mockStoreState.user = {
      accountType: 'operations',
      operationalSchedule: null,
      role: 'driver',
      vehicleId: 'vehicle-1',
    };
    mockWatchNativeLocation.mockResolvedValue({ remove: removeWatcher });
    mockRequestForegroundPermission.mockResolvedValue({ status: 'granted' });
    mockGetBackgroundPermission.mockResolvedValue({ status: 'granted' });
    mockNativeForegroundPermission.mockResolvedValue({ status: 'granted' });
    mockNativeBackgroundPermission.mockResolvedValue({ status: 'granted' });
    mockAcquireBackground.mockResolvedValue(true);
    mockReleaseBackground.mockResolvedValue(true);
    mockGetCurrentLocation.mockResolvedValue({
      coords: { latitude: 19.43, longitude: -99.13, accuracy: 5 },
      timestamp: 1_700_000_000_000,
    });
  });

  it('starts once in foreground and releases its watcher in background', async () => {
    const result: { current: Snapshot | null } = { current: null };
    const onChange = (value: Snapshot) => {
      result.current = value;
    };
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Probe, { enabled: true, onChange }));
    });

    expect(mockWatchNativeLocation).toHaveBeenCalledTimes(1);
    expect(result.current?.watcherActive).toBe(true);
    expect(result.current?.coordinates).toMatchObject({ latitude: 19.43, longitude: -99.13 });

    await act(async () => {
      renderer.update(React.createElement(Probe, { enabled: false, onChange }));
    });

    expect(removeWatcher).toHaveBeenCalledTimes(1);
    expect(result.current?.watcherActive).toBe(false);
    expect(mockAcquireBackground).toHaveBeenCalledWith(
      'operational-runtime',
      expect.objectContaining({
        token: 'access-token',
        vehicleId: 'vehicle-1',
      })
    );
  });

  it('does not create a watcher while background owns capture', async () => {
    await act(async () => {
      TestRenderer.create(React.createElement(Probe, { enabled: false, onChange: () => undefined }));
    });

    expect(mockWatchNativeLocation).not.toHaveBeenCalled();
    expect(mockAcquireBackground).toHaveBeenCalledTimes(1);
  });

  it('captures local GPS for an operational admin without acquiring vehicle tracking', async () => {
    mockStoreState.user = {
      accountType: 'operations',
      operationalSchedule: null,
      role: 'admin',
      vehicleId: null,
    };

    await act(async () => {
      TestRenderer.create(React.createElement(Probe, { enabled: true, onChange: () => undefined }));
    });

    expect(mockRequestForegroundPermission).toHaveBeenCalledTimes(1);
    expect(mockWatchNativeLocation).toHaveBeenCalledTimes(1);
    expect(mockAcquireBackground).not.toHaveBeenCalled();
    expect(mockReleaseBackground).toHaveBeenCalledWith('operational-runtime');
  });

  it('invalidates a permission request that resolves after background takes ownership', async () => {
    let resolvePermission: ((value: { status: string }) => void) | null = null;
    mockRequestForegroundPermission.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePermission = resolve;
        })
    );

    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(Probe, { enabled: true, onChange: () => undefined })
      );
    });
    await act(flushPromises);

    act(() => {
      renderer.update(
        React.createElement(Probe, { enabled: false, onChange: () => undefined })
      );
    });

    await act(async () => {
      resolvePermission?.({ status: 'granted' });
      await flushPromises();
    });

    expect(mockGetBackgroundPermission).not.toHaveBeenCalled();
    expect(mockGetCurrentLocation).not.toHaveBeenCalled();
    expect(mockWatchNativeLocation).not.toHaveBeenCalled();
  });

  it('uses the running journey id in the background lease', async () => {
    mockStoreState.activeRouteSession = { id: 'session-1', status: 'RUNNING' };

    await act(async () => {
      TestRenderer.create(React.createElement(Probe, { enabled: false, onChange: () => undefined }));
    });

    expect(mockAcquireBackground).toHaveBeenCalledWith(
      'operational-runtime',
      expect.objectContaining({ sessionId: 'session-1' })
    );
  });
});
