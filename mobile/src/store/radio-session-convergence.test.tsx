import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { AppState as NativeAppState, Platform, type AppStateStatus } from 'react-native';
import { io } from 'socket.io-client';
import { refreshAccessToken } from '@/src/api/client';
import { useAppStore } from './root-store';
import { RadioLiveOverlay } from '@/src/features/radio-live/radio-live-overlay';
import { setRadioLiveRuntimeFactory, useRadioLiveStore } from '@/src/features/radio-live/radio-live-store';
import { initialRadioLiveState, type RadioLiveActivation, type RadioLiveRuntime, type RadioLiveState } from '@/src/features/radio-live/radio-live-types';

let mockRecoveryConfig: any;
let mockCallPhase = 'IDLE';
let mockRadioSupported = true;
let mockNetwork: (snapshot: any) => void;
const mockUnsubscribe = jest.fn();
const mockOnline = { isConnected: true, isInternetReachable: true, type: 'wifi', expensive: false };

jest.mock('@/src/native/secure-store', () => ({
  getItemAsync: jest.fn(async () => null), setItemAsync: jest.fn(async () => {}), deleteItemAsync: jest.fn(async () => {}),
}));
jest.mock('@/src/native/haptics', () => ({}));
jest.mock('@/src/native/background-location', () => ({ hardResetBackgroundLocationServiceAsync: jest.fn(async () => {}) }));
jest.mock('@/src/utils/push-notifications', () => ({}));
jest.mock('@/src/api/offline-cache', () => ({
  loadOfflineCache: jest.fn(async () => null), loadPendingSyncQueue: jest.fn(async () => []),
  clearOfflineCache: jest.fn(async () => {}),
}));
jest.mock('@/src/api/mobile-runtime', () => ({
  mobileLog: jest.fn(), getMobileNetworkSnapshot: jest.fn(async () => mockOnline),
  refreshMobileNetworkSnapshot: jest.fn(async () => mockOnline),
  isNetworkReachable: (snapshot: any) => snapshot?.isConnected !== false,
  subscribeMobileNetwork: (callback: typeof mockNetwork) => { mockNetwork = callback; return mockUnsubscribe; },
}));
jest.mock('@/src/api/client', () => ({
  API_URL: 'https://backend.test/api', SOCKET_URL: 'https://backend.test',
  configureApiSessionRecovery: (config: any) => { mockRecoveryConfig = config; },
  refreshAccessToken: jest.fn(), setAuthToken: jest.fn(), healthRequest: jest.fn(async () => ({})),
  logoutRequest: jest.fn(async () => ({})),
}));
jest.mock('@/src/features/radio-live/radio-live-runtime', () => ({ get RADIO_LIVE_SUPPORTED() { return mockRadioSupported; }, createRadioLiveRuntime: jest.fn() }));
jest.mock('@/src/features/calls/call-store', () => ({ useCallStore: (selector: any) => selector({ phase: mockCallPhase }) }));
jest.mock('@/src/store/use-app-store', () => ({ useAppStore: jest.requireActual('./root-store').useAppStore }));
jest.mock('socket.io-client', () => ({ io: jest.fn(() => mockSocket()) }));

function mockSocket() {
  const listeners = new Map<string, (...args: any[]) => void>();
  const managerListeners = new Map<string, (...args: any[]) => void>();
  const transport = {
    connected: false, active: true, id: 'test-socket',
    on: jest.fn((name: string, handler: (...args: any[]) => void) => { listeners.set(name, handler); }),
    removeAllListeners: jest.fn(() => listeners.clear()),
    disconnect: jest.fn(() => { transport.connected = false; transport.active = false; }),
    connect: jest.fn(() => { transport.active = true; }),
    timeout: () => transport,
    emit: jest.fn((name: string, ...args: any[]) => {
      if (name === 'client:heartbeat') args.at(-1)(null, { ok: true });
    }),
    server: (name: string, payload?: unknown) => {
      if (name === 'connect') transport.connected = true;
      if (name === 'disconnect' || name === 'connect_error') transport.connected = false;
      listeners.get(name)?.(payload);
    },
    io: {
      on: jest.fn((name: string, handler: (...args: any[]) => void) => { managerListeners.set(name, handler); }),
      removeAllListeners: jest.fn(() => managerListeners.clear()),
      server: (name: string) => managerListeners.get(name)?.(),
    },
  };
  return transport;
}

const refreshed = { token: 'test-rotated', refreshToken: 'test-refresh-new', authContext: { canAccessMobile: true }, user: { id: 'test-user', name: 'Operador' } };
const currentSocket = () => (io as jest.Mock).mock.results.at(-1)!.value as ReturnType<typeof mockSocket>;
let tree: ReactTestRenderer | undefined;
let emitNative: (state: Partial<RadioLiveState>) => void;
let nativeRuntime: RadioLiveRuntime;
let activations: RadioLiveActivation[];
let foreground: (state: AppStateStatus) => void;
const mockRemoveForeground = jest.fn();
const originalAppState = Object.getOwnPropertyDescriptor(NativeAppState, 'currentState')!;
const settle = async () => { for (let index = 0; index < 20; index += 1) await Promise.resolve(); };

beforeEach(async () => {
  mockCallPhase = 'IDLE'; mockRadioSupported = true;
  jest.useFakeTimers();
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.replaceProperty(Platform, 'OS', 'android');
  Object.defineProperty(NativeAppState, 'currentState', { configurable: true, value: 'active' });
  jest.spyOn(NativeAppState, 'addEventListener').mockImplementation((_name, callback) => {
    foreground = callback;
    return { remove: mockRemoveForeground };
  });
  (refreshAccessToken as jest.Mock).mockReset().mockImplementation(async () => {
    await mockRecoveryConfig.onTokenRefresh(refreshed);
    return refreshed.token;
  });
  (io as jest.Mock).mockClear();
  activations = [];
  let listener: (state: RadioLiveState) => void = () => {};
  emitNative = (state) => listener({ ...initialRadioLiveState(), authRevision: activations.at(-1)?.authRevision || 0, channelId: 'general', ...state });
  nativeRuntime = {
    activate: jest.fn(async (input) => { activations.push(input); emitNative({ phase: 'JOINING' }); }),
    setSessionAuthState: jest.fn(async (state) => emitNative({
      phase: state === 'unauthorized' ? 'UNAUTHORIZED' : 'RECONNECTING',
      lastErrorCode: state === 'unauthorized' ? 'radio_unauthorized' : 'radio_auth_refresh_required',
    })),
    subscribe: (next) => { listener = next; return () => { listener = () => {}; }; },
    readSnapshot: async () => initialRadioLiveState(),
    deactivate: jest.fn(async () => {}), selectChannel: jest.fn(async () => {}),
    setCallActive: jest.fn(async () => {}), requestTransmission: jest.fn(async () => ({ ok: true })),
    endTransmission: jest.fn(async () => ({ ok: true })),
  };
  setRadioLiveRuntimeFactory(() => nativeRuntime);
  await useAppStore.getState().initialize();
  useAppStore.setState({
    token: 'test-access', refreshToken: 'test-refresh',
    user: refreshed.user as any, authContext: refreshed.authContext as any,
    realtimeAuthState: 'ready', isSigningOut: false,
    conversations: [{ id: 'general', channelMode: 'radio', kind: 'group', participants: [] }] as any,
    refreshAll: jest.fn(async () => {}), flushPendingSync: jest.fn(async () => {}),
  });
  await act(async () => {
    mockNetwork(mockOnline);
    tree = create(<RadioLiveOverlay />);
    await settle();
  });
});

afterEach(async () => {
  await act(async () => { tree?.unmount(); tree = undefined; useRadioLiveStore.getState().reset(); });
  await useAppStore.getState().signOut();
  setRadioLiveRuntimeFactory(null);
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
  Object.defineProperty(NativeAppState, 'currentState', originalAppState);
});

it('valid token connects both transports without refreshing or changing native identity', async () => {
  await act(async () => { currentSocket().server('connect'); emitNative({ phase: 'LISTENING', connected: true }); });
  expect(useAppStore.getState().socketStatus).toBe('connected');
  expect(useRadioLiveStore.getState().phase).toBe('LISTENING');
  expect(refreshAccessToken).not.toHaveBeenCalled();
  expect(activations).toHaveLength(1);
});

it('a pending logout cannot reactivate Radio while its old user and token are still present', async () => {
  await act(async () => { currentSocket().server('connect'); emitNative({ phase: 'LISTENING', connected: true }); });
  await act(async () => { useAppStore.setState({ isSigningOut: true }); await settle(); });
  expect(useRadioLiveStore.getState()._runtime).toBeNull();
  await act(async () => {
    useAppStore.setState({ token: 'test-stale-rotation', conversations: [...useAppStore.getState().conversations] });
    foreground('active'); mockNetwork(mockOnline); await settle();
  });
  expect(activations).toHaveLength(1);
  expect(useRadioLiveStore.getState()._runtime).toBeNull();
});

it('connect_error -> single refresh -> applyRefreshedSession -> overlay -> native activate with rotated token', async () => {
  const oldSocket = currentSocket();
  await act(async () => {
    oldSocket.server('connect_error', new Error('unauthorized'));
    emitNative({ phase: 'RECONNECTING', lastErrorCode: 'radio_auth_refresh_required' });
    await settle();
  });
  expect(refreshAccessToken).toHaveBeenCalledTimes(1);
  expect(oldSocket.disconnect).toHaveBeenCalled();
  expect(oldSocket.removeAllListeners).toHaveBeenCalled();
  expect(useAppStore.getState().token).toBe(refreshed.token);
  expect((io as jest.Mock).mock.calls.at(-1)[1].auth.token).toBe(refreshed.token);
  expect(activations).toHaveLength(2);
  expect(activations[1].token).toBe(refreshed.token);
  await act(async () => { currentSocket().server('connect'); emitNative({ phase: 'LISTENING', connected: true }); });
  expect(useAppStore.getState().socketStatus).toBe('connected');
  expect(useRadioLiveStore.getState().lastErrorCode).toBeNull();
});

it('native-only authentication rejection also invokes the same authority', async () => {
  await act(async () => {
    currentSocket().server('connect');
    emitNative({ phase: 'RECONNECTING', lastErrorCode: 'radio_auth_refresh_required' });
    await settle();
  });
  expect(refreshAccessToken).toHaveBeenCalledTimes(1);
  expect(activations[1].token).toBe(refreshed.token);
});

it('rejected refresh makes BOTH transports terminal and stops every reconnect producer', async () => {
  (refreshAccessToken as jest.Mock).mockRejectedValue({ isAxiosError: true, response: { status: 401 } });
  const oldSocket = currentSocket();
  await act(async () => { oldSocket.server('connect_error', new Error('unauthorized')); await settle(); });
  const connections = (io as jest.Mock).mock.calls.length;
  await act(async () => {
    oldSocket.io.server('reconnect_attempt');
    oldSocket.server('connect');
    mockNetwork(mockOnline); // even a queued NetInfo callback cannot resurrect it
    foreground('active');
    jest.advanceTimersByTime(180000);
    await settle();
  });
  expect(useAppStore.getState().socketStatus).toBe('unauthorized');
  expect(useRadioLiveStore.getState().phase).toBe('UNAUTHORIZED');
  expect(nativeRuntime.setSessionAuthState).toHaveBeenCalledWith('unauthorized');
  expect((io as jest.Mock).mock.calls).toHaveLength(connections);
  expect(refreshAccessToken).toHaveBeenCalledTimes(1);
  expect(mockUnsubscribe).toHaveBeenCalled();
  expect(mockRemoveForeground).toHaveBeenCalled();
});

it('does not loop when the refreshed token is rejected by Radio although the global socket connected', async () => {
  await act(async () => { currentSocket().server('connect_error', new Error('unauthorized')); await settle(); });
  await act(async () => {
    currentSocket().server('connect');
    // Namespace connect precedes the channel ACK; it cannot reset the budget.
    emitNative({ phase: 'JOINING', connected: true });
    await settle();
  });
  await act(async () => {
    currentSocket().server('connect');
    emitNative({ phase: 'RECONNECTING', lastErrorCode: 'radio_auth_refresh_required' });
    await settle();
  });
  expect(refreshAccessToken).toHaveBeenCalledTimes(1);
  expect(useAppStore.getState().socketStatus).toBe('unauthorized');
  expect(useRadioLiveStore.getState().phase).toBe('UNAUTHORIZED');
});

it.each(['PAUSED_BY_CALL', 'CHANNEL_BUSY', 'REQUESTING', 'ERROR', 'UNSUPPORTED'])(
  'accepted auth while Radio is %s permits a later independent expiry without false terminal', async phase => {
    await act(async () => { currentSocket().server('connect_error', new Error('unauthorized')); await settle(); });
    await act(async () => {
      if (phase === 'PAUSED_BY_CALL') mockCallPhase = 'CONNECTED';
      if (phase === 'UNSUPPORTED') mockRadioSupported = false;
      currentSocket().server('connect');
      emitNative({ phase: phase === 'UNSUPPORTED' ? 'IDLE' : phase as RadioLiveState['phase'], connected: true, lastErrorCode: phase === 'ERROR' ? 'forbidden' : null });
      await settle();
    });
    (refreshAccessToken as jest.Mock).mockImplementationOnce(async () => {
      await mockRecoveryConfig.onTokenRefresh({ ...refreshed, token: 'test-next-expiry', refreshToken: 'test-next-expiry-refresh' });
      return 'test-next-expiry';
    });
    await act(async () => { currentSocket().server('connect_error', new Error('unauthorized')); await settle(); });
    expect(refreshAccessToken).toHaveBeenCalledTimes(2);
    expect(useAppStore.getState().realtimeAuthState).toBe('ready');
  }
);

it.each(['temporary Internet loss', 'Wi-Fi to mobile data', 'backend/socket unavailable'])(
  '%s stays transient without expiring the session', async (scenario) => {
    await act(async () => {
      if (scenario === 'temporary Internet loss') {
        mockNetwork({ ...mockOnline, isConnected: false, isInternetReachable: false, type: 'none' });
        currentSocket().server('disconnect', 'transport close');
      }
      if (scenario === 'Wi-Fi to mobile data') {
        currentSocket().server('disconnect', 'transport close');
        mockNetwork({ ...mockOnline, type: 'cellular' });
      }
      currentSocket().server('connect_error', new Error('websocket error'));
      emitNative({ phase: 'RECONNECTING' });
    });
    expect(useAppStore.getState().socketStatus).toBe('reconnecting');
    expect(useRadioLiveStore.getState().phase).toBe('RECONNECTING');
    expect(refreshAccessToken).not.toHaveBeenCalled();
    expect(useAppStore.getState().networkStatus).toBe(scenario === 'temporary Internet loss' ? 'offline' : 'online');
    await act(async () => {
      mockNetwork({ ...mockOnline, type: 'cellular' });
      currentSocket().server('connect');
      emitNative({ phase: 'LISTENING', connected: true });
    });
    expect(useAppStore.getState().socketStatus).toBe('connected');
  }
);

it('missing refresh credentials cannot leave a resolved single-flight stuck forever', async () => {
  (refreshAccessToken as jest.Mock).mockResolvedValue(null);
  await act(async () => { currentSocket().server('connect_error', new Error('unauthorized')); await settle(); });
  expect(useAppStore.getState().realtimeAuthState).toBe('unauthorized');
  expect(useRadioLiveStore.getState().phase).toBe('UNAUTHORIZED');
  await useAppStore.getState().recoverRealtimeAuth('test-access');
  expect(refreshAccessToken).toHaveBeenCalledTimes(1);
});

it('ignores rejection from the old native revision after token rotation', async () => {
  const oldRevision = activations[0].authRevision;
  await act(async () => { currentSocket().server('connect_error', new Error('unauthorized')); await settle(); });
  await act(async () => {
    emitNative({ phase: 'RECONNECTING', authRevision: oldRevision, lastErrorCode: 'radio_auth_refresh_required' });
    currentSocket().server('connect');
    emitNative({ phase: 'RECEIVING', connected: true });
  });
  expect(useAppStore.getState().realtimeAuthState).toBe('ready');
  expect(refreshAccessToken).toHaveBeenCalledTimes(1);
});

it('foreground restarts stale shared transport without changing native credentials', async () => {
  const socket = currentSocket();
  await act(async () => { foreground('background'); foreground('active'); await settle(); });
  expect(socket.connect).toHaveBeenCalled();
  expect(activations).toHaveLength(1);
  expect(refreshAccessToken).not.toHaveBeenCalled();
});

it.each([429, 503, undefined])('refresh temporarily unavailable (%s) parks both sockets and respects cooldown', async (status) => {
  (refreshAccessToken as jest.Mock).mockRejectedValueOnce({ isAxiosError: true, response: status ? { status } : undefined });
  await act(async () => { currentSocket().server('connect_error', new Error('unauthorized')); await settle(); });
  expect(useAppStore.getState().socketStatus).toBe('reconnecting');
  expect(useRadioLiveStore.getState().phase).toBe('RECONNECTING');
  await act(async () => { mockNetwork(mockOnline); foreground('active'); await settle(); });
  expect(refreshAccessToken).toHaveBeenCalledTimes(1);
  await act(async () => { jest.advanceTimersByTime(30000); await settle(); });
  expect(refreshAccessToken).toHaveBeenCalledTimes(2);
  expect(activations.at(-1)?.token).toBe(refreshed.token);
});
