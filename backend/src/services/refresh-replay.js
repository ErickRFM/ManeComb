const crypto = require("crypto");
const { JWT_SECRET } = require("../config/env");
const { getRedisClient } = require("./redis");

const REPLAY_TTL_SECONDS = 90;
const memoryReplay = new Map();
const encryptionKey = crypto
  .createHash("sha256")
  .update(`${JWT_SECRET}:manecomb-refresh-replay:v1`)
  .digest();

function normalizeRefreshRequestId(value) {
  const requestId = String(value || "").trim();
  if (!requestId || requestId.length < 16 || requestId.length > 128) return "";
  if (!/^[A-Za-z0-9._:-]+$/.test(requestId)) return "";
  return requestId;
}

function replayKey(scope, tokenHash, requestId) {
  return `refresh-replay:v1:${scope}:${tokenHash}:${requestId}`;
}

function seal(payload) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64url");
}

function unseal(value) {
  try {
    const packed = Buffer.from(String(value || ""), "base64url");
    if (packed.length < 29) return null;
    const iv = packed.subarray(0, 12);
    const tag = packed.subarray(12, 28);
    const ciphertext = packed.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ]).toString("utf8");
    return JSON.parse(plaintext);
  } catch {
    return null;
  }
}

function pruneMemoryReplay() {
  const now = Date.now();
  for (const [key, entry] of memoryReplay.entries()) {
    if (!entry || entry.expiresAt <= now) memoryReplay.delete(key);
  }
}

async function setRefreshReplay(scope, tokenHash, requestIdValue, payload) {
  const requestId = normalizeRefreshRequestId(requestIdValue);
  if (!requestId || !tokenHash || !payload?.refreshToken || !payload?.sessionId) return false;

  const key = replayKey(scope, tokenHash, requestId);
  const sealed = seal(payload);
  const expiresAt = Date.now() + REPLAY_TTL_SECONDS * 1000;
  memoryReplay.set(key, { sealed, expiresAt });
  pruneMemoryReplay();

  const redis = getRedisClient();
  if (redis?.isReady) {
    try {
      await redis.set(key, sealed, { EX: REPLAY_TTL_SECONDS });
    } catch {
      // Mongo CAS remains authoritative. Memory replay still recovers this process.
    }
  }
  return true;
}

async function getRefreshReplay(scope, tokenHash, requestIdValue) {
  const requestId = normalizeRefreshRequestId(requestIdValue);
  if (!requestId || !tokenHash) return null;

  const key = replayKey(scope, tokenHash, requestId);
  const redis = getRedisClient();
  if (redis?.isReady) {
    try {
      const value = await redis.get(key);
      const decoded = value ? unseal(value) : null;
      if (decoded) return decoded;
    } catch {
      // Fall through to the in-process replay cache.
    }
  }

  const entry = memoryReplay.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    memoryReplay.delete(key);
    return null;
  }
  return unseal(entry.sealed);
}

async function waitForRefreshReplay(scope, tokenHash, requestIdValue) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const replay = await getRefreshReplay(scope, tokenHash, requestIdValue);
    if (replay) return replay;
    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  return null;
}

module.exports = {
  REPLAY_TTL_SECONDS,
  normalizeRefreshRequestId,
  setRefreshReplay,
  getRefreshReplay,
  waitForRefreshReplay
};
