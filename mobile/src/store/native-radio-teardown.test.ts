import { create } from 'zustand';
import { setRadioLiveRuntimeFactory, useRadioLiveStore } from '@/src/features/radio-live/radio-live-store';
import { initialRadioLiveState, type RadioLiveRuntime, type RadioLiveState } from '@/src/features/radio-live/radio-live-types';

const mockRoot = create<any>()(() => ({}));
jest.mock('./root-store', () => ({
  useAppStore: mockRoot,
  getSharedRealtimeSocket: () => null,
}));
jest.mock('@/src/api/api-session-boundary', () => ({ installApiSessionBoundary: jest.fn() }));
jest.mock('@/src/utils/push-notifications', () => ({
  clearSessionNotifications: jest.fn(async () => {}),
  deleteNativePushToken: jest.fn(async () => {}),
}));
jest.mock('@/src/features/radio-live/radio-live-runtime', () => ({ createRadioLiveRuntime: jest.fn() }));

let native: RadioLiveRuntime;
let publish: (state: RadioLiveState) => void;
const identity = { token: 'test-access', user: { id: 'test-user' } };

beforeAll(() => { require('./use-app-store'); });
beforeEach(() => {
  mockRoot.setState({ ...identity, isSigningOut: false, isHydrated: true, isBootstrapping: false,
    isSubmitting: false, isLoadingConversation: false, isLoadingChatContacts: false }, true);
  native = {
    activate: jest.fn(async () => {}), deactivate: jest.fn(async () => {}),
    subscribe: (listener) => { publish = listener; return jest.fn(); },
    readSnapshot: async () => initialRadioLiveState(),
    selectChannel: jest.fn(async () => {}), setCallActive: jest.fn(async () => {}),
    setSessionAuthState: jest.fn(async () => {}),
    requestTransmission: jest.fn(async () => ({ ok: true })),
    endTransmission: jest.fn(async () => ({ ok: true })),
  };
  setRadioLiveRuntimeFactory(() => native);
  useRadioLiveStore.getState().activate({ ...identity, userId: 'test-user', userName: 'Test',
    channelId: 'test-general', socketUrl: 'https://backend.test' });
  publish({ ...initialRadioLiveState(), authRevision: useRadioLiveStore.getState()._activationRevision,
    phase: 'LISTENING', connected: true, channelId: 'test-general' });
});
afterEach(() => { useRadioLiveStore.getState().reset(); setRadioLiveRuntimeFactory(null); });

it('stops Radio synchronously when logout starts, before waiting for HTTP or unmounting an overlay', () => {
  mockRoot.setState({ isSigningOut: true });
  expect(native.deactivate).toHaveBeenCalledTimes(1);
  expect(useRadioLiveStore.getState().phase).toBe('IDLE');
  expect(useRadioLiveStore.getState()._sessionKey).toBeNull();
  mockRoot.setState({ token: null, user: null, isSigningOut: false });
  expect(native.deactivate).toHaveBeenCalledTimes(1);
});

it.each(['HTTP refresh rejected', 'account suspended', 'identity cleared'])(
  '%s cleans native Radio even when the authenticated React subtree is already absent', () => {
    const stalePublication = { ...useRadioLiveStore.getState() };
    mockRoot.setState({ token: null, user: null });
    expect(native.deactivate).toHaveBeenCalledTimes(1);
    expect(useRadioLiveStore.getState().connected).toBe(false);
    expect(useRadioLiveStore.getState()._runtime).toBeNull();
    publish(stalePublication);
    expect(useRadioLiveStore.getState().phase).toBe('IDLE');
  }
);

it('cleans an unauthenticated settled bootstrap without a mounted Radio overlay', () => {
  mockRoot.setState({ token: null, user: null, isHydrated: false, isBootstrapping: true }, true);
  (native.deactivate as jest.Mock).mockClear();
  // A native runtime may have outlived the React authority while bootstrap was pending.
  useRadioLiveStore.getState().activate({ token: 'test-old', userId: 'test-old', userName: 'Test',
    channelId: 'test-general', socketUrl: 'https://backend.test' });
  mockRoot.setState({ isHydrated: true, isBootstrapping: false });
  expect(native.deactivate).toHaveBeenCalledTimes(1);
  expect(useRadioLiveStore.getState()._runtime).toBeNull();
});

it.each(['token rotation', 'transient network', 'realtime terminal projection', 'unrelated render'])(
  '%s does not turn a live authenticated runtime into a logout', (scenario) => {
    const changes: Record<string, object> = {
      'token rotation': { token: 'test-rotated' },
      'transient network': { socketStatus: 'reconnecting', networkStatus: 'offline' },
      'realtime terminal projection': { socketStatus: 'unauthorized', realtimeAuthState: 'unauthorized' },
      'unrelated render': { isRefreshing: true },
    };
    mockRoot.setState(changes[scenario]);
    expect(native.deactivate).not.toHaveBeenCalled();
    // The existing Radio auth-state bridge, not this teardown observer, owns UNAUTHORIZED.
    expect(useRadioLiveStore.getState()._runtime).toBe(native);
  }
);

it('allows a new normal activation after cleanup and rejects queued publications from the old session', () => {
  const stale = { ...useRadioLiveStore.getState() };
  mockRoot.setState({ token: null, user: null });
  mockRoot.setState(identity);
  useRadioLiveStore.getState().activate({ token: 'test-new', userId: 'test-user', userName: 'Test',
    channelId: 'test-general', socketUrl: 'https://backend.test' });
  expect(native.activate).toHaveBeenCalledTimes(2);
  expect(useRadioLiveStore.getState()._activationRevision).toBeGreaterThan(stale.authRevision);
  publish(stale);
  expect(useRadioLiveStore.getState().phase).toBe('IDLE');
});
