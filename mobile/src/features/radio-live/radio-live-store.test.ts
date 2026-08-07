import './radio-foreground-service.test';
import type { Socket } from 'socket.io-client';
import {
  setRadioLiveRuntimeFactory,
  useRadioLiveStore,
} from './radio-live-store';
import type {
  RadioLiveRuntimeParams,
  RadioLiveTransmissionResult,
} from './radio-live-types';

const socketA = {} as Socket;
const socketB = {} as Socket;

type Harness = {
  factory: jest.Mock;
  params: RadioLiveRuntimeParams[];
  stops: jest.Mock[];
  requests: jest.Mock[];
  ends: jest.Mock[];
  nextRequestResult: RadioLiveTransmissionResult;
};

function createHarness(): Harness {
  const harness: Harness = {
    factory: jest.fn(),
    params: [],
    stops: [],
    requests: [],
    ends: [],
    nextRequestResult: {
      ok: true,
      transmissionId: 'tx-local',
      transmitter: { id: 'user-1', name: 'Operador' },
    },
  };

  harness.factory = jest.fn((input: RadioLiveRuntimeParams) => {
    harness.params.push(input);
    const stop = jest.fn();
    const requestTransmission = jest.fn(async () => harness.nextRequestResult);
    const endTransmission = jest.fn(async () => ({ ok: true }));
    harness.stops.push(stop);
    harness.requests.push(requestTransmission);
    harness.ends.push(endTransmission);
    return { stop, requestTransmission, endTransmission };
  });

  setRadioLiveRuntimeFactory(harness.factory);
  return harness;
}

function activate(userId = 'user-1') {
  useRadioLiveStore.getState().activate({
    channelId: 'radio-general',
    socket: socketA,
    userId,
    userName: 'Operador',
  });
}

describe('single radio runtime store', () => {
  beforeEach(() => {
    useRadioLiveStore.getState().reset();
    setRadioLiveRuntimeFactory(null);
  });

  afterAll(() => {
    useRadioLiveStore.getState().reset();
    setRadioLiveRuntimeFactory(null);
  });

  it('starts one runtime for the authenticated channel', () => {
    const harness = createHarness();
    activate();

    expect(harness.factory).toHaveBeenCalledTimes(1);
    expect(useRadioLiveStore.getState().phase).toBe('JOINING');
    expect(useRadioLiveStore.getState().channelId).toBe('radio-general');

    activate();
    expect(harness.factory).toHaveBeenCalledTimes(1);
  });

  it('becomes LISTENING only after radio join is ready', () => {
    const harness = createHarness();
    activate();

    harness.params[0].onTransportState('join_sent');
    expect(useRadioLiveStore.getState().phase).toBe('JOINING');

    harness.params[0].onTransportState('ready');
    harness.params[0].onForegroundServiceChange(true);
    expect(useRadioLiveStore.getState().phase).toBe('LISTENING');
    expect(useRadioLiveStore.getState().foregroundServiceActive).toBe(true);
  });

  it('tracks an incoming transmission and returns to LISTENING', () => {
    const harness = createHarness();
    activate();
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

  it('runs REQUESTING -> TRANSMITTING -> LISTENING on the same authority', async () => {
    const harness = createHarness();
    activate();
    harness.params[0].onTransportState('ready');

    const request = useRadioLiveStore.getState().requestTransmission();
    expect(useRadioLiveStore.getState().phase).toBe('REQUESTING');

    await request;
    expect(useRadioLiveStore.getState()).toMatchObject({
      phase: 'TRANSMITTING',
      currentTransmissionId: 'tx-local',
      operator: { id: 'user-1' },
    });
    expect(useRadioLiveStore.getState().transmissionStartedAt).toEqual(expect.any(Number));

    await useRadioLiveStore.getState().endTransmission();
    expect(harness.ends[0]).toHaveBeenCalledWith('tx-local');
    expect(useRadioLiveStore.getState()).toMatchObject({
      phase: 'LISTENING',
      currentTransmissionId: null,
      transmissionStartedAt: null,
    });
  });

  it('refuses to transmit while the channel has another owner', async () => {
    const harness = createHarness();
    activate();
    harness.params[0].onTransportState('ready');
    harness.params[0].onReceiving({
      transmissionId: 'tx-remote',
      operator: { id: 'user-2', name: 'C-3' },
    });

    await expect(useRadioLiveStore.getState().requestTransmission()).resolves.toEqual({
      ok: false,
      error: 'radio_not_ready',
    });
    expect(harness.requests[0]).not.toHaveBeenCalled();
    expect(useRadioLiveStore.getState().phase).toBe('RECEIVING');
  });

  it('lands on CHANNEL_BUSY when the backend denies the floor', async () => {
    const harness = createHarness();
    harness.nextRequestResult = {
      ok: false,
      error: 'channel_busy',
      transmitter: { id: 'user-9', name: 'Supervisor' },
    };
    activate();
    harness.params[0].onTransportState('ready');

    await useRadioLiveStore.getState().requestTransmission();
    expect(useRadioLiveStore.getState()).toMatchObject({
      phase: 'CHANNEL_BUSY',
      operator: { id: 'user-9' },
    });

    // Solo el backend libera el canal ocupado.
    harness.params[0].onTransmissionEnd({ transmissionId: 'tx-remote' });
    expect(useRadioLiveStore.getState().phase).toBe('LISTENING');
  });

  it('closes the local transmission when the backend revokes it', async () => {
    const harness = createHarness();
    activate();
    harness.params[0].onTransportState('ready');
    await useRadioLiveStore.getState().requestTransmission();

    harness.params[0].onCaptureLost('authority_lost');

    expect(useRadioLiveStore.getState()).toMatchObject({
      phase: 'LISTENING',
      currentTransmissionId: null,
      lastErrorCode: 'authority_lost',
    });
  });

  it('discards a floor grant that arrives after the channel changed', async () => {
    const harness = createHarness();
    let resolveRequest!: (value: RadioLiveTransmissionResult) => void;
    harness.factory.mockImplementationOnce((input: RadioLiveRuntimeParams) => {
      harness.params.push(input);
      const stop = jest.fn();
      harness.stops.push(stop);
      return {
        stop,
        endTransmission: jest.fn(async () => ({ ok: true })),
        requestTransmission: jest.fn(
          () => new Promise<RadioLiveTransmissionResult>((resolve) => {
            resolveRequest = resolve;
          })
        ),
      };
    });

    activate();
    harness.params[0].onTransportState('ready');
    const request = useRadioLiveStore.getState().requestTransmission();

    useRadioLiveStore.getState().activate({
      channelId: 'radio-directo',
      socket: socketA,
      userId: 'user-1',
      userName: 'Operador',
    });
    resolveRequest({ ok: true, transmissionId: 'late-tx' });

    await expect(request).resolves.toEqual({ ok: false, error: 'radio_request_stale' });
    expect(useRadioLiveStore.getState().phase).not.toBe('TRANSMITTING');
    expect(useRadioLiveStore.getState().channelId).toBe('radio-directo');
  });

  it('pauses for a call and reactivates afterwards', () => {
    const harness = createHarness();
    activate();
    useRadioLiveStore.getState().pause('call');
    expect(harness.stops[0]).toHaveBeenCalledTimes(1);
    expect(useRadioLiveStore.getState().phase).toBe('PAUSED_BY_CALL');

    activate();
    expect(harness.factory).toHaveBeenCalledTimes(2);
    expect(useRadioLiveStore.getState().phase).toBe('JOINING');
  });

  it('replaces the runtime when the shared socket instance changes', () => {
    const harness = createHarness();
    activate();
    useRadioLiveStore.getState().activate({
      channelId: 'radio-general',
      socket: socketB,
      userId: 'user-1',
      userName: 'Operador',
    });

    expect(harness.stops[0]).toHaveBeenCalledTimes(1);
    expect(harness.factory).toHaveBeenCalledTimes(2);
  });

  it('ignores callbacks from a replaced runtime', () => {
    const harness = createHarness();
    activate();
    const stale = harness.params[0];
    useRadioLiveStore.getState().activate({
      channelId: 'radio-general',
      socket: socketB,
      userId: 'user-1',
      userName: 'Operador',
    });

    stale.onReceiving({
      transmissionId: 'stale-tx',
      operator: { id: 'old-user', name: 'Viejo' },
    });
    expect(useRadioLiveStore.getState().currentTransmissionId).toBeNull();
  });

  it('cleans the runtime and diagnostics on logout/reset', () => {
    const harness = createHarness();
    activate();
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
