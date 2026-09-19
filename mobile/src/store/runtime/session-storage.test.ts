import { createSessionStorageRuntime, SESSION_STORAGE_KEYS } from './session-storage';

describe('session storage runtime', () => {
  it('keeps existing credential keys stable', () => {
    expect(SESSION_STORAGE_KEYS).toEqual({
      token: 'combis-session-token',
      refreshToken: 'combis-refresh-token',
      mode: 'combis-session-mode',
    });
  });

  it('reads through the injected storage authority', async () => {
    const getItem = jest.fn(async (key: string) => `value:${key}`);
    const runtime = createSessionStorageRuntime({
      getItem,
      setItem: jest.fn(async () => undefined),
      deleteItem: jest.fn(async () => undefined),
    });

    await expect(runtime.getToken()).resolves.toBe('value:combis-session-token');
    await expect(runtime.getRefreshToken()).resolves.toBe('value:combis-refresh-token');
    await expect(runtime.getMode()).resolves.toBe('value:combis-session-mode');
  });

  it('preserves write and teardown ordering', async () => {
    const calls: string[] = [];
    const runtime = createSessionStorageRuntime({
      getItem: jest.fn(async () => null),
      setItem: jest.fn(async (key: string, value: string) => calls.push(`set:${key}:${value}`) as never),
      deleteItem: jest.fn(async (key: string) => calls.push(`delete:${key}`) as never),
    });

    await runtime.persistSession('token-1', 'online', 'refresh-1');
    expect(calls).toEqual([
      'set:combis-session-token:token-1',
      'set:combis-session-mode:online',
      'set:combis-refresh-token:refresh-1',
    ]);

    calls.length = 0;
    await runtime.persistSession(null, null);
    expect(calls).toEqual([
      'delete:combis-session-token',
      'delete:combis-refresh-token',
      'delete:combis-session-mode',
    ]);
  });
});
