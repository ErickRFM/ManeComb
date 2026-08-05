const assert = require("assert");
const { createRtcCallRegistry } = require("../src/sockets/rtc-call-registry");

async function run() {
  let nextId = 0;
  let scheduled = null;
  const timedOut = [];
  const registry = createRtcCallRegistry({
    timeoutMs: 35000,
    now: () => 1000,
    idFactory: () => `call-${++nextId}`,
    setTimer: (handler, delay) => {
      scheduled = { handler, delay };
      return scheduled;
    },
    clearTimer: (timer) => {
      if (scheduled === timer) scheduled = null;
    },
    onTimeout: (call) => timedOut.push(call)
  });

  const created = registry.create({
    roomId: "conversation-1",
    mode: "video",
    caller: { id: "user-a", name: "A" },
    calleeUserIds: ["user-b", "user-b", "user-a"]
  });
  assert.equal(created.ok, true, "crea una llamada valida");
  assert.equal(created.call.id, "call-1");
  assert.equal(created.call.mode, "video");
  assert.deepEqual(created.call.calleeUserIds, ["user-b"], "normaliza participantes");
  assert.equal(created.call.expiresAt, 36000);
  assert.equal(scheduled.delay, 35000);
  assert.equal(registry.isUserBusy("user-a"), true);
  assert.equal(registry.isUserBusy("user-b"), true);

  const overlapping = registry.create({
    roomId: "conversation-2",
    caller: { id: "user-c", name: "C" },
    calleeUserIds: ["user-b"]
  });
  assert.deepEqual(overlapping, { ok: false, reason: "busy" }, "evita llamadas superpuestas");

  const forbiddenAccept = registry.accept("call-1", "user-c");
  assert.deepEqual(forbiddenAccept, { ok: false, reason: "forbidden" });

  const accepted = registry.accept("call-1", "user-b");
  assert.equal(accepted.ok, true);
  assert.equal(accepted.acceptedBy, "user-b");
  assert.equal(registry.size(), 0, "aceptar liquida el timbrado pendiente");
  assert.equal(registry.isUserBusy("user-a"), false);
  assert.equal(scheduled, null, "aceptar cancela el timeout");

  const group = registry.create({
    roomId: "conversation-group",
    caller: { id: "user-a", name: "A" },
    calleeUserIds: ["user-b", "user-c"]
  });
  const firstReject = registry.reject(group.call.id, "user-b");
  assert.equal(firstReject.ok, true);
  assert.equal(firstReject.final, false, "un rechazo grupal no corta a los demas");
  assert.equal(registry.isUserBusy("user-b"), false);
  assert.equal(registry.isUserBusy("user-c"), true);

  const finalReject = registry.reject(group.call.id, "user-c");
  assert.equal(finalReject.final, true, "el ultimo rechazo cierra la llamada");
  assert.equal(registry.size(), 0);

  const expiring = registry.create({
    roomId: "conversation-timeout",
    caller: { id: "user-a", name: "A" },
    calleeUserIds: ["user-b"]
  });
  assert.equal(expiring.ok, true);
  scheduled.handler();
  assert.equal(registry.size(), 0, "timeout limpia el registro");
  assert.equal(timedOut.length, 1);
  assert.equal(timedOut[0].id, expiring.call.id);

  const disconnecting = registry.create({
    roomId: "conversation-disconnect",
    caller: { id: "user-a", name: "A" },
    calleeUserIds: ["user-b"]
  });
  assert.equal(disconnecting.ok, true);
  const released = registry.releaseUser("user-a");
  assert.equal(released.length, 1);
  assert.equal(released[0].type, "cancelled");
  assert.equal(registry.size(), 0, "desconexion del llamante cancela pendientes");

  console.log("rtc-call-registry.test.js: OK");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
