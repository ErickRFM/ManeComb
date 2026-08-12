import { Platform } from 'react-native';
import type { ThemeMode } from '@/constants/theme';
import * as SecureStore from '@/src/native/secure-store';
import {
  resolveWebStorage,
  safeWebStorageGetItem,
  safeWebStorageRemoveItem,
  safeWebStorageSetItem,
} from '@/src/store/safe-web-storage';

const LEGACY_THEME_KEY = 'combis-theme-mode';
const ACCOUNT_THEME_KEY_PREFIX = 'combis-theme-mode:account:';
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

async function getStoredItem(key: string) {
  const web = getWebStorage();
  if (web) return safeWebStorageGetItem(web, key);

  try {
    return await withStorageTimeout(SecureStore.getItemAsync(key), null);
  } catch {
    return null;
  }
}

async function setStoredItem(key: string, value: string) {
  const web = getWebStorage();
  if (web) return safeWebStorageSetItem(web, key, value);

  try {
    return await withStorageTimeout(
      SecureStore.setItemAsync(key, value).then(() => true),
      false
    );
  } catch {
    return false;
  }
}

async function deleteStoredItem(key: string) {
  const web = getWebStorage();
  if (web) return safeWebStorageRemoveItem(web, key);

  try {
    return await withStorageTimeout(
      SecureStore.deleteItemAsync(key).then(() => true),
      false
    );
  } catch {
    return false;
  }
}

function normalizeThemeMode(value: string | null): ThemeMode | null {
  return value === 'dark' || value === 'light' ? value : null;
}

export function getAccountThemeStorageKey(userId: string) {
  return `${ACCOUNT_THEME_KEY_PREFIX}${encodeURIComponent(String(userId || '').trim())}`;
}

export async function readAccountThemePreference(userId: string): Promise<ThemeMode | null> {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) return null;
  return normalizeThemeMode(await getStoredItem(getAccountThemeStorageKey(normalizedUserId)));
}

export async function writeAccountThemePreference(userId: string, mode: ThemeMode) {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) return false;
  return setStoredItem(getAccountThemeStorageKey(normalizedUserId), mode);
}

export async function clearLegacyThemePreference() {
  return deleteStoredItem(LEGACY_THEME_KEY);
}

export async function resolveAccountThemePreference(
  userId: string,
  options: { allowLegacyMigration?: boolean } = {}
): Promise<ThemeMode> {
  const scopedTheme = await readAccountThemePreference(userId);
  if (scopedTheme) return scopedTheme;

  if (options.allowLegacyMigration) {
    const legacyTheme = normalizeThemeMode(await getStoredItem(LEGACY_THEME_KEY));
    if (legacyTheme) {
      const migrated = await writeAccountThemePreference(userId, legacyTheme);
      if (migrated) await clearLegacyThemePreference();
      return legacyTheme;
    }
  }

  return 'light';
}
