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

  beforeEach(() => jest.clearAllMocks());

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

  it('exposes interruption status and rotated credentials', async () => {
    const { getBackgroundLocationServiceStatusAsync } = require('./background-location');
    const status = { active: false, reason: 'auth_failed', token: 'new-access', refreshToken: 'new-refresh' };
    mockGetServiceStatus.mockResolvedValue(status);
    await expect(getBackgroundLocationServiceStatusAsync()).resolves.toEqual(status);
  });

  it('stops the Android service', async () => {
    const { stopBackgroundLocationServiceAsync } = require('./background-location');
    mockStopService.mockResolvedValue(true);
    await expect(stopBackgroundLocationServiceAsync()).resolves.toBe(true);
    expect(mockStopService).toHaveBeenCalledTimes(1);
  });
});
