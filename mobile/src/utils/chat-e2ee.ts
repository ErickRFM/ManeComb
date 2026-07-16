import nacl from 'tweetnacl';
import * as naclUtil from 'tweetnacl-util';
import { pbkdf2Async } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha256';

export type StoredChatKeyPair = {
  publicKey: string;
  secretKey: string;
};

export type DirectMessageEnvelope = {
  version: string;
  nonce: string;
  ciphertext: string;
  recipientId: string;
  senderPublicKey?: string;
};

export type EncryptedChatKeyBackup = {
  version: string;
  kdf: 'pbkdf2-sha256';
  iterations: number;
  salt: string;
  deviceId: string;
  publicKey: string;
  nonce: string;
  ciphertext: string;
  createdAt: string;
};

export function isE2eeCapablePublicKey(value: string | null | undefined) {
  if (!value) return false;

  try {
    return decodeBase64Key(value).length === nacl.box.publicKeyLength;
  } catch {
    return false;
  }
}

export function generateE2eeDeviceId() {
  if (typeof globalThis !== 'undefined' && typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return `device-${naclUtil.encodeBase64(nacl.randomBytes(12)).replace(/[^a-zA-Z0-9]/g, '').slice(0, 18)}`;
}

export function generateStoredChatKeyPair(): StoredChatKeyPair {
  const keyPair = nacl.box.keyPair();

  return {
    publicKey: naclUtil.encodeBase64(keyPair.publicKey),
    secretKey: naclUtil.encodeBase64(keyPair.secretKey),
  };
}

function decodeBase64Key(value: string) {
  return naclUtil.decodeBase64(String(value || '').trim());
}

const BACKUP_KDF_ITERATIONS = 210_000;

async function buildBackupKeyMaterial(input: {
  userId: string;
  password: string;
  salt: Uint8Array;
  iterations?: number;
}) {
  const iterations = Math.max(BACKUP_KDF_ITERATIONS, Number(input.iterations) || 0);
  const passwordBytes = naclUtil.decodeUTF8(
    `${String(input.userId).trim()}:${String(input.password)}`
  );

  return await pbkdf2Async(sha256, passwordBytes, input.salt, {
    c: iterations,
    dkLen: nacl.secretbox.keyLength,
    asyncTick: 10,
  });
}

export async function encryptStoredChatKeyPairBackup(input: {
  keyPair: StoredChatKeyPair;
  userId: string;
  password: string;
  deviceId: string;
}): Promise<EncryptedChatKeyBackup> {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const salt = nacl.randomBytes(16);
  const plaintext = naclUtil.decodeUTF8(JSON.stringify(input.keyPair));
  const ciphertext = nacl.secretbox(
    plaintext,
    nonce,
    await buildBackupKeyMaterial({
      userId: input.userId,
      password: input.password,
      salt,
      iterations: BACKUP_KDF_ITERATIONS,
    })
  );

  return {
    version: 'secretbox-pbkdf2-sha256-v2',
    kdf: 'pbkdf2-sha256',
    iterations: BACKUP_KDF_ITERATIONS,
    salt: naclUtil.encodeBase64(salt),
    deviceId: input.deviceId,
    publicKey: input.keyPair.publicKey,
    nonce: naclUtil.encodeBase64(nonce),
    ciphertext: naclUtil.encodeBase64(ciphertext),
    createdAt: new Date().toISOString(),
  };
}

export async function decryptStoredChatKeyPairBackup(input: {
  backup: EncryptedChatKeyBackup;
  userId: string;
  password: string;
}): Promise<StoredChatKeyPair> {
  if (
    input.backup.version !== 'secretbox-pbkdf2-sha256-v2' ||
    input.backup.kdf !== 'pbkdf2-sha256' ||
    !input.backup.salt ||
    input.backup.iterations < BACKUP_KDF_ITERATIONS
  ) {
    throw new Error('El respaldo E2EE usa una derivacion de llave no compatible.');
  }

  const decrypted = nacl.secretbox.open(
    decodeBase64Key(input.backup.ciphertext),
    decodeBase64Key(input.backup.nonce),
    await buildBackupKeyMaterial({
      userId: input.userId,
      password: input.password,
      salt: decodeBase64Key(input.backup.salt),
      iterations: input.backup.iterations,
    })
  );

  if (!decrypted) {
    throw new Error('No fue posible restaurar el respaldo E2EE con esta contrasena.');
  }

  const parsed = JSON.parse(naclUtil.encodeUTF8(decrypted)) as StoredChatKeyPair;

  if (!parsed?.publicKey || !parsed?.secretKey) {
    throw new Error('El respaldo E2EE esta incompleto.');
  }

  return parsed;
}

export function encryptDirectChatText(input: {
  text: string;
  recipientId: string;
  recipientPublicKey: string;
  senderPublicKey: string;
  senderSecretKey: string;
}): DirectMessageEnvelope {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const sharedKey = nacl.box.before(
    decodeBase64Key(input.recipientPublicKey),
    decodeBase64Key(input.senderSecretKey)
  );
  const cipherBytes = nacl.box.after(naclUtil.decodeUTF8(input.text), nonce, sharedKey);

  return {
    version: 'x25519-xsalsa20-poly1305',
    nonce: naclUtil.encodeBase64(nonce),
    ciphertext: naclUtil.encodeBase64(cipherBytes),
    recipientId: input.recipientId,
    senderPublicKey: input.senderPublicKey,
  };
}

export function buildDirectChatMessagePayload(input: {
  text: string;
  currentUserId: string;
  conversation: {
    kind: string;
    channelMode?: string;
    participants: Array<{ id: string; e2eePublicKey?: string }>;
  } | null;
  keyPair: StoredChatKeyPair | null;
}) {
  const text = input.text.trim();
  const participants = input.conversation?.participants || [];
  const recipient = participants.find((participant) => participant.id !== input.currentUserId);
  const eligible =
    input.conversation?.kind === 'direct' &&
    input.conversation.channelMode !== 'radio' &&
    participants.length === 2;

  if (
    !eligible ||
    !recipient ||
    !input.keyPair ||
    !isE2eeCapablePublicKey(input.keyPair.publicKey) ||
    !isE2eeCapablePublicKey(recipient.e2eePublicKey)
  ) {
    return { text };
  }

  return {
    textPreview: 'Mensaje cifrado de extremo a extremo',
    e2eeEnvelope: encryptDirectChatText({
      text,
      recipientId: recipient.id,
      recipientPublicKey: recipient.e2eePublicKey!,
      senderPublicKey: input.keyPair.publicKey,
      senderSecretKey: input.keyPair.secretKey,
    }),
  };
}

export function decryptDirectChatText(input: {
  envelope: DirectMessageEnvelope;
  peerPublicKey: string;
  currentUserSecretKey: string;
}) {
  const sharedKey = nacl.box.before(
    decodeBase64Key(input.peerPublicKey),
    decodeBase64Key(input.currentUserSecretKey)
  );
  const decryptedBytes = nacl.box.open.after(
    decodeBase64Key(input.envelope.ciphertext),
    decodeBase64Key(input.envelope.nonce),
    sharedKey
  );

  if (!decryptedBytes) {
    throw new Error('No fue posible descifrar el mensaje directo.');
  }

  return naclUtil.encodeUTF8(decryptedBytes);
}
