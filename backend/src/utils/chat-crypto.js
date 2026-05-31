const crypto = require("crypto");
const { CHAT_ENCRYPTION_SECRET } = require("../config/env");

const ENCRYPTION_ALGORITHM = "aes-256-gcm";

function getEncryptionKey() {
  return crypto
    .createHash("sha256")
    .update(String(CHAT_ENCRYPTION_SECRET || "combis-chat-secret"))
    .digest();
}

function encryptChatPayload(payload) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, getEncryptionKey(), iv);
  const content = JSON.stringify(payload || {});
  const encrypted = Buffer.concat([cipher.update(content, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.from(
    JSON.stringify({
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
      content: encrypted.toString("base64")
    }),
    "utf8"
  ).toString("base64");
}

function decryptChatPayload(payloadEncrypted) {
  if (!payloadEncrypted) {
    return null;
  }

  try {
    const serializedPayload = JSON.parse(
      Buffer.from(String(payloadEncrypted), "base64").toString("utf8")
    );
    const decipher = crypto.createDecipheriv(
      ENCRYPTION_ALGORITHM,
      getEncryptionKey(),
      Buffer.from(String(serializedPayload.iv || ""), "base64")
    );
    decipher.setAuthTag(Buffer.from(String(serializedPayload.tag || ""), "base64"));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(String(serializedPayload.content || ""), "base64")),
      decipher.final()
    ]).toString("utf8");

    return JSON.parse(decrypted);
  } catch {
    return null;
  }
}

module.exports = {
  decryptChatPayload,
  encryptChatPayload
};
