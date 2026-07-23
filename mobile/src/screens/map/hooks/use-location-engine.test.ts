import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

jest.mock('@/src/native/location', () => ({
  PermissionStatus: {
    DENIED: 'denied',
    GRANTED: 'granted',
    UNDETERMINED: 'undetermined',
  },
}));

const removeWatcher = jest.fn();
const mockWatchNativeLocation = jest.fn();

jest.mock('../services/location-service', () => ({
  buildLivePoint: (coords: unknown) => coords,
  getCurrentLocation: jest.fn(async () => ({
    coords: { latitude: 19.43, longitude: -99.13, accuracy: 5 },
    timestamp: 1_700_000_000_000,
  })),
  getForegroundPermission: jest.fn(async () => ({ status: 'granted' })),
  getIssueFromError: jest.fn(() => 'unknown'),
  hasLocationServicesEnabled: jest.fn(async () => true),
  prepareNativeLocationProvider: jest.fn(async () => undefined),
  requestBackgroundPermission: jest.fn(async () => ({ status: 'granted' })),
  requestForegroundPermission: jest.fn(async () => ({ status: 'granted' })),
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

describe('useLocationEngine capture ownership', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWatchNativeLocation.mockResolvedValue({ remove: removeWatcher });
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
});
