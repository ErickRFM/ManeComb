// RC-MOBILE-CALLS-PRODUCTION-01 Bloque A — signaling global de llamadas (backend autoritativo).
// Ejercita el servicio real con el store embebido; los efectos de red se capturan con un
// emitToUser fake y un timer inyectable (el repo no tiene socket.io-client en tests).

const assert = require("node:assert/strict");
const { createRtcCallService } = require("../src/services/rtc-call-service");
const { createEmbeddedStore } = require("../src/data/store");

const CONV_DIRECT = "conversation-101"; // [user-admin-01, user-driver-01] (org demo)

function harness() {
  const store = createEmbeddedStore();
  const emits = [];
  let ringCb = null;
  const service = createRtcCallService({
    store,
    emitToUser: (userId, event, payload) => emits.push({ userId, event, payload }),
    setTimeoutFn: (fn) => { ringCb = fn; return Symbol("timer"); },
    clearTimeoutFn: () => { ringCb = null; }
  });
  return {
    store, service, emits,
    triggerRing: () => { if (ringCb) ringCb(); },
    admin: store.getUserById("user-admin-01"),
    driver: store.getUserById("user-driver-01"),
    supervisor: store.getUserById("user-supervisor-01"),
    eventsTo: (userId) => emits.filter((e) => e.userId === userId).map((e) => e.event),
    usersReceiving: (event) => emits.filter((e) => e.event === event).map((e) => e.userId)
  };
}

(async () => {
  // 1. Caller autorizado genera llamada + 2. Solo participantes reciben el evento.
  {
    const h = harness();
    const res = await h.service.startCall({ caller: h.admin, callerSocketId: "sock-a", conversationId: CONV_DIRECT, mode: "audio" });
    assert.equal(res.ok, true, "startCall ok");
    assert.ok(res.callId, "callId generado por backend");
    assert.equal(res.roomId, `call:${res.callId}`, "sala por llamada");
    const rung = h.usersReceiving("rtc:incoming-call");
    assert.deepEqual(rung, ["user-driver-01"], "solo el participante (callee) recibe rtc:incoming-call");
    assert.ok(!h.usersReceiving("rtc:incoming-call").includes("user-admin-01"), "el caller no se auto-timbra");
    console.log("ok - A1/A2: llamada autorizada, callId backend, solo participantes timbrados");
  }

  // 3. Cross-tenant bloqueado (org del caller != org de la conversacion) -> forbidden, sin emitir.
  {
    const h = harness();
    const foreignCaller = { ...h.admin, organizationId: "otra-org-xyz" };
    const res = await h.service.startCall({ caller: foreignCaller, callerSocketId: "sock-x", conversationId: CONV_DIRECT, mode: "audio" });
    assert.equal(res.ok, false, "cross-tenant -> no ok");
    assert.equal(res.reason, "forbidden", "razon forbidden");
    assert.equal(h.emits.length, 0, "cross-tenant no emite nada");
    console.log("ok - A3: cross-tenant bloqueado sin fuga de eventos");
  }

  // Auto-llamada / sin destinatarios (defensa extra).
  {
    const h = harness();
    // Conversacion consigo mismo: forzamos calleeIds vacio via una conversacion directa admin-admin? No existe;
    // en su lugar validamos que un caller que NO es participante -> forbidden.
    const outsider = { id: "user-driver-02", name: "D2", organizationId: h.admin.organizationId };
    const res = await h.service.startCall({ caller: outsider, callerSocketId: "s", conversationId: CONV_DIRECT, mode: "audio" });
    assert.equal(res.ok, false, "no participante -> forbidden");
    console.log("ok - A: no-participante bloqueado");
  }

  // 4. Accept -> call-accepted a caller y callee.
  {
    const h = harness();
    const call = await h.service.startCall({ caller: h.admin, callerSocketId: "sock-a", conversationId: CONV_DIRECT, mode: "audio" });
    const res = h.service.accept({ user: h.driver, socketId: "sock-b", callId: call.callId });
    assert.equal(res.ok, true, "accept ok");
    assert.ok(h.usersReceiving("rtc:call-accepted").includes("user-admin-01"), "caller recibe call-accepted");
    assert.ok(h.usersReceiving("rtc:call-accepted").includes("user-driver-01"), "callee recibe call-accepted");
    console.log("ok - A4: accept notifica a ambos con roomId de la llamada");
  }

  // 5. Reject -> call-rejected al caller, callee liberado.
  {
    const h = harness();
    const call = await h.service.startCall({ caller: h.admin, callerSocketId: "sock-a", conversationId: CONV_DIRECT, mode: "audio" });
    const res = h.service.reject({ user: h.driver, callId: call.callId });
    assert.equal(res.ok, true);
    assert.deepEqual(h.usersReceiving("rtc:call-rejected"), ["user-admin-01"], "solo el caller recibe rejected");
    assert.equal(h.service._state.userState.has("user-driver-01"), false, "callee liberado tras reject");
    console.log("ok - A5: reject");
  }

  // 6. Cancel -> call-cancelled al callee.
  {
    const h = harness();
    const call = await h.service.startCall({ caller: h.admin, callerSocketId: "sock-a", conversationId: CONV_DIRECT, mode: "audio" });
    const res = h.service.cancel({ user: h.admin, callId: call.callId });
    assert.equal(res.ok, true);
    assert.deepEqual(h.usersReceiving("rtc:call-cancelled"), ["user-driver-01"], "el callee recibe cancelled");
    assert.equal(h.service._state.callsById.size, 0, "llamada removida tras cancel");
    console.log("ok - A6: cancel");
  }

  // 7. Busy -> segundo caller al mismo callee ocupado recibe busy (A->B, C->B).
  {
    const h = harness();
    const directSupDriver = h.store.ensureDirectConversation("user-supervisor-01", "user-driver-01");
    await h.service.startCall({ caller: h.admin, callerSocketId: "sock-a", conversationId: CONV_DIRECT, mode: "audio" }); // reserva driver
    const second = await h.service.startCall({ caller: h.supervisor, callerSocketId: "sock-s", conversationId: directSupDriver.id, mode: "audio" });
    assert.equal(second.ok, false, "segundo llamado -> no ok");
    assert.equal(second.reason, "busy", "callee ocupado -> busy");
    console.log("ok - A7: busy (destinatario ya ocupado)");
  }

  // 8. Timeout -> call-timeout a ambos, llamada liberada.
  {
    const h = harness();
    const call = await h.service.startCall({ caller: h.admin, callerSocketId: "sock-a", conversationId: CONV_DIRECT, mode: "audio" });
    h.triggerRing(); // dispara el timeout de ring inyectado
    assert.ok(h.usersReceiving("rtc:call-timeout").includes("user-admin-01"), "caller recibe timeout");
    assert.ok(h.usersReceiving("rtc:call-timeout").includes("user-driver-01"), "callee recibe timeout");
    assert.equal(h.service._state.callsById.size, 0, "llamada liberada tras timeout");
    console.log("ok - A8: timeout de ring");
  }

  // 9. End idempotente.
  {
    const h = harness();
    const call = await h.service.startCall({ caller: h.admin, callerSocketId: "sock-a", conversationId: CONV_DIRECT, mode: "audio" });
    h.service.accept({ user: h.driver, socketId: "sock-b", callId: call.callId });
    const first = h.service.end({ user: h.admin, callId: call.callId });
    assert.equal(first.ok, true);
    assert.deepEqual(h.usersReceiving("rtc:end"), ["user-driver-01"], "el otro extremo recibe end una vez");
    const second = h.service.end({ user: h.admin, callId: call.callId });
    assert.equal(second.ok, true, "end repetido es ok");
    assert.equal(second.idempotent, true, "end repetido es idempotente");
    assert.equal(h.usersReceiving("rtc:end").length, 1, "no re-emite en el end idempotente");
    console.log("ok - A9: end idempotente");
  }

  // 10. Disconnect limpia la llamada e informa al otro extremo.
  {
    const h = harness();
    const call = await h.service.startCall({ caller: h.admin, callerSocketId: "sock-a", conversationId: CONV_DIRECT, mode: "audio" });
    h.service.handleDisconnect("sock-a"); // se cae el caller durante el ring
    assert.ok(h.usersReceiving("rtc:call-cancelled").includes("user-driver-01"), "callee notificado al caerse el caller");
    assert.equal(h.service._state.callsById.size, 0, "llamada limpiada tras disconnect");
    assert.equal(h.service._state.userState.size, 0, "ocupacion liberada tras disconnect");
    console.log("ok - A10: disconnect limpia la llamada");
  }

  console.log("ok - rtc-call-signaling Bloque A: signaling autoritativo, aislamiento, ocupacion e idempotencia");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
