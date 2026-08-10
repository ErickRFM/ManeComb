import {
  resolveWebStorage,
  safeWebStorageGetItem,
  safeWebStorageRemoveItem,
  safeWebStorageSetItem,
  type WebStorageLike,
} from './safe-web-storage';

function memoryStorage(): WebStorageLike {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

describe('safe web storage', () => {
  it('returns null when the localStorage getter is blocked', () => {
    const restrictedWindow = Object.defineProperty({}, 'localStorage', {
      get() {
        throw new Error('SecurityError');
      },
    });

    expect(resolveWebStorage(true, restrictedWindow as never)).toBeNull();
  });

  it('does not access browser storage outside web mode', () => {
    const restrictedWindow = Object.defineProperty({}, 'localStorage', {
      get() {
        throw new Error('should not be read');
      },
    });

    expect(resolveWebStorage(false, restrictedWindow as never)).toBeNull();
  });

  it('reads writes and deletes normal storage', () => {
    const storage = memoryStorage();
    expect(safeWebStorageSetItem(storage, 'token', 'abc')).toBe(true);
    expect(safeWebStorageGetItem(storage, 'token')).toBe('abc');
    expect(safeWebStorageRemoveItem(storage, 'token')).toBe(true);
    expect(safeWebStorageGetItem(storage, 'token')).toBeNull();
  });

  it('fails closed when individual storage operations throw', () => {
    const restrictedStorage: WebStorageLike = {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('QuotaExceededError'); },
      removeItem: () => { throw new Error('SecurityError'); },
    };

    expect(safeWebStorageGetItem(restrictedStorage, 'token')).toBeNull();
    expect(safeWebStorageSetItem(restrictedStorage, 'token', 'abc')).toBe(false);
    expect(safeWebStorageRemoveItem(restrictedStorage, 'token')).toBe(false);
  });
});
