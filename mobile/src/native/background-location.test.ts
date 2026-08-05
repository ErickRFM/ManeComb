import { NativeModules, Platform } from 'react-native';

const mockStartService = jest.fn();
const mockStopService = jest.fn();
const mockGetServiceStatus = jest.fn();

describe('background location native bridge', () => {
  beforeAll(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    NativeModules.ManeCombLocation = {
      getServiceStatus: mockGetServiceStatus,
      startService: mockStartService,
      stopService: mockStopService,
    };
  });

  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(require('react-native').AppState, 'currentState', {
      configurable: true,
      value: 'background',
    });
  });

  it('passes renewable credentials and route context to Android', async () => {
    const { startBackgroundLocationServiceAsync } = require('./background-location');
    mockStartService.mockResolvedValue(true);
    await expect(startBackgroundLocationServiceAsync({
      apiUrl: 'https://manecomb.test/api', token: 'access-token', refreshToken: 'refresh-token',
      vehicleId: 'vehicle-1', sessionId: 'session-1',
      schedule: { enabled: true, startTime: '06:00', endTime: '22:00', activeDays: [1, 2, 3] },
    })).resolves.toBe(true);
    expect(mockStartService).toHaveBeenCalledWith(
      'https://manecomb.test/api', 'access-token', 'refresh-token', 'vehicle-1', 'session-1',
      true, '06:00', '22:00', [1, 2, 3]
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

  it('stops the Android service', async () => {
    const { stopBackgroundLocationServiceAsync } = require('./background-location');
    mockStopService.mockResolvedValue(true);
    await expect(stopBackgroundLocationServiceAsync()).resolves.toBe(true);
    expect(mockStopService).toHaveBeenCalledTimes(1);
  });

  it('does not start native capture while React owns foreground capture', async () => {
    Object.defineProperty(require('react-native').AppState, 'currentState', {
      configurable: true,
      value: 'active',
    });
    const { startBackgroundLocationServiceAsync } = require('./background-location');

    await expect(startBackgroundLocationServiceAsync({
      apiUrl: 'https://manecomb.test/api', token: 'access-token', refreshToken: 'refresh-token',
      vehicleId: 'vehicle-1', sessionId: 'session-1', schedule: null,
    })).resolves.toBe(true);

    expect(mockStartService).not.toHaveBeenCalled();
  });

  it.each([
    ['active', true, false, 'FOREGROUND_REACT'],
    ['background', false, true, 'BACKGROUND_ANDROID'],
    ['active', true, true, 'TRANSITIONING'],
    ['background', false, false, 'DISABLED'],
  ])('classifies %s lifecycle ownership', (appState, foregroundWatcherActive, backgroundServiceActive, expected) => {
    const { getLocationCaptureOwner } = require('./background-location');
    expect(getLocationCaptureOwner({
      appState,
      foregroundWatcherActive,
      backgroundServiceActive,
    })).toBe(expected);
  });
});
