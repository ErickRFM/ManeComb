import {
  RadioRealtimeService,
  setRadioRealtimeSuspended,
} from './radio-realtime-service';

type Listener = (...args: any[]) => void;

type MockSocket = {
  connected: boolean;
  on: jest.Mock<MockSocket, [string, Listener]>;
  off: jest.Mock<MockSocket, [string]>;
  emit: jest.Mock;
  timeout: jest.Mock;
  io: {
    on: jest.Mock<void, [string, Listener]>;
    off: jest.Mock<void, [string]>;
  };
  listeners: Map<string, Listener>;
};

function createSocket(): MockSocket {
  const listeners = new Map<string, Listener>();
  const managerListeners = new Map<string, Listener>();
  const socket = {} as MockSocket;

  socket.connected = true;
  socket.listeners = listeners;
  socket.on = jest.fn((event: string, listener: Listener): MockSocket => {
    listeners.set(event, listener);
    return socket;
  });
  socket.off = jest.fn((event: string): MockSocket => {
    listeners.delete(event);
    return socket;
  });
  socket.emit = jest.fn();
  socket.timeout = jest.fn(() => ({
    emit: jest.fn((event: string, _payload: unknown, ack: (error: unknown, value: unknown) => void) => {
      if (event === 'radio:join') {
        ack(null, { ok: true, channelId: 'radio-general' });
        return;
      }
      ack(null, { ok: true, transmissionId: 'tx-local' });
    }),
  }));
  socket.io = {
    on: jest.fn((event: string, listener: Listener): void => {
      managerListeners.set(event, listener);
    }),
    off: jest.fn((event: string): void => {
      managerListeners.delete(event);
    }),
  };

  return socket;
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('RadioRealtimeService external audio ownership', () => {
  afterEach(() => {
    setRadioRealtimeSuspended(false);
  });

  it('blocks transmission and incoming frames while a call owns audio, then rejoins', async () => {
    const socket = createSocket();
    const onStart = jest.fn();
    const onStateChange = jest.fn();
    const onError = jest.fn();
    const service = new RadioRealtimeService({
      onEnd: jest.fn(),
      onError,
      onFrame: jest.fn(),
      onStateChange,
      onStart,
    });

    service.connect(socket as any, 'radio-general');
    await flushPromises();
    expect(onStateChange).toHaveBeenCalledWith('ready');

    setRadioRealtimeSuspended(true);
    expect(onError).toHaveBeenCalledWith('Radio pausada durante la llamada.');
    expect(onStateChange).toHaveBeenCalledWith('offline');
    await expect(service.requestTransmission()).resolves.toEqual({
      ok: false,
      error: 'radio_paused_by_call',
    });

    socket.listeners.get('radio:start')?.({
      channelId: 'radio-general',
      startedAt: Date.now(),
      transmissionId: 'tx-remote',
      transmitter: { id: 'user-2', name: 'C-3' },
    });
    expect(onStart).not.toHaveBeenCalled();

    setRadioRealtimeSuspended(false);
    await flushPromises();
    expect(onStateChange).toHaveBeenLastCalledWith('ready');

    service.disconnect();
  });
});
