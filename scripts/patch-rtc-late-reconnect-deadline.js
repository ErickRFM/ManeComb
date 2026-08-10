const fs = require('node:fs');
const path = require('node:path');

const servicePath = path.resolve(__dirname, '../backend/src/services/rtc-call-service.js');
let service = fs.readFileSync(servicePath, 'utf8');

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Missing ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`Non-unique ${label}`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

service = replaceOnce(
  service,
  `        if (!current || current.callId !== call.callId || current.status !== "active") return;\n        if (socketOwnerId(current, goneUserId) !== safeSocketId) return;\n        await finishDisconnectedCall(current, goneUserId);`,
  `        if (!current || current.callId !== call.callId || current.status !== "active") return;\n        if (socketOwnerId(current, goneUserId) !== safeSocketId) return;\n        if (current.disconnectingUserId !== goneUserId) return;\n        if (String(current.disconnectingSocketId || "").trim() !== safeSocketId) return;\n        const deadline = disconnectDeadlineMs(current);\n        if (deadline != null && deadline > now()) return;\n        await finishDisconnectedCall(current, goneUserId);`,
  'disconnect timer authority check'
);

service = replaceOnce(
  service,
  `        const markedUserId = call.disconnectingUserId || null;\n        if (markedUserId && call.disconnectDeadlineAt) {\n          const markedOwner = socketOwnerId(call, markedUserId) || String(call.disconnectingSocketId || "").trim() || null;\n          const markedIsLive = Boolean(`,
  `        const markedUserId = call.disconnectingUserId || null;\n        if (markedUserId && call.disconnectDeadlineAt) {\n          const deadline = disconnectDeadlineMs(call);\n          if (deadline != null && deadline <= now()) {\n            await finishDisconnectedCall(call, markedUserId);\n            return false;\n          }\n          const markedOwner = socketOwnerId(call, markedUserId) || String(call.disconnectingSocketId || "").trim() || null;\n          const markedIsLive = Boolean(`,
  'heartbeat deadline-first ordering'
);

service = replaceOnce(
  service,
  `\n          const deadline = disconnectDeadlineMs(call);\n          if (deadline != null && deadline <= now()) {\n            await finishDisconnectedCall(call, markedUserId);\n            return false;\n          }\n          if (markedOwner) scheduleDisconnectCleanup(call, markedUserId, markedOwner);`,
  `\n          if (markedOwner) scheduleDisconnectCleanup(call, markedUserId, markedOwner);`,
  'remove duplicate heartbeat deadline check'
);

service = replaceOnce(
  service,
  `        const field = socketOwnerField(call, userId);\n        if (!field) return { ok: false, reason: "forbidden" };\n\n        if (!safeSocketId) {`,
  `        const field = socketOwnerField(call, userId);\n        if (!field) return { ok: false, reason: "forbidden" };\n        const deadline = disconnectDeadlineMs(call);\n        if (call.disconnectingUserId && deadline != null && deadline <= now()) {\n          await finishDisconnectedCall(call, call.disconnectingUserId);\n          return { ok: false, reason: "call_ended" };\n        }\n\n        if (!safeSocketId) {`,
  'join deadline-first guard'
);

fs.writeFileSync(servicePath, service);

const testPath = path.resolve(__dirname, '../backend/test/rtc-call-reconnect-lifecycle.test.js');
let test = fs.readFileSync(testPath, 'utf8');
const marker = `  // Ringing remains governed only by its ringing deadline, not active-call disconnect ownership.\n`;
const block = `  // A reconnect/heartbeat after the grace deadline cannot resurrect the call, even with the same socket id.\n  {\n    const h = harness(store);\n    const call = await h.service.startCall({\n      caller: admin,\n      callerSocketId: "admin-same-id",\n      conversationId: CONV_DIRECT,\n      mode: "audio"\n    });\n    await h.service.accept({ user: driver, socketId: "driver-owner", callId: call.callId });\n    assert.equal(await h.service.handleDisconnect(admin.id, { socketId: "admin-same-id" }), true);\n    h.advance(15001);\n\n    assert.equal(await h.service.refreshForSocket(admin.id, "admin-same-id", {\n      isSocketConnected: async () => true\n    }), false);\n    assert.equal(await h.service.getCall(call.callId), null);\n\n    const next = await h.service.startCall({\n      caller: admin,\n      callerSocketId: "admin-late-join",\n      conversationId: CONV_DIRECT,\n      mode: "audio"\n    });\n    await h.service.accept({ user: driver, socketId: "driver-next", callId: next.callId });\n    assert.equal(await h.service.handleDisconnect(admin.id, { socketId: "admin-late-join" }), true);\n    h.advance(15001);\n    const lateJoin = await h.service.canJoinCall({\n      callId: next.callId,\n      userId: admin.id,\n      organizationId: admin.organizationId,\n      socketId: "admin-late-join",\n      isSocketConnected: async () => true\n    });\n    assert.equal(lateJoin.reason, "call_ended");\n    assert.equal(await h.service.getCall(next.callId), null);\n  }\n\n`;
if (!test.includes(marker)) throw new Error('Reconnect test insertion marker not found');
test = test.replace(marker, block + marker);
fs.writeFileSync(testPath, test);
console.log('RTC late reconnect deadline patch applied');
