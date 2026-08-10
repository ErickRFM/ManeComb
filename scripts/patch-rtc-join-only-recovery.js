const fs = require('node:fs');
const path = require('node:path');

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Missing ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`Non-unique ${label}`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

const servicePath = path.resolve(__dirname, '../backend/src/services/rtc-call-service.js');
let service = fs.readFileSync(servicePath, 'utf8');
service = replaceOnce(
  service,
  `          const markedOwner = socketOwnerId(call, markedUserId) || String(call.disconnectingSocketId || "").trim() || null;\n          const markedIsLive = Boolean(\n            markedOwner &&\n            typeof isSocketConnected === "function" &&\n            await isSocketConnected(markedOwner)\n          );\n          if (markedIsLive) {\n            const next = {\n              ...call,\n              disconnectingUserId: null,\n              disconnectingSocketId: null,\n              disconnectDeadlineAt: null\n            };\n            if (await authority.compareAndSet(call, next, { ttlMs: activeLeaseMs })) return true;\n            continue;\n          }\n\n          if (markedOwner) scheduleDisconnectCleanup(call, markedUserId, markedOwner);`,
  `          const markedOwner = socketOwnerId(call, markedUserId) || String(call.disconnectingSocketId || "").trim() || null;\n          // Heartbeat proves transport liveness only. It never proves that media rejoined the RTC room.\n          // Recovery/ownership transfer is exclusively authorized by canJoinCall().\n          if (markedOwner) scheduleDisconnectCleanup(call, markedUserId, markedOwner);`,
  'heartbeat cannot clear disconnect grace'
);

service = replaceOnce(
  service,
  `        const clearingOwnGrace = call.disconnectingUserId === userId;\n        const next = {\n          ...call,\n          [field]: safeSocketId,\n          ...(clearingOwnGrace\n            ? {\n                disconnectingUserId: null,\n                disconnectingSocketId: null,\n                disconnectDeadlineAt: null\n              }\n            : {})\n        };\n        const ttlMs = clearingOwnGrace ? activeLeaseMs : leaseTtlForCall(call);`,
  `        const clearingOwnGrace = call.disconnectingUserId === userId;\n        let missingPeer = null;\n        if (clearingOwnGrace && typeof isSocketConnected === "function") {\n          for (const peerId of callParticipantIds(call).filter((id) => id !== userId)) {\n            const peerSocketId = socketOwnerId(call, peerId);\n            if (!peerSocketId || !(await isSocketConnected(peerSocketId))) {\n              missingPeer = { userId: peerId, socketId: peerSocketId };\n              break;\n            }\n          }\n        }\n        const next = {\n          ...call,\n          [field]: safeSocketId,\n          ...(clearingOwnGrace\n            ? missingPeer\n              ? {\n                  disconnectingUserId: missingPeer.userId,\n                  disconnectingSocketId: missingPeer.socketId,\n                  disconnectDeadlineAt: call.disconnectDeadlineAt\n                }\n              : {\n                  disconnectingUserId: null,\n                  disconnectingSocketId: null,\n                  disconnectDeadlineAt: null\n                }\n            : {})\n        };\n        const ttlMs = clearingOwnGrace\n          ? missingPeer ? leaseTtlForCall(call) : activeLeaseMs\n          : leaseTtlForCall(call);`,
  'join recovery preserves missing peer grace'
);
service = replaceOnce(
  service,
  `        if (await authority.compareAndSet(call, next, { ttlMs })) {\n          return { ok: true, roomId: \`call:\${callId}\`, room: callRoom(callId) };\n        }`,
  `        if (await authority.compareAndSet(call, next, { ttlMs })) {\n          if (missingPeer?.socketId) {\n            scheduleDisconnectCleanup(next, missingPeer.userId, missingPeer.socketId);\n          }\n          return { ok: true, roomId: \`call:\${callId}\`, room: callRoom(callId) };\n        }`,
  'schedule transferred peer grace'
);
fs.writeFileSync(servicePath, service);

const socketPath = path.resolve(__dirname, '../backend/src/sockets/index.js');
let sockets = fs.readFileSync(socketPath, 'utf8');
sockets = replaceOnce(
  sockets,
  `    socket.on("rtc:leave", async ({ callId } = {}) => {\n      const startedAt = Date.now();\n      const safeRoomId = callRoomIdOf(callId);\n      if (safeRoomId) await leaveRtcRoom(socket, safeRoomId);\n      observeSocketEvent(socket, "rtc:leave", startedAt, "success", { callId: String(callId || "") || null });\n    });`,
  `    socket.on("rtc:leave", async ({ callId } = {}) => {\n      const startedAt = Date.now();\n      const safeCallId = String(callId || "").trim();\n      const safeRoomId = callRoomIdOf(safeCallId);\n      if (safeRoomId) await leaveRtcRoom(socket, safeRoomId);\n      const userId = socket.data.user?.id || null;\n      if (safeCallId && userId) {\n        await callService.handleDisconnect(userId, { socketId: socket.id });\n      }\n      observeSocketEvent(socket, "rtc:leave", startedAt, "success", { callId: safeCallId || null });\n    });`,
  'rtc leave lifecycle fallback'
);
fs.writeFileSync(socketPath, sockets);

const reconnectPath = path.resolve(__dirname, '../backend/test/rtc-call-reconnect-lifecycle.test.js');
let reconnect = fs.readFileSync(reconnectPath, 'utf8');
reconnect = replaceOnce(
  reconnect,
  `    const recovered = await h.service.canJoinCall({\n      callId: call.callId,\n      userId: admin.id,\n      organizationId: admin.organizationId,\n      socketId: "admin-new",\n      isSocketConnected: async () => false\n    });`,
  `    const recovered = await h.service.canJoinCall({\n      callId: call.callId,\n      userId: admin.id,\n      organizationId: admin.organizationId,\n      socketId: "admin-new",\n      isSocketConnected: async (socketId) => socketId === "driver-owner"\n    });`,
  'peer-live reconnect contract'
);
const marker = `  // A reconnect/heartbeat after the grace deadline cannot resurrect the call, even with the same socket id.\n`;
const block = `  // Heartbeat alone never recovers media; rtc:join is the only grace-clearing authority.\n  {\n    const h = harness(store);\n    const call = await h.service.startCall({\n      caller: admin,\n      callerSocketId: "admin-leave-owner",\n      conversationId: CONV_DIRECT,\n      mode: "audio"\n    });\n    await h.service.accept({ user: driver, socketId: "driver-leave-owner", callId: call.callId });\n    assert.equal(await h.service.handleDisconnect(admin.id, { socketId: "admin-leave-owner" }), true);\n    assert.equal(await h.service.refreshForSocket(admin.id, "admin-leave-owner", {\n      isSocketConnected: async () => true\n    }), false, "heartbeat cannot clear a media disconnect marker");\n    assert.equal(h.service._state.callsById.get(call.callId).disconnectingUserId, admin.id);\n\n    const rejoin = await h.service.canJoinCall({\n      callId: call.callId,\n      userId: admin.id,\n      organizationId: admin.organizationId,\n      socketId: "admin-leave-owner",\n      isSocketConnected: async () => true\n    });\n    assert.equal(rejoin.ok, true);\n    assert.equal(h.service._state.callsById.get(call.callId).disconnectingUserId, null);\n    assert.equal(await h.service.refreshForSocket(admin.id, "admin-leave-owner", {\n      isSocketConnected: async () => true\n    }), true);\n  }\n\n  // If both owners disappear, the first rejoin transfers the existing grace to the still-missing peer.\n  {\n    const h = harness(store);\n    const call = await h.service.startCall({\n      caller: admin,\n      callerSocketId: "admin-both-old",\n      conversationId: CONV_DIRECT,\n      mode: "video"\n    });\n    await h.service.accept({ user: driver, socketId: "driver-both-old", callId: call.callId });\n    assert.equal(await h.service.handleDisconnect(admin.id, { socketId: "admin-both-old" }), true);\n    assert.equal(await h.service.handleDisconnect(driver.id, { socketId: "driver-both-old" }), true);\n\n    const rejoin = await h.service.canJoinCall({\n      callId: call.callId,\n      userId: admin.id,\n      organizationId: admin.organizationId,\n      socketId: "admin-both-new",\n      isSocketConnected: async () => false\n    });\n    assert.equal(rejoin.ok, true);\n    const active = h.service._state.callsById.get(call.callId);\n    assert.equal(active.callerSocketId, "admin-both-new");\n    assert.equal(active.disconnectingUserId, driver.id);\n    assert.equal(active.disconnectingSocketId, "driver-both-old");\n    await h.runTimers();\n    assert.equal(await h.service.getCall(call.callId), null);\n  }\n\n`;
if (!reconnect.includes(marker)) throw new Error('join-only recovery test marker not found');
reconnect = reconnect.replace(marker, block + marker);
fs.writeFileSync(reconnectPath, reconnect);

const signalingPath = path.resolve(__dirname, '../backend/test/rtc-call-signaling.test.js');
let signaling = fs.readFileSync(signalingPath, 'utf8');
signaling = replaceOnce(
  signaling,
  `    const disconnectStart = socketSource.indexOf('socket.on("disconnect", async () =>');\n    const disconnectEnd = socketSource.indexOf('  });\\n\\n  return io;', disconnectStart);\n    const disconnectBlock = socketSource.slice(disconnectStart, disconnectEnd);\n    assert.ok(disconnectBlock.includes('handleDisconnect(disconnectedUserId, { socketId: socket.id })'));\n    assert.equal(disconnectBlock.includes('isUserConnected:'), false);`,
  `    const leaveStart = socketSource.indexOf('socket.on("rtc:leave"');\n    const leaveEnd = socketSource.indexOf('["rtc:offer", "rtc:answer", "rtc:ice-candidate"]', leaveStart);\n    const leaveBlock = socketSource.slice(leaveStart, leaveEnd);\n    assert.ok(leaveBlock.includes('handleDisconnect(userId, { socketId: socket.id })'));\n\n    const disconnectStart = socketSource.indexOf('socket.on("disconnect", async () =>');\n    const disconnectEnd = socketSource.indexOf('  });\\n\\n  return io;', disconnectStart);\n    const disconnectBlock = socketSource.slice(disconnectStart, disconnectEnd);\n    assert.ok(disconnectBlock.includes('handleDisconnect(disconnectedUserId, { socketId: socket.id })'));\n    assert.equal(disconnectBlock.includes('isUserConnected:'), false);`,
  'socket leave lifecycle contract'
);
fs.writeFileSync(signalingPath, signaling);

console.log('RTC join-only recovery patch applied');
