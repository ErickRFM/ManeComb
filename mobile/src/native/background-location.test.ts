import { NativeModules, Platform } from 'react-native';

const mockStartService = jest.fn();
const mockStopService = jest.fn();
const mockHardStopService = jest.fn();
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
      hardStopService: mockHardStopService,
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
    mockHardStopService.mockResolvedValue(true);
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
    const { hardResetBackgroundLocationServiceAsync } = require('./background-location');
    await hardResetBackgroundLocationServiceAsync();
  });

  it('passes renewable credentials and route context through the canonical owner', async () => {
    const { acquireBackgroundLocationServiceAsync } = require('./background-location');
    await expect(
      acquireBackgroundLocationServiceAsync('operational-runtime', {
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

  it('keeps a prepared lease without starting native capture in foreground', async () => {
    Object.defineProperty(require('react-native').AppState, 'currentState', {
      configurable: true,
      value: 'active',
    });
    const { acquireBackgroundLocationServiceAsync } = require('./background-location');
    await expect(acquireBackgroundLocationServiceAsync('operational-runtime', baseConfig)).resolves.toBe(true);
    expect(mockStartService).not.toHaveBeenCalled();
  });

  it('soft-stops only after the canonical owner releases', async () => {
    const { acquireBackgroundLocationServiceAsync, releaseBackgroundLocationServiceAsync } = require('./background-location');
    await acquireBackgroundLocationServiceAsync('operational-runtime', baseConfig);
    jest.clearAllMocks();
    await releaseBackgroundLocationServiceAsync('operational-runtime');
    expect(mockStopService).toHaveBeenCalledTimes(1);
    expect(mockHardStopService).not.toHaveBeenCalled();
  });

  it('hard reset destroys all session ownership immediately', async () => {
    const {
      acquireBackgroundLocationServiceAsync,
      getBackgroundLocationOwnershipSnapshot,
      hardResetBackgroundLocationServiceAsync,
    } = require('./background-location');
    await acquireBackgroundLocationServiceAsync('operational-runtime', baseConfig);
    jest.clearAllMocks();
    await hardResetBackgroundLocationServiceAsync();
    expect(mockHardStopService).toHaveBeenCalledTimes(1);
    expect(getBackgroundLocationOwnershipSnapshot().owners).toEqual([]);
    expect(getBackgroundLocationOwnershipSnapshot().hasAppliedConfig).toBe(false);
  });

  it.each([
    ['active', true, false, 'FOREGROUND_REACT'],
    ['background', false, true, 'BACKGROUND_ANDROID'],
    ['active', true, true, 'TRANSITIONING'],
    ['background', false, false, 'DISABLED'],
  ])('classifies %s lifecycle ownership', (appState, foregroundWatcherActive, backgroundServiceActive, expected) => {
    const { getLocationCaptureOwner } = require('./background-location');
    expect(getLocationCaptureOwner({ appState, foregroundWatcherActive, backgroundServiceActive })).toBe(expected);
  });
});
