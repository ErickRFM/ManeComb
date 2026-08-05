import { runCallNotificationAction } from './call-action-headless-task';

function fakeSocket(ack: { ok?: boolean; code?: string } = { ok: true }) {
  const handlers = new Map<string, (...args: any[]) => void>();
  const socket = {
    emitted: [] as Array<{ event: string; payload: unknown }>,
    disconnected: false,
    once(event: string, handler: (...args: any[]) => void) {
      handlers.set(event, handler);
      if (event === 'connect') queueMicrotask(handler);
      return socket;
    },
    emit(event: string, payload: unknown, callback?: (value: unknown) => void) {
      socket.emitted.push({ event, payload });
      callback?.(ack);
      return socket;
    },
    disconnect() {
      socket.disconnected = true;
      return socket;
    },
  };
  return socket;
}

describe('call notification action', () => {
  it('rechaza con el token seguro y cierra el socket temporal', async () => {
    const socket = fakeSocket();
    const result = await runCallNotificationAction(
      { callId: 'call-1', action: 'reject' },
      {
        getToken: async () => 'jwt-session',
        createSocket: (token) => {
          expect(token).toBe('jwt-session');
          return socket as any;
        },
        timeoutMs: 1000,
      }
    );

    expect(result).toEqual({ ok: true });
    expect(socket.emitted).toEqual([
      { event: 'rtc:reject', payload: { callId: 'call-1' } },
    ]);
    expect(socket.disconnected).toBe(true);
  });

  it('falla cerrado sin sesion o para acciones no admitidas', async () => {
    await expect(runCallNotificationAction(
      { callId: 'call-1', action: 'reject' },
      { getToken: async () => null }
    )).resolves.toEqual({ ok: false, code: 'no_session' });

    await expect(runCallNotificationAction(
      { callId: 'call-1', action: 'accept' },
      { getToken: async () => 'token' }
    )).resolves.toEqual({ ok: false, code: 'invalid_action' });
  });
});
