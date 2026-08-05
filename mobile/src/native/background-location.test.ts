import { NativeModules, Platform } from 'react-native';

const mockStartService = jest.fn();
const mockStopService = jest.fn();
const mockGetServiceStatus = jest.fn();

const baseConfig = {
  apiUrl: 'https://manecomb.test/api',
  token: 'access-token',
  refreshToken: 'refresh-token',
  vehicleId: 'vehicle-1',
  sessionId: '',
  schedule: {
    enabled: true,
    startTime: '06:00',
    endTime: '22:00',
    activeDays: [1, 2, 3],
  },
};

describe('background location native bridge', () => {
  beforeAll(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    NativeModules.ManeCombLocation = {
      getServiceStatus: mockGetServiceStatus,
      startService: mockStartService,
      stopService: mockStopService,
    };
  });

  beforeEach(async () => {
    Object.defineProperty(require('react-native').AppState, 'currentState', {
      configurable: true,
      value: 'background',
    });
    mockStartService.mockResolvedValue(true);
    mockStopService.mockResolvedValue(true);
    mockGetServiceStatus.mockResolvedValue({
      active: false,
      reason: null,
      vehicleId: null,
      sessionIdPresent: false,
      trackingActive: false,
      pendingPackets: 0,
      droppedPackets: 0,
      lastCapturedAt: null,
      lastSentAt: null,
      lastConfirmedAt: null,
    });

    const { resetBackgroundLocationServiceAsync } = require('./background-location');
    await resetBackgroundLocationServiceAsync();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    const { resetBackgroundLocationServiceAsync } = require('./background-location');
    await resetBackgroundLocationServiceAsync();
  });

  it('passes renewable credentials and route context to Android', async () => {
    const { startBackgroundLocationServiceAsync } = require('./background-location');
    await expect(
      startBackgroundLocationServiceAsync({
        ...baseConfig,
        sessionId: 'session-1',
      })
    ).resolves.toBe(true);

    expect(mockStartService).toHaveBeenCalledWith(
      'https://manecomb.test/api',
      'access-token',
      'refresh-token',
      'vehicle-1',
      'session-1',
      true,
      '06:00',
      '22:00',
      [1, 2, 3]
    );
  });

  it('exposes sanitized interruption and queue diagnostics', async () => {
    const { getBackgroundLocationServiceStatusAsync } = require('./background-location');
    const status = {
      active: false,
      reason: 'auth_failed',
      vehicleId: 'vehicle-1',
      sessionIdPresent: false,
      trackingActive: false,
      pendingPackets: 3,
      droppedPackets: 1,
      lastCapturedAt: 1,
      lastSentAt: 2,
      lastConfirmedAt: 3,
    };
    mockGetServiceStatus.mockResolvedValue(status);

    await expect(getBackgroundLocationServiceStatusAsync()).resolves.toEqual(status);
    expect(status).not.toHaveProperty('token');
    expect(status).not.toHaveProperty('refreshToken');
  });

  it('stops the Android service when no owner remains', async () => {
    const {
      startBackgroundLocationServiceAsync,
      stopBackgroundLocationServiceAsync,
    } = require('./background-location');

    await startBackgroundLocationServiceAsync({
      ...baseConfig,
      sessionId: 'session-1',
    });
    jest.clearAllMocks();

    await expect(stopBackgroundLocationServiceAsync()).resolves.toBe(true);
    expect(mockStopService).toHaveBeenCalledTimes(1);
  });

  it('keeps a prepared lease without starting native capture in foreground', async () => {
    Object.defineProperty(require('react-native').AppState, 'currentState', {
      configurable: true,
      value: 'active',
    });
    const { acquireBackgroundLocationServiceAsync } = require('./background-location');

    await expect(
      acquireBackgroundLocationServiceAsync('operational-runtime', baseConfig)
    ).resolves.toBe(true);
    expect(mockStartService).not.toHaveBeenCalled();

    Object.defineProperty(require('react-native').AppState, 'currentState', {
      configurable: true,
      value: 'background',
    });
    await acquireBackgroundLocationServiceAsync('operational-runtime', baseConfig);

    expect(mockStartService).toHaveBeenCalledTimes(1);
  });

  it('does not let a legacy cleanup stop the current operational runtime', async () => {
    const {
      acquireBackgroundLocationServiceAsync,
      getBackgroundLocationOwnershipSnapshot,
      startBackgroundLocationServiceAsync,
      stopBackgroundLocationServiceAsync,
    } = require('./background-location');

    await acquireBackgroundLocationServiceAsync('operational-runtime', baseConfig);
    await startBackgroundLocationServiceAsync(baseConfig);
    jest.clearAllMocks();

    await stopBackgroundLocationServiceAsync();

    expect(mockStopService).not.toHaveBeenCalled();
    expect(getBackgroundLocationOwnershipSnapshot().owners).toEqual([
      'operational-runtime',
    ]);
  });

  it('stops after the final operational owner releases', async () => {
    const {
      acquireBackgroundLocationServiceAsync,
      releaseBackgroundLocationServiceAsync,
    } = require('./background-location');

    await acquireBackgroundLocationServiceAsync('operational-runtime', baseConfig);
    jest.clearAllMocks();
    await releaseBackgroundLocationServiceAsync('operational-runtime');

    expect(mockStopService).toHaveBeenCalledTimes(1);
  });

  it('replaces a stale journey lease with canonical runtime credentials', async () => {
    const {
      acquireBackgroundLocationServiceAsync,
      getBackgroundLocationOwnershipSnapshot,
      startBackgroundLocationServiceAsync,
    } = require('./background-location');

    await startBackgroundLocationServiceAsync({
      ...baseConfig,
      sessionId: 'session-old',
      token: 'old-token',
    });
    await acquireBackgroundLocationServiceAsync('operational-runtime', {
      ...baseConfig,
      sessionId: 'session-new',
      token: 'new-token',
    });

    expect(getBackgroundLocationOwnershipSnapshot().owners).toEqual([
      'operational-runtime',
    ]);
    expect(mockStartService).toHaveBeenLastCalledWith(
      'https://manecomb.test/api',
      'new-token',
      'refresh-token',
      'vehicle-1',
      'session-new',
      true,
      '06:00',
      '22:00',
      [1, 2, 3]
    );
  });

  it.each([
    ['active', true, false, 'FOREGROUND_REACT'],
    ['background', false, true, 'BACKGROUND_ANDROID'],
    ['active', true, true, 'TRANSITIONING'],
    ['background', false, false, 'DISABLED'],
  ])(
    'classifies %s lifecycle ownership',
    (appState, foregroundWatcherActive, backgroundServiceActive, expected) => {
      const { getLocationCaptureOwner } = require('./background-location');
      expect(
        getLocationCaptureOwner({
          appState,
          foregroundWatcherActive,
          backgroundServiceActive,
        })
      ).toBe(expected);
    }
  );
});
