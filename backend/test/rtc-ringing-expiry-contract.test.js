const assert = require("node:assert/strict");

const { createRtcCallService } = require("../src/services/rtc-call-service");

(async () => {
  const nowMs = Date.parse("2030-01-01T00:00:00.000Z");
  const ringTimeoutMs = 35000;
  const emitted = [];
  const pushed = [];
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

  console.log("ok - RTC ringing expiry contract reaches socket ack, incoming event and push deep link");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
