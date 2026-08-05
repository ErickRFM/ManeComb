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

  it('keeps one service while ownership moves from global runtime to Radio screen', async () => {
    await acquireRadioForegroundService('global');
    await acquireRadioForegroundService('screen');

    expect(startService).toHaveBeenCalledTimes(1);

    await releaseRadioForegroundService('global');
    jest.advanceTimersByTime(1000);
    await flushPromises();

    expect(stopService).not.toHaveBeenCalled();

    const finalRelease = releaseRadioForegroundService('screen');
    jest.advanceTimersByTime(350);
    await finalRelease;

    expect(stopService).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending stop when another owner acquires the service', async () => {
    await acquireRadioForegroundService('global');

    const pendingRelease = releaseRadioForegroundService('global');
    jest.advanceTimersByTime(200);
    await acquireRadioForegroundService('screen');
    jest.advanceTimersByTime(500);
    await flushPromises();

    expect(startService).toHaveBeenCalledTimes(1);
    expect(stopService).not.toHaveBeenCalled();

    await pendingRelease;
  });
});
