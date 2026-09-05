import {
  setRadioLiveRuntimeFactory,
  useRadioLiveStore,
} from './radio-live-store';
import {
  initialRadioLiveState,
  projectNativeSnapshot,
  type RadioLiveRuntime,
  type RadioLiveState,
} from './radio-live-types';

type Harness = {
  runtime: RadioLiveRuntime;
  activations: unknown[];
  channels: string[];
  requests: number;
  ends: number;
  calls: boolean[];
  deactivations: number;
  emit: (state: Partial<RadioLiveState>) => void;
  subscribers: number;
};

function createHarness(): Harness {
  const listeners = new Set<(state: RadioLiveState) => void>();
  const harness: Partial<Harness> = {
    activations: [],
    channels: [],
    requests: 0,
    ends: 0,
    calls: [],
    deactivations: 0,
    subscribers: 0,
  };

  const runtime: RadioLiveRuntime = {
    async activate(input) {
      harness.activations!.push(input);
    },
    async selectChannel(channelId) {
      harness.channels!.push(channelId);
    },
    async requestTransmission() {
      harness.requests! += 1;
      return { ok: true };
    },
    async endTransmission() {
      harness.ends! += 1;
      return { ok: true };
    },
    async setCallActive(active) {
      harness.calls!.push(active);
    },
    async setSessionAuthState() {},
    async deactivate() {
      harness.deactivations! += 1;
    },
    subscribe(listener) {
      listeners.add(listener);
      harness.subscribers! += 1;
      return () => {
        listeners.delete(listener);
        harness.subscribers! -= 1;
      };
    },
    async readSnapshot() {
      return initialRadioLiveState();
    },
  };

  harness.runtime = runtime;
  harness.emit = (state) => {
    const next = { ...initialRadioLiveState(), authRevision: useRadioLiveStore.getState()._activationRevision, ...state };
    listeners.forEach((listener) => listener(next));
  };

  setRadioLiveRuntimeFactory(() => runtime);
  return harness as Harness;
}

const session = {
  channelId: 'radio-general',
  token: 'token-1',
  userId: 'user-1',
  userName: 'Operador',
  socketUrl: 'https://backend.test',
};

describe('radio live store projects the native session', () => {
  afterEach(() => {
    useRadioLiveStore.getState().reset();
    setRadioLiveRuntimeFactory(null);
  });

  it('activates the native session once per identity', () => {
    const harness = createHarness();
    useRadioLiveStore.getState().activate(session);
    useRadioLiveStore.getState().activate(session);

    expect(harness.activations).toHaveLength(1);
    expect(harness.subscribers).toBe(1);
  });

  it('treats a channel change as a command, not a reconnection', () => {
    const harness = createHarness();
    useRadioLiveStore.getState().activate(session);
    harness.emit({ phase: 'LISTENING', channelId: 'radio-general', connected: true });

    useRadioLiveStore.getState().activate({ ...session, channelId: 'radio-directo' });

    expect(harness.activations).toHaveLength(1);
    expect(harness.channels).toEqual(['radio-directo']);
  });

  it('reactivates when the operator identity changes', () => {
    const harness = createHarness();
    useRadioLiveStore.getState().activate(session);
    useRadioLiveStore.getState().activate({ ...session, userId: 'user-2', token: 'token-2' });

    expect(harness.activations).toHaveLength(2);
  });

  it('forwards a rotated token to the native runtime and ignores old credential snapshots', () => {
    const harness = createHarness();
    useRadioLiveStore.getState().activate(session);
    const oldRevision = useRadioLiveStore.getState()._activationRevision;
    harness.emit({ phase: 'RECONNECTING', lastErrorCode: 'radio_auth_refresh_required' });
    useRadioLiveStore.getState().activate({ ...session, token: 'token-rotated' });
    expect(harness.activations).toHaveLength(2);
    expect(harness.activations[1]).toMatchObject({ token: 'token-rotated', channelId: session.channelId });
    harness.emit({ phase: 'LISTENING', connected: true });
    harness.emit({ phase: 'UNAUTHORIZED', authRevision: oldRevision });
    expect(useRadioLiveStore.getState().phase).toBe('LISTENING');
  });

  it('never derives a phase of its own: it mirrors the native snapshot', () => {
    const harness = createHarness();
    useRadioLiveStore.getState().activate(session);

    harness.emit({
      phase: 'RECEIVING',
      channelId: 'radio-general',
      transmissionId: 'tx-remote',
      operator: { id: 'user-2', name: 'C-03' },
      connected: true,
    });

    expect(useRadioLiveStore.getState()).toMatchObject({
      phase: 'RECEIVING',
      transmissionId: 'tx-remote',
      operator: { id: 'user-2', name: 'C-03' },
    });

    harness.emit({ phase: 'CHANNEL_BUSY', channelId: 'radio-general', connected: true });
    expect(useRadioLiveStore.getState().phase).toBe('CHANNEL_BUSY');
  });

  it('forwards PTT commands without inventing a local phase', async () => {
    const harness = createHarness();
    useRadioLiveStore.getState().activate(session);
    harness.emit({ phase: 'LISTENING', channelId: 'radio-general', connected: true });

    await useRadioLiveStore.getState().requestTransmission();
    expect(harness.requests).toBe(1);
    expect(
      'la fase sigue siendo la del canal hasta que el backend concede el turno'
    ).toBeTruthy();
    expect(useRadioLiveStore.getState().phase).toBe('LISTENING');

    harness.emit({
      phase: 'TRANSMITTING',
      channelId: 'radio-general',
      transmissionId: 'tx-1',
      transmissionStartedAt: 1234,
      connected: true,
    });
    expect(useRadioLiveStore.getState().transmissionStartedAt).toBe(1234);

    await useRadioLiveStore.getState().endTransmission();
    expect(harness.ends).toBe(1);
  });

  it('hands the microphone to calls and takes it back', () => {
    const harness = createHarness();
    useRadioLiveStore.getState().activate(session);

    useRadioLiveStore.getState().setCallActive(true);
    useRadioLiveStore.getState().setCallActive(false);

    expect(harness.calls).toEqual([true, false]);
  });

  it('deactivates the native session and stops listening on logout', () => {
    const harness = createHarness();
    useRadioLiveStore.getState().activate(session);
    harness.emit({ phase: 'LISTENING', channelId: 'radio-general', connected: true });

    useRadioLiveStore.getState().reset();

    expect(harness.deactivations).toBe(1);
    expect(harness.subscribers).toBe(0);
    expect(useRadioLiveStore.getState()).toMatchObject(initialRadioLiveState());
  });

  it('refuses to activate an incomplete session', () => {
    const harness = createHarness();
    useRadioLiveStore.getState().activate({ ...session, token: '' });
    expect(harness.activations).toHaveLength(0);
  });
});

describe('native snapshot projection', () => {
  it('maps every field without reinterpreting it', () => {
    expect(
      projectNativeSnapshot({
        phase: 'TRANSMITTING',
        channelId: 'radio-general',
        transmissionId: 'tx-1',
        operatorId: 'user-1',
        operatorName: 'Operador',
        connected: true,
        errorCode: null,
        transmissionStartedAt: 42,
      })
    ).toEqual({
      authRevision: 0,
      phase: 'TRANSMITTING',
      channelId: 'radio-general',
      transmissionId: 'tx-1',
      operator: { id: 'user-1', name: 'Operador' },
      transmissionStartedAt: 42,
      connected: true,
      lastErrorCode: null,
    });
  });

  it('treats an absent operator as no operator', () => {
    const projected = projectNativeSnapshot({
      phase: 'LISTENING',
      channelId: 'radio-general',
      transmissionId: null,
      operatorId: null,
      operatorName: null,
      connected: true,
      errorCode: null,
    });

    expect(projected.operator).toBeNull();
    expect(projected.transmissionStartedAt).toBeNull();
  });
});
