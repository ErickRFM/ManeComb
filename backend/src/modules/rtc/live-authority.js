const CALL_PREFIX = "manecomb:rtc:call:";
const USER_PREFIX = "manecomb:rtc:user:";
const DEFAULT_ACTIVE_LEASE_MS = 120000;

const RESERVE_SCRIPT = `
local caller = redis.call("get", KEYS[1])
if caller then return { -1, caller } end
local callee = redis.call("get", KEYS[2])
if callee then return { -2, callee } end
redis.call("set", KEYS[1], ARGV[1], "PX", ARGV[3])
redis.call("set", KEYS[2], ARGV[1], "PX", ARGV[3])
redis.call("set", KEYS[3], ARGV[2], "PX", ARGV[3])
return { 1, ARGV[1] }
`;

const CAS_SCRIPT = `
local current = redis.call("get", KEYS[1])
if not current then return 0 end
if current ~= ARGV[1] then return -1 end
redis.call("set", KEYS[1], ARGV[2], "PX", ARGV[4])
for i = 2, #KEYS do
  if redis.call("get", KEYS[i]) == ARGV[3] then
    redis.call("pexpire", KEYS[i], ARGV[4])
  end
end
return 1
`;

const RELEASE_SCRIPT = `
local current = redis.call("get", KEYS[1])
if not current then return 0 end
if current ~= ARGV[1] then return -1 end
redis.call("del", KEYS[1])
for i = 2, #KEYS do
  if redis.call("get", KEYS[i]) == ARGV[2] then
    redis.call("del", KEYS[i])
  end
end
return 1
`;

const REFRESH_SCRIPT = `
local current = redis.call("get", KEYS[1])
if not current then return 0 end
redis.call("pexpire", KEYS[1], ARGV[2])
for i = 2, #KEYS do
  if redis.call("get", KEYS[i]) == ARGV[1] then
    redis.call("pexpire", KEYS[i], ARGV[2])
  end
end
return 1
`;

const RELEASE_STALE_USER_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`;

function callKey(callId) {
  return `${CALL_PREFIX}${String(callId || "").trim()}`;
}

function userKey(userId) {
  return `${USER_PREFIX}${String(userId || "").trim()}`;
}

function participantIds(call) {
  return [call?.callerId, ...(Array.isArray(call?.calleeIds) ? call.calleeIds : [])].filter(Boolean);
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function parseCall(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && parsed.callId ? parsed : null;
  } catch {
    return null;
  }
}

function createRtcLiveAuthority({
  redisClient = null,
  redisReadiness = { enabled: false },
  isClusterReady = () => true,
  activeLeaseMs = DEFAULT_ACTIVE_LEASE_MS
} = {}) {
  const localCalls = new Map();
  const localUsers = new Map();
  const distributed = Boolean(redisReadiness?.enabled);

  function assertDistributedAuthority() {
    if (!distributed) return;
    if (!redisClient?.isReady || !isClusterReady()) {
      const error = new Error("Redis no esta disponible para autoridad RTC distribuida");
      error.code = "rtc_unavailable";
      throw error;
    }
  }

  function keysForCall(call) {
    return [callKey(call.callId), ...participantIds(call).map(userKey)];
  }

  async function reserve(call, { ttlMs = activeLeaseMs } = {}) {
    if (!distributed) {
      if (localUsers.has(call.callerId)) {
        return { acquired: false, conflict: "caller", callId: localUsers.get(call.callerId) };
      }
      const calleeId = call.calleeIds?.[0];
      if (calleeId && localUsers.has(calleeId)) {
        return { acquired: false, conflict: "callee", callId: localUsers.get(calleeId) };
      }
      localCalls.set(call.callId, clone(call));
      for (const id of participantIds(call)) localUsers.set(id, call.callId);
      return { acquired: true };
    }

    assertDistributedAuthority();
    const result = await redisClient.eval(RESERVE_SCRIPT, {
      keys: [userKey(call.callerId), userKey(call.calleeIds?.[0]), callKey(call.callId)],
      arguments: [call.callId, JSON.stringify(call), String(ttlMs)]
    });
    const code = Number(result?.[0]);
    if (code === 1) return { acquired: true };
    return {
      acquired: false,
      conflict: code === -1 ? "caller" : "callee",
      callId: String(result?.[1] || "") || null
    };
  }

  async function getCall(callId) {
    if (!distributed) return clone(localCalls.get(callId) || null);
    assertDistributedAuthority();
    return parseCall(await redisClient.get(callKey(callId)));
  }

  async function getCallForUser(userId) {
    if (!distributed) {
      const id = localUsers.get(userId);
      return id ? clone(localCalls.get(id) || null) : null;
    }
    assertDistributedAuthority();
    const id = await redisClient.get(userKey(userId));
    if (!id) return null;
    const call = parseCall(await redisClient.get(callKey(id)));
    if (call) return call;
    await redisClient.eval(RELEASE_STALE_USER_SCRIPT, {
      keys: [userKey(userId)],
      arguments: [id]
    });
    return null;
  }

  async function compareAndSet(expected, next, { ttlMs = activeLeaseMs } = {}) {
    if (!expected || !next || expected.callId !== next.callId) return false;
    if (!distributed) {
      const current = localCalls.get(expected.callId);
      if (!current || JSON.stringify(current) !== JSON.stringify(expected)) return false;
      localCalls.set(next.callId, clone(next));
      return true;
    }
    assertDistributedAuthority();
    const result = await redisClient.eval(CAS_SCRIPT, {
      keys: keysForCall(expected),
      arguments: [JSON.stringify(expected), JSON.stringify(next), expected.callId, String(ttlMs)]
    });
    return Number(result) === 1;
  }

  async function release(expected) {
    if (!expected?.callId) return false;
    if (!distributed) {
      const current = localCalls.get(expected.callId);
      if (!current || JSON.stringify(current) !== JSON.stringify(expected)) return false;
      localCalls.delete(expected.callId);
      for (const id of participantIds(expected)) {
        if (localUsers.get(id) === expected.callId) localUsers.delete(id);
      }
      return true;
    }
    assertDistributedAuthority();
    const result = await redisClient.eval(RELEASE_SCRIPT, {
      keys: keysForCall(expected),
      arguments: [JSON.stringify(expected), expected.callId]
    });
    return Number(result) === 1;
  }

  async function refresh(call, { ttlMs = activeLeaseMs } = {}) {
    if (!call?.callId) return false;
    if (!distributed) return localCalls.has(call.callId);
    assertDistributedAuthority();
    const result = await redisClient.eval(REFRESH_SCRIPT, {
      keys: keysForCall(call),
      arguments: [call.callId, String(ttlMs)]
    });
    return Number(result) === 1;
  }

  return {
    distributed,
    reserve,
    getCall,
    getCallForUser,
    compareAndSet,
    release,
    refresh,
    _state: {
      callsById: localCalls,
      userState: localUsers
    }
  };
}

module.exports = {
  CALL_PREFIX,
  USER_PREFIX,
  DEFAULT_ACTIVE_LEASE_MS,
  createRtcLiveAuthority
};
