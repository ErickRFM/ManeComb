const { randomUUID } = require("crypto");

const DEFAULT_RING_TIMEOUT_MS = 35000;

function uniqueUserIds(values) {
  return [...new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))];
}

function cloneCall(call) {
  if (!call) return null;
  const { timer, ...safeCall } = call;
  return {
    ...safeCall,
    calleeUserIds: [...safeCall.calleeUserIds],
    remainingCalleeUserIds: [...safeCall.remainingCalleeUserIds]
  };
}

function createRtcCallRegistry(options = {}) {
  const timeoutMs = Math.max(1000, Number(options.timeoutMs) || DEFAULT_RING_TIMEOUT_MS);
  const now = typeof options.now === "function" ? options.now : Date.now;
  const idFactory = typeof options.idFactory === "function" ? options.idFactory : randomUUID;
  const schedule = typeof options.setTimer === "function" ? options.setTimer : setTimeout;
  const cancelTimer = typeof options.clearTimer === "function" ? options.clearTimer : clearTimeout;
  const onTimeout = typeof options.onTimeout === "function" ? options.onTimeout : () => undefined;
  const calls = new Map();
  const callIdsByUser = new Map();

  function indexUser(userId, callId) {
    const callIds = callIdsByUser.get(userId) || new Set();
    callIds.add(callId);
    callIdsByUser.set(userId, callIds);
  }

  function unindexUser(userId, callId) {
    const callIds = callIdsByUser.get(userId);
    if (!callIds) return;
    callIds.delete(callId);
    if (!callIds.size) callIdsByUser.delete(userId);
  }

  function remove(call) {
    if (!call) return null;
    if (call.timer) cancelTimer(call.timer);
    calls.delete(call.id);
    unindexUser(call.caller.id, call.id);
    call.calleeUserIds.forEach((userId) => unindexUser(userId, call.id));
    return cloneCall(call);
  }

  function get(callId) {
    return cloneCall(calls.get(String(callId || "").trim()));
  }

  function isUserBusy(userId) {
    return Boolean(callIdsByUser.get(String(userId || "").trim())?.size);
  }

  function expire(callId) {
    const call = calls.get(callId);
    if (!call) return null;
    const expired = remove(call);
    onTimeout(expired);
    return expired;
  }

  function create(payload = {}) {
    const roomId = String(payload.roomId || "").trim();
    const callerId = String(payload.caller?.id || "").trim();
    const callerName = String(payload.caller?.name || "Operador").trim() || "Operador";
    const calleeUserIds = uniqueUserIds(payload.calleeUserIds).filter((userId) => userId !== callerId);
    const mode = payload.mode === "video" ? "video" : "audio";

    if (!roomId || !callerId || !calleeUserIds.length) {
      return { ok: false, reason: "invalid_call" };
    }

    if ([callerId, ...calleeUserIds].some(isUserBusy)) {
      return { ok: false, reason: "busy" };
    }

    const createdAt = now();
    const call = {
      id: String(idFactory()),
      roomId,
      mode,
      caller: { id: callerId, name: callerName },
      calleeUserIds,
      remainingCalleeUserIds: [...calleeUserIds],
      createdAt,
      expiresAt: createdAt + timeoutMs,
      timer: null
    };

    calls.set(call.id, call);
    indexUser(callerId, call.id);
    calleeUserIds.forEach((userId) => indexUser(userId, call.id));
    call.timer = schedule(() => expire(call.id), timeoutMs);

    return { ok: true, call: cloneCall(call) };
  }

  function accept(callId, userId) {
    const call = calls.get(String(callId || "").trim());
    const safeUserId = String(userId || "").trim();
    if (!call) return { ok: false, reason: "call_not_found" };
    if (!call.remainingCalleeUserIds.includes(safeUserId)) {
      return { ok: false, reason: "forbidden" };
    }

    const accepted = remove(call);
    return { ok: true, call: accepted, acceptedBy: safeUserId };
  }

  function reject(callId, userId) {
    const call = calls.get(String(callId || "").trim());
    const safeUserId = String(userId || "").trim();
    if (!call) return { ok: false, reason: "call_not_found" };
    if (!call.remainingCalleeUserIds.includes(safeUserId)) {
      return { ok: false, reason: "forbidden" };
    }

    call.remainingCalleeUserIds = call.remainingCalleeUserIds.filter((entry) => entry !== safeUserId);
    unindexUser(safeUserId, call.id);
    const final = call.remainingCalleeUserIds.length === 0;
    const snapshot = final ? remove(call) : cloneCall(call);
    return { ok: true, call: snapshot, rejectedBy: safeUserId, final };
  }

  function cancel(callId, userId) {
    const call = calls.get(String(callId || "").trim());
    const safeUserId = String(userId || "").trim();
    if (!call) return { ok: false, reason: "call_not_found" };
    if (call.caller.id !== safeUserId) return { ok: false, reason: "forbidden" };
    return { ok: true, call: remove(call) };
  }

  function releaseUser(userId) {
    const safeUserId = String(userId || "").trim();
    const callIds = [...(callIdsByUser.get(safeUserId) || [])];
    const results = [];

    callIds.forEach((callId) => {
      const call = calls.get(callId);
      if (!call) return;
      if (call.caller.id === safeUserId) {
        const result = cancel(callId, safeUserId);
        if (result.ok) results.push({ type: "cancelled", ...result });
        return;
      }
      const result = reject(callId, safeUserId);
      if (result.ok) results.push({ type: "rejected", ...result });
    });

    return results;
  }

  function size() {
    return calls.size;
  }

  return {
    accept,
    cancel,
    create,
    expire,
    get,
    isUserBusy,
    reject,
    releaseUser,
    size
  };
}

module.exports = {
  DEFAULT_RING_TIMEOUT_MS,
  createRtcCallRegistry
};
