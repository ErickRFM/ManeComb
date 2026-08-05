import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const mockStoreState: {
  authContext: { canAccessMobile: boolean } | null;
  user: { role: string; vehicleId: string | null } | null;
} = {
  authContext: { canAccessMobile: true },
  user: { role: 'driver', vehicleId: 'vehicle-1' },
};

jest.mock('@/src/store/root-store', () => ({
  useAppStore: (selector: (state: typeof mockStoreState) => unknown) => selector(mockStoreState),
}));

jest.mock('@/src/native/location', () => ({
  PermissionStatus: {
    DENIED: 'denied',
    GRANTED: 'granted',
    UNDETERMINED: 'undetermined',
  },
}));

const removeWatcher = jest.fn();
const mockWatchNativeLocation = jest.fn();
const mockRequestForegroundPermission = jest.fn();
const mockRequestBackgroundPermission = jest.fn();
const mockGetCurrentLocation = jest.fn();

jest.mock('../services/location-service', () => ({
  buildLivePoint: (coords: unknown) => coords,
  getCurrentLocation: (...args: unknown[]) => mockGetCurrentLocation(...args),
  getForegroundPermission: jest.fn(async () => ({ status: 'granted' })),
  getIssueFromError: jest.fn(() => 'unknown'),
  hasLocationServicesEnabled: jest.fn(async () => true),
  prepareNativeLocationProvider: jest.fn(async () => undefined),
  requestBackgroundPermission: (...args: unknown[]) => mockRequestBackgroundPermission(...args),
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
  beforeEach(() => {
    jest.clearAllMocks();
    mockStoreState.authContext = { canAccessMobile: true };
    mockStoreState.user = { role: 'driver', vehicleId: 'vehicle-1' };
    mockWatchNativeLocation.mockResolvedValue({ remove: removeWatcher });
    mockRequestForegroundPermission.mockResolvedValue({ status: 'granted' });
    mockRequestBackgroundPermission.mockResolvedValue({ status: 'granted' });
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
  });

  it('does not create a watcher while background owns capture', async () => {
    await act(async () => {
      TestRenderer.create(React.createElement(Probe, { enabled: false, onChange: () => undefined }));
    });

    expect(mockWatchNativeLocation).not.toHaveBeenCalled();
  });

  it('does not continuously capture for a user without an assigned driver vehicle', async () => {
    mockStoreState.user = { role: 'admin', vehicleId: null };

    await act(async () => {
      TestRenderer.create(React.createElement(Probe, { enabled: true, onChange: () => undefined }));
    });

    expect(mockRequestForegroundPermission).not.toHaveBeenCalled();
    expect(mockWatchNativeLocation).not.toHaveBeenCalled();
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

    expect(mockRequestBackgroundPermission).not.toHaveBeenCalled();
    expect(mockGetCurrentLocation).not.toHaveBeenCalled();
    expect(mockWatchNativeLocation).not.toHaveBeenCalled();
  });
});
