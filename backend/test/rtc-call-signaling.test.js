// RC-RTC-DISTRIBUTED-AUTHORITY-20260809
// Contract regression for direct-call authorization, lifecycle idempotency, grace cleanup
// and callId-based membership after the live authority became asynchronous/distributed.

const assert = require("node:assert/strict");
const { createRtcCallService, callRoom } = require("../src/services/rtc-call-service");
const { createEmbeddedStore } = require("../src/data/store");

const CONV_DIRECT = "conversation-101";
const CONV_GROUP = "conversation-ops";

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

  async function flushAsync() {
    for (let index = 0; index < 4; index += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  }

  return {
    service,
    emits,
    timers,
    async runTimers() {
      for (const timer of timers) {
        if (timer.cleared) continue;
        timer.cleared = true;
        timer.fn();
      }
      await flushAsync();
    },
    usersReceiving(eventName) {
      return emits.filter((entry) => entry.event === eventName).map((entry) => entry.userId);
    },
    payloadOf(eventName) {
      return emits.find((entry) => entry.event === eventName)?.payload;
    }
  };
}

function fakeStore(conversation) {
  return {
    canUserAccessConversation: async (userId, conversationId) =>
      conversationId === conversation.id && conversation.participants.includes(userId),
    getConversationById: async (conversationId) =>
      conversationId === conversation.id ? conversation : null
  };
}

(async () => {
  const store = createEmbeddedStore();
  const admin = store.getUserById("user-admin-01");
  const driver = store.getUserById("user-driver-01");
  const supervisor = store.getUserById("user-supervisor-01");

  // Authorized direct call: backend chooses callId and only the real callee rings.
  {
    const h = harness(store);
    const result = await h.service.startCall({
      caller: admin,
      conversationId: CONV_DIRECT,
      mode: "audio"
    });
    assert.equal(result.ok, true);
    assert.ok(result.callId);
    assert.equal(result.roomId, `rtc:call:${result.callId}`);
    assert.deepEqual(h.usersReceiving("rtc:incoming-call"), [driver.id]);
    assert.equal(h.service._state.userState.size, 2);
  }

  // Tenant mismatch and non-direct conversations are rejected before reservation/emission.
  {
    const h = harness(store);
    const crossTenant = await h.service.startCall({
      caller: { ...admin, organizationId: "otra-org" },
      conversationId: CONV_DIRECT,
      mode: "audio"
    });
    assert.deepEqual(crossTenant, { ok: false, code: "forbidden" });
    assert.equal(h.emits.length, 0);

    const group = await h.service.startCall({
      caller: admin,
      conversationId: CONV_GROUP,
      mode: "audio"
    });
    assert.equal(group.code, "direct_call_required");
    assert.equal(h.service._state.userState.size, 0);
  }

  // Accept is atomic/idempotent and unlocks callId-based media membership.
  {
    const h = harness(store);
    const call = await h.service.startCall({ caller: admin, conversationId: CONV_DIRECT, mode: "audio" });
    assert.equal((await h.service.canJoinCall({
      callId: call.callId,
      userId: admin.id,
      organizationId: admin.organizationId
    })).reason, "not_accepted");

    const accepted = await h.service.accept({
      user: driver,
      socketId: "driver-socket-a",
      callId: call.callId
    });
    assert.equal(accepted.ok, true);
    assert.equal(accepted.roomId, `rtc:call:${call.callId}`);
    assert.ok(h.usersReceiving("rtc:call-accepted").includes(admin.id));
    assert.ok(h.usersReceiving("rtc:call-accepted").includes(driver.id));

    const duplicate = await h.service.accept({
      user: driver,
      socketId: "driver-socket-a",
      callId: call.callId
    });
    assert.equal(duplicate.ok, true);
    assert.equal(duplicate.idempotent, true);

    const otherDevice = await h.service.accept({
      user: driver,
      socketId: "driver-socket-b",
      callId: call.callId
    });
    assert.deepEqual(otherDevice, { ok: false, code: "answered_elsewhere" });

    const callerJoin = await h.service.canJoinCall({
      callId: call.callId,
      userId: admin.id,
      organizationId: admin.organizationId
    });
    const calleeJoin = await h.service.canJoinCall({
      callId: call.callId,
      userId: driver.id,
      organizationId: admin.organizationId
    });
    assert.equal(callerJoin.ok, true);
    assert.equal(calleeJoin.ok, true);
    assert.equal(callerJoin.room, `rtc:call:${call.callId}`);
    assert.equal(await h.service.isCallMember(call.callId, supervisor.id), false);
  }

  // Reject, cancel and busy release the reservation without duplicate notifications.
  {
    const h = harness(store);
    const call = await h.service.startCall({ caller: admin, conversationId: CONV_DIRECT, mode: "audio" });
    assert.equal((await h.service.reject({ user: driver, callId: call.callId })).ok, true);
    assert.deepEqual(h.usersReceiving("rtc:call-rejected"), [admin.id]);
    assert.equal((await h.service.reject({ user: driver, callId: call.callId })).idempotent, true);
    assert.equal(h.service._state.userState.size, 0);
  }
  {
    const h = harness(store);
    const call = await h.service.startCall({ caller: admin, conversationId: CONV_DIRECT, mode: "video" });
    assert.equal((await h.service.cancel({ user: admin, callId: call.callId })).ok, true);
    assert.deepEqual(h.usersReceiving("rtc:call-cancelled"), [driver.id]);
    assert.equal((await h.service.cancel({ user: admin, callId: call.callId })).idempotent, true);
  }
  {
    const h = harness(store);
    const supervisorDriver = store.ensureDirectConversation(supervisor.id, driver.id);
    await h.service.startCall({ caller: admin, conversationId: CONV_DIRECT, mode: "audio" });
    const second = await h.service.startCall({
      caller: supervisor,
      conversationId: supervisorDriver.id,
      mode: "audio"
    });
    assert.equal(second.ok, false);
    assert.equal(second.code, "busy");
  }

  // Ring timeout owns cleanup; a late accept cannot resurrect the call.
  {
    const h = harness(store);
    const call = await h.service.startCall({ caller: admin, conversationId: CONV_DIRECT, mode: "audio" });
    await h.runTimers();
    assert.ok(h.usersReceiving("rtc:call-timeout").includes(admin.id));
    assert.ok(h.usersReceiving("rtc:call-timeout").includes(driver.id));
    assert.equal(h.service._state.callsById.size, 0);
    assert.equal((await h.service.accept({ user: driver, callId: call.callId })).code, "unknown_call");
  }

  // End is idempotent and frees both busy slots.
  {
    const h = harness(store);
    const call = await h.service.startCall({ caller: admin, conversationId: CONV_DIRECT, mode: "audio" });
    await h.service.accept({ user: driver, callId: call.callId });
    assert.equal((await h.service.end({ user: admin, callId: call.callId })).ok, true);
    assert.equal((await h.service.end({ user: admin, callId: call.callId })).idempotent, true);
    assert.equal(h.usersReceiving("rtc:end").length, 1);
    assert.equal(h.service._state.userState.size, 0);
  }

  // Active disconnect cleanup belongs to the media-owning socket, never every device of the user.
  {
    const h = harness(store);
    const call = await h.service.startCall({
      caller: admin,
      callerSocketId: "admin-owner",
      conversationId: CONV_DIRECT,
      mode: "audio"
    });
    await h.service.accept({ user: driver, socketId: "driver-owner", callId: call.callId });

    assert.equal(await h.service.handleDisconnect(admin.id, { socketId: "admin-sibling" }), false);
    assert.equal(h.service._state.pendingDisconnects.size, 0);
    assert.equal(await h.service.handleDisconnect(admin.id, { socketId: "admin-owner" }), true);
    assert.equal(h.service._state.pendingDisconnects.size, 1);
    await h.runTimers();
    assert.equal(h.service._state.callsById.size, 0);
    assert.equal(h.payloadOf("rtc:end").reason, "peer_disconnected");
    assert.equal(h.payloadOf("rtc:end").endedBy, admin.id);
  }

  // Payload cannot choose caller/callee, and unsupported modes are rejected.
  const callerA = { id: "u-a", name: "A", organizationId: "org-1" };
  {
    const h = harness(fakeStore({ id: "c-1", organizationId: "org-1", participants: ["u-a"] }));
    const result = await h.service.startCall({ caller: callerA, conversationId: "c-1", mode: "audio" });
    assert.equal(result.code, "direct_call_required");
  }
  {
    const h = harness(fakeStore({ id: "c-2", organizationId: "org-1", participants: ["u-a", "u-b"] }));
    const result = await h.service.startCall({
      caller: callerA,
      conversationId: "c-2",
      mode: "audio",
      callerId: "u-victim",
      calleeId: "u-evil",
      to: "u-evil"
    });
    assert.equal(result.ok, true);
    assert.deepEqual(h.usersReceiving("rtc:incoming-call"), ["u-b"]);
    assert.equal(h.payloadOf("rtc:incoming-call").caller.id, "u-a");
  }
  {
    const h = harness(fakeStore({ id: "c-3", organizationId: "org-1", participants: ["u-a", "u-b"] }));
    const result = await h.service.startCall({ caller: callerA, conversationId: "c-3", mode: "hologram" });
    assert.equal(result.code, "invalid_mode");
    assert.equal(h.emits.length, 0);
  }

  assert.equal(callRoom("abc"), "rtc:call:abc");

  // Unknown/foreign/ended callIds cannot join or signal.
  {
    const h = harness(store);
    assert.equal((await h.service.canJoinCall({
      callId: "nope",
      userId: admin.id,
      organizationId: admin.organizationId
    })).reason, "unknown_call");

    const call = await h.service.startCall({ caller: admin, conversationId: CONV_DIRECT, mode: "audio" });
    await h.service.accept({ user: driver, callId: call.callId });
    assert.equal((await h.service.canJoinCall({
      callId: call.callId,
      userId: supervisor.id,
      organizationId: admin.organizationId
    })).reason, "forbidden");
    assert.equal((await h.service.canJoinCall({
      callId: call.callId,
      userId: admin.id,
      organizationId: "otra-org"
    })).reason, "forbidden");
    assert.equal(await h.service.isCallMember(call.callId, admin.id), true);

    await h.service.end({ user: admin, callId: call.callId });
    assert.equal((await h.service.canJoinCall({
      callId: call.callId,
      userId: admin.id,
      organizationId: admin.organizationId
    })).reason, "unknown_call");
    assert.equal(await h.service.getCall(call.callId), null);
    assert.equal(await h.service.isCallMember(call.callId, admin.id), false);
  }

  // A second live socket for the same logical user must never evict the winner from the RTC room.
  {
    const socketSource = require("node:fs").readFileSync(
      require("node:path").join(__dirname, "../src/sockets/index.js"),
      "utf8"
    );
    const joinStart = socketSource.indexOf('socket.on("rtc:join"');
    const joinEnd = socketSource.indexOf('// C.1: leave/offer/answer/ICE/stats', joinStart);
    assert.ok(joinStart >= 0 && joinEnd > joinStart, "rtc:join contract must remain discoverable");
    const joinBlock = socketSource.slice(joinStart, joinEnd);
    assert.ok(joinBlock.includes('reason: "already_connected_elsewhere"'));
    assert.equal(joinBlock.includes('socketsLeave'), false, "a live sibling socket must not evict the active device");
  }

  // Socket integration must never regress back to user-wide lease refresh/reconnect shortcuts.
  {
    const socketSource = require("node:fs").readFileSync(
      require("node:path").join(__dirname, "../src/sockets/index.js"),
      "utf8"
    );
    const heartbeatStart = socketSource.indexOf('socket.on("client:heartbeat"');
    const heartbeatEnd = socketSource.indexOf('socket.on("conversation:join"', heartbeatStart);
    const heartbeatBlock = socketSource.slice(heartbeatStart, heartbeatEnd);
    assert.ok(heartbeatBlock.includes('refreshForSocket(authenticatedUser.id, socket.id'));
    assert.equal(heartbeatBlock.includes('refreshForUser('), false);

    const presenceStart = socketSource.indexOf('socket.on("presence:join"');
    const presenceEnd = socketSource.indexOf('socket.on("client:heartbeat"', presenceStart);
    assert.equal(socketSource.slice(presenceStart, presenceEnd).includes('noteUserReconnected'), false);

    const disconnectStart = socketSource.indexOf('socket.on("disconnect", async () =>');
    const disconnectEnd = socketSource.indexOf('  });\n\n  return io;', disconnectStart);
    const disconnectBlock = socketSource.slice(disconnectStart, disconnectEnd);
    assert.ok(disconnectBlock.includes('handleDisconnect(disconnectedUserId, { socketId: socket.id })'));
    assert.equal(disconnectBlock.includes('isUserConnected:'), false);
  }

  console.log("ok - rtc-call-signaling async authority contract");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
