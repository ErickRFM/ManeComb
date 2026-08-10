const fs = require('node:fs');
const path = require('node:path');

function update(relativePath, transform) {
  const target = path.resolve(__dirname, '..', relativePath);
  const source = fs.readFileSync(target, 'utf8');
  const next = transform(source);
  if (next === source) throw new Error(`No changes produced for ${relativePath}`);
  fs.writeFileSync(target, next);
}

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Missing ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`Non-unique ${label}`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

update('backend/src/services/rtc-call-service.js', (source) => {
  source = replaceOnce(
    source,
    '      acceptedBy: null,\n      createdAt,',
    '      acceptedBy: null,\n      acceptedSocketId: null,\n      createdAt,',
    'initial accepted socket field'
  );
  source = replaceOnce(
    source,
    '  async function accept({ user, callId }) {\n    let result;',
    '  async function accept({ user, socketId = null, callId }) {\n    const safeSocketId = String(socketId || "").trim() || null;\n    let result;',
    'accept signature'
  );
  source = replaceOnce(
    source,
    '        if (call.status === "active") {\n          return call.acceptedBy === user.id\n            ? { ok: true, idempotent: true }\n            : { ok: false, code: "already_active" };\n        }',
    '        if (call.status === "active") {\n          if (call.acceptedBy !== user.id) return { ok: false, code: "already_active" };\n          if (call.acceptedSocketId && safeSocketId && call.acceptedSocketId !== safeSocketId) {\n            return { ok: false, code: "answered_elsewhere" };\n          }\n          return { ok: true, idempotent: true };\n        }',
    'active accept idempotency'
  );
  source = replaceOnce(
    source,
    '            status: "active",\n            acceptedBy: user.id,\n            connectedAt: now()',
    '            status: "active",\n            acceptedBy: user.id,\n            acceptedSocketId: safeSocketId,\n            connectedAt: now()',
    'accepted socket assignment'
  );
  return source;
});

update('backend/src/sockets/index.js', (source) => replaceOnce(
  source,
  '      for (const previousConnection of previousConnections) {\n        const reconnectTimer = rtcDisconnectTimers.get(previousConnection.id);\n        if (reconnectTimer) clearTimeout(reconnectTimer);\n        rtcDisconnectTimers.delete(previousConnection.id);\n        await io.in(previousConnection.id).socketsLeave(roomKey);\n      }\n\n      await socket.join(roomKey);',
  '      if (previousConnections.length) {\n        observeSocketEvent(socket, "rtc:join", startedAt, "rejected", {\n          roomId: safeRoomId,\n          reason: "already_connected_elsewhere"\n        });\n        acknowledge(ack, { ok: false, reason: "already_connected_elsewhere" });\n        return;\n      }\n\n      await socket.join(roomKey);',
  'same-user room handoff'
));

update('backend/test/rtc-call-signaling.test.js', (source) => replaceOnce(
  source,
  '    const accepted = await h.service.accept({ user: driver, callId: call.callId });\n    assert.equal(accepted.ok, true);\n    assert.equal(accepted.roomId, `rtc:call:${call.callId}`);\n    assert.ok(h.usersReceiving("rtc:call-accepted").includes(admin.id));\n    assert.ok(h.usersReceiving("rtc:call-accepted").includes(driver.id));\n\n    const duplicate = await h.service.accept({ user: driver, callId: call.callId });\n    assert.equal(duplicate.ok, true);\n    assert.equal(duplicate.idempotent, true);',
  '    const accepted = await h.service.accept({\n      user: driver,\n      socketId: "driver-socket-a",\n      callId: call.callId\n    });\n    assert.equal(accepted.ok, true);\n    assert.equal(accepted.roomId, `rtc:call:${call.callId}`);\n    assert.ok(h.usersReceiving("rtc:call-accepted").includes(admin.id));\n    assert.ok(h.usersReceiving("rtc:call-accepted").includes(driver.id));\n\n    const duplicate = await h.service.accept({\n      user: driver,\n      socketId: "driver-socket-a",\n      callId: call.callId\n    });\n    assert.equal(duplicate.ok, true);\n    assert.equal(duplicate.idempotent, true);\n\n    const otherDevice = await h.service.accept({\n      user: driver,\n      socketId: "driver-socket-b",\n      callId: call.callId\n    });\n    assert.deepEqual(otherDevice, { ok: false, code: "answered_elsewhere" });',
  'multidevice accept regression'
));

update('mobile/src/features/calls/call-types.ts', (source) => replaceOnce(
  source,
  "  | 'ended'\n  | 'failed'",
  "  | 'ended'\n  | 'answered_elsewhere'\n  | 'failed'",
  'answered elsewhere result type'
));

update('mobile/src/features/calls/call-runtime.ts', (source) => replaceOnce(
  source,
  "    case 'unknown_call':\n      return 'rtc_join_unknown_call';",
  "    case 'unknown_call':\n      return 'rtc_join_unknown_call';\n    case 'already_connected_elsewhere':\n      return 'rtc_join_connected_elsewhere';",
  'join elsewhere failure mapping'
));

update('mobile/src/features/calls/call-store.ts', (source) => {
  source = replaceOnce(
    source,
    "    if (state.phase === 'IDLE' || state.phase === 'ENDING' || state.phase === 'FAILED') return;\n    if (state._socket) emitEnd(state._socket, callId);",
    "    if (state.phase === 'IDLE' || state.phase === 'ENDING' || state.phase === 'FAILED') return;\n    if (code === 'rtc_join_connected_elsewhere') {\n      endWith('answered_elsewhere');\n      return;\n    }\n    if (state._socket) emitEnd(state._socket, callId);",
    'local-only elsewhere join failure'
  );
  source = replaceOnce(
    source,
    "        if (ack.code === 'call_expired' || ack.code === 'unknown_call') {\n          endWith('no_answer');\n          return;\n        }",
    "        if (ack.code === 'call_expired' || ack.code === 'unknown_call') {\n          endWith('no_answer');\n          return;\n        }\n        if (ack.code === 'answered_elsewhere') {\n          endWith('answered_elsewhere');\n          return;\n        }",
    'accept elsewhere mapping'
  );
  source = replaceOnce(
    source,
    "    handleAccepted: (payload) => {\n      const state = get();\n      if (!matchesCall(state, payload?.callId) || state.phase !== 'OUTGOING_RINGING') return;\n      clearRingTimeout();\n      dispatch({ type: 'REMOTE_ACCEPTED', roomId: payload.roomId ?? null, now: now() });\n      startRuntime();\n    },",
    "    handleAccepted: (payload) => {\n      const state = get();\n      if (!matchesCall(state, payload?.callId)) return;\n      if (state.phase === 'INCOMING_RINGING') {\n        endWith('answered_elsewhere');\n        return;\n      }\n      if (state.phase !== 'OUTGOING_RINGING') return;\n      clearRingTimeout();\n      dispatch({ type: 'REMOTE_ACCEPTED', roomId: payload.roomId ?? null, now: now() });\n      startRuntime();\n    },",
    'sibling accepted event convergence'
  );
  return source;
});

const mobileTest = `import {\n  __setConnectTimeoutMsForTests,\n  __setResultDisplayMsForTests,\n  setCallRuntimeFactory,\n  useCallStore,\n} from './call-store';\nimport { resolveRtcJoinFailureCode } from './call-runtime';\nimport type { CallAck } from './call-types';\n\nfunction fakeSocket() {\n  const handlers = new Map<string, Set<(payload: any) => void>>();\n  let acceptAck: CallAck = { ok: false, code: 'answered_elsewhere' };\n  return {\n    emitted: [] as Array<{ event: string; payload: any }>,\n    setAcceptAck(ack: CallAck) { acceptAck = ack; },\n    on(event: string, handler: (payload: any) => void) {\n      if (!handlers.has(event)) handlers.set(event, new Set());\n      handlers.get(event)!.add(handler);\n    },\n    off(event: string, handler: (payload: any) => void) { handlers.get(event)?.delete(handler); },\n    emit(event: string, payload: any, ack?: (response: CallAck) => void) {\n      this.emitted.push({ event, payload });\n      if (event === 'rtc:accept' && ack) ack(acceptAck);\n    },\n    server(event: string, payload: any) {\n      for (const handler of handlers.get(event) || []) handler(payload);\n    },\n  };\n}\n\nconst state = () => useCallStore.getState();\n\nbeforeEach(() => {\n  jest.useFakeTimers();\n  __setResultDisplayMsForTests(100000);\n  __setConnectTimeoutMsForTests(100000);\n  state().unbindSocket();\n  state().reset();\n});\n\nafterEach(() => {\n  state().unbindSocket();\n  state().reset();\n  setCallRuntimeFactory(null);\n  jest.runOnlyPendingTimers();\n  jest.useRealTimers();\n});\n\ndescribe('RTC multi-device accept ownership', () => {\n  it('apaga el timbrado del dispositivo hermano cuando la llamada fue aceptada en otro socket', () => {\n    const socket = fakeSocket();\n    state().bindSocket(socket as any);\n    socket.server('rtc:incoming-call', {\n      callId: 'call-multi-1',\n      conversationId: 'conv-1',\n      mode: 'audio',\n      caller: { id: 'caller-1', name: 'Ana' },\n      ringTimeoutMs: 35000,\n    });\n    expect(state().phase).toBe('INCOMING_RINGING');\n\n    socket.server('rtc:call-accepted', { callId: 'call-multi-1', roomId: 'rtc:call:call-multi-1' });\n\n    expect(state().phase).toBe('ENDING');\n    expect(state().endResult).toBe('answered_elsewhere');\n    expect(state().failureCode).toBeNull();\n    expect(socket.emitted.some((entry) => entry.event === 'rtc:end')).toBe(false);\n  });\n\n  it('un accept rechazado como answered_elsewhere no abre media ni termina la llamada ganadora', async () => {\n    const socket = fakeSocket();\n    let runtimeStarts = 0;\n    setCallRuntimeFactory(() => {\n      runtimeStarts += 1;\n      return { stop() {}, setMicEnabled() {}, setCameraEnabled() {} };\n    });\n    state().bindSocket(socket as any);\n    socket.server('rtc:incoming-call', {\n      callId: 'call-multi-2',\n      conversationId: 'conv-1',\n      mode: 'video',\n      caller: { id: 'caller-1', name: 'Ana' },\n      ringTimeoutMs: 35000,\n    });\n\n    await state().acceptIncomingCall();\n\n    expect(state().phase).toBe('ENDING');\n    expect(state().endResult).toBe('answered_elsewhere');\n    expect(runtimeStarts).toBe(0);\n    expect(socket.emitted.filter((entry) => entry.event === 'rtc:accept')).toHaveLength(1);\n    expect(socket.emitted.some((entry) => entry.event === 'rtc:end')).toBe(false);\n  });\n\n  it('mapea el rechazo de join por otro socket a un codigo local especifico', () => {\n    expect(resolveRtcJoinFailureCode({ ok: false, reason: 'already_connected_elsewhere' }))\n      .toBe('rtc_join_connected_elsewhere');\n  });\n});\n`;
fs.writeFileSync(
  path.resolve(__dirname, '../mobile/src/features/calls/call-multidevice-ownership.test.ts'),
  mobileTest
);

console.log('RTC multidevice ownership codemod applied');
