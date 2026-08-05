// RC-MOBILE-CALLS-PRODUCTION-01 Bloque A + A.1 — signaling global de llamadas (backend autoritativo).
// Ejercita el servicio real; los efectos de red se capturan con un emitToUser fake y timers
// inyectables (el repo no tiene socket.io-client en tests). Store real para flujos; fake-store para
// controlar conteo de participantes y payloads.

const assert = require("node:assert/strict");
const { createRtcCallService, callRoom } = require("../src/services/rtc-call-service");
const { createEmbeddedStore } = require("../src/data/store");

const CONV_DIRECT = "conversation-101"; // [user-admin-01, user-driver-01] (org demo) -> directa
const CONV_GROUP = "conversation-ops";  // 4 participantes -> grupal

function harness(store) {
  const emits = [];
  const timers = [];
  const service = createRtcCallService({
    store,
    emitToUser: (userId, event, payload) => emits.push({ userId, event, payload }),
    setTimeoutFn: (fn) => { const h = { fn, cleared: false }; timers.push(h); return h; },
    clearTimeoutFn: (h) => { if (h && typeof h === "object") h.cleared = true; }
  });
  return {
    service, emits, timers,
    runTimers: () => { for (const t of timers) { if (!t.cleared) { t.cleared = true; t.fn(); } } },
    usersReceiving: (event) => emits.filter((e) => e.event === event).map((e) => e.userId),
    payloadOf: (event) => (emits.find((e) => e.event === event) || {}).payload
  };
}

function fakeStore(conversation) {
  return {
    canUserAccessConversation: async (userId, convId) =>
      convId === conversation.id && conversation.participants.includes(userId),
    getConversationById: async (convId) => (convId === conversation.id ? conversation : null)
  };
}

(async () => {
  // ============ Flujos con store real ============
  const store = createEmbeddedStore();
  const admin = store.getUserById("user-admin-01");
  const driver = store.getUserById("user-driver-01");
  const supervisor = store.getUserById("user-supervisor-01");

  // A1/A2: llamada autorizada, callId backend, namespace canonico, solo participante timbrado.
  {
    const h = harness(store);
    const res = await h.service.startCall({ caller: admin, callerSocketId: "sock-a", conversationId: CONV_DIRECT, mode: "audio" });
    assert.equal(res.ok, true);
    assert.ok(res.callId);
    assert.equal(res.roomId, `rtc:call:${res.callId}`, "namespace canonico rtc:call:{callId}");
    assert.deepEqual(h.usersReceiving("rtc:incoming-call"), ["user-driver-01"], "solo el callee es timbrado");
    console.log("ok - A1/A2: autorizada, callId backend, namespace canonico, solo participante");
  }

  // A3: cross-tenant bloqueado.
  {
    const h = harness(store);
    const res = await h.service.startCall({ caller: { ...admin, organizationId: "otra-org" }, callerSocketId: "s", conversationId: CONV_DIRECT, mode: "audio" });
    assert.equal(res.ok, false);
    assert.equal(res.code, "forbidden");
    assert.equal(h.emits.length, 0, "sin fuga de eventos");
    console.log("ok - A3: cross-tenant bloqueado");
  }

  // A.1-1: conversacion GRUPAL rechazada (direct_call_required), sin reservar ni emitir.
  {
    const h = harness(store);
    const res = await h.service.startCall({ caller: admin, callerSocketId: "s", conversationId: CONV_GROUP, mode: "audio" });
    assert.equal(res.ok, false);
    assert.equal(res.code, "direct_call_required", "grupal -> direct_call_required");
    assert.equal(res.callId, undefined, "no genera callId");
    assert.equal(h.emits.length, 0, "no emite rtc:incoming-call");
    assert.equal(h.service._state.userState.size, 0, "no reserva usuarios");
    console.log("ok - A.1-1: conversacion grupal rechazada");
  }

  // A4 accept, A5 reject, A6 cancel, A7 busy, A8 timeout, A9 end idempotente.
  {
    const h = harness(store);
    const call = await h.service.startCall({ caller: admin, callerSocketId: "sock-a", conversationId: CONV_DIRECT, mode: "audio" });
    const acc = h.service.accept({ user: driver, socketId: "sock-b", callId: call.callId });
    assert.equal(acc.ok, true);
    assert.equal(acc.roomId, `rtc:call:${call.callId}`);
    assert.ok(h.usersReceiving("rtc:call-accepted").includes("user-admin-01"));
    assert.ok(h.usersReceiving("rtc:call-accepted").includes("user-driver-01"));
    console.log("ok - A4: accept notifica a ambos");
  }
  {
    const h = harness(store);
    const call = await h.service.startCall({ caller: admin, callerSocketId: "sock-a", conversationId: CONV_DIRECT, mode: "audio" });
    h.service.reject({ user: driver, callId: call.callId });
    assert.deepEqual(h.usersReceiving("rtc:call-rejected"), ["user-admin-01"]);
    assert.equal(h.service._state.userState.size, 0, "liberado tras reject");
    console.log("ok - A5: reject");
  }
  {
    const h = harness(store);
    const call = await h.service.startCall({ caller: admin, callerSocketId: "sock-a", conversationId: CONV_DIRECT, mode: "audio" });
    h.service.cancel({ user: admin, callId: call.callId });
    assert.deepEqual(h.usersReceiving("rtc:call-cancelled"), ["user-driver-01"]);
    console.log("ok - A6: cancel");
  }
  {
    const h = harness(store);
    const directSupDriver = store.ensureDirectConversation("user-supervisor-01", "user-driver-01");
    await h.service.startCall({ caller: admin, callerSocketId: "sock-a", conversationId: CONV_DIRECT, mode: "audio" });
    const second = await h.service.startCall({ caller: supervisor, callerSocketId: "sock-s", conversationId: directSupDriver.id, mode: "audio" });
    assert.equal(second.ok, false);
    assert.equal(second.code, "busy");
    console.log("ok - A7: busy (destinatario ocupado)");
  }
  {
    const h = harness(store);
    const call = await h.service.startCall({ caller: admin, callerSocketId: "sock-a", conversationId: CONV_DIRECT, mode: "audio" });
    h.runTimers(); // dispara el timeout de ring
    assert.ok(h.usersReceiving("rtc:call-timeout").includes("user-admin-01"));
    assert.ok(h.usersReceiving("rtc:call-timeout").includes("user-driver-01"));
    // accept despues de timeout -> unknown_call.
    const late = h.service.accept({ user: driver, socketId: "sock-b", callId: call.callId });
    assert.equal(late.code, "unknown_call", "accept tras timeout rechazado");
    console.log("ok - A8: timeout + accept tardio rechazado");
  }
  {
    const h = harness(store);
    const call = await h.service.startCall({ caller: admin, callerSocketId: "sock-a", conversationId: CONV_DIRECT, mode: "audio" });
    h.service.accept({ user: driver, socketId: "sock-b", callId: call.callId });
    // accept duplicado -> idempotente ok.
    const dupAccept = h.service.accept({ user: driver, socketId: "sock-b", callId: call.callId });
    assert.equal(dupAccept.ok, true);
    assert.equal(dupAccept.idempotent, true, "accept duplicado idempotente");
    const first = h.service.end({ user: admin, callId: call.callId });
    assert.equal(first.ok, true);
    const second = h.service.end({ user: admin, callId: call.callId });
    assert.equal(second.idempotent, true, "end duplicado idempotente");
    assert.equal(h.usersReceiving("rtc:end").length, 1, "no re-emite en end idempotente");
    console.log("ok - A9: accept/end duplicados idempotentes");
  }
  // reject/cancel duplicados idempotentes.
  {
    const h = harness(store);
    const call = await h.service.startCall({ caller: admin, callerSocketId: "sock-a", conversationId: CONV_DIRECT, mode: "audio" });
    h.service.reject({ user: driver, callId: call.callId });
    assert.equal(h.service.reject({ user: driver, callId: call.callId }).idempotent, true, "reject duplicado idempotente");
    assert.equal(h.service.cancel({ user: admin, callId: call.callId }).idempotent, true, "cancel sobre terminada idempotente");
    assert.equal(h.usersReceiving("rtc:call-rejected").length, 1, "no re-emite");
    console.log("ok - A.1: reject/cancel duplicados idempotentes");
  }

  // ============ Disconnect con gracia (A.1-3) ============
  // Definitivo: sin otro socket -> tras gracia, rtc:end reason peer_disconnected + limpieza.
  {
    const h = harness(store);
    const call = await h.service.startCall({ caller: admin, callerSocketId: "sock-a", conversationId: CONV_DIRECT, mode: "audio" });
    h.service.accept({ user: driver, socketId: "sock-b", callId: call.callId });
    await h.service.handleDisconnect("sock-a", { isUserConnected: () => false });
    assert.equal(h.service._state.callsById.size, 1, "durante la gracia la llamada sigue viva");
    h.runTimers(); // vence la gracia
    const endPayload = h.payloadOf("rtc:end");
    assert.equal(endPayload.reason, "peer_disconnected", "notifica peer_disconnected");
    assert.ok(h.usersReceiving("rtc:end").includes("user-driver-01"), "el otro extremo es notificado");
    assert.equal(h.service._state.callsById.size, 0, "llamada liberada tras la gracia");
    console.log("ok - A.1-3: disconnect definitivo tras gracia (peer_disconnected)");
  }
  // Reconexion dentro de la gracia -> se cancela el cleanup.
  {
    const h = harness(store);
    const call = await h.service.startCall({ caller: admin, callerSocketId: "sock-a", conversationId: CONV_DIRECT, mode: "audio" });
    h.service.accept({ user: driver, socketId: "sock-b", callId: call.callId });
    await h.service.handleDisconnect("sock-a", { isUserConnected: () => false });
    h.service.noteUserReconnected("user-admin-01"); // vuelve dentro de la gracia
    h.runTimers();
    assert.equal(h.service._state.callsById.size, 1, "reconexion cancela el cleanup: llamada viva");
    assert.equal(h.usersReceiving("rtc:end").length, 0, "no se emitio end");
    console.log("ok - A.1-3: reconexion dentro de la gracia cancela el cleanup");
  }
  // Conserva otro socket -> no se programa cleanup.
  {
    const h = harness(store);
    const call = await h.service.startCall({ caller: admin, callerSocketId: "sock-a", conversationId: CONV_DIRECT, mode: "audio" });
    h.service.accept({ user: driver, socketId: "sock-b", callId: call.callId });
    await h.service.handleDisconnect("sock-a", { isUserConnected: () => true });
    assert.equal(h.service._state.pendingDisconnects.size, 0, "otro socket vivo -> sin cleanup programado");
    h.runTimers();
    assert.equal(h.service._state.callsById.size, 1, "llamada intacta");
    console.log("ok - A.1-3: conserva otro socket -> sin cleanup");
  }

  // ============ Contrato de payload / modo (fake-store) ============
  const callerA = { id: "u-a", name: "A", organizationId: "org-1" };
  // A.1-4: conversacion INCOMPLETA (1 participante) rechazada.
  {
    const h = harness(fakeStore({ id: "c-1", organizationId: "org-1", participants: ["u-a"] }));
    const res = await h.service.startCall({ caller: callerA, callerSocketId: "s", conversationId: "c-1", mode: "audio" });
    assert.equal(res.code, "direct_call_required", "incompleta -> direct_call_required");
    console.log("ok - A.1-4: conversacion incompleta rechazada");
  }
  // El payload NO puede elegir caller/callee arbitrarios: se usan el usuario autenticado y los
  // participantes reales de la conversacion.
  {
    const conv = { id: "c-2", organizationId: "org-1", participants: ["u-a", "u-b"] };
    const h = harness(fakeStore(conv));
    const res = await h.service.startCall({
      caller: callerA, callerSocketId: "s", conversationId: "c-2", mode: "audio",
      callerId: "u-victim", calleeId: "u-evil", to: "u-evil" // campos maliciosos ignorados
    });
    assert.equal(res.ok, true);
    assert.deepEqual(h.usersReceiving("rtc:incoming-call"), ["u-b"], "callee resuelto del backend, no del payload");
    const incoming = h.payloadOf("rtc:incoming-call");
    assert.equal(incoming.caller.id, "u-a", "caller = usuario autenticado, no el del payload");
    console.log("ok - A.1-4: payload no elige caller/callee arbitrarios");
  }
  // mode invalido -> invalid_mode.
  {
    const h = harness(fakeStore({ id: "c-3", organizationId: "org-1", participants: ["u-a", "u-b"] }));
    const res = await h.service.startCall({ caller: callerA, callerSocketId: "s", conversationId: "c-3", mode: "hologram" });
    assert.equal(res.code, "invalid_mode", "mode invalido rechazado");
    assert.equal(h.emits.length, 0, "no emite con mode invalido");
    console.log("ok - A.1-4: mode invalido rechazado");
  }
  // Namespace: verificacion directa del helper.
  assert.equal(callRoom("abc"), "rtc:call:abc", "callRoom canonico");
  console.log("ok - A.1-2: namespace canonico rtc:call:{callId}");

  console.log("ok - rtc-call-signaling A/A.1: contrato directo, namespace, ocupacion, idempotencia y gracia");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
