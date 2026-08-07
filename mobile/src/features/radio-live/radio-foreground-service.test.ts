jest.mock('@/src/native/audio', () => ({
  setRadioForegroundServiceState: jest.fn(() => Promise.resolve()),
  startRadioForegroundService: jest.fn(() => Promise.resolve()),
  stopRadioForegroundService: jest.fn(() => Promise.resolve()),
}));

import {
  setRadioForegroundServiceState,
  startRadioForegroundService,
  stopRadioForegroundService,
} from '@/src/native/audio';
import {
  acquireRadioForegroundService,
  getRadioForegroundServiceOwnershipSnapshot,
  releaseRadioForegroundService,
  resetRadioForegroundService,
  setRadioForegroundServiceMode,
} from './radio-foreground-service';

const startService = startRadioForegroundService as jest.MockedFunction<
  typeof startRadioForegroundService
>;
const stopService = stopRadioForegroundService as jest.MockedFunction<
  typeof stopRadioForegroundService
>;
const setServiceState = setRadioForegroundServiceState as jest.MockedFunction<
  typeof setRadioForegroundServiceState
>;

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('Radio foreground service coordinator', () => {
  beforeEach(async () => {
    jest.useFakeTimers();
    await resetRadioForegroundService();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    jest.runOnlyPendingTimers();
    await flushPromises();
    await resetRadioForegroundService();
    jest.useRealTimers();
  });

  it('starts the native service once and in listening mode', async () => {
    await acquireRadioForegroundService();
    await acquireRadioForegroundService();

    expect(startService).toHaveBeenCalledTimes(1);
    expect(startService).toHaveBeenCalledWith('listening');
    expect(getRadioForegroundServiceOwnershipSnapshot()).toEqual({
      wanted: true,
      serviceActive: true,
      serviceMode: 'listening',
    });
  });

  it('stops only after the grace window expires', async () => {
    await acquireRadioForegroundService();

    const pendingRelease = releaseRadioForegroundService();
    jest.advanceTimersByTime(349);
    await flushPromises();
    expect(stopService).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    await pendingRelease;

    expect(stopService).toHaveBeenCalledTimes(1);
    expect(getRadioForegroundServiceOwnershipSnapshot()).toMatchObject({
      wanted: false,
      serviceActive: false,
    });
  });

  it('cancels a pending stop when the runtime restarts inside the grace window', async () => {
    await acquireRadioForegroundService();

    const pendingRelease = releaseRadioForegroundService();
    jest.advanceTimersByTime(200);
    await acquireRadioForegroundService();
    jest.advanceTimersByTime(500);
    await flushPromises();
    await pendingRelease;

    expect(startService).toHaveBeenCalledTimes(1);
    expect(stopService).not.toHaveBeenCalled();
    expect(getRadioForegroundServiceOwnershipSnapshot().serviceActive).toBe(true);
  });

  it('promotes the service to microphone only while transmitting', async () => {
    await acquireRadioForegroundService();

    await setRadioForegroundServiceMode('transmitting');
    expect(setServiceState).toHaveBeenCalledWith('transmitting');

    await setRadioForegroundServiceMode('listening');
    expect(setServiceState).toHaveBeenLastCalledWith('listening');
    expect(getRadioForegroundServiceOwnershipSnapshot().serviceMode).toBe('listening');
  });

  it('never touches the native service mode while it is stopped', async () => {
    await setRadioForegroundServiceMode('transmitting');
    expect(setServiceState).not.toHaveBeenCalled();
  });
});
