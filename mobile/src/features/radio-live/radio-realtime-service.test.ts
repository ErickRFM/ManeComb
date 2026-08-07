import { RadioRealtimeService } from './radio-realtime-service';
import { getRadioRealtimeErrorMessage } from './radio-live-errors';

type Listener = (...args: any[]) => void;

function createHandlers() {
  return {
    onEnd: jest.fn(),
    onError: jest.fn(),
    onFrame: jest.fn(),
    onStart: jest.fn(),
    onStateChange: jest.fn(),
  };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('RadioRealtimeService transport', () => {
  it('uses the shared socket and publishes ready only after the radio:join ACK', async () => {
    const listeners = new Map<string, Listener>();
    const managerListeners = new Map<string, Listener>();
    const emitted: string[] = [];
    const states: string[] = [];
    const disconnect = jest.fn();
    const socket = {
      connected: true,
      disconnect,
      emit: jest.fn(),
      io: {
        on: (event: string, listener: Listener) => managerListeners.set(event, listener),
        off: (event: string) => managerListeners.delete(event),
      },
      on: (event: string, listener: Listener) => listeners.set(event, listener),
      off: (event: string) => listeners.delete(event),
      timeout: () => ({
        emit: (event: string, _payload: unknown, ack: (error: null, response: { ok: boolean }) => void) => {
          emitted.push(event);
          ack(null, { ok: true });
        },
      }),
    };
    const handlers = createHandlers();
    const service = new RadioRealtimeService({
      ...handlers,
      onStateChange: (state) => states.push(state),
    });

    service.connect(socket as any, 'channel-1');
    await flushPromises();

    expect(states).toEqual(['connecting', 'join_sent', 'ready']);
    expect(emitted).toEqual(['radio:join']);
    expect(emitted).not.toContain('conversation:join');

    // Un evento de otro canal nunca alcanza al consumidor.
    listeners.get('radio:start')?.({
      channelId: 'channel-2',
      startedAt: 1,
      transmissionId: 'tx-other',
      transmitter: { id: 'user-2', name: 'Otro' },
    });
    expect(handlers.onStart).not.toHaveBeenCalled();

    listeners.get('radio:start')?.({
      channelId: 'channel-1',
      startedAt: 1,
      transmissionId: 'tx-mine',
      transmitter: { id: 'user-2', name: 'Otro' },
    });
    expect(handlers.onStart).toHaveBeenCalledTimes(1);

    // Abandona la sala sin desconectar el socket global compartido.
    service.disconnect();
    expect(disconnect).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith('radio:leave', { channelId: 'channel-1' });
    expect(listeners.size).toBe(0);
  });

  it('releases a late radio:start ACK after the active channel changes', async () => {
    const listeners = new Map<string, Listener>();
    let resolveStart!: (error: null, ack: { ok: boolean; transmissionId: string }) => void;
    const emitted: Array<{ event: string; payload: any }> = [];
    const socket = {
      connected: true,
      emit: jest.fn(),
      io: { on: jest.fn(), off: jest.fn() },
      on: (event: string, listener: Listener) => listeners.set(event, listener),
      off: (event: string) => listeners.delete(event),
      timeout: () => ({
        emit: (event: string, payload: any, ack: (error: null, response: any) => void) => {
          emitted.push({ event, payload });
          if (event === 'radio:start') {
            resolveStart = ack;
            return;
          }
          ack(null, { ok: true });
        },
      }),
    };
    const service = new RadioRealtimeService(createHandlers());

    service.connect(socket as any, 'channel-1');
    await flushPromises();
    const request = service.requestTransmission();
    service.connect(socket as any, 'channel-2');
    await flushPromises();
    expect(resolveStart).toBeDefined();
    resolveStart(null, { ok: true, transmissionId: 'late-tx' });

    await expect(request).resolves.toEqual({ ok: false, error: 'radio_request_stale' });
    expect(emitted).toContainEqual({
      event: 'radio:end',
      payload: { channelId: 'channel-1', transmissionId: 'late-tx' },
    });
  });

  it('retries radio:start once when only its ACK times out', async () => {
    let startAttempts = 0;
    const socket = {
      connected: true,
      emit: jest.fn(),
      io: { on: jest.fn(), off: jest.fn() },
      on: jest.fn(),
      off: jest.fn(),
      timeout: () => ({
        emit: (event: string, _payload: any, ack: (error: unknown, response?: any) => void) => {
          if (event === 'radio:join') {
            ack(null, { ok: true });
            return;
          }
          if (event === 'radio:start') {
            startAttempts += 1;
            if (startAttempts === 1) ack(new Error('timeout'));
            else ack(null, { ok: true, transmissionId: 'tx-recovered' });
          }
        },
      }),
    };
    const service = new RadioRealtimeService(createHandlers());

    service.connect(socket as any, 'channel-1');
    await flushPromises();

    await expect(service.requestTransmission()).resolves.toEqual({
      ok: true,
      transmissionId: 'tx-recovered',
    });
    expect(startAttempts).toBe(2);
  });

  it('retries radio:join once and never publishes ready before a successful ACK', async () => {
    let joinAttempts = 0;
    const states: string[] = [];
    const socket = {
      connected: true,
      emit: jest.fn(),
      io: { on: jest.fn(), off: jest.fn() },
      on: jest.fn(),
      off: jest.fn(),
      timeout: () => ({
        emit: (event: string, _payload: any, ack: (error: unknown, response?: any) => void) => {
          if (event !== 'radio:join') return;
          joinAttempts += 1;
          if (joinAttempts === 1) ack(new Error('timeout'));
          else ack(null, { ok: true });
        },
      }),
    };
    const service = new RadioRealtimeService({
      ...createHandlers(),
      onStateChange: (state) => states.push(state),
    });

    service.connect(socket as any, 'channel-1');
    await flushPromises();

    expect(joinAttempts).toBe(2);
    expect(states).toEqual(['connecting', 'join_sent', 'ready']);
  });

  it('treats radio:end as idempotent when the transmission is already closed', async () => {
    const socket = {
      connected: true,
      emit: jest.fn(),
      io: { on: jest.fn(), off: jest.fn() },
      on: jest.fn(),
      off: jest.fn(),
      timeout: () => ({
        emit: (event: string, _payload: any, ack: (error: unknown, response?: any) => void) => {
          if (event === 'radio:join') ack(null, { ok: true });
          else ack(null, { ok: false, error: 'transmission_not_active' });
        },
      }),
    };
    const service = new RadioRealtimeService(createHandlers());

    service.connect(socket as any, 'channel-1');
    await flushPromises();

    await expect(service.endTransmission('tx-1')).resolves.toEqual({ ok: true });
  });

  it('rejects frames that are not canonical 20 ms PCM16', async () => {
    const socket = {
      connected: true,
      emit: jest.fn(),
      io: { on: jest.fn(), off: jest.fn() },
      on: jest.fn(),
      off: jest.fn(),
      timeout: () => ({
        emit: (_event: string, _payload: any, ack: (error: unknown, response?: any) => void) =>
          ack(null, { ok: true }),
      }),
    };
    const service = new RadioRealtimeService(createHandlers());
    service.connect(socket as any, 'channel-1');
    await flushPromises();

    const valid = { data: 'x'.repeat(856), sequence: 0, sentAt: Date.now(), transmissionId: 'tx-1' };
    expect(service.sendFrame({ ...valid, data: 'x'.repeat(100) })).toBe(false);
    expect(service.sendFrame({ ...valid, sequence: -1 })).toBe(false);
    expect(service.sendFrame({ ...valid, sentAt: Number.NaN })).toBe(false);
    expect(service.sendFrame(valid)).toBe(true);
  });

  it('translates transport failures before they reach the operator', () => {
    expect(getRadioRealtimeErrorMessage('unauthorized')).toBe('Sesion expirada');
    expect(getRadioRealtimeErrorMessage('forbidden')).toBe('Sin permisos para transmitir');
    expect(getRadioRealtimeErrorMessage('transport close')).toBe('Error de conexion');
  });
});
