// RC-RTC-DISTRIBUTED-AUTHORITY-20260809
// Redis is the sole live authority when enabled. Local memory is retained only as the
// explicit single-instance fallback inside rtc/live-authority. Socket.IO Redis remains
// transport/fanout authority; Mongo remains CDR/history authority.

const { randomUUID } = require("crypto");
const { getOrganizationId } = require("../middlewares/access-control");
const { createRtcLiveAuthority, DEFAULT_ACTIVE_LEASE_MS } = require("../modules/rtc/live-authority");
const { deliverOperationalNotification } = require("./notification-delivery");

const RING_TIMEOUT_MS = 35000;
const DISCONNECT_GRACE_MS = 15000;
const RING_LEASE_SAFETY_MS = 10000;
const MUTATION_RETRIES = 4;

function callRoom(callId) {
  return `rtc:call:${callId}`;
}

function buildIncomingCallDeepLink(call, caller) {
  const params = new URLSearchParams({
    callId: call.callId,
    conversationId: call.conversationId,
    callerId: call.callerId,
    callerName: String(caller?.name || "Contacto operativo"),
    mode: call.mode,
    action: "incoming",
    expiresAt: String(call.expiresAt || ""),
    ringTimeoutMs: String(call.ringTimeoutMs || RING_TIMEOUT_MS)
  });
  return `manecomb:///call?${params.toString()}`;
}

function createRtcCallService({
  store,
  emitToUser,
  deliverNotification = deliverOperationalNotification,
  redisClient = null,
  redisReadiness = { enabled: false },
  isClusterReady = () => true,
  liveAuthority = null,
  now = () => Date.now(),
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  ringTimeoutMs = RING_TIMEOUT_MS,
  disconnectGraceMs = DISCONNECT_GRACE_MS,
  activeLeaseMs = DEFAULT_ACTIVE_LEASE_MS
} = {}) {
  const authority = liveAuthority || createRtcLiveAuthority({
    redisClient,
    redisReadiness,
    isClusterReady,
    activeLeaseMs
  });
  const pendingDisconnects = new Map();
  const ringTimers = new Map();

  function queuePush(targetUserIds, call, input = {}) {
    if (!call || !Array.isArray(targetUserIds) || !targetUserIds.length) return;
    const payload = {
      organizationId: call.organizationId,
      targetUserIds,
      category: "call",
      level: input.level || "critical",
      title: input.title || "Llamada ManeComb",
      body: input.body || "Actualizacion de llamada",
      silent: Boolean(input.silent),
      ttlSeconds: input.ttlSeconds || Math.ceil(ringTimeoutMs / 1000) + 5,
      data: {
        type: input.type || "call_state",
        callId: call.callId,
        conversationId: call.conversationId,
        callerId: call.callerId,
        callerName: String(input.callerName || ""),
        mode: call.mode,
        reason: String(input.reason || ""),
        expiresAt: String(input.expiresAt || ""),
        ringTimeoutMs: String(input.ringTimeoutMs || call.ringTimeoutMs || "")
      },
      deepLink: input.deepLink || ""
    };

    Promise.resolve(
      deliverNotification({ io: null, store, persist: false, payload })
    ).catch(() => undefined);
  }

  function queueIncomingPush(call, caller) {
    queuePush(call.calleeIds, call, {
      type: "incoming_call",
      title: caller?.name ? `${caller.name} te está llamando` : "Llamada entrante",
      body: call.mode === "video" ? "Videollamada de ManeComb" : "Llamada de audio de ManeComb",
      callerName: caller?.name || "Contacto operativo",
      expiresAt: call.expiresAt,
      ringTimeoutMs: call.ringTimeoutMs,
      deepLink: buildIncomingCallDeepLink(call, caller)
    });
  }

  function queueCallDismiss(call, targetUserIds, reason) {
    queuePush(targetUserIds, call, {
      type: "call_dismiss",
      title: "",
      body: "",
      reason,
      silent: true,
      ttlSeconds: 60
    });
  }

  function clearLocalRingTimer(callId) {
    const handle = ringTimers.get(callId);
    if (!handle) return;
    clearTimeoutFn(handle);
    ringTimers.delete(callId);
  }

  function clearPendingDisconnectsForCall(callId) {
    for (const [key, handle] of Array.from(pendingDisconnects.entries())) {
      if (!key.startsWith(`${callId}:`)) continue;
      clearTimeoutFn(handle);
      pendingDisconnects.delete(key);
    }
  }

  async function releaseCurrent(callId, validate) {
    for (let attempt = 0; attempt < MUTATION_RETRIES; attempt += 1) {
      const current = await authority.getCall(callId);
      if (!current) return { released: false, call: null, missing: true };
      const validation = validate ? validate(current) : { ok: true };
      if (!validation.ok) return { released: false, call: current, ...validation };
      if (await authority.release(current)) {
        clearLocalRingTimer(callId);
        clearPendingDisconnectsForCall(callId);
        return { released: true, call: current };
      }
    }
    return { released: false, conflict: true };
  }

  async function updateCurrent(callId, buildNext, { ttlMs = activeLeaseMs } = {}) {
    for (let attempt = 0; attempt < MUTATION_RETRIES; attempt += 1) {
      const current = await authority.getCall(callId);
      if (!current) return { updated: false, call: null, missing: true };
      const decision = buildNext(current);
      if (!decision?.ok) return { updated: false, call: current, ...decision };
      if (decision.idempotent) return { updated: false, call: current, ...decision };
      if (await authority.compareAndSet(current, decision.next, { ttlMs })) {
        return { updated: true, call: decision.next, previous: current, ...decision };
      }
    }
    return { updated: false, conflict: true };
  }

  async function onRingTimeout(callId) {
    ringTimers.delete(callId);
    const result = await releaseCurrent(callId, (call) => (
      call.status === "ringing" ? { ok: true } : { ok: false, noop: true }
    ));
    if (!result.released) return;
    const call = result.call;
    const payload = { callId, conversationId: call.conversationId, reason: "timeout" };
    emitToUser(call.callerId, "rtc:call-timeout", payload);
    for (const calleeId of call.calleeIds) emitToUser(calleeId, "rtc:call-timeout", payload);
    queueCallDismiss(call, call.calleeIds, "timeout");
  }

  async function startCall({ caller, conversationId, mode }) {
    const callerId = caller && caller.id;
    const organizationId = getOrganizationId(caller);
    const safeConversationId = String(conversationId || "").trim();

    if (!callerId || !safeConversationId) return { ok: false, code: "invalid_request" };
    if (!organizationId) return { ok: false, code: "forbidden" };

    const rawMode = mode == null ? "audio" : String(mode);
    if (rawMode !== "audio" && rawMode !== "video") return { ok: false, code: "invalid_mode" };

    const canAccess = await store.canUserAccessConversation?.(callerId, safeConversationId);
    if (!canAccess) return { ok: false, code: "forbidden" };
    const conversation = await store.getConversationById?.(safeConversationId);
    if (!conversation) return { ok: false, code: "forbidden" };
    if (String(conversation.organizationId || "").trim() !== organizationId) {
      return { ok: false, code: "forbidden" };
    }

    const participants = Array.isArray(conversation.participants)
      ? conversation.participants.map(String)
      : [];
    const calleeIds = participants.filter((id) => id && id !== callerId);
    if (participants.length !== 2 || calleeIds.length !== 1) {
      return { ok: false, code: "direct_call_required" };
    }

    const createdAt = now();
    const callId = randomUUID();
    const call = {
      callId,
      conversationId: safeConversationId,
      organizationId,
      mode: rawMode,
      callerId,
      calleeIds: [calleeIds[0]],
      status: "ringing",
      acceptedBy: null,
      createdAt,
      connectedAt: null,
      endedAt: null,
      ringTimeoutMs,
      expiresAt: new Date(createdAt + ringTimeoutMs).toISOString()
    };

    let reservation;
    try {
      reservation = await authority.reserve(call, {
        ttlMs: ringTimeoutMs + RING_LEASE_SAFETY_MS
      });
    } catch {
      return { ok: false, code: "rtc_unavailable" };
    }
    if (!reservation.acquired) {
      return {
        ok: false,
        code: reservation.conflict === "caller" ? "caller_busy" : "busy"
      };
    }

    const calleeId = call.calleeIds[0];
    emitToUser(calleeId, "rtc:incoming-call", {
      callId,
      conversationId: safeConversationId,
      mode: rawMode,
      caller: { id: callerId, name: (caller && caller.name) || null },
      expiresAt: call.expiresAt,
      ringTimeoutMs: call.ringTimeoutMs
    });
    queueIncomingPush(call, caller);

    const handle = setTimeoutFn(() => {
      void onRingTimeout(callId).catch(() => undefined);
    }, ringTimeoutMs);
    ringTimers.set(callId, handle);
    return {
      ok: true,
      callId,
      roomId: callRoom(callId),
      status: "ringing",
      calleeId,
      expiresAt: call.expiresAt,
      ringTimeoutMs: call.ringTimeoutMs
    };
  }

  async function accept({ user, callId }) {
    let result;
    try {
      result = await updateCurrent(callId, (call) => {
        if (!call.calleeIds.includes(user.id)) return { ok: false, code: "forbidden" };
        if (call.status === "active") {
          return call.acceptedBy === user.id
            ? { ok: true, idempotent: true }
            : { ok: false, code: "already_active" };
        }
        if (call.status !== "ringing") return { ok: false, code: "unknown_call" };
        return {
          ok: true,
          next: {
            ...call,
            status: "active",
            acceptedBy: user.id,
            connectedAt: now()
          }
        };
      });
    } catch {
      return { ok: false, code: "rtc_unavailable" };
    }

    if (result.missing) return { ok: false, code: "unknown_call" };
    if (result.code) return { ok: false, code: result.code };
    if (result.idempotent) {
      return { ok: true, callId, roomId: callRoom(callId), idempotent: true };
    }
    if (!result.updated) return { ok: false, code: "conflict" };

    clearLocalRingTimer(callId);
    const call = result.call;
    const payload = {
      callId,
      conversationId: call.conversationId,
      roomId: callRoom(callId),
      mode: call.mode,
      acceptedBy: user.id
    };
    emitToUser(call.callerId, "rtc:call-accepted", payload);
    emitToUser(user.id, "rtc:call-accepted", payload);
    queueCallDismiss(call, call.calleeIds, "accepted");
    return { ok: true, callId, roomId: callRoom(callId) };
  }

  async function reject({ user, callId, reason = "rejected" }) {
    let result;
    try {
      result = await releaseCurrent(callId, (call) => (
        call.calleeIds.includes(user.id)
          ? { ok: true }
          : { ok: false, code: "forbidden" }
      ));
    } catch {
      return { ok: false, code: "rtc_unavailable" };
    }
    if (result.missing) return { ok: true, idempotent: true };
    if (result.code) return { ok: false, code: result.code };
    if (!result.released) return { ok: false, code: "conflict" };
    const call = result.call;
    emitToUser(call.callerId, "rtc:call-rejected", {
      callId,
      conversationId: call.conversationId,
      reason
    });
    queueCallDismiss(call, call.calleeIds, reason);
    return { ok: true };
  }

  async function busy({ user, callId }) {
    return await reject({ user, callId, reason: "busy" });
  }

  async function cancel({ user, callId }) {
    let result;
    try {
      result = await releaseCurrent(callId, (call) => (
        call.callerId === user.id ? { ok: true } : { ok: false, code: "forbidden" }
      ));
    } catch {
      return { ok: false, code: "rtc_unavailable" };
    }
    if (result.missing) return { ok: true, idempotent: true };
    if (result.code) return { ok: false, code: result.code };
    if (!result.released) return { ok: false, code: "conflict" };
    const call = result.call;
    for (const id of call.calleeIds) {
      emitToUser(id, "rtc:call-cancelled", {
        callId,
        conversationId: call.conversationId,
        reason: "cancelled"
      });
    }
    queueCallDismiss(call, call.calleeIds, "cancelled");
    return { ok: true };
  }

  async function end({ user, callId }) {
    let result;
    try {
      result = await releaseCurrent(callId, (call) => {
        const isParty = call.callerId === user.id || call.calleeIds.includes(user.id);
        return isParty ? { ok: true } : { ok: false, code: "forbidden" };
      });
    } catch {
      return { ok: false, code: "rtc_unavailable" };
    }
    if (result.missing) return { ok: true, idempotent: true };
    if (result.code) return { ok: false, code: result.code };
    if (!result.released) return { ok: false, code: "conflict" };
    const call = result.call;
    const payload = {
      callId,
      conversationId: call.conversationId,
      endedBy: user.id,
      reason: "ended"
    };
    for (const id of [call.callerId, ...call.calleeIds]) {
      if (id !== user.id) emitToUser(id, "rtc:end", payload);
    }
    queueCallDismiss(call, [call.callerId, ...call.calleeIds], "ended");
    return { ok: true };
  }

  function scheduleDisconnectCleanup(call, goneUserId, isUserConnected) {
    const key = `${call.callId}:${goneUserId}`;
    if (pendingDisconnects.has(key)) return;
    const handle = setTimeoutFn(() => {
      pendingDisconnects.delete(key);
      void (async () => {
        if (isUserConnected && await isUserConnected(goneUserId)) return;
        const current = await authority.getCallForUser(goneUserId);
        if (!current || current.callId !== call.callId || current.status !== "active") return;
        if (!await authority.release(current)) return;
        clearLocalRingTimer(current.callId);
        clearPendingDisconnectsForCall(current.callId);
        const others = [current.callerId, ...current.calleeIds].filter((id) => id !== goneUserId);
        for (const id of others) {
          emitToUser(id, "rtc:end", {
            callId: current.callId,
            conversationId: current.conversationId,
            reason: "peer_disconnected",
            endedBy: goneUserId
          });
        }
        queueCallDismiss(current, [current.callerId, ...current.calleeIds], "peer_disconnected");
      })().catch(() => undefined);
    }, disconnectGraceMs);
    pendingDisconnects.set(key, handle);
  }

  async function handleDisconnect(userId, { isUserConnected } = {}) {
    if (!userId) return;
    try {
      const call = await authority.getCallForUser(userId);
      if (!call || call.status !== "active") return;
      const stillConnected = isUserConnected ? await isUserConnected(userId) : false;
      if (stillConnected) return;
      scheduleDisconnectCleanup(call, userId, isUserConnected);
    } catch {
      // Fail closed: Redis authority is unavailable, so do not make a local lifecycle decision.
    }
  }

  async function refreshForUser(userId) {
    if (!userId) return false;
    try {
      const call = await authority.getCallForUser(userId);
      if (!call || call.status !== "active") return false;
      return await authority.refresh(call, { ttlMs: activeLeaseMs });
    } catch {
      return false;
    }
  }

  async function noteUserReconnected(userId) {
    for (const [key, handle] of Array.from(pendingDisconnects.entries())) {
      if (!key.endsWith(`:${userId}`)) continue;
      clearTimeoutFn(handle);
      pendingDisconnects.delete(key);
    }
    return await refreshForUser(userId);
  }

  async function getCall(callId) {
    let call;
    try {
      call = await authority.getCall(callId);
    } catch {
      return null;
    }
    if (!call) return null;
    return {
      callId: call.callId,
      status: call.status,
      organizationId: call.organizationId,
      callerId: call.callerId,
      calleeIds: [...call.calleeIds],
      room: callRoom(call.callId)
    };
  }

  async function canJoinCall({ callId, userId, organizationId }) {
    let call;
    try {
      call = await authority.getCall(callId);
    } catch {
      return { ok: false, reason: "rtc_unavailable" };
    }
    if (!call) return { ok: false, reason: "unknown_call" };
    if (call.status !== "active") return { ok: false, reason: "not_accepted" };
    if (organizationId && call.organizationId !== organizationId) {
      return { ok: false, reason: "forbidden" };
    }
    const isParticipant = userId === call.callerId || call.calleeIds.includes(userId);
    if (!isParticipant) return { ok: false, reason: "forbidden" };
    try {
      if (!await authority.refresh(call, { ttlMs: activeLeaseMs })) {
        return { ok: false, reason: "rtc_unavailable" };
      }
    } catch {
      return { ok: false, reason: "rtc_unavailable" };
    }
    return { ok: true, roomId: `call:${callId}`, room: callRoom(callId) };
  }

  async function isCallMember(callId, userId) {
    let call;
    try {
      call = await authority.getCall(callId);
    } catch {
      return false;
    }
    if (!call) return false;
    return userId === call.callerId || call.calleeIds.includes(userId);
  }

  return {
    startCall,
    accept,
    reject,
    busy,
    cancel,
    end,
    handleDisconnect,
    refreshForUser,
    noteUserReconnected,
    getCall,
    canJoinCall,
    isCallMember,
    _state: {
      ...authority._state,
      pendingDisconnects,
      ringTimers
    }
  };
}

module.exports = {
  createRtcCallService,
  RING_TIMEOUT_MS,
  DISCONNECT_GRACE_MS,
  callRoom,
  buildIncomingCallDeepLink
};
