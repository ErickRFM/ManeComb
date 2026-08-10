// RC-RTC-SOCKET-LIFECYCLE-20260809
// Active-call grace belongs to the media-owning socket, never to every device of the user.

const assert = require("node:assert/strict");
const { createRtcCallService } = require("../src/services/rtc-call-service");
const { createEmbeddedStore } = require("../src/data/store");

const CONV_DIRECT = "conversation-101";

function harness(store) {
  const emits = [];
  const timers = [];
  let clock = Date.now();
  const service = createRtcCallService({
    store,
    emitToUser: (userId, event, payload) => emits.push({ userId, event, payload }),
    deliverNotification: async () => ({ ok: true }),
    now: () => clock,
    setTimeoutFn: (fn, delay = 0) => {
      const handle = { fn, delay, cleared: false };
      timers.push(handle);
      return handle;
    },
    clearTimeoutFn: (handle) => {
      if (handle && typeof handle === "object") handle.cleared = true;
    }
  });
  return {
    service,
    emits,
    advance(ms) { clock += ms; },
    async runTimers() {
      for (const timer of timers) {
        if (timer.cleared) continue;
        timer.cleared = true;
        clock += Math.max(0, Number(timer.delay) || 0);
        timer.fn();
      }
      for (let index = 0; index < 4; index += 1) await new Promise((resolve) => setImmediate(resolve));
    }
  };
}

(async () => {
  const store = createEmbeddedStore();
  const admin = store.getUserById("user-admin-01");
  const driver = store.getUserById("user-driver-01");

  // A sibling socket is presence only: it cannot refresh or start disconnect cleanup for the call.
  {
    const h = harness(store);
    const call = await h.service.startCall({
      caller: admin,
      callerSocketId: "admin-owner",
      conversationId: CONV_DIRECT,
      mode: "audio"
    });
    await h.service.accept({ user: driver, socketId: "driver-owner", callId: call.callId });

    assert.equal(await h.service.refreshForSocket(admin.id, "admin-sibling", {
      isSocketConnected: async () => true
    }), false);
    assert.equal(await h.service.handleDisconnect(admin.id, { socketId: "admin-sibling" }), false);
    assert.equal(h.service._state.pendingDisconnects.size, 0);
    assert.equal(await h.service.refreshForSocket(admin.id, "admin-owner", {
      isSocketConnected: async () => true
    }), true);
  }

  // Rejoin transfers socket ownership; an old disconnect timer cannot kill the recovered call.
  {
    const h = harness(store);
    const call = await h.service.startCall({
      caller: admin,
      callerSocketId: "admin-old",
      conversationId: CONV_DIRECT,
      mode: "video"
    });
    await h.service.accept({ user: driver, socketId: "driver-owner", callId: call.callId });

    assert.equal(await h.service.handleDisconnect(admin.id, { socketId: "admin-old" }), true);
    assert.equal(h.service._state.pendingDisconnects.size, 1);

    const liveOldOwner = await h.service.canJoinCall({
      callId: call.callId,
      userId: admin.id,
      organizationId: admin.organizationId,
      socketId: "admin-new",
      isSocketConnected: async (socketId) => socketId === "admin-old"
    });
    assert.equal(liveOldOwner.reason, "already_connected_elsewhere");

    const recovered = await h.service.canJoinCall({
      callId: call.callId,
      userId: admin.id,
      organizationId: admin.organizationId,
      socketId: "admin-new",
      isSocketConnected: async () => false
    });
    assert.equal(recovered.ok, true);

    await h.runTimers();
    assert.equal((await h.service.getCall(call.callId)).status, "active");

    assert.equal(await h.service.handleDisconnect(admin.id, { socketId: "admin-new" }), true);
    await h.runTimers();
    assert.equal(await h.service.getCall(call.callId), null);
    assert.ok(h.emits.some((entry) =>
      entry.event === "rtc:end" && entry.userId === driver.id && entry.payload.endedBy === admin.id
    ));
  }

  // If the remote media socket vanishes with its node, the surviving owner's heartbeat starts grace.
  {
    const h = harness(store);
    const call = await h.service.startCall({
      caller: admin,
      callerSocketId: "admin-crashed",
      conversationId: CONV_DIRECT,
      mode: "audio"
    });
    await h.service.accept({ user: driver, socketId: "driver-live", callId: call.callId });

    assert.equal(await h.service.refreshForSocket(driver.id, "driver-live", {
      isSocketConnected: async (socketId) => socketId !== "admin-crashed"
    }), false);
    assert.equal(h.service._state.pendingDisconnects.size, 1);
    await h.runTimers();
    assert.equal(await h.service.getCall(call.callId), null);
  }

  // A reconnect/heartbeat after the grace deadline cannot resurrect the call, even with the same socket id.
  {
    const h = harness(store);
    const call = await h.service.startCall({
      caller: admin,
      callerSocketId: "admin-same-id",
      conversationId: CONV_DIRECT,
      mode: "audio"
    });
    await h.service.accept({ user: driver, socketId: "driver-owner", callId: call.callId });
    assert.equal(await h.service.handleDisconnect(admin.id, { socketId: "admin-same-id" }), true);
    h.advance(15001);

    assert.equal(await h.service.refreshForSocket(admin.id, "admin-same-id", {
      isSocketConnected: async () => true
    }), false);
    assert.equal(await h.service.getCall(call.callId), null);

    const next = await h.service.startCall({
      caller: admin,
      callerSocketId: "admin-late-join",
      conversationId: CONV_DIRECT,
      mode: "audio"
    });
    await h.service.accept({ user: driver, socketId: "driver-next", callId: next.callId });
    assert.equal(await h.service.handleDisconnect(admin.id, { socketId: "admin-late-join" }), true);
    h.advance(15001);
    const lateJoin = await h.service.canJoinCall({
      callId: next.callId,
      userId: admin.id,
      organizationId: admin.organizationId,
      socketId: "admin-late-join",
      isSocketConnected: async () => true
    });
    assert.equal(lateJoin.reason, "call_ended");
    assert.equal(await h.service.getCall(next.callId), null);
  }

  // Ringing remains governed only by its ringing deadline, not active-call disconnect ownership.
  {
    const h = harness(store);
    const call = await h.service.startCall({
      caller: admin,
      callerSocketId: "admin-ring",
      conversationId: CONV_DIRECT,
      mode: "audio"
    });
    assert.equal(await h.service.handleDisconnect(admin.id, { socketId: "admin-ring" }), false);
    assert.equal(h.service._state.pendingDisconnects.size, 0);
    assert.equal((await h.service.getCall(call.callId)).status, "ringing");
  }

  console.log("ok - RTC socket-owned reconnect/disconnect lifecycle has no sibling ghost lease");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
