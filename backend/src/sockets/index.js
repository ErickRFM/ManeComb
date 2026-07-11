const { Server } = require("socket.io");
const { CORS_ORIGIN, CLIENT_ORIGINS } = require("../config/env");
const { canAccessTenantResource, getOrganizationId } = require("../middlewares/access-control");
const { canUseOperationalFeatures } = require("../middlewares/operational-access");
const { getRedisClient } = require("../services/redis");
const logger = require("../services/logger");
const { incrementMetric, observeDuration, setGauge } = require("../services/metrics");
const { getOrCreateTraceId } = require("../services/telemetry");
const { verifyToken } = require("../utils/jwt");
const { appendFrame, persistTransmission } = require("../modules/radio/live-stream");

function registerSocketServer(server, store) {
  const allowCredentials = !CLIENT_ORIGINS.includes("*");
  const rtcRooms = new Map();
  const activeRtcSessions = new Map();
  const activeRadioTransmissions = new Map();
  const io = new Server(server, {
    cors: {
      origin: CORS_ORIGIN,
      credentials: allowCredentials
    },
    transports: ["websocket", "polling"],
    pingInterval: 25000,
    pingTimeout: 30000,
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000,
      skipMiddlewares: false
    }
  });
  const redisClient = getRedisClient();

  if (redisClient) {
    try {
      const { createAdapter } = require("@socket.io/redis-adapter");
      const subClient = redisClient.duplicate();
      subClient
        .connect()
        .then(() => {
          io.adapter(createAdapter(redisClient, subClient));
        })
        .catch(() => undefined);
    } catch {
      // Redis adapter is optional; single-node realtime remains available.
    }
  }

  io.use(async (socket, next) => {
    socket.data.traceId = getOrCreateTraceId(
      socket.handshake.auth?.traceId ||
      socket.handshake.headers?.["x-trace-id"] ||
      socket.id
    );
    const token = String(socket.handshake.auth?.token || "").trim();

    if (!token) {
      incrementMetric("socket_auth_failures_total", 1);
      return next(new Error("unauthorized"));
    }

    try {
      const payload = verifyToken(token);
      const user = await store.getUserById(payload.sub);

      if (!user) {
        incrementMetric("socket_auth_failures_total", 1);
        return next(new Error("unauthorized"));
      }

      socket.data.user = user;
      return next();
    } catch (error) {
      incrementMetric("socket_auth_failures_total", 1);
      return next(new Error("unauthorized"));
    }
  });

  function getRoomKey(roomId) {
    return `rtc:${roomId}`;
  }

  function getRtcParticipants(roomId) {
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
      sharedScreen: Boolean(payload.sharedScreen),
      ...snapshot
    });

    activeRtcSessions.set(roomId, session.id);
    return session;
  }

  async function finishRtcSession(roomId, status, participants = getRtcParticipants(roomId)) {
    const activeSessionId = activeRtcSessions.get(roomId);

    if (!activeSessionId) {
      return null;
    }

    activeRtcSessions.delete(roomId);

    return await store.updateRtcSession(activeSessionId, {
      ...getRtcParticipantSnapshot(participants),
      status,
      endedAt: new Date().toISOString()
    });
  }

  function broadcastRtcParticipants(roomId) {
    io.to(getRoomKey(roomId)).emit("rtc:participants", {
      participants: getRtcParticipants(roomId),
      roomId
    });
  }

  function acknowledge(ack, payload) {
    if (typeof ack !== "function") {
      return;
    }

    try {
      ack(payload);
    } catch {
      // Socket.IO acknowledgements are best-effort and should never break the event path.
    }
  }

  function observeSocketEvent(socket, eventName, startedAt, status, metadata = {}) {
    const user = socket.data.user || null;
    const durationMs = Date.now() - startedAt;
    incrementMetric("socket_events_total", 1, { event: eventName, status });
    observeDuration("socket_event_duration_ms", durationMs, { event: eventName });
    logger.info({
      action: eventName,
      durationMs,
      metadata,
      module: "Socket",
      organizationId: getOrganizationId(user),
      requestId: socket.data.traceId,
      status,
      userId: user?.id
    });
  }

  async function canUseOperations(socket) {
    return await canUseOperationalFeatures(store, socket.data.user);
  }

  function isRtcRoomCompatible(roomId, organizationId) {
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

  async function leaveRtcRoom(socket, roomId) {
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
      await finishRtcSession(roomId, "completed", previousParticipants);
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

  io.on("connection", (socket) => {
    incrementMetric("socket_connections_total", 1);
    setGauge("socket_clients", io.engine.clientsCount || 0);
    logger.info({
      action: "Connect",
      module: "Socket",
      organizationId: getOrganizationId(socket.data.user),
      requestId: socket.data.traceId,
      status: "connected",
      userId: socket.data.user?.id
    });

    socket.on("presence:join", (payload, ack) => {
      const startedAt = Date.now();
      const authenticatedUser = socket.data.user || null;
      const resolvedUserId = authenticatedUser?.id;
      const resolvedRole = authenticatedUser?.role;
      const resolvedOrganizationId = getOrganizationId(authenticatedUser);
      const resolvedAccountType = authenticatedUser?.accountType;

      if (resolvedUserId) {
        socket.join(`user:${resolvedUserId}`);
      }

      if (resolvedRole) {
        socket.join(`role:${resolvedRole}`);
      }

      if (resolvedRole === "admin" && !resolvedOrganizationId) {
        socket.join("platform:admin");
      }

      if (resolvedOrganizationId) {
        socket.join(`org:${resolvedOrganizationId}`);

        if (resolvedRole) {
          socket.join(`org:${resolvedOrganizationId}:role:${resolvedRole}`);
        }
      }

      if (resolvedAccountType) {
        socket.join(`account:${resolvedAccountType}`);
      }

      acknowledge(ack, {
        ok: true,
        packetId: String(payload?.packetId || ""),
        serverTime: new Date().toISOString(),
        socketId: socket.id
      });
      observeSocketEvent(socket, "presence:join", startedAt, "success");
    });

    socket.on("client:heartbeat", (payload, ack) => {
      const startedAt = Date.now();
      const authenticatedUser = socket.data.user || null;

      if (!authenticatedUser) {
        acknowledge(ack, {
          ok: false,
          error: "unauthorized",
          packetId: String(payload?.packetId || ""),
          serverTime: new Date().toISOString()
        });
        observeSocketEvent(socket, "client:heartbeat", startedAt, "unauthorized");
        return;
      }

      const response = {
        ok: true,
        packetId: String(payload?.packetId || ""),
        serverTime: new Date().toISOString(),
        socketId: socket.id,
        userId: authenticatedUser.id
      };

      acknowledge(ack, response);
      socket.emit("server:pong", response);
      incrementMetric("socket_heartbeats_total", 1);
      observeSocketEvent(socket, "client:heartbeat", startedAt, "success");
    });

    socket.on("conversation:join", async (conversationId) => {
      const startedAt = Date.now();
      const authenticatedUser = socket.data.user;

      if (
        !(await canUseOperations(socket)) ||
        !(await store.canUserAccessConversation?.(authenticatedUser.id, conversationId))
      ) {
        observeSocketEvent(socket, "conversation:join", startedAt, "forbidden");
        return;
      }

      socket.join(`conversation:${conversationId}`);
      observeSocketEvent(socket, "conversation:join", startedAt, "success", { conversationId });
    });

    socket.on("radio:join", async ({ channelId } = {}, ack) => {
      const safeChannelId = String(channelId || "").trim();
      const allowed = safeChannelId &&
        (await canUseOperations(socket)) &&
        (await store.canUserAccessConversation?.(socket.data.user.id, safeChannelId));
      if (!allowed) {
        acknowledge(ack, { ok: false, error: "forbidden" });
        return;
      }
      socket.join(`conversation:${safeChannelId}`);
      acknowledge(ack, { ok: true });
    });

    socket.on("radio:leave", ({ channelId } = {}) => {
      const safeChannelId = String(channelId || "").trim();
      if (safeChannelId) socket.leave(`conversation:${safeChannelId}`);
    });

    socket.on("radio:start", async ({ channelId } = {}, ack) => {
      const safeChannelId = String(channelId || "").trim();
      const user = socket.data.user;
      const allowed = safeChannelId && user &&
        (await canUseOperations(socket)) &&
        (await store.canUserAccessConversation?.(user.id, safeChannelId));
      if (!allowed) {
        acknowledge(ack, { ok: false, error: "forbidden" });
        return;
      }

      const current = activeRadioTransmissions.get(safeChannelId);
      if (current) {
        const busyPayload = {
          channelId: safeChannelId,
          transmitter: { id: current.userId, name: current.userName }
        };
        socket.emit("radio:busy", busyPayload);
        acknowledge(ack, { ok: false, error: "channel_busy", ...busyPayload });
        return;
      }

      const transmission = {
        id: `${Date.now()}-${socket.id}`,
        channelId: safeChannelId,
        socketId: socket.id,
        userId: user.id,
        userName: user.name || "Operador",
        startedAt: Date.now(),
        byteLength: 0,
        frames: [],
        lastSequence: -1
      };
      activeRadioTransmissions.set(safeChannelId, transmission);
      const payload = {
        channelId: safeChannelId,
        transmissionId: transmission.id,
        startedAt: transmission.startedAt,
        transmitter: { id: transmission.userId, name: transmission.userName }
      };
      io.to(`conversation:${safeChannelId}`).emit("radio:start", payload);
      acknowledge(ack, { ok: true, transmissionId: transmission.id });
    });

    socket.on("radio:frame", (payload = {}) => {
      const channelId = String(payload.channelId || "").trim();
      const transmission = activeRadioTransmissions.get(channelId);
      const sequence = Number(payload.sequence);
      if (!transmission || transmission.socketId !== socket.id ||
          transmission.id !== payload.transmissionId || !Number.isInteger(sequence) ||
          sequence <= transmission.lastSequence || !appendFrame(transmission, payload.data)) {
        return;
      }
      transmission.lastSequence = sequence;
      socket.to(`conversation:${channelId}`).emit("radio:frame", {
        channelId,
        data: payload.data,
        sequence,
        sentAt: Number(payload.sentAt || Date.now()),
        transmissionId: transmission.id
      });
    });

    async function finishRadioTransmission(channelId, reason = "completed") {
      const transmission = activeRadioTransmissions.get(channelId);
      if (!transmission || transmission.socketId !== socket.id) return null;
      activeRadioTransmissions.delete(channelId);
      io.to(`conversation:${channelId}`).emit("radio:end", {
        channelId,
        reason,
        transmissionId: transmission.id
      });
      try {
        const message = await persistTransmission(store, transmission);
        if (message) {
          io.to(`conversation:${channelId}`).emit("radio:message:new", { channelId, message });
          incrementMetric("radio_transmissions_total", 1, { transport: "live_socket" });
        }
        return message;
      } catch (error) {
        logger.error({ action: "PersistLiveTransmission", module: "Radio", status: "error", error });
        socket.emit("radio:error", { message: "La transmision termino, pero no pudo guardarse." });
        return null;
      }
    }

    socket.on("radio:end", async ({ channelId, transmissionId } = {}, ack) => {
      const safeChannelId = String(channelId || "").trim();
      const transmission = activeRadioTransmissions.get(safeChannelId);
      if (!transmission || transmission.id !== transmissionId || transmission.socketId !== socket.id) {
        acknowledge(ack, { ok: false, error: "transmission_not_active" });
        return;
      }
      await finishRadioTransmission(safeChannelId);
      acknowledge(ack, { ok: true });
    });

    socket.on("chat:send", async ({ conversationId, senderId, text, ...payload } = {}, ack) => {
      const startedAt = Date.now();
      const authenticatedUser = socket.data.user || null;

      if (!authenticatedUser || authenticatedUser.id !== senderId) {
        acknowledge(ack, { ok: false, error: "unauthorized" });
        observeSocketEvent(socket, "chat:send", startedAt, "unauthorized");
        return;
      }

      if (
        !(await canUseOperations(socket)) ||
        !conversationId ||
        !senderId ||
        (!text?.trim() && payload.kind !== "audio") ||
        !(await store.canUserAccessConversation?.(authenticatedUser.id, conversationId))
      ) {
        acknowledge(ack, { ok: false, error: "forbidden_or_invalid_payload" });
        observeSocketEvent(socket, "chat:send", startedAt, "invalid");
        return;
      }

      const message = await store.addMessage(
        conversationId,
        senderId,
        payload.kind === "audio"
          ? payload
          : text.trim()
      );

      if (message) {
        io.to(`conversation:${conversationId}`).emit("chat:message", message);
        acknowledge(ack, {
          ok: true,
          messageId: message.id,
          packetId: String(payload.packetId || "")
        });
        incrementMetric("chat_messages_total", 1, { transport: "socket" });
        if (payload.kind === "audio") {
          incrementMetric("radio_transmissions_total", 1, { transport: "socket" });
        }
        observeSocketEvent(socket, "chat:send", startedAt, "success", { conversationId });
      }
    });

    socket.on("location:update", async ({ vehicleId, coordinates, heading, speed, timestamp, packetId } = {}, ack) => {
      const startedAt = Date.now();
      const authenticatedUser = socket.data.user || null;
      const vehicle = vehicleId ? await store.getVehicleById(vehicleId) : null;
      const latitude = Number(coordinates?.latitude);
      const longitude = Number(coordinates?.longitude);

      if (
        !authenticatedUser ||
        !(await canUseOperations(socket)) ||
        !vehicle ||
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180 ||
        !canAccessTenantResource(authenticatedUser, vehicle) ||
        (authenticatedUser.role !== "admin" && authenticatedUser.vehicleId !== vehicleId)
      ) {
        acknowledge(ack, { ok: false, error: "forbidden_or_invalid_payload", packetId: String(packetId || "") });
        observeSocketEvent(socket, "location:update", startedAt, "invalid", { vehicleId });
        return;
      }

      const update = await store.updateVehicleLocation({
        vehicleId,
        coordinates: { latitude, longitude },
        heading: Number.isFinite(Number(heading)) ? Number(heading) : undefined,
        timestamp,
        speed: Number.isFinite(Number(speed)) ? Number(speed) : 0
      });

      if (update) {
        acknowledge(ack, {
          ok: true,
          packetId: String(packetId || ""),
          serverTime: new Date().toISOString(),
          vehicleId
        });
        incrementMetric("gps_updates_total", 1, { transport: "socket" });
        observeSocketEvent(socket, "location:update", startedAt, "success", { vehicleId });
        const organizationId = String(vehicle.organizationId || "").trim();

        if (organizationId) {
          io.to(`org:${organizationId}`).emit("location:updated", update);
          return;
        }

        io.to("platform:admin").emit("location:updated", update);
      }
    });

    socket.on("rtc:join", async ({ roomId }) => {
      const startedAt = Date.now();
      const authenticatedUser = socket.data.user;
      const safeRoomId = String(roomId || "").trim();
      const organizationId = getOrganizationId(authenticatedUser);

      if (
        !safeRoomId ||
        !organizationId ||
        !(await canUseOperations(socket)) ||
        !isRtcRoomCompatible(safeRoomId, organizationId)
      ) {
        observeSocketEvent(socket, "rtc:join", startedAt, "forbidden", { roomId: safeRoomId });
        return;
      }

      const roomKey = getRoomKey(safeRoomId);
      const members = rtcRooms.get(safeRoomId) || new Map();

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
    });

    socket.on("rtc:leave", ({ roomId }) => {
      const startedAt = Date.now();
      void leaveRtcRoom(socket, String(roomId || "").trim());
      observeSocketEvent(socket, "rtc:leave", startedAt, "success", { roomId: String(roomId || "").trim() });
    });

    ["rtc:offer", "rtc:answer", "rtc:ice-candidate", "rtc:hangup"].forEach((eventName) => {
      socket.on(eventName, async ({ roomId, targetSocketId, ...payload }) => {
        const startedAt = Date.now();
        const safeRoomId = String(roomId || "").trim();
        const authenticatedUser = socket.data.user;

        if (
          !safeRoomId ||
          !authenticatedUser ||
          !(await canUseOperations(socket)) ||
          !isSocketInRtcRoom(socket, safeRoomId) ||
          (targetSocketId && !rtcRooms.get(safeRoomId)?.has(String(targetSocketId)))
        ) {
          observeSocketEvent(socket, eventName, startedAt, "forbidden", { roomId: safeRoomId });
          return;
        }

        if (eventName === "rtc:offer") {
          await ensureRtcSession(safeRoomId, {
            initiatedBy: authenticatedUser.id,
            organizationId: getOrganizationId(authenticatedUser),
            offerCount: 1,
            sharedScreen: payload.mode === "screen"
          });
        }

        if (eventName === "rtc:hangup") {
          await finishRtcSession(safeRoomId, "completed");
        }

        const eventPayload = {
          ...payload,
          fromSocketId: socket.id,
          roomId: safeRoomId
        };

        if (targetSocketId) {
          io.to(String(targetSocketId)).emit(eventName, eventPayload);
          observeSocketEvent(socket, eventName, startedAt, "success", { roomId: safeRoomId });
          return;
        }

        socket.to(getRoomKey(safeRoomId)).emit(eventName, eventPayload);
        observeSocketEvent(socket, eventName, startedAt, "success", { roomId: safeRoomId });
      });
    });

    socket.on("disconnect", () => {
      incrementMetric("socket_disconnects_total", 1);
      setGauge("socket_clients", io.engine.clientsCount || 0);
      logger.info({
        action: "Disconnect",
        module: "Socket",
        organizationId: getOrganizationId(socket.data.user),
        requestId: socket.data.traceId,
        status: "disconnected",
        userId: socket.data.user?.id
      });
      Array.from(rtcRooms.keys()).forEach((roomId) => {
        void leaveRtcRoom(socket, roomId);
      });
      Array.from(activeRadioTransmissions.entries()).forEach(([channelId, transmission]) => {
        if (transmission.socketId === socket.id) void finishRadioTransmission(channelId, "disconnected");
      });
    });
  });

  return io;
}

module.exports = {
  registerSocketServer
};
