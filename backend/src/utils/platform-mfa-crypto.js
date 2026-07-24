const crypto = require("crypto");
const { PLATFORM_MFA_ENCRYPTION_KEY } = require("../config/env");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function isMfaEncryptionKeyValid() {
  if (!PLATFORM_MFA_ENCRYPTION_KEY) return false;
  try {
    const decoded = Buffer.from(PLATFORM_MFA_ENCRYPTION_KEY, "base64");
    return decoded.length === 32;
  } catch {
    return false;
  }
}

function getEncryptionKey() {
  if (!isMfaEncryptionKeyValid()) {
    throw Object.assign(new Error("PLATFORM_MFA_ENCRYPTION_KEY no está configurada o es inválida"), {
      name: "MfaEncryptionKeyInvalid",
      statusCode: 503,
      mfaUnavailable: true
    });
  }
  return Buffer.from(PLATFORM_MFA_ENCRYPTION_KEY, "base64");
}

function encrypt(text) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

function decrypt(encoded) {
  const key = getEncryptionKey();
  const raw = Buffer.from(encoded, "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final("utf8");
}

module.exports = {
  encrypt,
  decrypt,
  isMfaEncryptionKeyValid,
  getEncryptionKey
};
