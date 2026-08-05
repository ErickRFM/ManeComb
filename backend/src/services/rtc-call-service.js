// RC-MOBILE-CALLS-PRODUCTION-01 — Bloque A + A.1: signaling global de llamadas (autoritativo backend).
//
// Estado de llamadas EN MEMORIA (una sola instancia de backend). Si en el futuro hay varias
// replicas, esta reserva debe centralizarse (p.ej. Redis) — ver reporte. La logica es pura respecto
// a la red: recibe un `emitToUser(userId, event, payload)` inyectado y timers inyectables, de modo
// que se prueba en aislamiento (el repo no tiene socket.io-client en tests).
//
// Reglas del contrato:
// - El `callId` lo genera el BACKEND (nunca el cliente) y se devuelve por ACK de rtc:call.
// - Solo llamadas DIRECTAS: conversacion con exactamente 2 participantes (caller + 1 callee).
// - Sala canonica por llamada: `rtc:call:{callId}` (namespace unico; sin `call:{callId}`).
// - Destinatario resuelto por backend desde participantes de la conversacion (no desde el cliente).
// - Aislamiento por organizacion.
// - Reserva de ocupacion por usuario para responder `busy`.
// - Idempotencia por `callId`.
// - Disconnect con GRACIA de 15s alineada con la retencion RTC.

const { randomUUID } = require("crypto");
const { getOrganizationId } = require("../middlewares/access-control");

const RING_TIMEOUT_MS = 35000;
const DISCONNECT_GRACE_MS = 15000;

function callRoom(callId) {
  return `rtc:call:${callId}`;
}

function createRtcCallService({
  store,
  emitToUser,
  now = () => Date.now(),
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  ringTimeoutMs = RING_TIMEOUT_MS,
  disconnectGraceMs = DISCONNECT_GRACE_MS
} = {}) {
  const callsById = new Map(); // callId -> call
  const userState = new Map(); // userId -> callId (ocupacion)
  const pendingDisconnects = new Map(); // `${callId}:${userId}` -> timer handle

  const isBusy = (userId) => userState.has(userId);

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
    finalize(call);
  }

  async function startCall({ caller, callerSocketId, conversationId, mode }) {
    const callerId = caller && caller.id;
    const organizationId = getOrganizationId(caller);
    const safeConversationId = String(conversationId || "").trim();

    if (!callerId || !safeConversationId) return { ok: false, code: "invalid_request" };
    if (!organizationId) return { ok: false, code: "forbidden" };

    // Modo estricto: solo audio/video. Ausente => audio.
    const rawMode = mode == null ? "audio" : String(mode);
    if (rawMode !== "audio" && rawMode !== "video") return { ok: false, code: "invalid_mode" };

    // Acceso a la conversacion (autorizacion) + resolucion de participantes DESDE backend.
    const canAccess = await store.canUserAccessConversation?.(callerId, safeConversationId);
    if (!canAccess) return { ok: false, code: "forbidden" };
    const conversation = await store.getConversationById?.(safeConversationId);
    if (!conversation) return { ok: false, code: "forbidden" };
    // Aislamiento por organizacion.
    if (String(conversation.organizationId || "").trim() !== organizationId) {
      return { ok: false, code: "forbidden" };
    }

    // Solo llamadas DIRECTAS: exactamente 2 participantes (caller + 1 callee distinto).
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
      calleeSockets: new Map(), // userId -> socketId (al aceptar)
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

    call.timeoutHandle = setTimeoutFn(() => onRingTimeout(callId), ringTimeoutMs);
    return { ok: true, callId, roomId: callRoom(callId), status: "ringing", calleeId };
  }

  function accept({ user, socketId, callId }) {
    const call = callsById.get(callId);
    if (!call || call.status === "ended") return { ok: false, code: "unknown_call" }; // idempotente/tras timeout
    if (!call.calleeIds.includes(user.id)) return { ok: false, code: "forbidden" };
    if (call.status === "active") {
      return call.acceptedBy === user.id
        ? { ok: true, callId, roomId: callRoom(callId), idempotent: true } // accept duplicado
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
    return { ok: true, callId, roomId: callRoom(callId) };
  }

  function reject({ user, callId, reason = "rejected" }) {
    const call = callsById.get(callId);
    if (!call || call.status === "ended") return { ok: true, idempotent: true };
    if (!call.calleeIds.includes(user.id)) return { ok: false, code: "forbidden" };
    emitToUser(call.callerId, "rtc:call-rejected", { callId, conversationId: call.conversationId, reason });
    finalize(call);
    return { ok: true };
  }

  // El callee declina por estar ocupado: el caller recibe rejected(reason=busy).
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
    finalize(call);
    return { ok: true };
  }

  function scheduleDisconnectCleanup(call, goneUserId) {
    const key = `${call.callId}:${goneUserId}`;
    if (pendingDisconnects.has(key)) return; // idempotente
    const handle = setTimeoutFn(() => {
      pendingDisconnects.delete(key);
      const current = callsById.get(call.callId);
      if (!current || current.status === "ended") return;
      const others = [current.callerId, ...current.calleeIds].filter((id) => id !== goneUserId);
      for (const id of others) {
        emitToUser(id, "rtc:end", { callId: current.callId, conversationId: current.conversationId, reason: "peer_disconnected", endedBy: goneUserId });
      }
      finalize(current);
    }, disconnectGraceMs);
    pendingDisconnects.set(key, handle);
  }

  // Un socket que era parte de una llamada se cayo. Gracia de 15s: no se limpia si el usuario
  // conserva/recupera otro socket autenticado dentro del plazo.
  // isUserConnected(userId) -> boolean (o Promise<boolean>): hay OTRO socket vivo del usuario.
  async function handleDisconnect(socketId, { isUserConnected } = {}) {
    for (const call of Array.from(callsById.values())) {
      const isCaller = call.callerSocketId === socketId;
      const calleeEntry = Array.from(call.calleeSockets.entries()).find(([, sid]) => sid === socketId);
      if (!isCaller && !calleeEntry) continue;

      const goneUserId = isCaller ? call.callerId : calleeEntry[0];
      // Desasociar el socket caido (no lo vuelve a contar un disconnect posterior).
      if (isCaller) call.callerSocketId = null;
      else call.calleeSockets.delete(goneUserId);

      // Si conserva otro socket activo, no iniciar cleanup.
      const stillConnected = isUserConnected ? await isUserConnected(goneUserId) : false;
      if (stillConnected) continue;

      scheduleDisconnectCleanup(call, goneUserId);
    }
  }

  // El usuario recupero un socket autenticado dentro de la gracia: cancelar su cleanup pendiente.
  function noteUserReconnected(userId) {
    for (const [key, handle] of Array.from(pendingDisconnects.entries())) {
      if (key.endsWith(`:${userId}`)) {
        clearTimeoutFn(handle);
        pendingDisconnects.delete(key);
      }
    }
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
    // Solo para pruebas / diagnostico.
    _state: { callsById, userState, pendingDisconnects }
  };
}

module.exports = { createRtcCallService, RING_TIMEOUT_MS, DISCONNECT_GRACE_MS, callRoom };
