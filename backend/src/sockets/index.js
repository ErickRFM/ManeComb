const { Server } = require("socket.io");
const { CORS_ORIGIN, CLIENT_ORIGINS } = require("../config/env");
const { canAccessTenantResource, getOrganizationId, getRolesWithPermission } = require("../middlewares/access-control");
const { canUseOperationalFeatures } = require("../middlewares/operational-access");
const { getRedisClient, getRedisReadiness } = require("../services/redis");
const logger = require("../services/logger");
const { hasAnotherPresenceSocket, isPresenceHeartbeatFresh } = require("../services/presence");
const { incrementMetric, observeDuration, setGauge } = require("../services/metrics");
const { getOrCreateTraceId } = require("../services/telemetry");
const { emitOperationalUnitUpdate } = require("../services/operational-units-service");
const { resolveAuthenticatedUser } = require("../middlewares/authenticate");
const {
  appendFrame,
  FRAME_BASE64_LENGTH,
  FRAME_BYTES,
  MAX_TRANSMISSION_BYTES,
  persistTransmission
} = require("../modules/radio/live-stream");

const RADIO_TRANSMISSION_TIMEOUT_MS = 65000;
const RADIO_LOCK_TTL_MS = 10000;
const RADIO_LOCK_PREFIX = "manecomb:radio:channel:";
const RADIO_FRAME_DURATION_MS = 20;
const RADIO_FRAME_BURST_ALLOWANCE = 50;
const PRESENCE_HEARTBEAT_TIMEOUT_MS = 55000;
const PRESENCE_SWEEP_INTERVAL_MS = 5000;

function getRadioRoom(channelId) {
  return `radio:${channelId}`;
}

function registerSocketServer(server, store) {
  const allowCredentials = !CLIENT_ORIGINS.includes("*");
  const rtcRooms = new Map();
  const activeRtcSessions = new Map();
  const rtcDisconnectTimers = new Map();
  const activeRadioTransmissions = new Map();
  const io = new Server(server, {
    cors: {
      origin: CORS_ORIGIN,
      credentials: allowCredentials
    },
    transports: ["websocket", "polling"],
    pingInterval: 25000,
    pingTimeout: 30000,
    maxHttpBufferSize: 64 * 1024,
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000,
      skipMiddlewares: false
    }
  });
  const redisClient = getRedisClient();
  const redisReadiness = getRedisReadiness();
  let radioClusterReady = !redisReadiness.enabled;

  async function hasAnotherLivePresenceSocket(sourceSocket, userId) {
    const candidates = await io.in(`user:${userId}`).fetchSockets();
    return hasAnotherPresenceSocket(candidates, sourceSocket.id, userId);
  }

  async function emitPresenceStatus(sourceSocket, status) {
    const userId = sourceSocket.data.user?.id;
    const organizationId = getOrganizationId(sourceSocket.data.user);
    if (!userId || !organizationId) return;
    if (status === "offline" && await hasAnotherLivePresenceSocket(sourceSocket, userId)) return;
    io.to(`org:${organizationId}`).emit("presence:updated", { userId, status });
  }

  const presenceSweepTimer = setInterval(() => {
    const now = Date.now();
    io.sockets.sockets.forEach((candidate) => {
      if (!candidate.data.presenceJoined) return;
      const lastHeartbeatAt = Number(candidate.data.lastPresenceHeartbeatAt || 0);
      if (isPresenceHeartbeatFresh(lastHeartbeatAt, now, PRESENCE_HEARTBEAT_TIMEOUT_MS)) return;
      candidate.data.presenceJoined = false;
      void emitPresenceStatus(candidate, "offline").catch((error) => {
        logger.error({ action: "PresenceExpireBroadcast", module: "Presence", status: "error", error });
      });
      logger.warn({
        action: "PresenceExpired",
        module: "Presence",
        status: "offline",
        userId: candidate.data.user?.id,
        metadata: { lastHeartbeatAt: lastHeartbeatAt || null, socketId: candidate.id }
      });
    });
  }, PRESENCE_SWEEP_INTERVAL_MS);
  presenceSweepTimer.unref?.();
  server.once("close", () => clearInterval(presenceSweepTimer));

  function getLocalRoomDiagnostics(room, sourceSocketId = null) {
    const socketIds = [...(io.sockets.adapter.rooms.get(room) || [])];
    const clients = socketIds.map((socketId) => ({
      socketId,
      userId: io.sockets.sockets.get(socketId)?.data.user?.id || null
    }));
    return {
      localDestinationClients: sourceSocketId
        ? clients.filter((client) => client.socketId !== sourceSocketId)
        : clients,
      localRoomClients: clients.length
    };
  }

  async function acquireRadioChannel(channelId, owner) {
    if (!redisReadiness.enabled) return { acquired: true, owner: null };
    if (!redisClient?.isReady || !radioClusterReady) {
      throw new Error("Redis no esta disponible para arbitrar Radio");
    }
    const key = `${RADIO_LOCK_PREFIX}${channelId}`;
    const value = JSON.stringify(owner);
    const acquired = await redisClient.set(key, value, { NX: true, PX: RADIO_LOCK_TTL_MS });
    if (acquired === "OK") return { acquired: true, key, value, owner: null };
    const currentValue = await redisClient.get(key);
    try {
      return { acquired: false, key, value, owner: currentValue ? JSON.parse(currentValue) : null };
    } catch {
      return { acquired: false, key, value, owner: null };
    }
  }

  async function getAuthoritativeRadioOwner(channelId) {
    if (!redisReadiness.enabled) {
      const local = activeRadioTransmissions.get(channelId);
      return local
        ? { socketId: local.socketId, transmissionId: local.id, userId: local.userId, userName: local.userName }
        : null;
    }
    if (!redisClient?.isReady || !radioClusterReady) {
      throw new Error("Redis no esta disponible para consultar Radio");
    }
    const value = await redisClient.get(`${RADIO_LOCK_PREFIX}${channelId}`);
    if (!value) return null;
    try { return JSON.parse(value); } catch { return null; }
  }

  async function verifyAndRefreshRadioChannel(transmission) {
    if (!redisReadiness.enabled) return true;
    if (!redisClient?.isReady || !radioClusterReady || !transmission.lockKey || !transmission.lockValue) {
      return false;
    }
    const refreshed = await redisClient.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end",
      { keys: [transmission.lockKey], arguments: [transmission.lockValue, String(RADIO_LOCK_TTL_MS)] }
    );
    return Number(refreshed) === 1;
  }

  async function releaseRadioChannel(transmission) {
    if (!redisReadiness.enabled) return true;
    if (!redisClient || !transmission.lockKey || !transmission.lockValue) return false;
    const released = await redisClient.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      { keys: [transmission.lockKey], arguments: [transmission.lockValue] }
    );
    return Number(released) === 1;
  }

  if (redisClient) {
    try {
      const { createAdapter } = require("@socket.io/redis-adapter");
      const subClient = redisClient.duplicate();
      let adapterConfigured = false;
      subClient.on("ready", () => {
        if (adapterConfigured) radioClusterReady = true;
      });
      subClient.on("end", () => {
        radioClusterReady = false;
      });
      subClient.on("error", (error) => {
        radioClusterReady = false;
        logger.error({ action: "RedisAdapter", module: "Radio", status: "error", error });
      });
      subClient
        .connect()
        .then(() => {
          io.adapter(createAdapter(redisClient, subClient));
          adapterConfigured = true;
          radioClusterReady = true;
        })
        .catch((error) => {
          logger.error({ action: "ConnectRedisAdapter", module: "Radio", status: "error", error });
        });
    } catch (error) {
      logger.error({ action: "ConfigureRedisAdapter", module: "Radio", status: "error", error });
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
      const resolved = await resolveAuthenticatedUser(store, token);

      if (!resolved) {
        incrementMetric("socket_auth_failures_total", 1);
        return next(new Error("unauthorized"));
      }

      socket.data.user = resolved.user;
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
    let radioFrameQueue = Promise.resolve();
    setGauge("socket_clients", io.engine.clientsCount || 0);
    logger.info({
      action: "Connect",
      module: "Socket",
      organizationId: getOrganizationId(socket.data.user),
      requestId: socket.data.traceId,
      status: "connected",
      userId: socket.data.user?.id
    });

    socket.on("presence:join", async (payload, ack) => {
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

      socket.data.presenceJoined = true;
      socket.data.lastPresenceHeartbeatAt = Date.now();
      const organizationSockets = resolvedOrganizationId
        ? await io.in(`org:${resolvedOrganizationId}`).fetchSockets()
        : [];
      const onlineUserIds = organizationSockets
        .filter(
          (candidate) =>
            candidate.data.presenceJoined &&
            getOrganizationId(candidate.data.user) === resolvedOrganizationId
        )
        .map((candidate) => candidate.data.user?.id)
        .filter(Boolean);
      socket.emit("presence:snapshot", { userIds: [...new Set(onlineUserIds)] });
      if (resolvedOrganizationId && resolvedUserId) {
        io.to(`org:${resolvedOrganizationId}`).emit("presence:updated", {
          userId: resolvedUserId,
          status: "online"
        });
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
      const liveRoom = getRadioRoom(safeChannelId);
      const historyRoom = `conversation:${safeChannelId}`;
      const allowed = safeChannelId &&
        (await canUseOperations(socket)) &&
        (await store.canUserAccessConversation?.(socket.data.user.id, safeChannelId));
      if (!allowed) {
        logger.warn({
          action: "JoinChannel",
          module: "Radio",
          status: "forbidden",
          userId: socket.data.user?.id,
          metadata: { channelId: safeChannelId, socketId: socket.id }
        });
        acknowledge(ack, { ok: false, error: "forbidden" });
        return;
      }
      const previousRadioRooms = [...socket.rooms].filter(
        (joinedRoom) => joinedRoom.startsWith("radio:") && joinedRoom !== liveRoom
      );
      for (const previousRoom of previousRadioRooms) {
        const previousChannelId = previousRoom.slice("radio:".length);
        const previousTransmission = activeRadioTransmissions.get(previousChannelId);
        if (previousTransmission?.socketId === socket.id) {
          void finishRadioTransmission(previousChannelId, "channel_changed");
        }
        await socket.leave(previousRoom);
      }
      await Promise.all([
        socket.join(liveRoom),
        socket.join(historyRoom)
      ]);
      logger.info({
        action: "JoinChannel",
        module: "Radio",
        status: "success",
        organizationId: getOrganizationId(socket.data.user),
        userId: socket.data.user.id,
        metadata: {
          channelId: safeChannelId,
          historyRoom,
          historyRoomDiagnostics: getLocalRoomDiagnostics(historyRoom),
          liveRoom,
          liveRoomDiagnostics: getLocalRoomDiagnostics(liveRoom),
          socketId: socket.id
        }
      });
      acknowledge(ack, {
        ok: true,
        channelId: safeChannelId,
        historyRoom,
        liveRoom,
        socketId: socket.id
      });
    });

    socket.on("radio:leave", async ({ channelId } = {}, ack) => {
      const safeChannelId = String(channelId || "").trim();
      if (!safeChannelId) {
        acknowledge(ack, { ok: false, error: "channel_required" });
        return;
      }
      const room = getRadioRoom(safeChannelId);
      await socket.leave(room);
      const transmission = activeRadioTransmissions.get(safeChannelId);
      if (transmission?.socketId === socket.id) {
        void finishRadioTransmission(safeChannelId, "left_channel");
      }
      logger.info({
        action: "LeaveChannel",
        module: "Radio",
        status: "success",
        userId: socket.data.user?.id,
        metadata: { channelId: safeChannelId, room, socketId: socket.id }
      });
      acknowledge(ack, { ok: true });
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
      const liveRoom = getRadioRoom(safeChannelId);
      if (!socket.rooms.has(liveRoom)) {
        acknowledge(ack, { ok: false, error: "radio_not_joined" });
        return;
      }

      let authoritativeOwner;
      try {
        authoritativeOwner = await getAuthoritativeRadioOwner(safeChannelId);
      } catch (error) {
        logger.error({ action: "ReadRadioChannel", module: "Radio", status: "error", error });
        acknowledge(ack, { ok: false, error: "radio_unavailable" });
        return;
      }
      if (authoritativeOwner) {
        const current = activeRadioTransmissions.get(safeChannelId);
        if (authoritativeOwner.socketId === socket.id && current?.id === authoritativeOwner.transmissionId) {
          acknowledge(ack, { ok: true, transmissionId: current.id });
          return;
        }
        const busyPayload = {
          channelId: safeChannelId,
          transmitter: { id: authoritativeOwner.userId, name: authoritativeOwner.userName }
        };
        acknowledge(ack, { ok: false, error: "channel_busy", ...busyPayload });
        return;
      }

      const activeForSocket = [...activeRadioTransmissions.values()].find(
        (transmission) => transmission.socketId === socket.id
      );
      if (activeForSocket) {
        acknowledge(ack, {
          ok: false,
          error: "channel_busy",
          channelId: activeForSocket.channelId,
          transmissionId: activeForSocket.id,
          transmitter: { id: activeForSocket.userId, name: activeForSocket.userName }
        });
        return;
      }

      const transmission = {
        id: `${Date.now()}-${socket.id}`,
        channelId: safeChannelId,
        socketId: socket.id,
        userId: user.id,
        userName: user.name || "Operador",
        organizationId: getOrganizationId(user),
        startedAt: Date.now(),
        byteLength: 0,
        frames: [],
        lastSequence: -1,
        receivedFrames: 0,
        forwardedFrames: 0,
        latencyTotalMs: 0,
        latencyMaxMs: 0,
        minDestinationClients: Number.POSITIVE_INFINITY,
        maxDestinationClients: 0,
        timeoutId: null,
        lockKey: null,
        lockValue: null
      };

      const presenceWasExpired = !socket.data.presenceJoined;
      socket.data.lastPresenceHeartbeatAt = Date.now();
      socket.data.presenceJoined = true;
      if (presenceWasExpired) {
        void emitPresenceStatus(socket, "online");
      }
      try {
        const lock = await acquireRadioChannel(safeChannelId, {
          socketId: socket.id,
          transmissionId: transmission.id,
          userId: transmission.userId,
          userName: transmission.userName
        });
        if (!lock.acquired) {
          acknowledge(ack, {
            ok: false,
            error: "channel_busy",
            channelId: safeChannelId,
            transmitter: lock.owner
              ? { id: lock.owner.userId, name: lock.owner.userName }
              : undefined
          });
          return;
        }
        transmission.lockKey = lock.key || null;
        transmission.lockValue = lock.value || null;
      } catch (error) {
        logger.error({ action: "AcquireRadioChannel", module: "Radio", status: "error", error });
        acknowledge(ack, { ok: false, error: "radio_unavailable" });
        return;
      }
      activeRadioTransmissions.set(safeChannelId, transmission);
      transmission.timeoutId = setTimeout(() => {
        const current = activeRadioTransmissions.get(safeChannelId);
        if (current?.id === transmission.id) {
          void finishRadioTransmission(safeChannelId, "timeout");
        }
      }, RADIO_TRANSMISSION_TIMEOUT_MS);
      const payload = {
        channelId: safeChannelId,
        transmissionId: transmission.id,
        startedAt: transmission.startedAt,
        transmitter: { id: transmission.userId, name: transmission.userName }
      };
      logger.info({
        action: "StartTransmission",
        module: "Radio",
        status: "success",
        userId: transmission.userId,
        metadata: {
          channelId: safeChannelId,
          ...getLocalRoomDiagnostics(liveRoom, socket.id),
          socketId: socket.id,
          startedAt: transmission.startedAt,
          transmissionId: transmission.id
        }
      });
      io.to(liveRoom).emit("radio:start", payload);
      acknowledge(ack, { ok: true, transmissionId: transmission.id });
    });

    socket.on("radio:frame", (payload = {}) => {
      radioFrameQueue = radioFrameQueue.then(async () => {
      const channelId = String(payload.channelId || "").trim();
      const liveRoom = getRadioRoom(channelId);
      const transmission = activeRadioTransmissions.get(channelId);
      const sequence = Number(payload.sequence);
      const sentAt = Number(payload.sentAt);
      const base64Length = typeof payload.data === "string" ? payload.data.length : -1;
      if (!transmission || transmission.socketId !== socket.id ||
          transmission.id !== payload.transmissionId || !Number.isInteger(sequence)) {
        logger.warn({
          action: "RejectFrame",
          module: "Radio",
          status: "invalid_owner",
          userId: socket.data.user?.id,
          metadata: {
            channelId,
            sequence,
            socketId: socket.id,
            transmissionId: payload.transmissionId || null
          }
        });
        return;
      }
      let ownsAuthoritativeChannel = false;
      try {
        ownsAuthoritativeChannel = await verifyAndRefreshRadioChannel(transmission);
      } catch (error) {
        logger.error({ action: "RefreshRadioChannel", module: "Radio", status: "error", error });
      }
      if (!ownsAuthoritativeChannel) {
        activeRadioTransmissions.delete(channelId);
        if (transmission.timeoutId) clearTimeout(transmission.timeoutId);
        io.to(liveRoom).emit("radio:end", {
          channelId,
          reason: "authority_lost",
          transmissionId: transmission.id
        });
        socket.emit("radio:error", { message: "Se perdio el arbitraje distribuido del canal." });
        return;
      }
      if (sequence <= transmission.lastSequence) {
        logger.warn({
          action: "RejectFrame",
          module: "Radio",
          status: "duplicate",
          userId: transmission.userId,
          metadata: {
            channelId,
            expectedSequence: transmission.lastSequence + 1,
            sequence,
            socketId: socket.id,
            transmissionId: transmission.id
          }
        });
        return;
      }
      const maxSequenceForElapsedTime =
        Math.floor((Date.now() - transmission.startedAt) / RADIO_FRAME_DURATION_MS) +
        RADIO_FRAME_BURST_ALLOWANCE;
      if (sequence > maxSequenceForElapsedTime) {
        logger.warn({
          action: "RejectFrame",
          module: "Radio",
          status: "rate_exceeded",
          userId: transmission.userId,
          metadata: {
            channelId,
            maxSequenceForElapsedTime,
            sequence,
            socketId: socket.id,
            transmissionId: transmission.id
          }
        });
        socket.emit("radio:error", { message: "El flujo de audio PTT excedio la cadencia permitida." });
        void finishRadioTransmission(channelId, "rate_exceeded");
        return;
      }
      if (transmission.byteLength + FRAME_BYTES > MAX_TRANSMISSION_BYTES) {
        void finishRadioTransmission(channelId, "max_duration");
        return;
      }
      if (sequence !== transmission.lastSequence + 1 || !Number.isFinite(sentAt) || sentAt <= 0 ||
          base64Length !== FRAME_BASE64_LENGTH ||
          !appendFrame(transmission, payload.data)) {
        logger.warn({
          action: "RejectFrame",
          module: "Radio",
          status: "invalid_frame",
          userId: transmission.userId,
          metadata: {
            base64Length,
            channelId,
            expectedSequence: transmission.lastSequence + 1,
            sequence,
            sentAt,
            socketId: socket.id,
            transmissionId: transmission.id
          }
        });
        socket.emit("radio:error", { message: "El flujo de audio PTT se interrumpio." });
        void finishRadioTransmission(channelId, "invalid_frame");
        return;
      }
      transmission.lastSequence = sequence;
      transmission.receivedFrames += 1;
      const frameLatencyMs = Math.max(0, Date.now() - sentAt);
      transmission.latencyTotalMs += frameLatencyMs;
      transmission.latencyMaxMs = Math.max(transmission.latencyMaxMs, frameLatencyMs);
      const destinationClients = Math.max(
        0,
        (io.sockets.adapter.rooms.get(liveRoom)?.size || 0) - 1
      );
      transmission.minDestinationClients = Math.min(
        transmission.minDestinationClients,
        destinationClients
      );
      transmission.maxDestinationClients = Math.max(
        transmission.maxDestinationClients,
        destinationClients
      );
      socket.to(liveRoom).emit("radio:frame", {
        channelId,
        data: payload.data,
        sequence,
        sentAt,
        transmissionId: transmission.id
      });
        transmission.forwardedFrames += 1;
      }).catch((error) => {
        logger.error({ action: "ProcessRadioFrame", module: "Radio", status: "error", error });
      });
    });

    async function finishRadioTransmission(channelId, reason = "completed") {
      const transmission = activeRadioTransmissions.get(channelId);
      if (!transmission || transmission.socketId !== socket.id) return null;
      activeRadioTransmissions.delete(channelId);
      if (transmission.timeoutId) clearTimeout(transmission.timeoutId);
      try {
        await releaseRadioChannel(transmission);
      } catch (error) {
        logger.error({ action: "ReleaseRadioChannel", module: "Radio", status: "error", error });
      }
      const liveRoom = getRadioRoom(channelId);
      io.to(liveRoom).emit("radio:end", {
        channelId,
        reason,
        transmissionId: transmission.id
      });
      logger.info({
        action: "EndTransmission",
        module: "Radio",
        status: reason,
        userId: transmission.userId,
        metadata: {
          averageFrameLatencyMs: transmission.receivedFrames
            ? Math.round(transmission.latencyTotalMs / transmission.receivedFrames)
            : null,
          bytes: transmission.byteLength,
          channelId,
          firstSequence: transmission.receivedFrames ? 0 : null,
          forwardedFrames: transmission.forwardedFrames,
          frames: transmission.receivedFrames,
          lastSequence: transmission.lastSequence,
          ...getLocalRoomDiagnostics(liveRoom, transmission.socketId),
          maxDestinationClients: transmission.maxDestinationClients,
          maxFrameLatencyMs: transmission.latencyMaxMs,
          minDestinationClients: Number.isFinite(transmission.minDestinationClients)
            ? transmission.minDestinationClients
            : 0,
          socketId: transmission.socketId,
          transmissionId: transmission.id
        }
      });
      try {
        const shouldPersist = !["invalid_frame", "rate_exceeded"].includes(reason);
        const message = shouldPersist ? await persistTransmission(store, transmission) : null;
        if (message) {
          const historyRoom = `conversation:${channelId}`;
          const historyRoomDiagnostics = getLocalRoomDiagnostics(historyRoom);
          io.to(historyRoom).emit("radio:message:new", { channelId, message });
          logger.info({
            action: "PersistTransmission",
            module: "Radio",
            status: "success",
            organizationId: transmission.organizationId,
            userId: transmission.userId,
            metadata: {
              channelId,
              conversationId: message.conversationId,
              historyRoom,
              historyRoomDiagnostics,
              messageId: message.id,
              transmissionId: transmission.id
            }
          });
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

    socket.on("chat:typing", async ({ conversationId } = {}) => {
      const authenticatedUser = socket.data.user;
      if (
        !conversationId ||
        !(await canUseOperations(socket)) ||
        !(await store.canUserAccessConversation?.(authenticatedUser.id, conversationId)) ||
        !socket.rooms.has(`conversation:${conversationId}`)
      ) return;
      socket.to(`conversation:${conversationId}`).emit("chat:typing", {
        conversationId,
        userId: authenticatedUser.id,
        userName: authenticatedUser.name
      });
    });

    socket.on("chat:typing:stop", async ({ conversationId } = {}) => {
      const authenticatedUser = socket.data.user;
      if (
        !conversationId ||
        !(await canUseOperations(socket)) ||
        !(await store.canUserAccessConversation?.(authenticatedUser.id, conversationId)) ||
        !socket.rooms.has(`conversation:${conversationId}`)
      ) return;
      socket.to(`conversation:${conversationId}`).emit("chat:typing:stop", {
        conversationId,
        userId: authenticatedUser.id
      });
    });

    socket.on("chat:delivered", async ({ conversationId, messageId } = {}, ack) => {
      const userId = socket.data.user?.id;
      if (!conversationId || !messageId || !userId) {
        acknowledge(ack, { ok: false, error: "unauthorized_or_invalid_payload" });
        return;
      }
      const message = await store.markConversationMessageDelivered?.(conversationId, messageId, userId);
      if (!message) {
        acknowledge(ack, { ok: false, error: "message_not_found" });
        return;
      }
      io.to(`conversation:${conversationId}`).emit("chat:delivered", { conversationId, messageId, userId });
      acknowledge(ack, { ok: true });
    });

    socket.on("chat:read", async ({ conversationId, messageId } = {}, ack) => {
      const userId = socket.data.user?.id;
      if (!conversationId || !messageId || !userId) {
        acknowledge(ack, { ok: false, error: "unauthorized_or_invalid_payload" });
        return;
      }
      const message = await store.markConversationMessageRead?.(conversationId, messageId, userId);
      if (!message) {
        acknowledge(ack, { ok: false, error: "message_not_found" });
        return;
      }
      io.to(`conversation:${conversationId}`).emit("chat:read", { conversationId, messageId, userId });
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

      const { buildGpsFreshness, normalizeTrackingTime } = require("../services/tracking-time");
      const temporal = normalizeTrackingTime(timestamp);
      logger.info({ module: "Tracking", action: "location.temporal_decision",
        userId: authenticatedUser.id, organizationId: getOrganizationId(authenticatedUser),
        status: temporal.discardReason ? "normalized" : "accepted",
        metadata: { vehicleId, packetId: String(packetId || ""), origin: "socket", ...temporal } });
      const update = await store.updateVehicleLocation({
        vehicleId,
        coordinates: { latitude, longitude },
        heading: Number.isFinite(Number(heading)) ? Number(heading) : undefined,
        timestamp: temporal.processedTimestamp,
        temporal,
        speed: Number.isFinite(Number(speed)) ? Number(speed) : 0
      });

      if (update) {
        const publicUpdate = { ...update, gpsFreshness: buildGpsFreshness(update.locationTimestamp) };
        acknowledge(ack, {
          ok: true,
          packetId: String(packetId || ""),
          serverTime: new Date().toISOString(),
          trackingDecision: temporal,
          vehicleId
        });
        incrementMetric("gps_updates_total", 1, { transport: "socket" });
        observeSocketEvent(socket, "location:update", startedAt, "success", { vehicleId });
        const organizationId = String(vehicle.organizationId || "").trim();

        if (organizationId) {
          getRolesWithPermission("canViewAnalytics").forEach((role) => {
            io.to(`org:${organizationId}:role:${role}`).emit("location:updated", publicUpdate);
          });
          if (vehicle.driverId) io.to(`user:${vehicle.driverId}`).emit("location:updated", publicUpdate);
          io.to("platform:admin").emit("location:updated", publicUpdate);
          await emitOperationalUnitUpdate({
            io,
            store,
            vehicle: update,
            organizationId,
            getRolesWithPermission
          });
          return;
        }

        io.to("platform:admin").emit("location:updated", publicUpdate);
        await emitOperationalUnitUpdate({ io, store, vehicle: update, organizationId, getRolesWithPermission });
      }
    });

    socket.on("rtc:join", async ({ roomId }, ack) => {
      const startedAt = Date.now();
      const authenticatedUser = socket.data.user;
      const safeRoomId = String(roomId || "").trim();
      const organizationId = getOrganizationId(authenticatedUser);

      if (
        !safeRoomId ||
        !organizationId ||
        !(await canUseOperations(socket)) ||
        !(await store.canUserAccessConversation?.(authenticatedUser.id, safeRoomId)) ||
        !isRtcRoomCompatible(safeRoomId, organizationId)
      ) {
        observeSocketEvent(socket, "rtc:join", startedAt, "forbidden", { roomId: safeRoomId });
        acknowledge(ack, { ok: false, reason: "forbidden" });
        return;
      }

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
      acknowledge(ack, { ok: true });
    });

    socket.on("rtc:leave", ({ roomId }) => {
      const startedAt = Date.now();
      void leaveRtcRoom(socket, String(roomId || "").trim());
      observeSocketEvent(socket, "rtc:leave", startedAt, "success", { roomId: String(roomId || "").trim() });
    });

    ["rtc:offer", "rtc:answer", "rtc:ice-candidate"].forEach((eventName) => {
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

    socket.on("disconnect", async () => {
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
      const disconnectedUserId = socket.data.user?.id;
      const disconnectedOrganizationId = getOrganizationId(socket.data.user);
      if (socket.data.presenceJoined && disconnectedOrganizationId && disconnectedUserId) {
        await emitPresenceStatus(socket, "offline");
      }
      const joinedRtcRoomIds = Array.from(rtcRooms.keys()).filter((roomId) =>
        isSocketInRtcRoom(socket, roomId)
      );
      if (joinedRtcRoomIds.length) {
        const disconnectTimer = setTimeout(() => {
        rtcDisconnectTimers.delete(socket.id);
        joinedRtcRoomIds.forEach((roomId) => {
          void leaveRtcRoom(socket, roomId);
        });
        }, 15000);
        rtcDisconnectTimers.set(socket.id, disconnectTimer);
      }
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
