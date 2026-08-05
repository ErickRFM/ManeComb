import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function write(path, content) {
  fs.writeFileSync(path, content, 'utf8');
}

function replaceExactly(content, before, after, label) {
  const count = content.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected exactly 1 occurrence, found ${count}`);
  }
  return content.replace(before, after);
}

// ---------------------------------------------------------------------------
// Backend Socket.IO signaling
// ---------------------------------------------------------------------------
const socketPath = 'backend/src/sockets/index.js';
let socketSource = read(socketPath);

socketSource = replaceExactly(
  socketSource,
  'const { resolveAuthenticatedUser } = require("../middlewares/authenticate");\n',
  'const { resolveAuthenticatedUser } = require("../middlewares/authenticate");\nconst { createRtcCallRegistry } = require("./rtc-call-registry");\n',
  'backend registry import'
);

socketSource = replaceExactly(
  socketSource,
  `  const redisClient = getRedisClient();\n  const redisReadiness = getRedisReadiness();\n  let radioClusterReady = !redisReadiness.enabled;`,
  `  const redisClient = getRedisClient();\n  const redisReadiness = getRedisReadiness();\n  let radioClusterReady = !redisReadiness.enabled;\n\n  function getRtcCallPayload(call, extra = {}) {\n    return {\n      callId: call.id,\n      roomId: call.roomId,\n      mode: call.mode,\n      caller: call.caller,\n      createdAt: call.createdAt,\n      expiresAt: call.expiresAt,\n      ...extra\n    };\n  }\n\n  function emitRtcCallCancelled(call, reason, userIds = call.remainingCalleeUserIds) {\n    uniqueRtcUserIds(userIds).forEach((userId) => {\n      io.to(\`user:\${userId}\`).emit("rtc:call-cancelled",\n        getRtcCallPayload(call, { reason }));\n    });\n  }\n\n  function uniqueRtcUserIds(values) {\n    return [...new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))];\n  }\n\n  function getConversationParticipantIds(conversation) {\n    return uniqueRtcUserIds(\n      (conversation?.participants || []).map((participant) =>\n        typeof participant === "string"\n          ? participant\n          : participant?.id || participant?.userId\n      )\n    );\n  }\n\n  const rtcCallRegistry = createRtcCallRegistry({\n    onTimeout(call) {\n      io.to(\`user:\${call.caller.id}\`).emit(\n        "rtc:call-timeout",\n        getRtcCallPayload(call, { reason: "timeout" })\n      );\n      emitRtcCallCancelled(call, "timeout");\n    }\n  });`,
  'backend registry setup'
);

const rtcHandlersMarker = `    socket.on("rtc:join", async ({ roomId }, ack) => {`;
const rtcHandlers = `    socket.on("rtc:call", async ({ roomId, mode } = {}, ack) => {\n      const startedAt = Date.now();\n      const authenticatedUser = socket.data.user;\n      const safeRoomId = String(roomId || "").trim();\n\n      if (\n        !authenticatedUser ||\n        !safeRoomId ||\n        !(await canUseOperations(socket)) ||\n        !(await store.canUserAccessConversation?.(authenticatedUser.id, safeRoomId)) ||\n        (rtcRooms.get(safeRoomId)?.size || 0) >= 2\n      ) {\n        acknowledge(ack, { ok: false, reason: "forbidden_or_busy" });\n        observeSocketEvent(socket, "rtc:call", startedAt, "forbidden", { roomId: safeRoomId });\n        return;\n      }\n\n      const conversation = await store.getConversationById?.(safeRoomId);\n      const calleeUserIds = getConversationParticipantIds(conversation).filter(\n        (userId) => userId !== authenticatedUser.id\n      );\n      const created = rtcCallRegistry.create({\n        roomId: safeRoomId,\n        mode,\n        caller: { id: authenticatedUser.id, name: authenticatedUser.name || "Operador" },\n        calleeUserIds\n      });\n\n      if (!created.ok) {\n        acknowledge(ack, { ok: false, reason: created.reason });\n        observeSocketEvent(socket, "rtc:call", startedAt, created.reason, { roomId: safeRoomId });\n        return;\n      }\n\n      // Acknowledge first so the caller stores callId before an exceptionally\n      // fast callee can accept the ring.\n      acknowledge(ack, {\n        ok: true,\n        callId: created.call.id,\n        expiresAt: created.call.expiresAt\n      });\n      created.call.remainingCalleeUserIds.forEach((userId) => {\n        io.to(\`user:\${userId}\`).emit("rtc:incoming-call", getRtcCallPayload(created.call));\n      });\n      observeSocketEvent(socket, "rtc:call", startedAt, "success", {\n        callId: created.call.id,\n        roomId: safeRoomId,\n        recipients: created.call.remainingCalleeUserIds.length\n      });\n    });\n\n    socket.on("rtc:accept", ({ callId } = {}, ack) => {\n      const startedAt = Date.now();\n      const userId = socket.data.user?.id;\n      const result = rtcCallRegistry.accept(callId, userId);\n\n      if (!result.ok) {\n        acknowledge(ack, { ok: false, reason: result.reason });\n        observeSocketEvent(socket, "rtc:accept", startedAt, result.reason, { callId });\n        return;\n      }\n\n      io.to(\`user:\${result.call.caller.id}\`).emit(\n        "rtc:call-accepted",\n        getRtcCallPayload(result.call, { acceptedBy: userId })\n      );\n      emitRtcCallCancelled(\n        result.call,\n        "answered_elsewhere",\n        result.call.calleeUserIds.filter((calleeId) => calleeId !== userId)\n      );\n      acknowledge(ack, { ok: true, roomId: result.call.roomId });\n      observeSocketEvent(socket, "rtc:accept", startedAt, "success", {\n        callId: result.call.id,\n        roomId: result.call.roomId\n      });\n    });\n\n    socket.on("rtc:reject", ({ callId, reason } = {}, ack) => {\n      const startedAt = Date.now();\n      const userId = socket.data.user?.id;\n      const result = rtcCallRegistry.reject(callId, userId);\n\n      if (!result.ok) {\n        acknowledge(ack, { ok: false, reason: result.reason });\n        observeSocketEvent(socket, "rtc:reject", startedAt, result.reason, { callId });\n        return;\n      }\n\n      io.to(\`user:\${result.call.caller.id}\`).emit(\n        "rtc:call-rejected",\n        getRtcCallPayload(result.call, {\n          final: result.final,\n          reason: String(reason || "declined"),\n          rejectedBy: userId\n        })\n      );\n      acknowledge(ack, { ok: true, final: result.final });\n      observeSocketEvent(socket, "rtc:reject", startedAt, "success", {\n        callId: result.call.id,\n        final: result.final,\n        roomId: result.call.roomId\n      });\n    });\n\n    socket.on("rtc:cancel", ({ callId, reason } = {}, ack) => {\n      const startedAt = Date.now();\n      const userId = socket.data.user?.id;\n      const result = rtcCallRegistry.cancel(callId, userId);\n\n      if (!result.ok) {\n        acknowledge(ack, { ok: false, reason: result.reason });\n        observeSocketEvent(socket, "rtc:cancel", startedAt, result.reason, { callId });\n        return;\n      }\n\n      emitRtcCallCancelled(result.call, String(reason || "caller_cancelled"));\n      acknowledge(ack, { ok: true });\n      observeSocketEvent(socket, "rtc:cancel", startedAt, "success", {\n        callId: result.call.id,\n        roomId: result.call.roomId\n      });\n    });\n\n${rtcHandlersMarker}`;
socketSource = replaceExactly(
  socketSource,
  rtcHandlersMarker,
  rtcHandlers,
  'backend RTC ring handlers'
);

socketSource = replaceExactly(
  socketSource,
  `      const disconnectedUserId = socket.data.user?.id;\n      const disconnectedOrganizationId = getOrganizationId(socket.data.user);`,
  `      const disconnectedUserId = socket.data.user?.id;\n      const disconnectedOrganizationId = getOrganizationId(socket.data.user);\n      if (disconnectedUserId) {\n        rtcCallRegistry.releaseUser(disconnectedUserId).forEach((released) => {\n          if (released.type === "cancelled") {\n            emitRtcCallCancelled(released.call, "caller_disconnected");\n            return;\n          }\n          io.to(\`user:\${released.call.caller.id}\`).emit(\n            "rtc:call-rejected",\n            getRtcCallPayload(released.call, {\n              final: released.final,\n              reason: "callee_disconnected",\n              rejectedBy: disconnectedUserId\n            })\n          );\n        });\n      }`,
  'backend disconnect pending call cleanup'
);

write(socketPath, socketSource);

// ---------------------------------------------------------------------------
// Backend test chain
// ---------------------------------------------------------------------------
const backendPackagePath = 'backend/package.json';
let backendPackage = read(backendPackagePath);
backendPackage = replaceExactly(
  backendPackage,
  'node --require ./test/setup-env.js test/rtc-session-cdr.test.js && node --require ./test/setup-env.js test/route-sessions.test.js',
  'node --require ./test/setup-env.js test/rtc-session-cdr.test.js && node --require ./test/setup-env.js test/rtc-call-registry.test.js && node --require ./test/setup-env.js test/route-sessions.test.js',
  'backend RTC registry test chain'
);
write(backendPackagePath, backendPackage);

// ---------------------------------------------------------------------------
// Mobile types
// ---------------------------------------------------------------------------
const chatTypesPath = 'mobile/src/screens/chat/types.ts';
let chatTypes = read(chatTypesPath);
chatTypes = replaceExactly(
  chatTypes,
  `export type RtcParticipant = {\n  socketId: string;\n  userId: string;\n  name: string;\n};`,
  `export type RtcParticipant = {\n  socketId: string;\n  userId: string;\n  name: string;\n};\nexport type IncomingCall = {\n  callId: string;\n  roomId: string;\n  mode: CallMode;\n  caller: { id: string; name: string };\n  createdAt: number;\n  expiresAt: number;\n};`,
  'mobile incoming call type'
);
write(chatTypesPath, chatTypes);

// ---------------------------------------------------------------------------
// Mobile chat controller
// ---------------------------------------------------------------------------
const controllerPath = 'mobile/src/screens/chat/hooks/use-chat-controller.ts';
let controller = read(controllerPath);

controller = replaceExactly(
  controller,
  "import type { CallMode, CallSession, DirectoryMode, LocalTextMessage, MobilePane, RecordingState, RtcParticipant } from '../types';",
  "import type { CallMode, CallSession, DirectoryMode, IncomingCall, LocalTextMessage, MobilePane, RecordingState, RtcParticipant } from '../types';",
  'controller IncomingCall import'
);

controller = replaceExactly(
  controller,
  `  const [callSession, setCallSession] = useState<CallSession | null>(null);\n  const [callParticipants, setCallParticipants] = useState<RtcParticipant[]>([]);`,
  `  const [callSession, setCallSession] = useState<CallSession | null>(null);\n  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);\n  const [isAnsweringIncomingCall, setIsAnsweringIncomingCall] = useState(false);\n  const [callParticipants, setCallParticipants] = useState<RtcParticipant[]>([]);`,
  'controller incoming call state'
);

controller = replaceExactly(
  controller,
  `  const isStartingCallRef = useRef(false);\n  const callAttemptRef = useRef(0);`,
  `  const isStartingCallRef = useRef(false);\n  const callAttemptRef = useRef(0);\n  const outgoingCallIdRef = useRef<string | null>(null);\n  const callSessionRef = useRef<CallSession | null>(null);\n  const incomingCallRef = useRef<IncomingCall | null>(null);`,
  'controller call refs'
);

controller = replaceExactly(
  controller,
  `  const obtainLocalMediaRef = useRef<(mode: CallMode) => Promise<boolean>>(\n    async () => false\n  );\n\n  useEffect(() => {`,
  `  const obtainLocalMediaRef = useRef<(mode: CallMode) => Promise<boolean>>(\n    async () => false\n  );\n\n  useEffect(() => {\n    callSessionRef.current = callSession;\n  }, [callSession]);\n\n  useEffect(() => {\n    incomingCallRef.current = incomingCall;\n  }, [incomingCall]);\n\n  useEffect(() => {`,
  'controller state refs synchronization'
);

controller = replaceExactly(
  controller,
  `    socketRef.current = socket;\n    getRtcIceConfigRequest()`,
  `    socketRef.current = socket;\n    const announceRealtimeIdentity = () => {\n      socket.emit('presence:join', {\n        accountType: user.accountType,\n        organizationId: user.organizationId,\n        role: user.role,\n        userId: user.id,\n        packetId: \`rtc-presence:\${Date.now()}\`,\n      });\n    };\n    socket.on('connect', announceRealtimeIdentity);\n    if (socket.connected) announceRealtimeIdentity();\n\n    getRtcIceConfigRequest()`,
  'controller RTC socket user room registration'
);

const participantListenerMarker = `    socket.on(\n      'rtc:participants',`;
const incomingListeners = `    socket.on('rtc:incoming-call', (payload: IncomingCall) => {\n      if (!payload?.callId || !payload.roomId || payload.caller?.id === user.id) return;\n\n      if (callSessionRef.current || incomingCallRef.current) {\n        socket.emit('rtc:reject', {\n          callId: payload.callId,\n          reason: 'busy',\n        });\n        return;\n      }\n\n      const normalized: IncomingCall = {\n        ...payload,\n        mode: payload.mode === 'video' ? 'video' : 'audio',\n        caller: {\n          id: String(payload.caller?.id || ''),\n          name: String(payload.caller?.name || 'Operador ManeComb'),\n        },\n      };\n      incomingCallRef.current = normalized;\n      setIncomingCall(normalized);\n      setCallNotice(null);\n    });\n\n    socket.on('rtc:call-cancelled', (payload: { callId: string; reason?: string }) => {\n      if (payload.callId !== incomingCallRef.current?.callId) return;\n      incomingCallRef.current = null;\n      setIncomingCall(null);\n      setIsAnsweringIncomingCall(false);\n      if (payload.reason !== 'answered_elsewhere') {\n        setCallNotice('La llamada entrante fue cancelada.');\n      }\n    });\n\n    socket.on('rtc:call-accepted', (payload: { callId: string; roomId: string }) => {\n      if (payload.callId !== outgoingCallIdRef.current) return;\n      outgoingCallIdRef.current = null;\n      setCallNotice('Llamada contestada. Conectando...');\n      setCallSession((current) =>\n        current?.roomId === payload.roomId ? { ...current, phase: 'connecting' } : current\n      );\n    });\n\n${participantListenerMarker}`;
controller = replaceExactly(
  controller,
  participantListenerMarker,
  incomingListeners,
  'controller incoming call socket listeners'
);

const oldRejectBlock = `    socket.on('rtc:reject', (payload: { roomId: string }) => {\n      if (payload.roomId !== joinedRtcRoomRef.current) return;\n      resetPeerConnection();\n      localStreamRef.current?.getTracks().forEach((track) => track.stop());\n      localStreamRef.current = null;\n      joinedRtcRoomRef.current = null;\n      currentCallModeRef.current = null;\n      setCallParticipants([]);\n      setCallSession(null);\n      setIsCallMuted(false);\n      setIsCameraEnabled(true);\n      stopCallTimer();\n      setCallNotice('La llamada fue rechazada.');\n    });`;
const newRejectBlock = `    socket.on(\n      'rtc:call-rejected',\n      (payload: { callId: string; roomId: string; final?: boolean; reason?: string }) => {\n        if (payload.callId !== outgoingCallIdRef.current) return;\n        if (!payload.final) {\n          setCallNotice('Una persona rechazo; esperando otra respuesta...');\n          return;\n        }\n        outgoingCallIdRef.current = null;\n        resetPeerConnection();\n        localStreamRef.current?.getTracks().forEach((track) => track.stop());\n        localStreamRef.current = null;\n        joinedRtcRoomRef.current = null;\n        currentCallModeRef.current = null;\n        setCallParticipants([]);\n        setCallSession(null);\n        setIsCallMuted(false);\n        setIsCameraEnabled(true);\n        stopCallTimer();\n        setCallNotice(\n          payload.reason === 'busy'\n            ? 'La persona esta en otra llamada.'\n            : 'La llamada fue rechazada.'\n        );\n      }\n    );`;
controller = replaceExactly(controller, oldRejectBlock, newRejectBlock, 'controller rejected event');

const oldTimeoutBlock = `    socket.on('rtc:timeout', (payload: { roomId: string }) => {\n      if (payload.roomId !== joinedRtcRoomRef.current) return;\n      resetPeerConnection();\n      localStreamRef.current?.getTracks().forEach((track) => track.stop());\n      localStreamRef.current = null;\n      joinedRtcRoomRef.current = null;\n      currentCallModeRef.current = null;\n      setCallParticipants([]);\n      setCallSession(null);\n      setIsCallMuted(false);\n      setIsCameraEnabled(true);\n      stopCallTimer();\n      setCallNotice('La llamada no fue respondida a tiempo.');\n    });`;
const newTimeoutBlock = `    socket.on('rtc:call-timeout', (payload: { callId: string; roomId: string }) => {\n      if (payload.callId !== outgoingCallIdRef.current) return;\n      outgoingCallIdRef.current = null;\n      resetPeerConnection();\n      localStreamRef.current?.getTracks().forEach((track) => track.stop());\n      localStreamRef.current = null;\n      joinedRtcRoomRef.current = null;\n      currentCallModeRef.current = null;\n      setCallParticipants([]);\n      setCallSession(null);\n      setIsCallMuted(false);\n      setIsCameraEnabled(true);\n      stopCallTimer();\n      setCallNotice('La llamada no fue respondida a tiempo.');\n    });`;
controller = replaceExactly(controller, oldTimeoutBlock, newTimeoutBlock, 'controller timeout event');

controller = replaceExactly(
  controller,
  `      setCallElapsedSeconds(0);\n      socket.removeAllListeners();`,
  `      setCallElapsedSeconds(0);\n      if (incomingCallRef.current) {\n        socket.emit('rtc:reject', {\n          callId: incomingCallRef.current.callId,\n          reason: 'screen_closed',\n        });\n      }\n      incomingCallRef.current = null;\n      outgoingCallIdRef.current = null;\n      setIncomingCall(null);\n      setIsAnsweringIncomingCall(false);\n      socket.removeAllListeners();`,
  'controller cleanup pending ring'
);

const autoJoinEffect = `  // Join RTC room when entering a conversation\n  useEffect(() => {\n    if (!activeConversation?.id || !socketRef.current?.connected) {\n      return;\n    }\n\n    if (joinedRtcRoomRef.current === activeConversation.id) {\n      return;\n    }\n\n    if (joinedRtcRoomRef.current) {\n      socketRef.current.emit('rtc:leave', { roomId: joinedRtcRoomRef.current });\n    }\n\n    joinedRtcRoomRef.current = activeConversation.id;\n    callAttemptRef.current += 1;\n    isStartingCallRef.current = false;\n    socketRef.current.emit('rtc:join', {\n      roomId: activeConversation.id,\n      userId: user?.id,\n      name: user?.name,\n    });\n  }, [activeConversation?.id, user?.id, user?.name]);\n\n`;
controller = replaceExactly(
  controller,
  autoJoinEffect,
  `  // Entrar a un chat no equivale a entrar a una llamada. El RTC room solo se\n  // ocupa al iniciar o aceptar, evitando que una oferta WebRTC conteste sola.\n\n`,
  'controller remove automatic RTC room join'
);

const oldStartCall = `  const startCall = useCallback(async (mode: CallMode) => {\n    if (!activeConversation || !socketRef.current?.connected || !isWebRTCAvailable()) {\n      setCallNotice('La cabina de llamadas no esta disponible.');\n      return;\n    }\n\n    if (callSession) {\n      setCallNotice('Ya hay una llamada activa en esta cabina.');\n      return;\n    }\n\n    if (isStartingCallRef.current) return;\n    isStartingCallRef.current = true;\n\n    const ok = await obtainLocalMediaRef.current(mode);\n    if (!ok) {\n      isStartingCallRef.current = false;\n      return;\n    }\n\n    if (!localStreamRef.current) {\n      isStartingCallRef.current = false;\n      return;\n    }\n\n    currentCallModeRef.current = mode;\n    const roomId = activeConversation.id;\n    joinedRtcRoomRef.current = roomId;\n    callAttemptRef.current += 1;\n\n    setCallSession({\n      roomId,\n      mode,\n      phase: 'calling',\n      joinedAt: Date.now(),\n      remoteStream: null,\n      remoteSocketId: null,\n    });\n\n    const joinAttempt = callAttemptRef.current;\n\n    socketRef.current\n      .timeout(RTC_JOIN_ACK_TIMEOUT_MS)\n      .emit(\n        'rtc:join',\n        { roomId, userId: user?.id, name: user?.name },\n        (ackError: Error | null, ack?: RtcJoinAck) => {\n          // Una llamada posterior (o un colgado) ya invalido este intento.\n          if (callAttemptRef.current !== joinAttempt) return;\n\n          const notice = resolveRtcJoinFailureNotice(ack, ackError);\n          if (!notice) return;\n\n          closeActiveCallRef.current({ reason: notice });\n        }\n      );\n\n    isStartingCallRef.current = false;\n  }, [activeConversation, callSession, user?.id, user?.name]);`;

const newStartCall = `  const startCall = useCallback(async (mode: CallMode) => {\n    const activeSocket = socketRef.current;\n    if (!activeConversation || !activeSocket?.connected || !isWebRTCAvailable()) {\n      setCallNotice('La cabina de llamadas no esta disponible.');\n      return;\n    }\n\n    if (callSession || incomingCallRef.current) {\n      setCallNotice('Ya hay una llamada activa o entrante.');\n      return;\n    }\n\n    if (isStartingCallRef.current) return;\n    isStartingCallRef.current = true;\n\n    const ok = await obtainLocalMediaRef.current(mode);\n    if (!ok || !localStreamRef.current) {\n      isStartingCallRef.current = false;\n      return;\n    }\n\n    currentCallModeRef.current = mode;\n    const roomId = activeConversation.id;\n    joinedRtcRoomRef.current = roomId;\n    callAttemptRef.current += 1;\n    outgoingCallIdRef.current = null;\n\n    setCallSession({\n      roomId,\n      mode,\n      phase: 'calling',\n      joinedAt: Date.now(),\n      remoteStream: null,\n      remoteSocketId: null,\n    });\n    setCallNotice(mode === 'video' ? 'Iniciando videollamada...' : 'Iniciando llamada...');\n\n    const joinAttempt = callAttemptRef.current;\n    activeSocket\n      .timeout(RTC_JOIN_ACK_TIMEOUT_MS)\n      .emit(\n        'rtc:join',\n        { roomId, userId: user?.id, name: user?.name },\n        (ackError: Error | null, ack?: RtcJoinAck) => {\n          if (callAttemptRef.current !== joinAttempt) return;\n          const joinNotice = resolveRtcJoinFailureNotice(ack, ackError);\n          if (joinNotice) {\n            void closeActiveCallRef.current({ reason: joinNotice });\n            return;\n          }\n\n          activeSocket\n            .timeout(RTC_JOIN_ACK_TIMEOUT_MS)\n            .emit(\n              'rtc:call',\n              { roomId, mode },\n              (ringError: Error | null, ringAck?: { ok?: boolean; reason?: string; callId?: string }) => {\n                if (callAttemptRef.current !== joinAttempt) return;\n                if (ringError || !ringAck?.ok || !ringAck.callId) {\n                  const reason = ringAck?.reason === 'busy' || ringAck?.reason === 'forbidden_or_busy'\n                    ? 'La persona esta en otra llamada.'\n                    : 'No fue posible timbrar esta llamada.';\n                  void closeActiveCallRef.current({ reason });\n                  return;\n                }\n\n                outgoingCallIdRef.current = ringAck.callId;\n                setCallSession((current) =>\n                  current?.roomId === roomId ? { ...current, phase: 'ringing' } : current\n                );\n                setCallNotice(mode === 'video' ? 'Videollamada timbrando...' : 'Llamando...');\n              }\n            );\n        }\n      );\n\n    isStartingCallRef.current = false;\n  }, [activeConversation, callSession, user?.id, user?.name]);`;
controller = replaceExactly(controller, oldStartCall, newStartCall, 'controller startCall ring flow');

controller = replaceExactly(
  controller,
  `    const { reason = null } = options;\n    const roomId = joinedRtcRoomRef.current;\n\n    if (roomId && socketRef.current) {`,
  `    const { reason = null } = options;\n    const roomId = joinedRtcRoomRef.current;\n    const outgoingCallId = outgoingCallIdRef.current;\n    outgoingCallIdRef.current = null;\n\n    if (outgoingCallId && socketRef.current) {\n      socketRef.current.emit('rtc:cancel', {\n        callId: outgoingCallId,\n        reason: reason || 'caller_cancelled',\n      });\n    }\n\n    if (roomId && socketRef.current) {`,
  'controller cancel outgoing ring on close'
);

controller = replaceExactly(
  controller,
  `  closeActiveCallRef.current = closeActiveCall;\n\n  const toggleCallMute = () => {`,
  `  closeActiveCallRef.current = closeActiveCall;\n\n  const rejectIncomingCall = useCallback(() => {\n    const call = incomingCallRef.current;\n    if (!call) return;\n    socketRef.current?.emit('rtc:reject', { callId: call.callId, reason: 'declined' });\n    incomingCallRef.current = null;\n    setIncomingCall(null);\n    setIsAnsweringIncomingCall(false);\n    setCallNotice('Llamada rechazada.');\n  }, []);\n\n  const acceptIncomingCall = useCallback(async () => {\n    const call = incomingCallRef.current;\n    const activeSocket = socketRef.current;\n    if (!call || !activeSocket?.connected || isAnsweringIncomingCall) return;\n\n    if (callSessionRef.current) {\n      activeSocket.emit('rtc:reject', { callId: call.callId, reason: 'busy' });\n      incomingCallRef.current = null;\n      setIncomingCall(null);\n      setCallNotice('Ya existe otra llamada activa.');\n      return;\n    }\n\n    setIsAnsweringIncomingCall(true);\n    const hasLocalMedia = await obtainLocalMediaRef.current(call.mode);\n    if (!hasLocalMedia || !localStreamRef.current) {\n      activeSocket.emit('rtc:reject', { callId: call.callId, reason: 'media_unavailable' });\n      incomingCallRef.current = null;\n      setIncomingCall(null);\n      setIsAnsweringIncomingCall(false);\n      return;\n    }\n\n    activeSocket\n      .timeout(RTC_JOIN_ACK_TIMEOUT_MS)\n      .emit(\n        'rtc:accept',\n        { callId: call.callId },\n        (acceptError: Error | null, acceptAck?: { ok?: boolean; reason?: string }) => {\n          if (acceptError || !acceptAck?.ok) {\n            setIsAnsweringIncomingCall(false);\n            if (acceptAck?.reason === 'call_not_found') {\n              incomingCallRef.current = null;\n              setIncomingCall(null);\n              setCallNotice('La llamada ya no esta disponible.');\n            } else {\n              setCallNotice('No fue posible contestar la llamada.');\n            }\n            stopLocalCallTracks();\n            return;\n          }\n\n          if (joinedRtcRoomRef.current && joinedRtcRoomRef.current !== call.roomId) {\n            activeSocket.emit('rtc:leave', { roomId: joinedRtcRoomRef.current });\n          }\n          setActiveConversationId(call.roomId);\n          void loadConversation(call.roomId).catch(() => undefined);\n          if (isCompact) setMobilePane('conversation');\n          joinedRtcRoomRef.current = call.roomId;\n          currentCallModeRef.current = call.mode;\n          callAttemptRef.current += 1;\n          incomingCallRef.current = null;\n          setIncomingCall(null);\n          setIsAnsweringIncomingCall(false);\n          setCallSession({\n            roomId: call.roomId,\n            mode: call.mode,\n            phase: 'connecting',\n            joinedAt: Date.now(),\n            remoteStream: null,\n            remoteSocketId: null,\n          });\n          setCallNotice(call.mode === 'video' ? 'Conectando videollamada...' : 'Conectando llamada...');\n\n          const joinAttempt = callAttemptRef.current;\n          activeSocket\n            .timeout(RTC_JOIN_ACK_TIMEOUT_MS)\n            .emit(\n              'rtc:join',\n              { roomId: call.roomId, userId: user?.id, name: user?.name },\n              (joinError: Error | null, joinAck?: RtcJoinAck) => {\n                if (callAttemptRef.current !== joinAttempt) return;\n                const notice = resolveRtcJoinFailureNotice(joinAck, joinError);\n                if (notice) void closeActiveCallRef.current({ reason: notice });\n              }\n            );\n        }\n      );\n  }, [isAnsweringIncomingCall, isCompact, loadConversation, setActiveConversationId, user?.id, user?.name]);\n\n  const toggleCallMute = () => {`,
  'controller incoming call actions'
);

controller = replaceExactly(
  controller,
  `    activeCallSession,\n    activeContact,`,
  `    activeCallSession,\n    acceptIncomingCall,\n    activeContact,`,
  'controller return accept action'
);
controller = replaceExactly(
  controller,
  `    isCallMuted,\n    isCameraEnabled,`,
  `    incomingCall,\n    isAnsweringIncomingCall,\n    isCallMuted,\n    isCameraEnabled,`,
  'controller return incoming state'
);
controller = replaceExactly(
  controller,
  `    retryVoiceNote,\n    scrollMessagesToEnd,`,
  `    rejectIncomingCall,\n    retryVoiceNote,\n    scrollMessagesToEnd,`,
  'controller return reject action'
);

write(controllerPath, controller);

// ---------------------------------------------------------------------------
// Mobile view
// ---------------------------------------------------------------------------
const viewPath = 'mobile/src/screens/chat/components/chat-screen-view.tsx';
let view = read(viewPath);
view = replaceExactly(
  view,
  "import { ChatHeader } from './chat-header';\n",
  "import { ChatHeader } from './chat-header';\nimport { IncomingCallModal } from './incoming-call-modal';\n",
  'view incoming modal import'
);
view = replaceExactly(
  view,
  `    activeAudioMessageId,\n    activeCallSession,`,
  `    activeAudioMessageId,\n    activeCallSession,\n    acceptIncomingCall,`,
  'view accept destructure'
);
view = replaceExactly(
  view,
  `    isCallMuted,\n    isCameraEnabled,`,
  `    incomingCall,\n    isAnsweringIncomingCall,\n    isCallMuted,\n    isCameraEnabled,`,
  'view incoming state destructure'
);
view = replaceExactly(
  view,
  `    presenceByUser,\n    token,`,
  `    presenceByUser,\n    rejectIncomingCall,\n    token,`,
  'view reject destructure'
);
view = replaceExactly(
  view,
  `  return (\n    <AppShell`,
  `  return (\n    <>\n      <IncomingCallModal\n        call={incomingCall}\n        isAnswering={isAnsweringIncomingCall}\n        onAccept={() => void acceptIncomingCall()}\n        onReject={rejectIncomingCall}\n      />\n      <AppShell`,
  'view modal render opening'
);
view = replaceExactly(
  view,
  `\n    </AppShell>\n  );`,
  `\n      </AppShell>\n    </>\n  );`,
  'view modal render closing'
);
write(viewPath, view);

// Remove audit/one-shot machinery from the product diff.
fs.rmSync('.github/workflows/audit-mobile-rc-integrity.yml', { force: true });
fs.rmSync('.github/workflows/apply-rtc-call-ring-restoration.yml', { force: true });
fs.rmSync('scripts/apply-rtc-call-ring-restoration.mjs', { force: true });

console.log('RTC incoming-call ring restoration applied.');
