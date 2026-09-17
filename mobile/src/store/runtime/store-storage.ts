import {
  safeWebStorageGetItem,
  safeWebStorageRemoveItem,
  safeWebStorageSetItem,
  type WebStorageLike,
} from '../safe-web-storage';

export const STORE_STORAGE_TIMEOUT_MS = 1200;

type StoreStorageRuntimeDependencies = {
  getWebStorage: () => WebStorageLike | null;
  getNativeItem: (key: string) => Promise<string | null>;
  setNativeItem: (key: string, value: string) => Promise<void>;
  deleteNativeItem: (key: string) => Promise<void>;
  timeoutMs?: number;
};

type StoreStorageRuntime = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  deleteItem: (key: string) => Promise<void>;
};

async function withStorageTimeout<T>(
  task: Promise<T>,
  fallbackValue: T,
  timeoutMs: number
): Promise<T> {
  return await Promise.race([
    task,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallbackValue), timeoutMs)),
  ]);
}

export function createStoreStorageRuntime({
  getWebStorage,
  getNativeItem,
  setNativeItem,
  deleteNativeItem,
  timeoutMs = STORE_STORAGE_TIMEOUT_MS,
}: StoreStorageRuntimeDependencies): StoreStorageRuntime {
  return {
    async getItem(key) {
      const web = getWebStorage();
      if (web) {
        return safeWebStorageGetItem(web, key);
      }

      try {
        return await withStorageTimeout(getNativeItem(key), null, timeoutMs);
      } catch {
        return null;
      }
    },

    async setItem(key, value) {
      const web = getWebStorage();
      if (web) {
        safeWebStorageSetItem(web, key, value);
        return;
      }

      try {
        await withStorageTimeout(setNativeItem(key, value), undefined, timeoutMs);
      } catch {
        // Storage failures are intentionally non-fatal for the application runtime.
      }
    },

    async deleteItem(key) {
      const web = getWebStorage();
      if (web) {
        safeWebStorageRemoveItem(web, key);
        return;
      }

      try {
        await withStorageTimeout(deleteNativeItem(key), undefined, timeoutMs);
      } catch {
        // Storage failures are intentionally non-fatal for the application runtime.
      }
    },
  };
}
