export type WebStorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

type WindowStorageLike = {
  readonly localStorage: WebStorageLike;
};

export function resolveWebStorage(
  isWeb: boolean,
  windowObject?: WindowStorageLike | null
): WebStorageLike | null {
  if (!isWeb) return null;

  try {
    const source = windowObject ?? (typeof window !== 'undefined' ? window : null);
    return source?.localStorage ?? null;
  } catch {
    return null;
  }
}

export function safeWebStorageGetItem(storage: WebStorageLike, key: string) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function safeWebStorageSetItem(storage: WebStorageLike, key: string, value: string) {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function safeWebStorageRemoveItem(storage: WebStorageLike, key: string) {
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
