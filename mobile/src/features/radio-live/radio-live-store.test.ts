import type { Socket } from 'socket.io-client';
import {
  setRadioLiveRuntimeFactory,
  useRadioLiveStore,
} from './radio-live-store';
import type { RadioLiveRuntimeParams } from './radio-live-types';

const socketA = {} as Socket;
const socketB = {} as Socket;

function createHarness() {
  const stops: jest.Mock[] = [];
  const params: RadioLiveRuntimeParams[] = [];
  const factory = jest.fn((input: RadioLiveRuntimeParams) => {
    params.push(input);
    const stop = jest.fn();
    stops.push(stop);
    return { stop };
  });
  setRadioLiveRuntimeFactory(factory);
  return { factory, params, stops };
}

describe('global radio live store', () => {
  beforeEach(() => {
    useRadioLiveStore.getState().reset();
    setRadioLiveRuntimeFactory(null);
  });

  afterAll(() => {
    useRadioLiveStore.getState().reset();
    setRadioLiveRuntimeFactory(null);
  });

  it('starts one runtime for the authenticated general channel', () => {
    const harness = createHarness();
    useRadioLiveStore.getState().activate({
      channelId: 'radio-general',
      socket: socketA,
      userId: 'user-1',
    });

    expect(harness.factory).toHaveBeenCalledTimes(1);
    expect(useRadioLiveStore.getState().phase).toBe('JOINING');
    expect(useRadioLiveStore.getState().channelId).toBe('radio-general');

    useRadioLiveStore.getState().activate({
      channelId: 'radio-general',
      socket: socketA,
      userId: 'user-1',
    });
    expect(harness.factory).toHaveBeenCalledTimes(1);
  });

  it('becomes LISTENING only after radio join is ready', () => {
    const harness = createHarness();
    useRadioLiveStore.getState().activate({ channelId: 'radio-general', socket: socketA, userId: 'user-1' });

    harness.params[0].onTransportState('join_sent');
    expect(useRadioLiveStore.getState().phase).toBe('JOINING');

    harness.params[0].onTransportState('ready');
    harness.params[0].onForegroundServiceChange(true);
    expect(useRadioLiveStore.getState().phase).toBe('LISTENING');
    expect(useRadioLiveStore.getState().foregroundServiceActive).toBe(true);
  });

  it('tracks an incoming transmission and returns to LISTENING', () => {
    const harness = createHarness();
    useRadioLiveStore.getState().activate({ channelId: 'radio-general', socket: socketA, userId: 'user-1' });
    harness.params[0].onTransportState('ready');
    harness.params[0].onReceiving({
      transmissionId: 'tx-1',
      operator: { id: 'user-2', name: 'Chofer C-3' },
    });
    harness.params[0].onFrame({ transmissionId: 'tx-1', receivedAt: 1234 });

    expect(useRadioLiveStore.getState()).toMatchObject({
      phase: 'RECEIVING',
      currentTransmissionId: 'tx-1',
      lastFrameAt: 1234,
    });

    harness.params[0].onTransmissionEnd({ transmissionId: 'tx-1' });
    expect(useRadioLiveStore.getState()).toMatchObject({
      phase: 'LISTENING',
      currentTransmissionId: null,
      operator: null,
    });
  });

  it('pauses for a call and for the dedicated Radio screen', () => {
    const harness = createHarness();
    useRadioLiveStore.getState().activate({ channelId: 'radio-general', socket: socketA, userId: 'user-1' });
    useRadioLiveStore.getState().pause('call');
    expect(harness.stops[0]).toHaveBeenCalledTimes(1);
    expect(useRadioLiveStore.getState().phase).toBe('PAUSED_BY_CALL');

    useRadioLiveStore.getState().activate({ channelId: 'radio-general', socket: socketA, userId: 'user-1' });
    useRadioLiveStore.getState().pause('screen');
    expect(harness.stops[1]).toHaveBeenCalledTimes(1);
    expect(useRadioLiveStore.getState().phase).toBe('PAUSED_BY_SCREEN');
  });

  it('replaces the runtime when the shared socket instance changes', () => {
    const harness = createHarness();
    useRadioLiveStore.getState().activate({ channelId: 'radio-general', socket: socketA, userId: 'user-1' });
    useRadioLiveStore.getState().activate({ channelId: 'radio-general', socket: socketB, userId: 'user-1' });

    expect(harness.stops[0]).toHaveBeenCalledTimes(1);
    expect(harness.factory).toHaveBeenCalledTimes(2);
  });

  it('ignores callbacks from a replaced runtime', () => {
    const harness = createHarness();
    useRadioLiveStore.getState().activate({ channelId: 'radio-general', socket: socketA, userId: 'user-1' });
    const stale = harness.params[0];
    useRadioLiveStore.getState().activate({ channelId: 'radio-general', socket: socketB, userId: 'user-1' });

    stale.onReceiving({
      transmissionId: 'stale-tx',
      operator: { id: 'old-user', name: 'Viejo' },
    });
    expect(useRadioLiveStore.getState().currentTransmissionId).toBeNull();
  });

  it('cleans the runtime and diagnostics on logout/reset', () => {
    const harness = createHarness();
    useRadioLiveStore.getState().activate({ channelId: 'radio-general', socket: socketA, userId: 'user-1' });
    harness.params[0].onTransportState('ready');
    harness.params[0].onForegroundServiceChange(true);

    useRadioLiveStore.getState().reset();
    expect(harness.stops[0]).toHaveBeenCalledTimes(1);
    expect(useRadioLiveStore.getState()).toMatchObject({
      phase: 'IDLE',
      channelId: null,
      foregroundServiceActive: false,
    });
  });
});
