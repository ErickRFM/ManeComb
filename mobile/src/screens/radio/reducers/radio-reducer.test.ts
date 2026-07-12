import { getProgressBarFill } from '../utils/radio-format';
import { getRadioRealtimeErrorMessage } from '../services/radio-audio-service';
import { initialRadioSessionState, radioSessionReducer } from './radio-session-reducer';
import { RadioRealtimeService } from '../services/radio-realtime-service';

describe('radio state', () => {
  it('stores phase, authorization, operator and transmission in one session', () => {
    const joining = radioSessionReducer(initialRadioSessionState, {
      type: 'TRANSITION',
      phase: 'JOIN_SENT',
    });
    const ready = radioSessionReducer(joining, {
      type: 'TRANSITION',
      phase: 'READY',
      message: null,
    });
    const transmitting = radioSessionReducer(ready, {
      type: 'TRANSITION',
      phase: 'TRANSMITTING',
      operator: { id: 'operator-1', name: 'Pepe' },
      transmissionId: 'tx-1',
    });

    expect(joining.phase).toBe('JOIN_SENT');
    expect(ready.phase).toBe('READY');
    expect(transmitting).toMatchObject({
      phase: 'TRANSMITTING',
      transmissionId: 'tx-1',
      operator: { id: 'operator-1' },
    });
  });

  it('keeps REST and Socket radio history on the same merge path', () => {
    const fs = jest.requireActual('fs') as {
      readFileSync: (filePath: string, encoding: string) => string;
    };
    const rootStoreSource = fs.readFileSync(
      'src/store/root-store.ts',
      'utf8'
    );
    const radioScreenSource = fs.readFileSync(
      'src/screens/radio/radio-screen-view.tsx',
      'utf8'
    );

    expect(rootStoreSource).toContain(
      '[conversationId]: mergeConversationMessages(current, [message])'
    );
    expect(rootStoreSource).toMatch(
      /const messagesById = new Map\(current\.map\(\(message\) => \[message\.id, message\]\)\);[\s\S]*incoming\.forEach\(\(message\) => messagesById\.set\(message\.id, message\)\)/
    );
    expect(rootStoreSource).toContain('function joinCurrentConversationRooms');
    expect(rootStoreSource).toMatch(
      /if \(socket && socketSessionKey === nextSessionKey\) \{[\s\S]*joinCurrentConversationRooms\(get\);[\s\S]*return;/
    );
    expect(rootStoreSource).not.toContain('refreshMissingConversation');
    expect(radioScreenSource).toContain(
      'return byDate || right.message.id.localeCompare(left.message.id);'
    );
    expect(radioScreenSource).toContain('const ensureRadioHistoryLoaded = useCallback');
    expect(radioScreenSource).toContain('historyLoadInFlightRef.current.has(channelId)');
    expect(radioScreenSource).not.toContain('messagesByConversation[channelId] !== undefined');
    expect(radioScreenSource).toContain('bootstrappedRef.current = false;');
  });

  it('uses the shared socket and publishes READY only after radio:join ACK', async () => {
    const listeners = new Map<string, (...args: any[]) => void>();
    const managerListeners = new Map<string, (...args: any[]) => void>();
    const emitted: string[] = [];
    const states: string[] = [];
    const disconnect = jest.fn();
    const socket = {
      connected: true,
      disconnect,
      emit: jest.fn(),
      io: {
        on: (event: string, listener: (...args: any[]) => void) => managerListeners.set(event, listener),
        off: (event: string) => managerListeners.delete(event),
      },
      on: (event: string, listener: (...args: any[]) => void) => listeners.set(event, listener),
      off: (event: string) => listeners.delete(event),
      timeout: () => ({
        emit: (event: string, _payload: unknown, ack: (error: null, response: { ok: boolean }) => void) => {
          emitted.push(event);
          ack(null, { ok: true });
        },
      }),
    };
    const onStart = jest.fn();
    const service = new RadioRealtimeService({
      onEnd: jest.fn(),
      onError: jest.fn(),
      onFrame: jest.fn(),
      onStart,
      onStateChange: (state) => states.push(state),
    });

    service.connect(socket as any, 'channel-1');
    await Promise.resolve();
    await Promise.resolve();

    expect(states).toEqual(['connecting', 'join_sent', 'ready']);
    expect(emitted).toEqual(['radio:join']);
    expect(emitted).not.toContain('conversation:join');

    listeners.get('radio:start')?.({
      channelId: 'channel-2',
      startedAt: 1,
      transmissionId: 'tx-other',
      transmitter: { id: 'user-2', name: 'Otro' },
    });
    expect(onStart).not.toHaveBeenCalled();

    service.disconnect();
    expect(disconnect).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith('radio:leave', { channelId: 'channel-1' });
  });

  it('translates transport failures before they reach the operator', () => {
    expect(getRadioRealtimeErrorMessage('unauthorized')).toBe('Sesion expirada');
    expect(getRadioRealtimeErrorMessage('forbidden')).toBe('Sin permisos para transmitir');
    expect(getRadioRealtimeErrorMessage('transport close')).toBe('Error de conexion');
  });

  it('releases a late radio:start ACK after the active channel changes', async () => {
    const listeners = new Map<string, (...args: any[]) => void>();
    let resolveStart!: (error: null, ack: { ok: boolean; transmissionId: string }) => void;
    const emitted: Array<{ event: string; payload: any }> = [];
    const socket = {
      connected: true,
      emit: jest.fn(),
      io: { on: jest.fn(), off: jest.fn() },
      on: (event: string, listener: (...args: any[]) => void) => listeners.set(event, listener),
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
    const service = new RadioRealtimeService({
      onEnd: jest.fn(),
      onError: jest.fn(),
      onFrame: jest.fn(),
      onStart: jest.fn(),
      onStateChange: jest.fn(),
    });

    service.connect(socket as any, 'channel-1');
    await Promise.resolve();
    const request = service.requestTransmission();
    service.connect(socket as any, 'channel-2');
    await Promise.resolve();
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
    const service = new RadioRealtimeService({
      onEnd: jest.fn(),
      onError: jest.fn(),
      onFrame: jest.fn(),
      onStart: jest.fn(),
      onStateChange: jest.fn(),
    });

    service.connect(socket as any, 'channel-1');
    await Promise.resolve();

    await expect(service.requestTransmission()).resolves.toEqual({
      ok: true,
      transmissionId: 'tx-recovered',
    });
    expect(startAttempts).toBe(2);
  });

  it('retries radio:join once and never publishes READY before a successful ACK', async () => {
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
      onEnd: jest.fn(),
      onError: jest.fn(),
      onFrame: jest.fn(),
      onStart: jest.fn(),
      onStateChange: (state) => states.push(state),
    });

    service.connect(socket as any, 'channel-1');
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(joinAttempts).toBe(2);
    expect(states).toEqual(['connecting', 'join_sent', 'ready']);
  });

  it.each([0, 0.01, 0.125, 0.5, 0.731, 1])(
    'illuminates waveform bars in exact proportion to progress %s',
    (progress) => {
      const barCount = 18;
      const illuminatedArea = Array.from({ length: barCount }, (_, index) =>
        getProgressBarFill(progress, index, barCount)
      ).reduce((sum, fill) => sum + fill, 0);

      expect(illuminatedArea).toBeCloseTo(progress * barCount, 10);
    }
  );
});
