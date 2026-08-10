const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function file(relative) {
  return path.join(root, relative);
}

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Missing ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`Non-unique ${label}`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function replaceBetween(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`Missing start ${label}`);
  const end = source.indexOf(endMarker, start);
  if (end < 0) throw new Error(`Missing end ${label}`);
  return source.slice(0, start) + replacement + source.slice(end);
}

function update(relative, transform) {
  const target = file(relative);
  const source = fs.readFileSync(target, 'utf8');
  const next = transform(source);
  if (next === source) throw new Error(`No changes produced for ${relative}`);
  fs.writeFileSync(target, next);
}

update('backend/src/modules/rtc/live-authority.js', (source) => {
  source = replaceOnce(
    source,
    `const REFRESH_SCRIPT = \`\nlocal current = redis.call("get", KEYS[1])\nif not current then return 0 end\nredis.call("pexpire", KEYS[1], ARGV[2])\nfor i = 2, #KEYS do\n  if redis.call("get", KEYS[i]) == ARGV[1] then\n    redis.call("pexpire", KEYS[i], ARGV[2])\n  end\nend\nreturn 1\n\`;`,
    `const REFRESH_SCRIPT = \`\nlocal current = redis.call("get", KEYS[1])\nif not current then return 0 end\nif current ~= ARGV[1] then return -1 end\nredis.call("pexpire", KEYS[1], ARGV[3])\nfor i = 2, #KEYS do\n  if redis.call("get", KEYS[i]) == ARGV[2] then\n    redis.call("pexpire", KEYS[i], ARGV[3])\n  end\nend\nreturn 1\n\`;`,
    'compare-and-refresh script'
  );
  source = replaceOnce(
    source,
    `    if (!call?.callId) return false;\n    if (!distributed) return localCalls.has(call.callId);\n    assertDistributedAuthority();\n    const result = await redisClient.eval(REFRESH_SCRIPT, {\n      keys: keysForCall(call),\n      arguments: [call.callId, String(ttlMs)]\n    });\n    return Number(result) === 1;`,
    `    if (!call?.callId) return false;\n    if (!distributed) {\n      const current = localCalls.get(call.callId);\n      return Boolean(current) && JSON.stringify(current) === JSON.stringify(call);\n    }\n    assertDistributedAuthority();\n    const result = await redisClient.eval(REFRESH_SCRIPT, {\n      keys: keysForCall(call),\n      arguments: [JSON.stringify(call), call.callId, String(ttlMs)]\n    });\n    return Number(result) === 1;`,
    'refresh arguments'
  );
  return source;
});

update('backend/test/helpers/fake-redis.js', (source) => replaceOnce(
  source,
  `      // live-authority refresh.\n      if (script.includes('redis.call("pexpire", KEYS[1], ARGV[2])')) {\n        return shared.has(keys[0]) ? 1 : 0;\n      }`,
  `      // live-authority compare-and-refresh.\n      if (script.includes('redis.call("pexpire", KEYS[1], ARGV[3])')) {\n        const current = shared.get(keys[0]);\n        if (!current) return 0;\n        if (current !== args[0]) return -1;\n        return 1;\n      }`,
  'fake redis refresh'
));

update('backend/src/services/rtc-call-service.js', (source) => {
  source = replaceOnce(
    source,
    '  async function startCall({ caller, conversationId, mode }) {\n    const callerId = caller && caller.id;',
    '  async function startCall({ caller, callerSocketId = null, conversationId, mode }) {\n    const callerId = caller && caller.id;\n    const safeCallerSocketId = String(callerSocketId || "").trim() || null;',
    'start call socket signature'
  );
  source = replaceOnce(
    source,
    '      callerId,\n      calleeIds: [calleeIds[0]],\n      status: "ringing",\n      acceptedBy: null,\n      acceptedSocketId: null,',
    '      callerId,\n      callerSocketId: safeCallerSocketId,\n      calleeIds: [calleeIds[0]],\n      status: "ringing",\n      acceptedBy: null,\n      acceptedSocketId: null,\n      disconnectingUserId: null,\n      disconnectingSocketId: null,\n      disconnectDeadlineAt: null,',
    'initial socket lifecycle fields'
  );

  const lifecycleBlock = `  function socketOwnerField(call, userId) {\n    if (call?.callerId === userId) return "callerSocketId";\n    if (call?.acceptedBy === userId && call?.calleeIds?.includes(userId)) return "acceptedSocketId";\n    return null;\n  }\n\n  function socketOwnerId(call, userId) {\n    const field = socketOwnerField(call, userId);\n    if (!field) return null;\n    return String(call?.[field] || "").trim() || null;\n  }\n\n  function callParticipantIds(call) {\n    return [...new Set([call?.callerId, ...(Array.isArray(call?.calleeIds) ? call.calleeIds : [])].filter(Boolean))];\n  }\n\n  function disconnectDeadlineMs(call) {\n    const parsed = Date.parse(String(call?.disconnectDeadlineAt || ""));\n    return Number.isFinite(parsed) ? parsed : null;\n  }\n\n  function leaseTtlForCall(call) {\n    const deadline = disconnectDeadlineMs(call);\n    return deadline == null ? activeLeaseMs : Math.max(1, deadline - now());\n  }\n\n  async function finishDisconnectedCall(call, goneUserId) {\n    if (!call || call.status !== "active") return false;\n    if (!await authority.release(call)) return false;\n    clearLocalRingTimer(call.callId);\n    clearPendingDisconnectsForCall(call.callId);\n    const others = callParticipantIds(call).filter((id) => id !== goneUserId);\n    for (const id of others) {\n      emitToUser(id, "rtc:end", {\n        callId: call.callId,\n        conversationId: call.conversationId,\n        reason: "peer_disconnected",\n        endedBy: goneUserId\n      });\n    }\n    queueCallDismiss(call, callParticipantIds(call), "peer_disconnected");\n    return true;\n  }\n\n  function scheduleDisconnectCleanup(call, goneUserId, socketId) {\n    const safeSocketId = String(socketId || "").trim();\n    if (!call?.callId || !goneUserId || !safeSocketId) return;\n    const key = \`\${call.callId}:\${goneUserId}:\${safeSocketId}\`;\n    if (pendingDisconnects.has(key)) return;\n    const deadline = disconnectDeadlineMs(call);\n    const delayMs = deadline == null ? disconnectGraceMs : Math.max(1, deadline - now());\n    const handle = setTimeoutFn(() => {\n      pendingDisconnects.delete(key);\n      void (async () => {\n        const current = await authority.getCallForUser(goneUserId);\n        if (!current || current.callId !== call.callId || current.status !== "active") return;\n        if (socketOwnerId(current, goneUserId) !== safeSocketId) return;\n        await finishDisconnectedCall(current, goneUserId);\n      })().catch(() => undefined);\n    }, delayMs);\n    pendingDisconnects.set(key, handle);\n  }\n\n  async function markDisconnectGrace(callId, goneUserId, socketId) {\n    const safeSocketId = String(socketId || "").trim();\n    if (!callId || !goneUserId || !safeSocketId) return false;\n    for (let attempt = 0; attempt < MUTATION_RETRIES; attempt += 1) {\n      const current = await authority.getCall(callId);\n      if (!current || current.status !== "active") return false;\n      if (socketOwnerId(current, goneUserId) !== safeSocketId) return false;\n      if (current.disconnectingUserId && current.disconnectDeadlineAt) {\n        scheduleDisconnectCleanup(current, goneUserId, safeSocketId);\n        return true;\n      }\n      const deadlineAt = new Date(now() + disconnectGraceMs).toISOString();\n      const next = {\n        ...current,\n        disconnectingUserId: goneUserId,\n        disconnectingSocketId: safeSocketId,\n        disconnectDeadlineAt: deadlineAt\n      };\n      if (await authority.compareAndSet(current, next, { ttlMs: disconnectGraceMs })) {\n        scheduleDisconnectCleanup(next, goneUserId, safeSocketId);\n        return true;\n      }\n    }\n    return false;\n  }\n\n  async function handleDisconnect(userId, { socketId } = {}) {\n    const safeSocketId = String(socketId || "").trim();\n    if (!userId || !safeSocketId) return false;\n    try {\n      const call = await authority.getCallForUser(userId);\n      if (!call || call.status !== "active") return false;\n      if (socketOwnerId(call, userId) !== safeSocketId) return false;\n      return await markDisconnectGrace(call.callId, userId, safeSocketId);\n    } catch {\n      return false;\n    }\n  }\n\n  async function refreshForSocket(userId, socketId, { isSocketConnected } = {}) {\n    const safeSocketId = String(socketId || "").trim();\n    if (!userId || !safeSocketId) return false;\n    try {\n      for (let attempt = 0; attempt < MUTATION_RETRIES; attempt += 1) {\n        const call = await authority.getCallForUser(userId);\n        if (!call || call.status !== "active") return false;\n        if (socketOwnerId(call, userId) !== safeSocketId) return false;\n\n        const markedUserId = call.disconnectingUserId || null;\n        if (markedUserId && call.disconnectDeadlineAt) {\n          const markedOwner = socketOwnerId(call, markedUserId) || String(call.disconnectingSocketId || "").trim() || null;\n          const markedIsLive = Boolean(\n            markedOwner &&\n            typeof isSocketConnected === "function" &&\n            await isSocketConnected(markedOwner)\n          );\n          if (markedIsLive) {\n            const next = {\n              ...call,\n              disconnectingUserId: null,\n              disconnectingSocketId: null,\n              disconnectDeadlineAt: null\n            };\n            if (await authority.compareAndSet(call, next, { ttlMs: activeLeaseMs })) return true;\n            continue;\n          }\n\n          const deadline = disconnectDeadlineMs(call);\n          if (deadline != null && deadline <= now()) {\n            await finishDisconnectedCall(call, markedUserId);\n            return false;\n          }\n          if (markedOwner) scheduleDisconnectCleanup(call, markedUserId, markedOwner);\n          if (await authority.refresh(call, { ttlMs: leaseTtlForCall(call) })) return false;\n          continue;\n        }\n\n        if (typeof isSocketConnected === "function") {\n          const peers = callParticipantIds(call).filter((id) => id !== userId);\n          let missingPeer = null;\n          for (const peerId of peers) {\n            const peerSocketId = socketOwnerId(call, peerId);\n            if (!peerSocketId || !(await isSocketConnected(peerSocketId))) {\n              missingPeer = { userId: peerId, socketId: peerSocketId };\n              break;\n            }\n          }\n          if (missingPeer) {\n            if (!missingPeer.socketId) return false;\n            const deadlineAt = new Date(now() + disconnectGraceMs).toISOString();\n            const next = {\n              ...call,\n              disconnectingUserId: missingPeer.userId,\n              disconnectingSocketId: missingPeer.socketId,\n              disconnectDeadlineAt: deadlineAt\n            };\n            if (await authority.compareAndSet(call, next, { ttlMs: disconnectGraceMs })) {\n              scheduleDisconnectCleanup(next, missingPeer.userId, missingPeer.socketId);\n              return false;\n            }\n            continue;\n          }\n        }\n\n        if (await authority.refresh(call, { ttlMs: activeLeaseMs })) return true;\n      }\n      return false;\n    } catch {\n      return false;\n    }\n  }\n\n`;
  source = replaceBetween(
    source,
    '  function scheduleDisconnectCleanup(',
    '  async function getCall(callId) {',
    lifecycleBlock,
    'socket-aware lifecycle block'
  );

  const joinBlock = `  async function canJoinCall({\n    callId,\n    userId,\n    organizationId,\n    socketId = null,\n    isSocketConnected = null\n  }) {\n    const safeSocketId = String(socketId || "").trim() || null;\n    try {\n      for (let attempt = 0; attempt < MUTATION_RETRIES; attempt += 1) {\n        const call = await authority.getCall(callId);\n        if (!call) return { ok: false, reason: "unknown_call" };\n        if (call.status !== "active") return { ok: false, reason: "not_accepted" };\n        if (organizationId && call.organizationId !== organizationId) {\n          return { ok: false, reason: "forbidden" };\n        }\n        const field = socketOwnerField(call, userId);\n        if (!field) return { ok: false, reason: "forbidden" };\n\n        if (!safeSocketId) {\n          if (await authority.refresh(call, { ttlMs: leaseTtlForCall(call) })) {\n            return { ok: true, roomId: \`call:\${callId}\`, room: callRoom(callId) };\n          }\n          continue;\n        }\n\n        const currentOwner = socketOwnerId(call, userId);\n        if (currentOwner && currentOwner !== safeSocketId) {\n          if (typeof isSocketConnected !== "function") {\n            return { ok: false, reason: "already_connected_elsewhere" };\n          }\n          if (await isSocketConnected(currentOwner)) {\n            return { ok: false, reason: "already_connected_elsewhere" };\n          }\n        }\n\n        const clearingOwnGrace = call.disconnectingUserId === userId;\n        const next = {\n          ...call,\n          [field]: safeSocketId,\n          ...(clearingOwnGrace\n            ? {\n                disconnectingUserId: null,\n                disconnectingSocketId: null,\n                disconnectDeadlineAt: null\n              }\n            : {})\n        };\n        const ttlMs = clearingOwnGrace ? activeLeaseMs : leaseTtlForCall(call);\n        if (JSON.stringify(next) === JSON.stringify(call)) {\n          if (await authority.refresh(call, { ttlMs })) {\n            return { ok: true, roomId: \`call:\${callId}\`, room: callRoom(callId) };\n          }\n          continue;\n        }\n        if (await authority.compareAndSet(call, next, { ttlMs })) {\n          return { ok: true, roomId: \`call:\${callId}\`, room: callRoom(callId) };\n        }\n      }\n      return { ok: false, reason: "rtc_unavailable" };\n    } catch {\n      return { ok: false, reason: "rtc_unavailable" };\n    }\n  }\n\n`;
  source = replaceBetween(
    source,
    '  async function canJoinCall({',
    '  async function isCallMember(callId, userId) {',
    joinBlock,
    'socket-aware join authority'
  );

  source = replaceOnce(
    source,
    '    handleDisconnect,\n    refreshForUser,\n    noteUserReconnected,\n    getCall,',
    '    handleDisconnect,\n    refreshForSocket,\n    getCall,',
    'service lifecycle exports'
  );
  return source;
});

update('backend/src/sockets/index.js', (source) => {
  source = replaceOnce(
    source,
    `  async function isSocketInRtcRoomById(roomId, socketId) {\n    if (!socketId) return false;\n    const participants = await io.in(getRoomKey(roomId)).fetchSockets();\n    return participants.some((participant) => participant.id === String(socketId));\n  }`,
    `  async function isSocketInRtcRoomById(roomId, socketId) {\n    if (!socketId) return false;\n    const participants = await io.in(getRoomKey(roomId)).fetchSockets();\n    return participants.some((participant) => participant.id === String(socketId));\n  }\n\n  async function isSocketConnectedById(socketId) {\n    const safeSocketId = String(socketId || "").trim();\n    if (!safeSocketId) return false;\n    const participants = await io.in(safeSocketId).fetchSockets();\n    return participants.some((participant) => participant.id === safeSocketId);\n  }`,
    'distributed socket liveness helper'
  );
  source = replaceOnce(
    source,
    '      // A.1: si el usuario recupero un socket dentro de la gracia, cancelar el cleanup de su llamada.\n      if (resolvedUserId) await callService.noteUserReconnected(resolvedUserId);\n',
    '',
    'presence reconnect lifecycle shortcut'
  );
  source = replaceOnce(
    source,
    '      await callService.refreshForUser(authenticatedUser.id);',
    '      await callService.refreshForSocket(authenticatedUser.id, socket.id, {\n        isSocketConnected: isSocketConnectedById\n      });',
    'socket-aware heartbeat refresh'
  );
  source = replaceOnce(
    source,
    '      const auth = await callService.canJoinCall({\n        callId: safeCallId,\n        userId: authenticatedUser.id,\n        organizationId\n      });',
    '      const auth = await callService.canJoinCall({\n        callId: safeCallId,\n        userId: authenticatedUser.id,\n        organizationId,\n        socketId: socket.id,\n        isSocketConnected: isSocketConnectedById\n      });',
    'socket-aware join call'
  );
  source = replaceOnce(
    source,
    '      // Bloque A/A.1: si el socket era parte de una llamada, aplicar gracia de 15s antes de limpiar\n      // (no limpiar si conserva/recupera otro socket autenticado). Idempotente.\n      await callService.handleDisconnect(disconnectedUserId, {\n        isUserConnected: (userId) => hasAnotherLivePresenceSocket(socket, userId)\n      });',
    '      // Solo el socket propietario de la media puede degradar el lease de la llamada.\n      // Un telefono hermano del mismo usuario nunca cancela ni extiende esta gracia.\n      await callService.handleDisconnect(disconnectedUserId, { socketId: socket.id });',
    'socket-aware disconnect lifecycle'
  );
  return source;
});

update('backend/test/rtc-distributed-authority.test.js', (source) => {
  source = replaceOnce(
    source,
    '    const call = await nodeA.service.startCall({\n      caller: admin,\n      conversationId: "conversation-101",\n      mode: "audio"\n    });',
    '    const call = await nodeA.service.startCall({\n      caller: admin,\n      callerSocketId: "admin-socket-a",\n      conversationId: "conversation-101",\n      mode: "audio"\n    });',
    'distributed caller socket'
  );
  source = replaceOnce(
    source,
    '    const accepted = await nodeB.service.accept({ user: driver, callId: call.callId });\n    assert.equal(accepted.ok, true, "another node can atomically accept the same call");',
    '    const accepted = await nodeB.service.accept({\n      user: driver,\n      socketId: "driver-socket-a",\n      callId: call.callId\n    });\n    assert.equal(accepted.ok, true, "another node can atomically accept the same call");\n\n    assert.equal(await nodeB.service.refreshForSocket(driver.id, "driver-sibling", {\n      isSocketConnected: async () => true\n    }), false, "a sibling device cannot renew the active lease");\n    assert.equal(await nodeB.service.refreshForSocket(driver.id, "driver-socket-a", {\n      isSocketConnected: async () => true\n    }), true, "the media-owning socket can renew a healthy call");\n\n    assert.equal(await nodeB.service.refreshForSocket(driver.id, "driver-socket-a", {\n      isSocketConnected: async (socketId) => socketId !== "admin-socket-a"\n    }), false, "the surviving peer degrades the lease when the remote owner disappears");\n    const degraded = JSON.parse(shared.get(`manecomb:rtc:call:${call.callId}`));\n    assert.equal(degraded.disconnectingUserId, admin.id);\n    assert.equal(degraded.disconnectingSocketId, "admin-socket-a");\n    assert.ok(degraded.disconnectDeadlineAt);\n\n    const callerRejoin = await nodeA.service.canJoinCall({\n      callId: call.callId,\n      userId: admin.id,\n      organizationId: admin.organizationId,\n      socketId: "admin-socket-b",\n      isSocketConnected: async (socketId) => socketId !== "admin-socket-a"\n    });\n    assert.equal(callerRejoin.ok, true, "a reconnect transfers ownership after the old socket is gone");\n    const recovered = JSON.parse(shared.get(`manecomb:rtc:call:${call.callId}`));\n    assert.equal(recovered.callerSocketId, "admin-socket-b");\n    assert.equal(recovered.disconnectingUserId, null);',
    'distributed socket lifecycle regression'
  );
  source = replaceOnce(
    source,
    '    const active = { ...stale, status: "active", acceptedBy: driver.id, connectedAt: Date.now() };\n    assert.equal(await authorityA.compareAndSet(stale, active), true);\n    assert.equal(await authorityB.release(stale), false, "stale state cannot delete current authority");\n    assert.equal((await authorityA.getCall(ringing.callId)).status, "active");\n    assert.equal(await authorityA.release(active), true);',
    '    const active = { ...stale, status: "active", acceptedBy: driver.id, connectedAt: Date.now() };\n    assert.equal(await authorityA.compareAndSet(stale, active), true);\n    assert.equal(await authorityB.release(stale), false, "stale state cannot delete current authority");\n    assert.equal(await authorityB.refresh(stale), false, "stale heartbeat cannot extend a newer live-call state");\n    assert.equal(await authorityA.refresh(active), true, "exact current state can refresh its lease");\n    assert.equal((await authorityA.getCall(ringing.callId)).status, "active");\n    assert.equal(await authorityA.release(active), true);',
    'compare-and-refresh regression'
  );
  return source;
});

const reconnectTest = `// RC-RTC-SOCKET-LIFECYCLE-20260809\n// Active-call grace belongs to the media-owning socket, never to every device of the user.\n\nconst assert = require("node:assert/strict");\nconst { createRtcCallService } = require("../src/services/rtc-call-service");\nconst { createEmbeddedStore } = require("../src/data/store");\n\nconst CONV_DIRECT = "conversation-101";\n\nfunction harness(store) {\n  const emits = [];\n  const timers = [];\n  let clock = Date.now();\n  const service = createRtcCallService({\n    store,\n    emitToUser: (userId, event, payload) => emits.push({ userId, event, payload }),\n    deliverNotification: async () => ({ ok: true }),\n    now: () => clock,\n    setTimeoutFn: (fn, delay = 0) => {\n      const handle = { fn, delay, cleared: false };\n      timers.push(handle);\n      return handle;\n    },\n    clearTimeoutFn: (handle) => {\n      if (handle && typeof handle === "object") handle.cleared = true;\n    }\n  });\n  return {\n    service,\n    emits,\n    advance(ms) { clock += ms; },\n    async runTimers() {\n      for (const timer of timers) {\n        if (timer.cleared) continue;\n        timer.cleared = true;\n        clock += Math.max(0, Number(timer.delay) || 0);\n        timer.fn();\n      }\n      for (let index = 0; index < 4; index += 1) await new Promise((resolve) => setImmediate(resolve));\n    }\n  };\n}\n\n(async () => {\n  const store = createEmbeddedStore();\n  const admin = store.getUserById("user-admin-01");\n  const driver = store.getUserById("user-driver-01");\n\n  // A sibling socket is presence only: it cannot refresh or start disconnect cleanup for the call.\n  {\n    const h = harness(store);\n    const call = await h.service.startCall({\n      caller: admin,\n      callerSocketId: "admin-owner",\n      conversationId: CONV_DIRECT,\n      mode: "audio"\n    });\n    await h.service.accept({ user: driver, socketId: "driver-owner", callId: call.callId });\n\n    assert.equal(await h.service.refreshForSocket(admin.id, "admin-sibling", {\n      isSocketConnected: async () => true\n    }), false);\n    assert.equal(await h.service.handleDisconnect(admin.id, { socketId: "admin-sibling" }), false);\n    assert.equal(h.service._state.pendingDisconnects.size, 0);\n    assert.equal(await h.service.refreshForSocket(admin.id, "admin-owner", {\n      isSocketConnected: async () => true\n    }), true);\n  }\n\n  // Rejoin transfers socket ownership; an old disconnect timer cannot kill the recovered call.\n  {\n    const h = harness(store);\n    const call = await h.service.startCall({\n      caller: admin,\n      callerSocketId: "admin-old",\n      conversationId: CONV_DIRECT,\n      mode: "video"\n    });\n    await h.service.accept({ user: driver, socketId: "driver-owner", callId: call.callId });\n\n    assert.equal(await h.service.handleDisconnect(admin.id, { socketId: "admin-old" }), true);\n    assert.equal(h.service._state.pendingDisconnects.size, 1);\n\n    const liveOldOwner = await h.service.canJoinCall({\n      callId: call.callId,\n      userId: admin.id,\n      organizationId: admin.organizationId,\n      socketId: "admin-new",\n      isSocketConnected: async (socketId) => socketId === "admin-old"\n    });\n    assert.equal(liveOldOwner.reason, "already_connected_elsewhere");\n\n    const recovered = await h.service.canJoinCall({\n      callId: call.callId,\n      userId: admin.id,\n      organizationId: admin.organizationId,\n      socketId: "admin-new",\n      isSocketConnected: async () => false\n    });\n    assert.equal(recovered.ok, true);\n\n    await h.runTimers();\n    assert.equal((await h.service.getCall(call.callId)).status, "active");\n\n    assert.equal(await h.service.handleDisconnect(admin.id, { socketId: "admin-new" }), true);\n    await h.runTimers();\n    assert.equal(await h.service.getCall(call.callId), null);\n    assert.ok(h.emits.some((entry) =>\n      entry.event === "rtc:end" && entry.userId === driver.id && entry.payload.endedBy === admin.id\n    ));\n  }\n\n  // If the remote media socket vanishes with its node, the surviving owner's heartbeat starts grace.\n  {\n    const h = harness(store);\n    const call = await h.service.startCall({\n      caller: admin,\n      callerSocketId: "admin-crashed",\n      conversationId: CONV_DIRECT,\n      mode: "audio"\n    });\n    await h.service.accept({ user: driver, socketId: "driver-live", callId: call.callId });\n\n    assert.equal(await h.service.refreshForSocket(driver.id, "driver-live", {\n      isSocketConnected: async (socketId) => socketId !== "admin-crashed"\n    }), false);\n    assert.equal(h.service._state.pendingDisconnects.size, 1);\n    await h.runTimers();\n    assert.equal(await h.service.getCall(call.callId), null);\n  }\n\n  // Ringing remains governed only by its ringing deadline, not active-call disconnect ownership.\n  {\n    const h = harness(store);\n    const call = await h.service.startCall({\n      caller: admin,\n      callerSocketId: "admin-ring",\n      conversationId: CONV_DIRECT,\n      mode: "audio"\n    });\n    assert.equal(await h.service.handleDisconnect(admin.id, { socketId: "admin-ring" }), false);\n    assert.equal(h.service._state.pendingDisconnects.size, 0);\n    assert.equal((await h.service.getCall(call.callId)).status, "ringing");\n  }\n\n  console.log("ok - RTC socket-owned reconnect/disconnect lifecycle has no sibling ghost lease");\n})().catch((error) => {\n  console.error(error);\n  process.exitCode = 1;\n});\n`;
fs.writeFileSync(file('backend/test/rtc-call-reconnect-lifecycle.test.js'), reconnectTest);

update('backend/test/rtc-call-signaling.test.js', (source) => replaceOnce(
  source,
  '  console.log("ok - rtc-call-signaling async authority contract");',
  `  // Socket integration must never regress back to user-wide lease refresh/reconnect shortcuts.\n  {\n    const socketSource = require("node:fs").readFileSync(\n      require("node:path").join(__dirname, "../src/sockets/index.js"),\n      "utf8"\n    );\n    const heartbeatStart = socketSource.indexOf('socket.on("client:heartbeat"');\n    const heartbeatEnd = socketSource.indexOf('socket.on("conversation:join"', heartbeatStart);\n    const heartbeatBlock = socketSource.slice(heartbeatStart, heartbeatEnd);\n    assert.ok(heartbeatBlock.includes('refreshForSocket(authenticatedUser.id, socket.id'));\n    assert.equal(heartbeatBlock.includes('refreshForUser('), false);\n\n    const presenceStart = socketSource.indexOf('socket.on("presence:join"');\n    const presenceEnd = socketSource.indexOf('socket.on("client:heartbeat"', presenceStart);\n    assert.equal(socketSource.slice(presenceStart, presenceEnd).includes('noteUserReconnected'), false);\n\n    const disconnectStart = socketSource.indexOf('socket.on("disconnect", async () =>');\n    const disconnectEnd = socketSource.indexOf('  });\\n\\n  return io;', disconnectStart);\n    const disconnectBlock = socketSource.slice(disconnectStart, disconnectEnd);\n    assert.ok(disconnectBlock.includes('handleDisconnect(disconnectedUserId, { socketId: socket.id })'));\n    assert.equal(disconnectBlock.includes('isUserConnected:'), false);\n  }\n\n  console.log("ok - rtc-call-signaling async authority contract");`,
  'socket lifecycle integration contract'
));

console.log('RTC socket lifecycle ownership codemod applied');
