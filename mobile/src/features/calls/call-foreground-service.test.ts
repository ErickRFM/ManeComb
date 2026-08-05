jest.mock('@/src/native/call-service', () => ({
  startCallForegroundService: jest.fn(() => Promise.resolve()),
  stopCallForegroundService: jest.fn(() => Promise.resolve()),
}));

import {
  startCallForegroundService,
  stopCallForegroundService,
} from '@/src/native/call-service';
import {
  getCallForegroundServiceSnapshot,
  resetCallForegroundService,
  setCallForegroundServiceMode,
} from './call-foreground-service';

const startService = startCallForegroundService as jest.MockedFunction<
  typeof startCallForegroundService
>;
const stopService = stopCallForegroundService as jest.MockedFunction<
  typeof stopCallForegroundService
>;

describe('Call foreground service coordinator', () => {
  beforeEach(async () => {
    await resetCallForegroundService();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await resetCallForegroundService();
  });

  it('starts once for repeated audio state', async () => {
    await setCallForegroundServiceMode('audio');
    await setCallForegroundServiceMode('audio');

    expect(startService).toHaveBeenCalledTimes(1);
    expect(startService).toHaveBeenCalledWith(false);
    expect(stopService).not.toHaveBeenCalled();
  });

  it('updates an active service from audio to video without a stop gap', async () => {
    await setCallForegroundServiceMode('audio');
    await setCallForegroundServiceMode('video');

    expect(startService).toHaveBeenNthCalledWith(1, false);
    expect(startService).toHaveBeenNthCalledWith(2, true);
    expect(stopService).not.toHaveBeenCalled();
    expect(getCallForegroundServiceSnapshot().appliedMode).toBe('video');
  });

  it('serializes start followed by stop', async () => {
    let resolveStart: (() => void) | null = null;
    startService.mockImplementationOnce(
      () => new Promise<void>((resolve) => {
        resolveStart = resolve;
      })
    );

    const starting = setCallForegroundServiceMode('audio');
    const stopping = setCallForegroundServiceMode(null);

    expect(stopService).not.toHaveBeenCalled();
    resolveStart?.();
    await Promise.all([starting, stopping]);

    expect(startService).toHaveBeenCalledTimes(1);
    expect(stopService).toHaveBeenCalledTimes(1);
    expect(getCallForegroundServiceSnapshot().appliedMode).toBeNull();
  });

  it('reset is idempotent and leaves no desired service', async () => {
    await setCallForegroundServiceMode('video');
    await resetCallForegroundService();
    await resetCallForegroundService();

    expect(getCallForegroundServiceSnapshot()).toEqual(
      expect.objectContaining({
        appliedMode: null,
        desiredMode: null,
      })
    );
  });
});
