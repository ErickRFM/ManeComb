const assert = require("node:assert/strict");

const { createRtcCallService } = require("../src/services/rtc-call-service");

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function createRecordingAuthority() {
  let currentCall = null;
  let reservedTtlMs = null;

  return {
    async reserve(call, { ttlMs } = {}) {
      if (currentCall) return { acquired: false, conflict: "caller", callId: currentCall.callId };
      currentCall = clone(call);
      reservedTtlMs = ttlMs;
      return { acquired: true };
    },
    async getCall(callId) {
      return currentCall?.callId === callId ? clone(currentCall) : null;
    },
    async getCallForUser(userId) {
      if (!currentCall) return null;
      return currentCall.callerId === userId || currentCall.calleeIds.includes(userId)
        ? clone(currentCall)
        : null;
    },
    async compareAndSet(expected, next) {
      if (!currentCall || JSON.stringify(currentCall) !== JSON.stringify(expected)) return false;
      currentCall = clone(next);
      return true;
    },
    async release(expected) {
      if (!currentCall || JSON.stringify(currentCall) !== JSON.stringify(expected)) return false;
      currentCall = null;
      return true;
    },
    async refresh() {
      return Boolean(currentCall);
    },
    get reservedTtlMs() {
      return reservedTtlMs;
    },
    _state: {}
  };
}

(async () => {
  const initialNowMs = Date.parse("2030-01-01T00:00:00.000Z");
  let nowMs = initialNowMs;
  const ringTimeoutMs = 35000;
  const emitted = [];
  const pushed = [];
  const authority = createRecordingAuthority();
  const store = {
    async canUserAccessConversation(userId, conversationId) {
      return userId === "caller-1" && conversationId === "conv-1";
    },
    async getConversationById(conversationId) {
      return conversationId === "conv-1"
        ? {
            id: "conv-1",
            organizationId: "org-1",
            participants: ["caller-1", "callee-1"]
          }
        : null;
    }
  };

  const service = createRtcCallService({
    store,
    liveAuthority: authority,
    now: () => nowMs,
    ringTimeoutMs,
    emitToUser(userId, event, payload) {
      emitted.push({ userId, event, payload });
    },
    async deliverNotification(input) {
      pushed.push(input.payload);
    },
    setTimeoutFn() {
      return { timer: true };
    },
    clearTimeoutFn() {}
  });

  const started = await service.startCall({
    caller: { id: "caller-1", name: "Ana", organizationId: "org-1" },
    conversationId: "conv-1",
    mode: "video"
  });
  await new Promise((resolve) => setImmediate(resolve));

  const expectedExpiry = "2030-01-01T00:00:35.000Z";
  assert.equal(started.ok, true);
  assert.equal(started.expiresAt, expectedExpiry);
  assert.equal(started.ringTimeoutMs, ringTimeoutMs);
  assert.equal(
    authority.reservedTtlMs,
    ringTimeoutMs,
    "Redis ringing lease termina en el mismo deadline, sin ventana safety adicional"
  );

  const incoming = emitted.find((entry) => entry.event === "rtc:incoming-call");
  assert.ok(incoming);
  assert.equal(incoming.userId, "callee-1");
  assert.equal(incoming.payload.expiresAt, expectedExpiry);
  assert.equal(incoming.payload.ringTimeoutMs, ringTimeoutMs);

  assert.equal(pushed.length, 1);
  assert.equal(pushed[0].data.expiresAt, expectedExpiry);
  assert.equal(pushed[0].data.ringTimeoutMs, String(ringTimeoutMs));
  assert.ok(pushed[0].deepLink.includes(`expiresAt=${encodeURIComponent(expectedExpiry)}`));
  assert.ok(pushed[0].deepLink.includes(`ringTimeoutMs=${ringTimeoutMs}`));

  // Incluso si el timer local del nodo originador no corre, el backend no puede aceptar
  // una llamada pasada del deadline. El mismo compare-and-release libera la autoridad obsoleta.
  nowMs = initialNowMs + ringTimeoutMs;
  const expiredAccept = await service.accept({
    user: { id: "callee-1" },
    callId: started.callId
  });
  assert.deepEqual(expiredAccept, { ok: false, code: "call_expired" });
  assert.equal(await authority.getCall(started.callId), null, "ringing vencido fue liberado");

  // La reserva vencida no deja ghost busy: el mismo par puede iniciar una llamada nueva.
  nowMs += 1;
  const retry = await service.startCall({
    caller: { id: "caller-1", name: "Ana", organizationId: "org-1" },
    conversationId: "conv-1",
    mode: "audio"
  });
  assert.equal(retry.ok, true);

  console.log("ok - RTC ringing deadline is transport-visible and backend-authoritative");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
