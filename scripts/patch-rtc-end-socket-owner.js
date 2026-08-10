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
  `  async function end({ user, callId }) {\n    let result;\n    try {\n      result = await releaseCurrent(callId, (call) => {\n        const isParty = call.callerId === user.id || call.calleeIds.includes(user.id);\n        return isParty ? { ok: true } : { ok: false, code: "forbidden" };\n      });`,
  `  async function end({ user, socketId = null, callId }) {\n    const safeSocketId = String(socketId || "").trim() || null;\n    let result;\n    try {\n      result = await releaseCurrent(callId, (call) => {\n        const isParty = call.callerId === user.id || call.calleeIds.includes(user.id);\n        if (!isParty) return { ok: false, code: "forbidden" };\n        if (call.status === "active" && safeSocketId) {\n          const ownerSocketId = socketOwnerId(call, user.id);\n          if (!ownerSocketId || ownerSocketId !== safeSocketId) {\n            return { ok: false, code: "not_call_owner" };\n          }\n        }\n        return { ok: true };\n      });`,
  'active end socket ownership'
);
fs.writeFileSync(servicePath, service);

const testPath = path.resolve(__dirname, '../backend/test/rtc-call-signaling.test.js');
let test = fs.readFileSync(testPath, 'utf8');
const before = `  // End is idempotent and frees both busy slots.\n  {\n    const h = harness(store);\n    const call = await h.service.startCall({ caller: admin, conversationId: CONV_DIRECT, mode: "audio" });\n    await h.service.accept({ user: driver, callId: call.callId });\n    assert.equal((await h.service.end({ user: admin, callId: call.callId })).ok, true);\n    assert.equal((await h.service.end({ user: admin, callId: call.callId })).idempotent, true);\n    assert.equal(h.usersReceiving("rtc:end").length, 1);\n    assert.equal(h.service._state.userState.size, 0);\n  }`;
const after = `  // End is idempotent, frees busy slots and only the media-owning socket can hang up active calls.\n  {\n    const h = harness(store);\n    const call = await h.service.startCall({\n      caller: admin,\n      callerSocketId: "admin-end-owner",\n      conversationId: CONV_DIRECT,\n      mode: "audio"\n    });\n    await h.service.accept({ user: driver, socketId: "driver-end-owner", callId: call.callId });\n    assert.deepEqual(\n      await h.service.end({ user: admin, socketId: "admin-sibling", callId: call.callId }),\n      { ok: false, code: "not_call_owner" }\n    );\n    assert.equal((await h.service.getCall(call.callId)).status, "active");\n    assert.equal((await h.service.end({\n      user: admin,\n      socketId: "admin-end-owner",\n      callId: call.callId\n    })).ok, true);\n    assert.equal((await h.service.end({\n      user: admin,\n      socketId: "admin-end-owner",\n      callId: call.callId\n    })).idempotent, true);\n    assert.equal(h.usersReceiving("rtc:end").length, 1);\n    assert.equal(h.service._state.userState.size, 0);\n  }`;
test = replaceOnce(test, before, after, 'active end regression');
fs.writeFileSync(testPath, test);
console.log('RTC active hangup socket owner patch applied');
