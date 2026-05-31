import nacl from 'tweetnacl';
import * as naclUtil from 'tweetnacl-util';

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
  deviceId: string;
  publicKey: string;
  nonce: string;
  ciphertext: string;
  createdAt: string;
};

export function isE2eeCapablePublicKey(value: string | null | undefined) {
  return Boolean(value && value.trim().length >= 40);
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

function buildBackupKeyMaterial(userId: string, password: string) {
  const hashBytes = nacl.hash(naclUtil.decodeUTF8(`${String(userId).trim()}:${String(password).trim()}`));
  return hashBytes.slice(0, nacl.secretbox.keyLength);
}

export function encryptStoredChatKeyPairBackup(input: {
  keyPair: StoredChatKeyPair;
  userId: string;
  password: string;
  deviceId: string;
}): EncryptedChatKeyBackup {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const plaintext = naclUtil.decodeUTF8(JSON.stringify(input.keyPair));
  const ciphertext = nacl.secretbox(
    plaintext,
    nonce,
    buildBackupKeyMaterial(input.userId, input.password)
  );

  return {
    version: 'secretbox-v1',
    deviceId: input.deviceId,
    publicKey: input.keyPair.publicKey,
    nonce: naclUtil.encodeBase64(nonce),
    ciphertext: naclUtil.encodeBase64(ciphertext),
    createdAt: new Date().toISOString(),
  };
}

export function decryptStoredChatKeyPairBackup(input: {
  backup: EncryptedChatKeyBackup;
  userId: string;
  password: string;
}): StoredChatKeyPair {
  const decrypted = nacl.secretbox.open(
    decodeBase64Key(input.backup.ciphertext),
    decodeBase64Key(input.backup.nonce),
    buildBackupKeyMaterial(input.userId, input.password)
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
