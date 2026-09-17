import * as SecureStore from '@/src/native/secure-store';
import { Platform } from 'react-native';
import {
  resolveWebStorage,
  safeWebStorageGetItem,
  safeWebStorageRemoveItem,
  safeWebStorageSetItem,
} from '@shared/browser-session/safe-web-storage';

const STORAGE_TIMEOUT_MS = 1200;

function getWebStorage() {
  return resolveWebStorage(Platform.OS === 'web');
}

async function withStorageTimeout<T>(task: Promise<T>, fallbackValue: T) {
  return await Promise.race([
    task,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallbackValue), STORAGE_TIMEOUT_MS)),
  ]);
}

export async function getStoredItem(key: string) {
  const web = getWebStorage();
  if (web) return safeWebStorageGetItem(web, key);

  try {
    return await withStorageTimeout(SecureStore.getItemAsync(key), null);
  } catch {
    return null;
  }
}

export async function setStoredItem(key: string, value: string) {
  const web = getWebStorage();
  if (web) {
    safeWebStorageSetItem(web, key, value);
    return;
  }

  try {
    await withStorageTimeout(SecureStore.setItemAsync(key, value), undefined);
  } catch {
    // Storage is best-effort; session authority remains in memory.
  }
}

export async function deleteStoredItem(key: string) {
  const web = getWebStorage();
  if (web) {
    safeWebStorageRemoveItem(web, key);
    return;
  }

  try {
    await withStorageTimeout(SecureStore.deleteItemAsync(key), undefined);
  } catch {
    // Storage is best-effort; caller already owns the in-memory transition.
  }
}
