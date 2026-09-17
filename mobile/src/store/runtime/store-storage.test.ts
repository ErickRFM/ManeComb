import { createStoreStorageRuntime, STORE_STORAGE_TIMEOUT_MS } from './store-storage';

describe('store storage runtime', () => {
  it('keeps the existing 1200ms storage timeout contract', () => {
    expect(STORE_STORAGE_TIMEOUT_MS).toBe(1200);
  });

  it('uses native storage when web storage is unavailable', async () => {
    const getNativeItem = jest.fn(async () => 'native-value');
    const setNativeItem = jest.fn(async () => undefined);
    const deleteNativeItem = jest.fn(async () => undefined);
    const runtime = createStoreStorageRuntime({
      getWebStorage: () => null,
      getNativeItem,
      setNativeItem,
      deleteNativeItem,
    });

    await expect(runtime.getItem('key')).resolves.toBe('native-value');
    await expect(runtime.setItem('key', 'value')).resolves.toBeUndefined();
    await expect(runtime.deleteItem('key')).resolves.toBeUndefined();

    expect(getNativeItem).toHaveBeenCalledWith('key');
    expect(setNativeItem).toHaveBeenCalledWith('key', 'value');
    expect(deleteNativeItem).toHaveBeenCalledWith('key');
  });

  it('fails closed without propagating native storage errors', async () => {
    const runtime = createStoreStorageRuntime({
      getWebStorage: () => null,
      getNativeItem: async () => {
        throw new Error('read failed');
      },
      setNativeItem: async () => {
        throw new Error('write failed');
      },
      deleteNativeItem: async () => {
        throw new Error('delete failed');
      },
    });

    await expect(runtime.getItem('key')).resolves.toBeNull();
    await expect(runtime.setItem('key', 'value')).resolves.toBeUndefined();
    await expect(runtime.deleteItem('key')).resolves.toBeUndefined();
  });

  it('uses safe web storage semantics without touching native storage', async () => {
    const getNativeItem = jest.fn(async () => 'native-value');
    const setNativeItem = jest.fn(async () => undefined);
    const deleteNativeItem = jest.fn(async () => undefined);
    const storage = {
      getItem: jest.fn(() => 'web-value'),
      setItem: jest.fn(() => undefined),
      removeItem: jest.fn(() => undefined),
    };
    const runtime = createStoreStorageRuntime({
      getWebStorage: () => storage,
      getNativeItem,
      setNativeItem,
      deleteNativeItem,
    });

    await expect(runtime.getItem('key')).resolves.toBe('web-value');
    await runtime.setItem('key', 'value');
    await runtime.deleteItem('key');

    expect(storage.getItem).toHaveBeenCalledWith('key');
    expect(storage.setItem).toHaveBeenCalledWith('key', 'value');
    expect(storage.removeItem).toHaveBeenCalledWith('key');
    expect(getNativeItem).not.toHaveBeenCalled();
    expect(setNativeItem).not.toHaveBeenCalled();
    expect(deleteNativeItem).not.toHaveBeenCalled();
  });

  it('returns timeout fallbacks when native storage never settles', async () => {
    const never = new Promise<never>(() => undefined);
    const runtime = createStoreStorageRuntime({
      getWebStorage: () => null,
      getNativeItem: () => never,
      setNativeItem: () => never,
      deleteNativeItem: () => never,
      timeoutMs: 1,
    });

    await expect(runtime.getItem('key')).resolves.toBeNull();
    await expect(runtime.setItem('key', 'value')).resolves.toBeUndefined();
    await expect(runtime.deleteItem('key')).resolves.toBeUndefined();
  });
});
