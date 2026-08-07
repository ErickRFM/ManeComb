jest.mock('@/src/native/audio', () => ({
  startRadioForegroundService: jest.fn(() => Promise.resolve()),
  stopRadioForegroundService: jest.fn(() => Promise.resolve()),
}));

import {
  startRadioForegroundService,
  stopRadioForegroundService,
} from '@/src/native/audio';
import {
  acquireRadioForegroundService,
  getRadioForegroundServiceOwnershipSnapshot,
  releaseRadioForegroundService,
  resetRadioForegroundService,
} from './radio-foreground-service';

const startService = startRadioForegroundService as jest.MockedFunction<
  typeof startRadioForegroundService
>;
const stopService = stopRadioForegroundService as jest.MockedFunction<
  typeof stopRadioForegroundService
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

  it('keeps exactly one native service through global -> screen -> global handoff', async () => {
    await acquireRadioForegroundService('global');
    await acquireRadioForegroundService('screen');
    await releaseRadioForegroundService('global');
    await acquireRadioForegroundService('global');
    await releaseRadioForegroundService('screen');

    jest.advanceTimersByTime(1000);
    await flushPromises();

    expect(startService).toHaveBeenCalledTimes(1);
    expect(stopService).not.toHaveBeenCalled();
    expect(getRadioForegroundServiceOwnershipSnapshot()).toEqual({
      owners: ['global'],
      serviceActive: true,
    });
  });

  it('stops only after the last owner leaves for the grace window', async () => {
    await acquireRadioForegroundService('global');

    const pendingRelease = releaseRadioForegroundService('global');
    jest.advanceTimersByTime(349);
    await flushPromises();
    expect(stopService).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    await pendingRelease;

    expect(stopService).toHaveBeenCalledTimes(1);
    expect(getRadioForegroundServiceOwnershipSnapshot().owners).toEqual([]);
    expect(getRadioForegroundServiceOwnershipSnapshot().serviceActive).toBe(false);
  });

  it('cancels a pending stop when another owner acquires before grace expires', async () => {
    await acquireRadioForegroundService('global');

    const pendingRelease = releaseRadioForegroundService('global');
    jest.advanceTimersByTime(200);
    await acquireRadioForegroundService('screen');
    jest.advanceTimersByTime(500);
    await flushPromises();
    await pendingRelease;

    expect(startService).toHaveBeenCalledTimes(1);
    expect(stopService).not.toHaveBeenCalled();
    expect(getRadioForegroundServiceOwnershipSnapshot().owners).toEqual(['screen']);
  });
});
