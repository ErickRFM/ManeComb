const { randomUUID } = require("crypto");

const POINTER_PREFIX = "manecomb:rtc:cdr:";
const CREATE_LOCK_PREFIX = "manecomb:rtc:cdr-create:";
const DEFAULT_POINTER_TTL_MS = 120000;
const CREATE_LOCK_TTL_MS = 5000;

const RELEASE_IF_VALUE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`;

function pointerKey(roomId) {
  return `${POINTER_PREFIX}${String(roomId || "").trim()}`;
}

function createLockKey(roomId) {
  return `${CREATE_LOCK_PREFIX}${String(roomId || "").trim()}`;
}

function createRtcSessionCoordinator({
  store,
  redisClient = null,
  redisReadiness = { enabled: false },
  isClusterReady = () => true,
  pointerTtlMs = DEFAULT_POINTER_TTL_MS,
  setTimeoutFn = setTimeout
} = {}) {
  const localPointers = new Map();
  const localCreateLocks = new Map();
  const distributed = Boolean(redisReadiness?.enabled);

  function assertAvailable() {
    if (!distributed) return;
    if (!redisClient?.isReady || !isClusterReady()) {
      const error = new Error("Redis no esta disponible para coordinacion CDR RTC");
      error.code = "rtc_unavailable";
      throw error;
    }
  }

  async function listActive(roomId, organizationId) {
    const sessions = await store.listRtcSessions?.({ organizationId, roomId, limit: 10 }) || [];
    return sessions.find((session) => session?.status === "active") || null;
  }

  async function readPointer(roomId) {
    if (!distributed) return localPointers.get(roomId) || null;
    assertAvailable();
    return await redisClient.get(pointerKey(roomId));
  }

  async function writePointer(roomId, sessionId) {
    if (!distributed) {
      localPointers.set(roomId, sessionId);
      return;
    }
    assertAvailable();
    await redisClient.set(pointerKey(roomId), sessionId, { PX: pointerTtlMs });
  }

  async function clearPointer(roomId, sessionId) {
    if (!distributed) {
      if (localPointers.get(roomId) === sessionId) localPointers.delete(roomId);
      return;
    }
    assertAvailable();
    await redisClient.eval(RELEASE_IF_VALUE_SCRIPT, {
      keys: [pointerKey(roomId)],
      arguments: [sessionId]
    });
  }

  async function resolveSessionId(roomId, organizationId) {
    const pointer = await readPointer(roomId);
    if (pointer) return pointer;
    const active = await listActive(roomId, organizationId);
    if (!active) return null;
    await writePointer(roomId, active.id);
    return active.id;
  }

  async function sync(roomId, organizationId, payload) {
    const sessionId = await resolveSessionId(roomId, organizationId);
    if (!sessionId) return null;
    const updated = await store.updateRtcSession(sessionId, payload);
    if (updated) await writePointer(roomId, sessionId);
    return updated;
  }

  async function ensureLocal(roomId, payload) {
    const inFlight = localCreateLocks.get(roomId);
    if (inFlight) return await inFlight;

    const work = (async () => {
      const existingId = await resolveSessionId(roomId, payload.organizationId);
      if (existingId) {
        const updated = await store.updateRtcSession(existingId, payload.update || payload.create);
        if (updated) await writePointer(roomId, existingId);
        return updated;
      }
      const created = await store.createRtcSession(payload.create);
      localPointers.set(roomId, created.id);
      return created;
    })();

    localCreateLocks.set(roomId, work);
    try {
      return await work;
    } finally {
      if (localCreateLocks.get(roomId) === work) localCreateLocks.delete(roomId);
    }
  }

  async function ensure(roomId, payload) {
    if (!distributed) return await ensureLocal(roomId, payload);

    const existingId = await resolveSessionId(roomId, payload.organizationId);
    if (existingId) {
      const updated = await store.updateRtcSession(existingId, payload.update || payload.create);
      if (updated) await writePointer(roomId, existingId);
      return updated;
    }

    assertAvailable();
    const lockToken = randomUUID();
    const acquired = await redisClient.set(createLockKey(roomId), lockToken, {
      NX: true,
      PX: CREATE_LOCK_TTL_MS
    });

    if (!acquired) {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        await new Promise((resolve) => setTimeoutFn(resolve, 25 * (attempt + 1)));
        const active = await listActive(roomId, payload.organizationId);
        if (active) {
          await writePointer(roomId, active.id);
          return await store.updateRtcSession(active.id, payload.update || payload.create);
        }
      }
      const error = new Error("No fue posible coordinar la sesion RTC activa");
      error.code = "rtc_session_conflict";
      throw error;
    }

    try {
      const raced = await listActive(roomId, payload.organizationId);
      const session = raced || await store.createRtcSession(payload.create);
      await writePointer(roomId, session.id);
      return raced
        ? await store.updateRtcSession(session.id, payload.update || payload.create)
        : session;
    } finally {
      await redisClient.eval(RELEASE_IF_VALUE_SCRIPT, {
        keys: [createLockKey(roomId)],
        arguments: [lockToken]
      }).catch(() => undefined);
    }
  }

  async function finish(roomId, organizationId, payload) {
    const sessionId = await resolveSessionId(roomId, organizationId);
    if (!sessionId) return null;
    const updated = await store.updateRtcSession(sessionId, payload);
    await clearPointer(roomId, sessionId);
    return updated;
  }

  return {
    distributed,
    ensure,
    sync,
    finish,
    _state: {
      sessionPointers: localPointers,
      createLocks: localCreateLocks
    }
  };
}

module.exports = {
  DEFAULT_POINTER_TTL_MS,
  POINTER_PREFIX,
  CREATE_LOCK_PREFIX,
  createRtcSessionCoordinator
};
