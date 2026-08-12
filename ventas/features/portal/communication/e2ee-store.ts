import { create } from 'zustand';
import {
  buildDirectChatMessagePayload,
  decryptDirectChatText,
  decryptStoredChatKeyPairBackup,
  encryptStoredChatKeyPairBackup,
  generateE2eeDeviceId,
  generateStoredChatKeyPair,
  isDirectChatEncryptionActive,
  type CommunicationConversation,
  type CommunicationMessage,
  type EncryptedChatKeyBackup,
  type StoredChatKeyPair,
} from '@shared/communication';
import {
  getPortalE2eeBackup,
  putPortalE2eeBackup,
  setPortalE2eePublicKey,
} from './api';

const VAULT_DB = 'manecomb-communication-v1';
const VAULT_STORE = 'e2ee-vault';

type VaultRecord = {
  userId: string;
  publicKey: string;
  wrappingKey: CryptoKey;
  iv: Uint8Array;
  ciphertext: ArrayBuffer;
};

type E2eeStatus =
  | 'idle'
  | 'ready'
  | 'setup_required'
  | 'restore_required'
  | 'working'
  | 'unavailable'
  | 'error';

type PortalE2eeState = {
  status: E2eeStatus;
  userId: string | null;
  serverPublicKey: string | null;
  keyPair: StoredChatKeyPair | null;
  error: string | null;
  initialize(input: { userId: string; e2eePublicKey?: string | null }): Promise<void>;
  setup(password: string): Promise<{ ok: boolean; message?: string }>;
  restore(password: string): Promise<{ ok: boolean; message?: string }>;
  reset(): void;
  buildMessagePayload(input: {
    text: string;
    currentUserId: string;
    conversation: CommunicationConversation;
  }): { text?: string; textPreview?: string; e2eeEnvelope?: any };
  decryptMessage(input: {
    message: CommunicationMessage;
    currentUserId: string;
    conversation: CommunicationConversation;
  }): string;
};

function openVaultDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB || !globalThis.crypto?.subtle) {
      reject(new Error('El navegador no ofrece almacenamiento criptográfico seguro.'));
      return;
    }
    const request = indexedDB.open(VAULT_DB, 1);
    request.onerror = () => reject(request.error || new Error('No fue posible abrir el almacén cifrado.'));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(VAULT_STORE)) db.createObjectStore(VAULT_STORE, { keyPath: 'userId' });
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function readVaultRecord(userId: string): Promise<VaultRecord | null> {
  const db = await openVaultDb();
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(VAULT_STORE, 'readonly');
    const request = tx.objectStore(VAULT_STORE).get(userId);
    request.onerror = () => reject(request.error || new Error('No fue posible leer la llave local.'));
    request.onsuccess = () => resolve((request.result as VaultRecord | undefined) || null);
    tx.oncomplete = () => db.close();
  });
}

async function saveVaultKeyPair(userId: string, keyPair: StoredChatKeyPair) {
  const wrappingKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    wrappingKey,
    new TextEncoder().encode(JSON.stringify(keyPair))
  );
  const db = await openVaultDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(VAULT_STORE, 'readwrite');
    tx.objectStore(VAULT_STORE).put({ userId, publicKey: keyPair.publicKey, wrappingKey, iv, ciphertext } satisfies VaultRecord);
    tx.onerror = () => reject(tx.error || new Error('No fue posible guardar la llave local.'));
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
  });
}

async function decryptVaultRecord(record: VaultRecord): Promise<StoredChatKeyPair> {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: record.iv },
    record.wrappingKey,
    record.ciphertext
  );
  const parsed = JSON.parse(new TextDecoder().decode(plaintext)) as StoredChatKeyPair;
  if (!parsed?.publicKey || !parsed?.secretKey || parsed.publicKey !== record.publicKey) {
    throw new Error('La llave local de Comunicación no es válida.');
  }
  return parsed;
}

function parseBackupCipher(value: string): EncryptedChatKeyBackup {
  const parsed = JSON.parse(String(value || '')) as EncryptedChatKeyBackup;
  if (!parsed?.publicKey || !parsed?.ciphertext || !parsed?.nonce || !parsed?.salt) {
    throw new Error('El respaldo E2EE está incompleto.');
  }
  return parsed;
}

function readableError(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export const usePortalE2eeStore = create<PortalE2eeState>((set, get) => ({
  status: 'idle',
  userId: null,
  serverPublicKey: null,
  keyPair: null,
  error: null,

  initialize: async ({ userId, e2eePublicKey }) => {
    const serverPublicKey = String(e2eePublicKey || '').trim() || null;
    set({ status: 'working', userId, serverPublicKey, keyPair: null, error: null });
    try {
      const record = await readVaultRecord(userId);
      if (record) {
        const keyPair = await decryptVaultRecord(record);
        if (!serverPublicKey || keyPair.publicKey === serverPublicKey) {
          set({ status: 'ready', keyPair, serverPublicKey: serverPublicKey || keyPair.publicKey });
          return;
        }
      }
      set({ status: serverPublicKey ? 'restore_required' : 'setup_required', keyPair: null });
    } catch (error) {
      if (!globalThis.indexedDB || !globalThis.crypto?.subtle) {
        set({ status: 'unavailable', error: readableError(error, 'Cifrado no disponible.') });
        return;
      }
      set({ status: serverPublicKey ? 'restore_required' : 'setup_required', keyPair: null, error: null });
    }
  },

  setup: async (password) => {
    const userId = get().userId;
    if (!userId || !password) return { ok: false, message: 'Escribe tu contraseña.' };
    if (get().serverPublicKey) return { ok: false, message: 'Esta cuenta ya tiene una llave E2EE. Restáurala.' };
    set({ status: 'working', error: null });
    try {
      const keyPair = generateStoredChatKeyPair();
      const deviceId = generateE2eeDeviceId();
      const backup = await encryptStoredChatKeyPairBackup({ keyPair, userId, password, deviceId });
      await putPortalE2eeBackup({
        deviceId,
        publicKey: keyPair.publicKey,
        backupCipher: JSON.stringify(backup),
        backupVersion: backup.version,
        platform: 'web',
        label: 'Portal Web',
      });
      await setPortalE2eePublicKey(keyPair.publicKey);
      await saveVaultKeyPair(userId, keyPair);
      set({ status: 'ready', keyPair, serverPublicKey: keyPair.publicKey, error: null });
      return { ok: true };
    } catch (error) {
      const message = readableError(error, 'No fue posible habilitar el cifrado.');
      set({ status: 'setup_required', error: message });
      return { ok: false, message };
    }
  },

  restore: async (password) => {
    const userId = get().userId;
    const expectedPublicKey = get().serverPublicKey;
    if (!userId || !expectedPublicKey || !password) return { ok: false, message: 'Escribe tu contraseña.' };
    set({ status: 'working', error: null });
    try {
      const record = await getPortalE2eeBackup();
      if (!record?.backupCipher) throw new Error('No existe un respaldo E2EE para restaurar.');
      const backup = parseBackupCipher(record.backupCipher);
      const keyPair = await decryptStoredChatKeyPairBackup({ backup, userId, password });
      if (keyPair.publicKey !== expectedPublicKey || record.publicKey !== expectedPublicKey) {
        throw new Error('El respaldo no corresponde a la llave activa de esta cuenta.');
      }
      await saveVaultKeyPair(userId, keyPair);
      await putPortalE2eeBackup({
        deviceId: record.deviceId,
        publicKey: record.publicKey,
        backupCipher: record.backupCipher,
        backupVersion: record.backupVersion,
        platform: record.platform || 'web',
        label: record.label || 'Portal Web',
        restoredAt: new Date().toISOString(),
      });
      set({ status: 'ready', keyPair, error: null });
      return { ok: true };
    } catch (error) {
      const message = readableError(error, 'No fue posible restaurar el cifrado.');
      set({ status: 'restore_required', error: message });
      return { ok: false, message };
    }
  },

  reset: () => set({ status: 'idle', userId: null, serverPublicKey: null, keyPair: null, error: null }),

  buildMessagePayload: ({ text, currentUserId, conversation }) => {
    const encryptionActive = isDirectChatEncryptionActive({ currentUserId, conversation });
    const keyPair = get().keyPair;
    if (encryptionActive && !keyPair) {
      throw new Error('Desbloquea el cifrado de este navegador antes de enviar mensajes.');
    }
    return buildDirectChatMessagePayload({
      text,
      currentUserId,
      conversation,
      keyPair,
    });
  },

  decryptMessage: ({ message, currentUserId, conversation }) => {
    if (!message.e2eeEnvelope?.ciphertext) return message.text || '';
    const keyPair = get().keyPair;
    if (!keyPair) throw new Error('Cifrado bloqueado en este navegador.');
    const peer = conversation.participants.find((participant) => participant.id !== currentUserId);
    if (!peer?.e2eePublicKey) throw new Error('No se encontró la llave pública del contacto.');
    return decryptDirectChatText({
      envelope: message.e2eeEnvelope,
      peerPublicKey: peer.e2eePublicKey,
      currentUserSecretKey: keyPair.secretKey,
    });
  },
}));
