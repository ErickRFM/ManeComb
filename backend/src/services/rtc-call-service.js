// RC-MOBILE-CALLS-PRODUCTION-01 — Bloque A: signaling global de llamadas (autoritativo backend).
//
// Estado de llamadas EN MEMORIA (una sola instancia de backend). Si en el futuro hay varias
// replicas, esta reserva debe centralizarse (p.ej. Redis) — ver reporte. La logica es pura respecto
// a la red: recibe un `emitToUser(userId, event, payload)` inyectado y un scheduler inyectable, de
// modo que se prueba en aislamiento (el repo no tiene socket.io-client en tests).
//
// Reglas clave del contrato:
// - El `callId` lo genera el BACKEND (nunca el cliente) y se devuelve por ACK de rtc:call.
// - Sala por llamada: `call:{callId}` (el socket layer la prefija a `rtc:call:{callId}`).
// - Los destinatarios salen de los PARTICIPANTES autorizados de la conversacion (no del cliente).
// - Aislamiento por organizacion: no se timbra fuera del tenant de la conversacion.
// - Reserva de ocupacion por usuario para responder `busy` a llamadas simultaneas.
// - Idempotencia por `callId`: eventos de una llamada ya terminada se ignoran.

const { randomUUID } = require("crypto");
const { getOrganizationId } = require("../middlewares/access-control");

const RING_TIMEOUT_MS = 35000;

function createRtcCallService({
  store,
  emitToUser,
  now = () => Date.now(),
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  ringTimeoutMs = RING_TIMEOUT_MS
} = {}) {
  const callsById = new Map(); // callId -> call
  const userState = new Map(); // userId -> callId (ocupacion)

  const isBusy = (userId) => userState.has(userId);
  const normalizeMode = (mode) => (mode === "video" ? "video" : "audio");
  const roomOf = (callId) => `call:${callId}`;

  function freeUsers(call) {
    for (const userId of [call.callerId, ...call.calleeIds]) {
      if (userState.get(userId) === call.callId) userState.delete(userId);
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
    const safeMode = normalizeMode(mode);

    if (!callerId || !safeConversationId) return { ok: false, reason: "invalid_request" };
    if (!organizationId) return { ok: false, reason: "forbidden" };

    // Acceso a la conversacion (autorizacion) + resolucion de participantes DESDE backend.
    const canAccess = await store.canUserAccessConversation?.(callerId, safeConversationId);
    if (!canAccess) return { ok: false, reason: "forbidden" };
    const conversation = await store.getConversationById?.(safeConversationId);
    if (!conversation) return { ok: false, reason: "forbidden" };
    // Aislamiento por organizacion: la conversacion debe ser del mismo tenant del caller.
    if (String(conversation.organizationId || "").trim() !== organizationId) {
      return { ok: false, reason: "forbidden" };
    }

    const participants = Array.isArray(conversation.participants) ? conversation.participants.map(String) : [];
    const calleeIds = participants.filter((id) => id && id !== callerId);
    if (!calleeIds.length) return { ok: false, reason: "no_recipients" }; // auto-llamada / sin destinatarios

    if (isBusy(callerId)) return { ok: false, reason: "caller_busy" };
    const freeCallees = calleeIds.filter((id) => !isBusy(id));
    if (!freeCallees.length) return { ok: false, reason: "busy" }; // todos ocupados

    const callId = randomUUID();
    const call = {
      callId,
      conversationId: safeConversationId,
      organizationId,
      mode: safeMode,
      callerId,
      callerSocketId: callerSocketId || null,
      calleeIds: freeCallees,
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
    for (const id of freeCallees) userState.set(id, callId);

    const incoming = {
      callId,
      conversationId: safeConversationId,
      mode: safeMode,
      caller: { id: callerId, name: (caller && caller.name) || null }
    };
    for (const id of freeCallees) emitToUser(id, "rtc:incoming-call", incoming);

    call.timeoutHandle = setTimeoutFn(() => onRingTimeout(callId), ringTimeoutMs);
    return { ok: true, callId, roomId: roomOf(callId), status: "ringing", calleeIds: freeCallees };
  }

  function accept({ user, socketId, callId }) {
    const call = callsById.get(callId);
    if (!call || call.status === "ended") return { ok: false, reason: "unknown_call" };
    if (!call.calleeIds.includes(user.id)) return { ok: false, reason: "forbidden" };
    if (call.status === "active") {
      // Idempotente si es el mismo que ya acepto.
      return call.acceptedBy === user.id
        ? { ok: true, callId, roomId: roomOf(callId), idempotent: true }
        : { ok: false, reason: "already_active" };
    }

    call.status = "active";
    call.acceptedBy = user.id;
    call.connectedAt = null; // CONNECTED lo confirma el media pipeline (mobile), no el accept
    if (socketId) call.calleeSockets.set(user.id, socketId);
    if (call.timeoutHandle) {
      clearTimeoutFn(call.timeoutHandle);
      call.timeoutHandle = null;
    }

    // Grupo: cancelar el timbre de los otros destinatarios y liberarlos.
    for (const id of call.calleeIds) {
      if (id !== user.id) {
        emitToUser(id, "rtc:call-cancelled", { callId, conversationId: call.conversationId, reason: "answered_elsewhere" });
        if (userState.get(id) === callId) userState.delete(id);
      }
    }
    call.calleeIds = [user.id];

    const payload = { callId, conversationId: call.conversationId, roomId: roomOf(callId), mode: call.mode, acceptedBy: user.id };
    emitToUser(call.callerId, "rtc:call-accepted", payload);
    emitToUser(user.id, "rtc:call-accepted", payload);
    return { ok: true, callId, roomId: roomOf(callId) };
  }

  function reject({ user, callId, reason = "rejected" }) {
    const call = callsById.get(callId);
    if (!call || call.status === "ended") return { ok: true, idempotent: true };
    if (!call.calleeIds.includes(user.id)) return { ok: false, reason: "forbidden" };
    emitToUser(call.callerId, "rtc:call-rejected", { callId, conversationId: call.conversationId, reason });
    finalize(call);
    return { ok: true };
  }

  // El callee declina por estar ocupado en otra llamada: el caller recibe rejected(reason=busy).
  function busy({ user, callId }) {
    return reject({ user, callId, reason: "busy" });
  }

  function cancel({ user, callId }) {
    const call = callsById.get(callId);
    if (!call || call.status === "ended") return { ok: true, idempotent: true };
    if (call.callerId !== user.id) return { ok: false, reason: "forbidden" };
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
    if (!isParty) return { ok: false, reason: "forbidden" };
    const payload = { callId, conversationId: call.conversationId, endedBy: user.id, reason: "ended" };
    for (const id of [call.callerId, ...call.calleeIds]) {
      if (id !== user.id) emitToUser(id, "rtc:end", payload);
    }
    finalize(call);
    return { ok: true };
  }

  // Un socket que era parte de una llamada se cayo: limpiar la llamada e informar al otro extremo.
  function handleDisconnect(socketId) {
    for (const call of Array.from(callsById.values())) {
      const isCaller = call.callerSocketId === socketId;
      const calleeEntry = Array.from(call.calleeSockets.entries()).find(([, sid]) => sid === socketId);
      if (!isCaller && !calleeEntry) continue;

      const goneUserId = isCaller ? call.callerId : calleeEntry[0];
      const others = [call.callerId, ...call.calleeIds].filter((id) => id !== goneUserId);
      const event = call.status === "ringing"
        ? (isCaller ? "rtc:call-cancelled" : "rtc:call-rejected")
        : "rtc:end";
      const payload = { callId: call.callId, conversationId: call.conversationId, reason: "disconnected", endedBy: goneUserId };
      for (const id of others) emitToUser(id, event, payload);
      finalize(call);
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
    // Solo para pruebas / diagnostico.
    _state: { callsById, userState }
  };
}

module.exports = { createRtcCallService, RING_TIMEOUT_MS };
