// RC-MOBILE-CALLS-PRODUCTION-01 — signaling global autoritativo + push de llamada.
// RC-RTC-RECONNECT-LIFECYCLE-20260808 — reconcilia participantes activos sin binding de socket
// despues de una reconexion para que una segunda caida vuelva a liberar call/userState.
//
// Estado de llamadas EN MEMORIA (una sola instancia de backend). Si en el futuro hay varias
// replicas, esta reserva debe centralizarse (p.ej. Redis). Push nunca reemplaza al socket:
// despierta el dispositivo y transporta el mismo callId que gobierna signaling/WebRTC.

const { randomUUID } = require("crypto");
const { getOrganizationId } = require("../middlewares/access-control");
const { deliverOperationalNotification } = require("./notification-delivery");

const RING_TIMEOUT_MS = 35000;
const DISCONNECT_GRACE_MS = 15000;

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
    action: "incoming"
  });
  return `manecomb:///call?${params.toString()}`;
}

function createRtcCallService({
  store,
  emitToUser,
  deliverNotification = deliverOperationalNotification,
  now = () => Date.now(),
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  ringTimeoutMs = RING_TIMEOUT_MS,
  disconnectGraceMs = DISCONNECT_GRACE_MS
} = {}) {
  const callsById = new Map();
  const userState = new Map();
  const pendingDisconnects = new Map();

  const isBusy = (userId) => userState.has(userId);

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
        expiresAt: String(input.expiresAt || "")
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
      expiresAt: new Date(call.createdAt + ringTimeoutMs).toISOString(),
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

  function freeUsers(call) {
    for (const userId of [call.callerId, ...call.calleeIds]) {
      if (userState.get(userId) === call.callId) userState.delete(userId);
    }
  }

  function clearPendingDisconnectsForCall(callId) {
    for (const [key, handle] of Array.from(pendingDisconnects.entries())) {
      if (key.startsWith(`${callId}:`)) {
        clearTimeoutFn(handle);
        pendingDisconnects.delete(key);
      }
    }
  }

  function finalize(call) {
    if (!call || call.status === "ended") return;
    call.status = "ended";
    call.endedAt = now();
    if (call.timeoutHandle) {
      clearTimeoutFn(call.timeoutHandle);
      call.timeoutHandle = null;
    }
    clearPendingDisconnectsForCall(call.callId);
    freeUsers(call);
    callsById.delete(call.callId);
  }

  function onRingTimeout(callId) {
    const call = callsById.get(callId);
    if (!call || call.status !== "ringing") return;
    const payload = { callId, conversationId: call.conversationId, reason: "timeout" };
    emitToUser(call.callerId, "rtc:call-timeout", payload);
    for (const calleeId of call.calleeIds) emitToUser(calleeId, "rtc:call-timeout", payload);
    queueCallDismiss(call, call.calleeIds, "timeout");
    finalize(call);
  }

  async function startCall({ caller, callerSocketId, conversationId, mode }) {
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

    const participants = Array.isArray(conversation.participants) ? conversation.participants.map(String) : [];
    const calleeIds = participants.filter((id) => id && id !== callerId);
    if (participants.length !== 2 || calleeIds.length !== 1) {
      return { ok: false, code: "direct_call_required" };
    }
    const calleeId = calleeIds[0];

    if (isBusy(callerId)) return { ok: false, code: "caller_busy" };
    if (isBusy(calleeId)) return { ok: false, code: "busy" };

    const callId = randomUUID();
    const call = {
      callId,
      conversationId: safeConversationId,
      organizationId,
      mode: rawMode,
      callerId,
      callerSocketId: callerSocketId || null,
      calleeIds: [calleeId],
      calleeSockets: new Map(),
      status: "ringing",
      acceptedBy: null,
      createdAt: now(),
      connectedAt: null,
      endedAt: null,
      timeoutHandle: null
    };
    callsById.set(callId, call);
    userState.set(callerId, callId);
    userState.set(calleeId, callId);

    emitToUser(calleeId, "rtc:incoming-call", {
      callId,
      conversationId: safeConversationId,
      mode: rawMode,
      caller: { id: callerId, name: (caller && caller.name) || null }
    });
    queueIncomingPush(call, caller);

    call.timeoutHandle = setTimeoutFn(() => onRingTimeout(callId), ringTimeoutMs);
    return { ok: true, callId, roomId: callRoom(callId), status: "ringing", calleeId };
  }

  function accept({ user, socketId, callId }) {
    const call = callsById.get(callId);
    if (!call || call.status === "ended") return { ok: false, code: "unknown_call" };
    if (!call.calleeIds.includes(user.id)) return { ok: false, code: "forbidden" };
    if (call.status === "active") {
      return call.acceptedBy === user.id
        ? { ok: true, callId, roomId: callRoom(callId), idempotent: true }
        : { ok: false, code: "already_active" };
    }

    call.status = "active";
    call.acceptedBy = user.id;
    if (socketId) call.calleeSockets.set(user.id, socketId);
    if (call.timeoutHandle) {
      clearTimeoutFn(call.timeoutHandle);
      call.timeoutHandle = null;
    }

    const payload = { callId, conversationId: call.conversationId, roomId: callRoom(callId), mode: call.mode, acceptedBy: user.id };
    emitToUser(call.callerId, "rtc:call-accepted", payload);
    emitToUser(user.id, "rtc:call-accepted", payload);
    queueCallDismiss(call, call.calleeIds, "accepted");
    return { ok: true, callId, roomId: callRoom(callId) };
  }

  function reject({ user, callId, reason = "rejected" }) {
    const call = callsById.get(callId);
    if (!call || call.status === "ended") return { ok: true, idempotent: true };
    if (!call.calleeIds.includes(user.id)) return { ok: false, code: "forbidden" };
    emitToUser(call.callerId, "rtc:call-rejected", { callId, conversationId: call.conversationId, reason });
    queueCallDismiss(call, call.calleeIds, reason);
    finalize(call);
    return { ok: true };
  }

  function busy({ user, callId }) {
    return reject({ user, callId, reason: "busy" });
  }

  function cancel({ user, callId }) {
    const call = callsById.get(callId);
    if (!call || call.status === "ended") return { ok: true, idempotent: true };
    if (call.callerId !== user.id) return { ok: false, code: "forbidden" };
    for (const id of call.calleeIds) {
      emitToUser(id, "rtc:call-cancelled", { callId, conversationId: call.conversationId, reason: "cancelled" });
    }
    queueCallDismiss(call, call.calleeIds, "cancelled");
    finalize(call);
    return { ok: true };
  }

  function end({ user, callId }) {
    const call = callsById.get(callId);
    if (!call || call.status === "ended") return { ok: true, idempotent: true };
    const isParty = call.callerId === user.id || call.calleeIds.includes(user.id);
    if (!isParty) return { ok: false, code: "forbidden" };
    const payload = { callId, conversationId: call.conversationId, endedBy: user.id, reason: "ended" };
    for (const id of [call.callerId, ...call.calleeIds]) {
      if (id !== user.id) emitToUser(id, "rtc:end", payload);
    }
    queueCallDismiss(call, [call.callerId, ...call.calleeIds], "ended");
    finalize(call);
    return { ok: true };
  }

  function scheduleDisconnectCleanup(call, goneUserId) {
    const key = `${call.callId}:${goneUserId}`;
    if (pendingDisconnects.has(key)) return;
    const handle = setTimeoutFn(() => {
      pendingDisconnects.delete(key);
      const current = callsById.get(call.callId);
      if (!current || current.status === "ended") return;
      const others = [current.callerId, ...current.calleeIds].filter((id) => id !== goneUserId);
      for (const id of others) {
        emitToUser(id, "rtc:end", { callId: current.callId, conversationId: current.conversationId, reason: "peer_disconnected", endedBy: goneUserId });
      }
      queueCallDismiss(current, [current.callerId, ...current.calleeIds], "peer_disconnected");
      finalize(current);
    }, disconnectGraceMs);
    pendingDisconnects.set(key, handle);
  }

  function collectDisconnectCandidates(call, socketId) {
    const candidates = new Set();
    const isCaller = call.callerSocketId === socketId;
    const calleeEntry = Array.from(call.calleeSockets.entries()).find(([, sid]) => sid === socketId);

    if (isCaller) {
      call.callerSocketId = null;
      candidates.add(call.callerId);
    }
    if (calleeEntry) {
      call.calleeSockets.delete(calleeEntry[0]);
      candidates.add(calleeEntry[0]);
    }

    // Tras una reconexion el socket de presence/rtc puede cambiar. callService no debe
    // depender para siempre del socket inicial: si una llamada activa ya perdio ese binding,
    // reconciliamos el participante contra la presencia real en cada disconnect posterior.
    // No se hace durante ringing para no matar antes de tiempo a un callee que aun solo tiene push.
    if (call.status === "active") {
      if (!call.callerSocketId) candidates.add(call.callerId);
      for (const calleeId of call.calleeIds) {
        if (!call.calleeSockets.has(calleeId)) candidates.add(calleeId);
      }
    }

    return candidates;
  }

  async function handleDisconnect(socketId, { isUserConnected } = {}) {
    for (const call of Array.from(callsById.values())) {
      const candidates = collectDisconnectCandidates(call, socketId);
      if (!candidates.size) continue;

      for (const goneUserId of candidates) {
        const stillConnected = isUserConnected ? await isUserConnected(goneUserId) : false;
        if (stillConnected) continue;
        scheduleDisconnectCleanup(call, goneUserId);
      }
    }
  }

  function noteUserReconnected(userId) {
    for (const [key, handle] of Array.from(pendingDisconnects.entries())) {
      if (key.endsWith(`:${userId}`)) {
        clearTimeoutFn(handle);
        pendingDisconnects.delete(key);
      }
    }
  }

  function getCall(callId) {
    const call = callsById.get(callId);
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

  function canJoinCall({ callId, userId, organizationId }) {
    const call = callsById.get(callId);
    if (!call) return { ok: false, reason: "unknown_call" };
    if (call.status === "ended") return { ok: false, reason: "call_ended" };
    if (call.status !== "active") return { ok: false, reason: "not_accepted" };
    if (organizationId && call.organizationId !== organizationId) return { ok: false, reason: "forbidden" };
    const isParticipant = userId === call.callerId || call.calleeIds.includes(userId);
    if (!isParticipant) return { ok: false, reason: "forbidden" };
    return { ok: true, roomId: `call:${callId}`, room: callRoom(callId) };
  }

  function isCallMember(callId, userId) {
    const call = callsById.get(callId);
    if (!call || call.status === "ended") return false;
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
    noteUserReconnected,
    getCall,
    canJoinCall,
    isCallMember,
    _state: { callsById, userState, pendingDisconnects }
  };
}

module.exports = {
  createRtcCallService,
  RING_TIMEOUT_MS,
  DISCONNECT_GRACE_MS,
  callRoom,
  buildIncomingCallDeepLink
};
