const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const target = path.join(root, "backend/src/sockets/index.js");
let source = fs.readFileSync(target, "utf8");

function replaceOnce(before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected exactly one match, found ${count}`);
  }
  source = source.replace(before, after);
}

replaceOnce(
  'const { createRadioFloorControl } = require("../modules/radio/floor-control");',
  'const { createRadioFloorControl } = require("../modules/radio/floor-control");\nconst { createRtcSessionCoordinator } = require("../modules/rtc/session-coordinator");',
  "rtc session coordinator import"
);

replaceOnce(
`  const rtcRooms = new Map();
  const activeRtcSessions = new Map();
  const rtcDisconnectTimers = new Map();
  const activeRadioTransmissions = new Map();`,
`  // Timers are process-local scheduling only; they are never live-call authority.
  const rtcDisconnectTimers = new Map();
  const activeRadioTransmissions = new Map();`,
  "remove process-local RTC authority maps"
);

source = source.replaceAll("radioClusterReady", "realtimeClusterReady");
replaceOnce(
  '  let realtimeClusterReady = !redisReadiness.enabled;',
  '  // A configured Redis deployment is fail-closed until the Socket.IO adapter is ready.\n  let realtimeClusterReady = !redisReadiness.enabled;',
  "shared realtime readiness"
);

replaceOnce(
`  function getRtcParticipants(roomId) {
    return Array.from(rtcRooms.get(roomId)?.values() || []);
  }

  function getRtcParticipantSnapshot(participants) {
    return {
      participantUserIds: participants.map((participant) => participant.userId).filter(Boolean),
      participantNames: participants.map((participant) => participant.name).filter(Boolean)
    };
  }

  async function syncRtcSession(roomId, payload) {
    const activeSessionId = activeRtcSessions.get(roomId);

    if (!activeSessionId) {
      return null;
    }

    return await store.updateRtcSession(activeSessionId, payload);
  }

  async function ensureRtcSession(roomId, payload) {
    const participants = getRtcParticipants(roomId);
    const snapshot = getRtcParticipantSnapshot(participants);
    const existingSessionId = activeRtcSessions.get(roomId);

    if (existingSessionId) {
      return await store.updateRtcSession(existingSessionId, {
        ...snapshot,
        offerCount: Math.max(1, Number(payload.offerCount) || 1),
        sharedScreen: Boolean(payload.sharedScreen)
      });
    }

    const session = await store.createRtcSession({
      roomId,
      organizationId: payload.organizationId,
      initiatedBy: payload.initiatedBy,
      offerCount: Math.max(1, Number(payload.offerCount) || 1),
      mode: payload.mode || null,
      sharedScreen: Boolean(payload.sharedScreen),
      ...snapshot
    });

    activeRtcSessions.set(roomId, session.id);
    return session;
  }

  async function finishRtcSession(roomId, status, participants = getRtcParticipants(roomId), endReason = "hangup") {
    const activeSessionId = activeRtcSessions.get(roomId);

    if (!activeSessionId) {
      return null;
    }

    activeRtcSessions.delete(roomId);

    return await store.updateRtcSession(activeSessionId, {
      ...getRtcParticipantSnapshot(participants),
      status,
      endReason,
      endedAt: new Date().toISOString()
    });
  }

  function broadcastRtcParticipants(roomId) {
    io.to(getRoomKey(roomId)).emit("rtc:participants", {
      participants: getRtcParticipants(roomId),
      roomId
    });
  }`,
`  async function getRtcParticipants(roomId) {
    const sockets = await io.in(getRoomKey(roomId)).fetchSockets();
    return sockets
      .map((candidate) => ({
        socketId: candidate.id,
        userId: candidate.data.user?.id || null,
        name: candidate.data.user?.name || null,
        organizationId: getOrganizationId(candidate.data.user)
      }))
      .filter((participant) => participant.userId && participant.organizationId);
  }

  function getRtcParticipantSnapshot(participants) {
    const unique = Array.from(
      new Map(
        participants
          .filter((participant) => participant?.userId)
          .map((participant) => [participant.userId, participant])
      ).values()
    );
    return {
      participantUserIds: unique.map((participant) => participant.userId),
      participantNames: unique.map((participant) => participant.name).filter(Boolean)
    };
  }

  const rtcSessions = createRtcSessionCoordinator({
    store,
    redisClient,
    redisReadiness,
    isClusterReady: () => realtimeClusterReady
  });

  async function syncRtcSession(roomId, payload) {
    const participants = await getRtcParticipants(roomId);
    const organizationId = participants[0]?.organizationId || null;
    if (!organizationId) return null;
    return await rtcSessions.sync(roomId, organizationId, payload);
  }

  async function ensureRtcSession(roomId, payload) {
    const participants = await getRtcParticipants(roomId);
    const snapshot = getRtcParticipantSnapshot(participants);
    const update = {
      ...snapshot,
      offerCount: Math.max(1, Number(payload.offerCount) || 1),
      sharedScreen: Boolean(payload.sharedScreen)
    };
    return await rtcSessions.ensure(roomId, {
      organizationId: payload.organizationId,
      update,
      create: {
        roomId,
        organizationId: payload.organizationId,
        initiatedBy: payload.initiatedBy,
        mode: payload.mode || null,
        ...update
      }
    });
  }

  async function finishRtcSession(
    roomId,
    status,
    participants,
    endReason = "hangup",
    fallbackOrganizationId = null
  ) {
    const safeParticipants = Array.isArray(participants) ? participants : await getRtcParticipants(roomId);
    const organizationId = safeParticipants[0]?.organizationId || fallbackOrganizationId;
    if (!organizationId) return null;
    return await rtcSessions.finish(roomId, organizationId, {
      ...getRtcParticipantSnapshot(safeParticipants),
      status,
      endReason,
      endedAt: new Date().toISOString()
    });
  }

  async function broadcastRtcParticipants(roomId) {
    io.to(getRoomKey(roomId)).emit("rtc:participants", {
      participants: await getRtcParticipants(roomId),
      roomId
    });
  }`,
  "replace RTC room and CDR maps with distributed adapter/coordinator"
);

replaceOnce(
`  function isRtcRoomCompatible(roomId, organizationId) {
    const members = rtcRooms.get(roomId);

    return (
      !members ||
      Array.from(members.values()).every(
        (participant) => participant.organizationId === organizationId
      )
    );
  }

  function isSocketInRtcRoom(socket, roomId) {
    return rtcRooms.get(roomId)?.has(socket.id) || false;
  }

  async function leaveRtcRoom(socket, roomId, endReason = "hangup") {
    const disconnectTimer = rtcDisconnectTimers.get(socket.id);
    if (disconnectTimer) {
      clearTimeout(disconnectTimer);
      rtcDisconnectTimers.delete(socket.id);
    }

    if (!roomId || !rtcRooms.has(roomId)) {
      return;
    }

    const members = rtcRooms.get(roomId);
    const previousParticipants = Array.from(members.values());
    const didDelete = members.delete(socket.id);

    if (!didDelete) {
      return;
    }

    socket.leave(getRoomKey(roomId));

    if (!members.size) {
      await finishRtcSession(roomId, "completed", previousParticipants, endReason);
      rtcRooms.delete(roomId);
    } else {
      await syncRtcSession(roomId, getRtcParticipantSnapshot(Array.from(members.values())));
    }

    io.to(getRoomKey(roomId)).emit("rtc:hangup", {
      roomId,
      fromSocketId: socket.id
    });
    broadcastRtcParticipants(roomId);
  }

  // RC-MOBILE-CALLS-PRODUCTION-01 Bloque A: signaling global de llamadas (autoritativo backend).
  // Reserva/timbre/aceptacion/timeout viven aqui; el media (join/offer/answer/ICE) sigue en rtc:*.
  // Estado en memoria => asume UNA instancia de backend (documentado en el reporte); con varias
  // replicas debera centralizarse (Redis).
  const callService = createRtcCallService({
    store,
    emitToUser: (userId, event, payload) => io.to(\`user:\${userId}\`).emit(event, payload)
  });`,
`  function isSocketInRtcRoom(socket, roomId) {
    return socket.rooms.has(getRoomKey(roomId));
  }

  async function isSocketInRtcRoomById(roomId, socketId) {
    if (!socketId) return false;
    const participants = await io.in(getRoomKey(roomId)).fetchSockets();
    return participants.some((participant) => participant.id === String(socketId));
  }

  async function leaveRtcRoom(socket, roomId, endReason = "hangup") {
    const disconnectTimer = rtcDisconnectTimers.get(socket.id);
    if (disconnectTimer) {
      clearTimeout(disconnectTimer);
      rtcDisconnectTimers.delete(socket.id);
    }
    if (!roomId || !isSocketInRtcRoom(socket, roomId)) return;

    const previousParticipants = await getRtcParticipants(roomId);
    await socket.leave(getRoomKey(roomId));
    const participants = await getRtcParticipants(roomId);
    const organizationId =
      participants[0]?.organizationId ||
      previousParticipants[0]?.organizationId ||
      getOrganizationId(socket.data.user);

    if (!participants.length) {
      await finishRtcSession(roomId, "completed", previousParticipants, endReason, organizationId);
    } else {
      await rtcSessions.sync(
        roomId,
        organizationId,
        getRtcParticipantSnapshot(participants)
      );
    }

    io.to(getRoomKey(roomId)).emit("rtc:hangup", {
      roomId,
      fromSocketId: socket.id
    });
    await broadcastRtcParticipants(roomId);
  }

  async function reconcileRtcRoomAfterDisconnect(socket, roomId, endReason = "timeout") {
    if (!roomId) return;
    const disconnectedUserId = socket.data.user?.id || null;
    const participants = await getRtcParticipants(roomId);
    if (disconnectedUserId && participants.some((participant) => participant.userId === disconnectedUserId)) {
      const organizationId = participants[0]?.organizationId || getOrganizationId(socket.data.user);
      if (organizationId) {
        await rtcSessions.sync(roomId, organizationId, getRtcParticipantSnapshot(participants));
      }
      return;
    }

    const disconnectedParticipant = disconnectedUserId
      ? {
          socketId: socket.id,
          userId: disconnectedUserId,
          name: socket.data.user?.name || null,
          organizationId: getOrganizationId(socket.data.user)
        }
      : null;
    const previousParticipants = disconnectedParticipant
      ? [...participants, disconnectedParticipant]
      : participants;
    const organizationId =
      participants[0]?.organizationId ||
      disconnectedParticipant?.organizationId ||
      null;

    if (!participants.length) {
      await finishRtcSession(roomId, "completed", previousParticipants, endReason, organizationId);
    } else if (organizationId) {
      await rtcSessions.sync(roomId, organizationId, getRtcParticipantSnapshot(participants));
    }

    io.to(getRoomKey(roomId)).emit("rtc:hangup", {
      roomId,
      fromSocketId: socket.id
    });
    await broadcastRtcParticipants(roomId);
  }

  // Redis owns the live call lease; Socket.IO Redis adapter owns distributed room transport;
  // Mongo/store remains the CDR/history authority.
  const callService = createRtcCallService({
    store,
    redisClient,
    redisReadiness,
    isClusterReady: () => realtimeClusterReady,
    emitToUser: (userId, event, payload) => io.to(\`user:\${userId}\`).emit(event, payload)
  });`,
  "replace local RTC membership and live authority"
);

replaceOnce(
  "      if (resolvedUserId) callService.noteUserReconnected(resolvedUserId);",
  "      if (resolvedUserId) await callService.noteUserReconnected(resolvedUserId);",
  "await reconnect reconciliation"
);

replaceOnce(
  '    socket.on("client:heartbeat", (payload, ack) => {',
  '    socket.on("client:heartbeat", async (payload, ack) => {',
  "async heartbeat"
);
replaceOnce(
`      const response = {
        ok: true,`,
`      await callService.refreshForUser(authenticatedUser.id);

      const response = {
        ok: true,`,
  "refresh RTC lease from heartbeat"
);

replaceOnce(
`      const auth = callService.canJoinCall({ callId: safeCallId, userId: authenticatedUser.id, organizationId });
      if (!auth.ok) {
        observeSocketEvent(socket, "rtc:join", startedAt, "forbidden", { callId: safeCallId, reason: auth.reason });
        acknowledge(ack, { ok: false, reason: auth.reason });
        return;
      }

      const safeRoomId = auth.roomId; // \`call:{callId}\`
      const roomKey = getRoomKey(safeRoomId);
      const members = rtcRooms.get(safeRoomId) || new Map();
      const previousConnection = Array.from(members.values()).find(
        (participant) => participant.userId === authenticatedUser.id && participant.socketId !== socket.id
      );

      if (previousConnection) {
        const reconnectTimer = rtcDisconnectTimers.get(previousConnection.socketId);
        if (reconnectTimer) clearTimeout(reconnectTimer);
        rtcDisconnectTimers.delete(previousConnection.socketId);
        members.delete(previousConnection.socketId);
      }
      const alreadyJoined = members.has(socket.id);

      if (!alreadyJoined && members.size >= 2) {
        observeSocketEvent(socket, "rtc:join", startedAt, "busy", { roomId: safeRoomId });
        acknowledge(ack, { ok: false, reason: "busy" });
        return;
      }

      members.set(socket.id, {
        socketId: socket.id,
        userId: authenticatedUser.id,
        name: authenticatedUser.name,
        organizationId
      });
      rtcRooms.set(safeRoomId, members);
      socket.join(roomKey);
      broadcastRtcParticipants(safeRoomId);
      observeSocketEvent(socket, "rtc:join", startedAt, "success", { roomId: safeRoomId });
      acknowledge(ack, { ok: true });`,
`      const auth = await callService.canJoinCall({
        callId: safeCallId,
        userId: authenticatedUser.id,
        organizationId
      });
      if (!auth.ok) {
        observeSocketEvent(socket, "rtc:join", startedAt, "forbidden", { callId: safeCallId, reason: auth.reason });
        acknowledge(ack, { ok: false, reason: auth.reason });
        return;
      }

      const safeRoomId = auth.roomId; // \`call:{callId}\`
      const roomKey = getRoomKey(safeRoomId);
      const roomSockets = await io.in(roomKey).fetchSockets();
      const previousConnections = roomSockets.filter(
        (participant) =>
          participant.data.user?.id === authenticatedUser.id && participant.id !== socket.id
      );
      for (const previousConnection of previousConnections) {
        const reconnectTimer = rtcDisconnectTimers.get(previousConnection.id);
        if (reconnectTimer) clearTimeout(reconnectTimer);
        rtcDisconnectTimers.delete(previousConnection.id);
        await io.in(previousConnection.id).socketsLeave(roomKey);
      }

      await socket.join(roomKey);
      await broadcastRtcParticipants(safeRoomId);
      observeSocketEvent(socket, "rtc:join", startedAt, "success", { roomId: safeRoomId });
      acknowledge(ack, { ok: true });`,
  "distributed rtc join"
);

replaceOnce(
`    socket.on("rtc:leave", ({ callId } = {}) => {
      const startedAt = Date.now();
      const safeRoomId = callRoomIdOf(callId);
      if (safeRoomId) void leaveRtcRoom(socket, safeRoomId);
      observeSocketEvent(socket, "rtc:leave", startedAt, "success", { callId: String(callId || "") || null });
    });`,
`    socket.on("rtc:leave", async ({ callId } = {}) => {
      const startedAt = Date.now();
      const safeRoomId = callRoomIdOf(callId);
      if (safeRoomId) await leaveRtcRoom(socket, safeRoomId);
      observeSocketEvent(socket, "rtc:leave", startedAt, "success", { callId: String(callId || "") || null });
    });`,
  "async rtc leave"
);

replaceOnce(
`          !isSocketInRtcRoom(socket, safeRoomId) ||
          !callService.isCallMember(safeCallId, authenticatedUser.id) ||
          (targetSocketId && !rtcRooms.get(safeRoomId)?.has(String(targetSocketId)))`,
`          !isSocketInRtcRoom(socket, safeRoomId) ||
          !(await callService.isCallMember(safeCallId, authenticatedUser.id)) ||
          (targetSocketId && !(await isSocketInRtcRoomById(safeRoomId, targetSocketId)))`,
  "distributed signaling membership"
);

replaceOnce(
`      const result = action({ user, socketId: socket.id, callId: String(callId || "").trim() });
      acknowledge(ack, result);`,
`      const result = await action({ user, socketId: socket.id, callId: String(callId || "").trim() });
      acknowledge(ack, result);`,
  "await RTC lifecycle action"
);

replaceOnce(
`    socket.on("disconnect", async () => {`,
`    socket.on("disconnecting", () => {
      socket.data.rtcDisconnectRoomIds = [...socket.rooms]
        .filter((room) => room.startsWith("rtc:call:"))
        .map((room) => room.slice("rtc:".length));
    });

    socket.on("disconnect", async () => {`,
  "capture RTC rooms before adapter removes membership"
);

replaceOnce(
`      const joinedRtcRoomIds = Array.from(rtcRooms.keys()).filter((roomId) =>
        isSocketInRtcRoom(socket, roomId)
      );
      if (joinedRtcRoomIds.length) {
        const disconnectTimer = setTimeout(() => {
        rtcDisconnectTimers.delete(socket.id);
        joinedRtcRoomIds.forEach((roomId) => {
          void leaveRtcRoom(socket, roomId, "timeout");
        });
        }, 15000);
        rtcDisconnectTimers.set(socket.id, disconnectTimer);
      }`,
`      const joinedRtcRoomIds = Array.isArray(socket.data.rtcDisconnectRoomIds)
        ? socket.data.rtcDisconnectRoomIds
        : [];
      if (joinedRtcRoomIds.length) {
        const disconnectTimer = setTimeout(() => {
          rtcDisconnectTimers.delete(socket.id);
          joinedRtcRoomIds.forEach((roomId) => {
            void reconcileRtcRoomAfterDisconnect(socket, roomId, "timeout").catch((error) => {
              logger.error({ action: "RtcDisconnectReconcile", module: "RTC", status: "error", error });
            });
          });
        }, 15000);
        rtcDisconnectTimers.set(socket.id, disconnectTimer);
      }`,
  "distributed disconnect room reconciliation"
);

replaceOnce(
`      await callService.handleDisconnect(socket.id, {
        isUserConnected: (userId) => hasAnotherLivePresenceSocket(socket, userId)
      });`,
`      await callService.handleDisconnect(disconnectedUserId, {
        isUserConnected: (userId) => hasAnotherLivePresenceSocket(socket, userId)
      });`,
  "disconnect lifecycle by authenticated user"
);

// The adapter readiness is shared by Radio and RTC. Keep the existing behavior but make
// diagnostics describe the actual shared dependency rather than a Radio-only facility.
source = source.replaceAll('module: "Radio", status: "error", error });\n      });\n      subClient', 'module: "Realtime", status: "error", error });\n      });\n      subClient');
source = source.replaceAll('action: "ConnectRedisAdapter", module: "Radio"', 'action: "ConnectRedisAdapter", module: "Realtime"');
source = source.replaceAll('action: "ConfigureRedisAdapter", module: "Radio"', 'action: "ConfigureRedisAdapter", module: "Realtime"');

for (const forbidden of [
  "const rtcRooms = new Map()",
  "const activeRtcSessions = new Map()",
  "rtcRooms.get(",
  "rtcRooms.set(",
  "activeRtcSessions.get(",
  "activeRtcSessions.set("
]) {
  if (source.includes(forbidden)) {
    throw new Error(`stale process-local RTC authority remains: ${forbidden}`);
  }
}

fs.writeFileSync(target, source);
execFileSync(process.execPath, ["--check", target], { stdio: "inherit" });
execFileSync(process.execPath, ["--check", path.join(root, "backend/src/services/rtc-call-service.js")], { stdio: "inherit" });
execFileSync(process.execPath, ["--check", path.join(root, "backend/src/modules/rtc/live-authority.js")], { stdio: "inherit" });
execFileSync(process.execPath, ["--check", path.join(root, "backend/src/modules/rtc/session-coordinator.js")], { stdio: "inherit" });
console.log("rtc distributed socket codemod: OK");
