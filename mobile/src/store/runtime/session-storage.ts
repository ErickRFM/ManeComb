import type { ConnectionMode } from '@/src/types/app';

export const SESSION_STORAGE_KEYS = {
  token: 'combis-session-token',
  refreshToken: 'combis-refresh-token',
  mode: 'combis-session-mode',
} as const;

type SessionStoragePort = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  deleteItem: (key: string) => Promise<void>;
};

export function createSessionStorageRuntime(storage: SessionStoragePort) {
  return {
    getToken: () => storage.getItem(SESSION_STORAGE_KEYS.token),
    getRefreshToken: () => storage.getItem(SESSION_STORAGE_KEYS.refreshToken),
    getMode: () => storage.getItem(SESSION_STORAGE_KEYS.mode),

    async persistSession(
      token: string | null,
      mode: ConnectionMode | null,
      refreshToken?: string | null
    ) {
      if (!token || !mode) {
        await storage.deleteItem(SESSION_STORAGE_KEYS.token);
        await storage.deleteItem(SESSION_STORAGE_KEYS.refreshToken);
        await storage.deleteItem(SESSION_STORAGE_KEYS.mode);
        return;
      }

      await storage.setItem(SESSION_STORAGE_KEYS.token, token);
      await storage.setItem(SESSION_STORAGE_KEYS.mode, mode);

      if (refreshToken) {
        await storage.setItem(SESSION_STORAGE_KEYS.refreshToken, refreshToken);
      } else {
        await storage.deleteItem(SESSION_STORAGE_KEYS.refreshToken);
      }
    },
  };
}
