import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ThemeMode } from '@/constants/theme';

const THEME_PREFERENCE_PREFIX = 'combis-theme-mode:user:';

export const DEFAULT_THEME_MODE: ThemeMode = 'light';

export type ThemePreferenceOwner = {
  userId: string | null | undefined;
  organizationId?: string | null;
};

function normalizeIdentityPart(value: string | null | undefined) {
  return String(value || '').trim();
}

export function getThemePreferenceScope(owner: ThemePreferenceOwner) {
  const userId = normalizeIdentityPart(owner.userId);
  if (!userId) return null;

  const organizationId = normalizeIdentityPart(owner.organizationId) || 'no-org';
  return `${organizationId}:${userId}`;
}

export function getThemePreferenceKey(owner: ThemePreferenceOwner) {
  const scope = getThemePreferenceScope(owner);
  return scope ? `${THEME_PREFERENCE_PREFIX}${scope}` : null;
}

export function normalizeThemeMode(value: unknown): ThemeMode {
  return value === 'dark' ? 'dark' : DEFAULT_THEME_MODE;
}

export async function loadThemePreference(owner: ThemePreferenceOwner): Promise<ThemeMode> {
  const key = getThemePreferenceKey(owner);
  if (!key) return DEFAULT_THEME_MODE;

  try {
    return normalizeThemeMode(await AsyncStorage.getItem(key));
  } catch {
    return DEFAULT_THEME_MODE;
  }
}

export async function saveThemePreference(
  owner: ThemePreferenceOwner,
  mode: ThemeMode
): Promise<void> {
  const key = getThemePreferenceKey(owner);
  if (!key) return;

  try {
    await AsyncStorage.setItem(key, normalizeThemeMode(mode));
  } catch {
    // Appearance is non-critical. A storage failure must not block the session.
  }
}
