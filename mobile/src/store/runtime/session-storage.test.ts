import { createSessionStorageRuntime, SESSION_STORAGE_KEYS } from './session-storage';

describe('session storage runtime', () => {
  it('keeps the existing session credential keys stable', () => {
    expect(SESSION_STORAGE_KEYS).toEqual({
      token: 'combis-session-token',
      refreshToken: 'combis-refresh-token',
      mode: 'combis-session-mode',
    });
  });

  it('reads each persisted session field through the shared storage port', async () => {
    const getItem = jest.fn(async (key: string) => `value:${key}`);
    const runtime = createSessionStorageRuntime({
      getItem,
      setItem: jest.fn(async () => undefined),
      deleteItem: jest.fn(async () => undefined),
    });

    await expect(runtime.getToken()).resolves.toBe('value:combis-session-token');
    await expect(runtime.getRefreshToken()).resolves.toBe('value:combis-refresh-token');
    await expect(runtime.getMode()).resolves.toBe('value:combis-session-mode');

    expect(getItem.mock.calls).toEqual([
      ['combis-session-token'],
      ['combis-refresh-token'],
      ['combis-session-mode'],
    ]);
  });

  it('preserves persisted-session write ordering', async () => {
    const calls: string[] = [];
    const runtime = createSessionStorageRuntime({
      getItem: jest.fn(async () => null),
      setItem: jest.fn(async (key: string, value: string) => {
        calls.push(`set:${key}:${value}`);
      }),
      deleteItem: jest.fn(async (key: string) => {
        calls.push(`delete:${key}`);
      }),
    });

    await runtime.persistSession('token-1', 'online', 'refresh-1');

    expect(calls).toEqual([
      'set:combis-session-token:token-1',
      'set:combis-session-mode:online',
      'set:combis-refresh-token:refresh-1',
    ]);
  });

  it('removes only the refresh token when persisting without one', async () => {
    const calls: string[] = [];
    const runtime = createSessionStorageRuntime({
      getItem: jest.fn(async () => null),
      setItem: jest.fn(async (key: string, value: string) => {
        calls.push(`set:${key}:${value}`);
      }),
      deleteItem: jest.fn(async (key: string) => {
        calls.push(`delete:${key}`);
      }),
    });

    await runtime.persistSession('token-1', 'local', null);

    expect(calls).toEqual([
      'set:combis-session-token:token-1',
      'set:combis-session-mode:local',
      'delete:combis-refresh-token',
    ]);
  });

  it('clears token, refresh token, and mode in the current teardown order', async () => {
    const calls: string[] = [];
    const runtime = createSessionStorageRuntime({
      getItem: jest.fn(async () => null),
      setItem: jest.fn(async () => undefined),
      deleteItem: jest.fn(async (key: string) => {
        calls.push(key);
      }),
    });

    await runtime.persistSession(null, null);

    expect(calls).toEqual([
      'combis-session-token',
      'combis-refresh-token',
      'combis-session-mode',
    ]);
  });
});
