// RC-RTC-RECONNECT-LIFECYCLE-20260809
// Regression: an active call must remain cleanable after reconnecting with a new socket.

const assert = require("node:assert/strict");
const { createRtcCallService } = require("../src/services/rtc-call-service");
const { createEmbeddedStore } = require("../src/data/store");

const CONV_DIRECT = "conversation-101";

function harness(store) {
  const emits = [];
  const timers = [];
  const service = createRtcCallService({
    store,
    emitToUser: (userId, event, payload) => emits.push({ userId, event, payload }),
    deliverNotification: async () => ({ ok: true }),
    setTimeoutFn: (fn) => {
      const handle = { fn, cleared: false };
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
    runTimers() {
      for (const timer of timers) {
        if (timer.cleared) continue;
        timer.cleared = true;
        timer.fn();
      }
    },
    payloads(eventName) {
      return emits.filter((entry) => entry.event === eventName);
    }
  };
}

(async () => {
  const store = createEmbeddedStore();
  const admin = store.getUserById("user-admin-01");
  const driver = store.getUserById("user-driver-01");

  {
    const h = harness(store);
    const call = await h.service.startCall({
      caller: admin,
      callerSocketId: "sock-a",
      conversationId: CONV_DIRECT,
      mode: "audio"
    });
    assert.equal(call.ok, true);
    assert.equal(h.service.accept({ user: driver, socketId: "sock-b", callId: call.callId }).ok, true);

    await h.service.handleDisconnect("sock-a", {
      isUserConnected: (userId) => userId === driver.id
    });
    assert.equal(h.service._state.pendingDisconnects.size, 1);

    h.service.noteUserReconnected(admin.id);
    assert.equal(h.service._state.pendingDisconnects.size, 0);

    await h.service.handleDisconnect("sock-a2", {
      isUserConnected: (userId) => userId === driver.id
    });
    assert.equal(h.service._state.pendingDisconnects.size, 1);

    h.runTimers();
    assert.equal(h.service._state.callsById.size, 0);
    assert.equal(h.service._state.userState.size, 0);
    const end = h.payloads("rtc:end");
    assert.equal(end.length, 1);
    assert.equal(end[0].userId, driver.id);
    assert.equal(end[0].payload.reason, "peer_disconnected");
    assert.equal(end[0].payload.endedBy, admin.id);
  }

  {
    const h = harness(store);
    const call = await h.service.startCall({
      caller: admin,
      callerSocketId: "sock-a",
      conversationId: CONV_DIRECT,
      mode: "video"
    });
    assert.equal(call.ok, true);
    assert.equal(h.service.accept({ user: driver, socketId: "sock-b", callId: call.callId }).ok, true);

    await h.service.handleDisconnect("sock-b", {
      isUserConnected: (userId) => userId === admin.id
    });
    h.service.noteUserReconnected(driver.id);

    await h.service.handleDisconnect("sock-b2", {
      isUserConnected: (userId) => userId === admin.id
    });
    assert.equal(h.service._state.pendingDisconnects.size, 1);

    h.runTimers();
    assert.equal(h.service._state.callsById.size, 0);
    assert.equal(h.service._state.userState.size, 0);
    const end = h.payloads("rtc:end");
    assert.equal(end.length, 1);
    assert.equal(end[0].userId, admin.id);
    assert.equal(end[0].payload.endedBy, driver.id);
  }

  {
    const h = harness(store);
    const call = await h.service.startCall({
      caller: admin,
      callerSocketId: "sock-a",
      conversationId: CONV_DIRECT,
      mode: "audio"
    });
    h.service.accept({ user: driver, socketId: "sock-b", callId: call.callId });

    await h.service.handleDisconnect("sock-a", {
      isUserConnected: (userId) => userId === driver.id
    });
    h.service.noteUserReconnected(admin.id);

    await h.service.handleDisconnect("unrelated-socket", {
      isUserConnected: () => true
    });
    assert.equal(h.service._state.pendingDisconnects.size, 0);
    assert.equal(h.service._state.callsById.size, 1);
    assert.equal(h.service._state.userState.size, 2);
  }

  {
    const h = harness(store);
    const call = await h.service.startCall({
      caller: admin,
      callerSocketId: "sock-a",
      conversationId: CONV_DIRECT,
      mode: "audio"
    });
    assert.equal(call.ok, true);

    await h.service.handleDisconnect("unrelated-socket", {
      isUserConnected: () => false
    });
    assert.equal(h.service._state.pendingDisconnects.size, 0);
    assert.equal(h.service._state.callsById.size, 1);
  }

  console.log("ok - repeated RTC reconnect/disconnect lifecycle is reconciled without ghost busy state");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
