const crypto = require("crypto");
const mongoose = require("mongoose");
const { PlatformUserModel } = require("../../data/models");
const { PLATFORM_ROLES } = require("../../config/platform-roles");
const { sanitizeEnum, sanitizeText } = require("../../utils/platform-filters");
const { parsePagination, buildPaginationMeta } = require("../../utils/platform-pagination");
const {
  PlatformNotFoundError,
  PlatformValidationError,
  PlatformForbiddenError,
  PlatformConflictError
} = require("../../utils/platform-errors");
const {
  listPlatformSessions,
  getPlatformSessionById,
  revokePlatformSession,
  revokeAllPlatformSessions
} = require("../../services/platform-sessions");

const USER_STATUSES = ["active", "suspended", "disabled"];
const USER_SORTS = ["createdAt", "updatedAt", "name", "email", "lastLoginAt"];
const SESSION_SORTS = ["createdAt", "lastSeenAt", "expiresAt"];
const ACTION_PROCESSING_TIMEOUT_MS = 5 * 60 * 1000;
const ACTION_TYPES = [
  "platform.user.suspend",
  "platform.user.reactivate",
  "platform.user.role.change",
  "platform.session.revoke",
  "platform.sessions.revoke_all"
];

const actionMemory = new Map();
const actionSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    actorId: { type: String, required: true, index: true },
    idempotencyKeyHash: { type: String, required: true },
    requestFingerprint: { type: String, required: true },
    action: { type: String, required: true, index: true },
    targetType: { type: String, required: true },
    targetId: { type: String, required: true, index: true },
    reason: { type: String, required: true },
    status: { type: String, required: true, index: true },
    safeResponse: { type: mongoose.Schema.Types.Mixed, default: null },
    processingStartedAt: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
    failedAt: { type: Date, default: null }
  },
  { collection: "platform_actions", versionKey: false }
);
actionSchema.index({ actorId: 1, idempotencyKeyHash: 1 }, { unique: true });
const PlatformActionModel = mongoose.models.PlatformAction || mongoose.model("PlatformAction", actionSchema);

function iso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeIdentifier(value, label = "Identificador") {
  const normalized = sanitizeText(value, 128);
  if (!normalized || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(normalized)) {
    throw new PlatformValidationError(`${label} inválido`);
  }
  return normalized;
}

function serializePlatformUser(user) {
  if (!user) return null;
  const source = typeof user.toObject === "function" ? user.toObject() : user;
  return {
    id: source._id || source.id,
    name: source.name || "",
    email: source.email || "",
    role: source.role,
    status: source.status || "active",
    createdAt: iso(source.createdAt),
    updatedAt: iso(source.updatedAt),
    lastLoginAt: iso(source.lastLoginAt),
    passwordChangedAt: iso(source.passwordChangedAt),
    lockedUntil: iso(source.lockedUntil),
    createdBy: source.createdBy || null,
    suspendedAt: iso(source.suspendedAt),
    suspendedReason: source.suspendedReason || "",
    mfaEnabled: Boolean(source.mfaEnabled),
    mfaEnrollmentRequired: Boolean(source.mfaEnrollmentRequired),
    mfaSetupCompletedAt: iso(source.mfaSetupCompletedAt)
  };
}

function serializeGovernanceSession(session, usersById = new Map()) {
  const user = usersById.get(session.userId);
  return {
    id: session.id || session._id,
    userId: session.userId,
    user: user ? { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status } : null,
    platform: session.platform || "unknown",
    deviceName: session.deviceName || "Sesión",
    createdAt: iso(session.createdAt),
    lastSeenAt: iso(session.lastSeenAt),
    expiresAt: iso(session.expiresAt),
    revokedAt: iso(session.revokedAt),
    revokedReason: session.revokedReason || "",
    isActive: Boolean(session.isActive && !session.revokedAt && (!session.expiresAt || new Date(session.expiresAt).getTime() > Date.now())),
    mfaVerified: Boolean(session.mfaVerified),
    current: Boolean(session.current)
  };
}

async function loadPlatformUsers(store) {
  if (mongoose.connection.readyState === 1) {
    return PlatformUserModel.find({}).lean();
  }
  if (typeof store.listPlatformUsers === "function") {
    return Promise.resolve(store.listPlatformUsers());
  }
  return [];
}

function filterUsers(users, query) {
  const search = sanitizeText(query.search || query.q, 100).toLowerCase();
  const role = sanitizeEnum(query.role, PLATFORM_ROLES);
  const status = sanitizeEnum(query.status, USER_STATUSES);
  return users.filter((user) => {
    if (search) {
      const haystack = [user.name, user.email, user.role, user.status].filter(Boolean).join(" ").toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    if (role && user.role !== role) return false;
    if (status && user.status !== status) return false;
    return true;
  });
}

function sortUsers(users, { sort, order }) {
  const direction = order === "asc" ? 1 : -1;
  return [...users].sort((left, right) => {
    if (sort === "name" || sort === "email") {
      return String(left[sort] || "").localeCompare(String(right[sort] || ""), "es", { sensitivity: "base" }) * direction;
    }
    return (new Date(left[sort] || 0).getTime() - new Date(right[sort] || 0).getTime()) * direction;
  });
}

async function listGovernanceUsers(store, query = {}) {
  const pagination = parsePagination(query, USER_SORTS);
  const users = (await loadPlatformUsers(store)).map(serializePlatformUser);
  const filtered = filterUsers(users, query);
  const sorted = sortUsers(filtered, pagination);
  return {
    items: sorted.slice(pagination.skip, pagination.skip + pagination.limit),
    pagination: buildPaginationMeta(filtered.length, pagination.page, pagination.limit),
    filters: {
      search: sanitizeText(query.search || query.q, 100),
      role: sanitizeEnum(query.role, PLATFORM_ROLES),
      status: sanitizeEnum(query.status, USER_STATUSES),
      sort: pagination.sort,
      order: pagination.order
    }
  };
}

async function createGovernanceUser(store, actorId, payload = {}) {
  const name = sanitizeText(payload.name, 120);
  const email = sanitizeText(payload.email, 254).toLowerCase();
  const password = String(payload.password || "");
  const role = sanitizeEnum(payload.role, PLATFORM_ROLES);
  if (!name || !email || !/^\S+@\S+\.\S+$/.test(email) || !role) {
    throw new PlatformValidationError("Nombre, correo y rol válidos son obligatorios");
  }
  if (password.length < 12) {
    throw new PlatformValidationError("La contraseña temporal debe tener al menos 12 caracteres");
  }
  const existing = await Promise.resolve(store.getPlatformUserByEmail(email));
  if (existing) throw new PlatformConflictError("El correo ya existe");
  const created = await Promise.resolve(store.createPlatformUser({
    name,
    email,
    password,
    role,
    status: "active",
    createdBy: actorId,
    mfaEnrollmentRequired: true
  }));
  return serializePlatformUser(created);
}

async function getGovernanceUser(store, userId) {
  const id = normalizeIdentifier(userId, "Usuario");
  const user = await Promise.resolve(store.getPlatformUserById(id));
  if (!user) throw new PlatformNotFoundError("Usuario Platform no encontrado");
  return user;
}

async function listGovernanceSessions(store, query = {}, currentSessionId = null) {
  const pagination = parsePagination(query, SESSION_SORTS);
  const users = (await loadPlatformUsers(store)).map(serializePlatformUser);
  const usersById = new Map(users.map((user) => [user.id, user]));
  const userId = sanitizeText(query.userId, 128);
  const activeOnly = String(query.activeOnly || "").toLowerCase() === "true";
  const sessions = await listPlatformSessions({ userId, activeOnly, limit: 500, currentSessionId });
  const direction = pagination.order === "asc" ? 1 : -1;
  const sorted = sessions.sort((left, right) => (
    new Date(left[pagination.sort] || 0).getTime() - new Date(right[pagination.sort] || 0).getTime()
  ) * direction);
  const serialized = sorted.map((session) => serializeGovernanceSession(session, usersById));
  return {
    items: serialized.slice(pagination.skip, pagination.skip + pagination.limit),
    pagination: buildPaginationMeta(serialized.length, pagination.page, pagination.limit),
    filters: { userId: userId || null, activeOnly, sort: pagination.sort, order: pagination.order }
  };
}

function canonicalFingerprint(payload) {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function hashIdempotencyKey(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function validateActionRequest(actorId, idempotencyKey, payload) {
  const action = sanitizeEnum(payload.action, ACTION_TYPES);
  const targetId = normalizeIdentifier(payload.targetId, "Objetivo");
  const reason = sanitizeText(payload.reason, 500);
  const confirmation = sanitizeText(payload.confirmation, 180);
  if (!action) throw new PlatformValidationError("Acción no permitida");
  if (reason.length < 10) throw new PlatformValidationError("La razón debe tener al menos 10 caracteres");
  if (confirmation !== `CONFIRM ${action}`) {
    throw new PlatformValidationError(`La confirmación debe ser: CONFIRM ${action}`);
  }
  const normalizedKey = sanitizeText(idempotencyKey, 200);
  if (!normalizedKey || normalizedKey.length < 16) {
    throw new PlatformValidationError("Idempotency-Key de al menos 16 caracteres es obligatorio");
  }
  const nextRole = action === "platform.user.role.change"
    ? sanitizeEnum(payload.nextRole, PLATFORM_ROLES)
    : null;
  if (action === "platform.user.role.change" && !nextRole) {
    throw new PlatformValidationError("nextRole no es válido");
  }
  return {
    actorId,
    action,
    targetId,
    reason,
    nextRole,
    idempotencyKeyHash: hashIdempotencyKey(normalizedKey),
    requestFingerprint: canonicalFingerprint({ actorId, action, targetId, reason, nextRole })
  };
}

function isActionProcessingStale(record, now = Date.now()) {
  if (record?.status !== "processing") return false;
  const startedAt = new Date(record.processingStartedAt || record.createdAt || 0).getTime();
  return Number.isFinite(startedAt) && startedAt > 0 && startedAt <= now - ACTION_PROCESSING_TIMEOUT_MS;
}

function getActionClaimDisposition(record, requestFingerprint, now = Date.now()) {
  if (!record) return "missing";
  if (record.requestFingerprint !== requestFingerprint) return "conflict";
  if (record.status === "completed" && record.safeResponse) return "replay";
  if (record.status === "failed" || isActionProcessingStale(record, now)) return "reclaim";
  return "processing";
}

async function reclaimMongoAction(existing, request) {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - ACTION_PROCESSING_TIMEOUT_MS);
  const statusCondition = existing.status === "failed"
    ? { status: "failed" }
    : {
        status: "processing",
        $or: [
          { processingStartedAt: { $lte: staleBefore } },
          { processingStartedAt: null, createdAt: { $lte: staleBefore } }
        ]
      };

  return PlatformActionModel.findOneAndUpdate(
    {
      _id: existing._id,
      actorId: request.actorId,
      idempotencyKeyHash: request.idempotencyKeyHash,
      requestFingerprint: request.requestFingerprint,
      ...statusCondition
    },
    {
      $set: {
        status: "processing",
        processingStartedAt: now,
        safeResponse: null,
        completedAt: null,
        failedAt: null
      }
    },
    { returnDocument: "after" }
  ).lean();
}

async function claimAction(request) {
  const memoryKey = `${request.actorId}:${request.idempotencyKeyHash}`;
  if (mongoose.connection.readyState !== 1) {
    const existing = actionMemory.get(memoryKey);
    if (existing) {
      const disposition = getActionClaimDisposition(existing, request.requestFingerprint);
      if (disposition === "conflict") {
        throw new PlatformConflictError("La clave de idempotencia ya fue usada para otra solicitud");
      }
      if (disposition === "reclaim") {
        existing.status = "processing";
        existing.processingStartedAt = new Date();
        existing.safeResponse = null;
        existing.completedAt = null;
        existing.failedAt = null;
        actionMemory.set(memoryKey, existing);
        return { claimed: true, record: existing, memoryKey };
      }
      return { claimed: false, record: existing };
    }
    const record = {
      _id: crypto.randomUUID(),
      ...request,
      targetType: request.action.startsWith("platform.user") ? "platform_user" : "platform_session",
      status: "processing",
      safeResponse: null,
      processingStartedAt: new Date(),
      createdAt: new Date(),
      completedAt: null,
      failedAt: null
    };
    actionMemory.set(memoryKey, record);
    return { claimed: true, record, memoryKey };
  }

  try {
    const record = await PlatformActionModel.create({
      _id: crypto.randomUUID(),
      ...request,
      targetType: request.action.startsWith("platform.user") ? "platform_user" : "platform_session",
      status: "processing",
      processingStartedAt: new Date()
    });
    return { claimed: true, record: record.toObject() };
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const existing = await PlatformActionModel.findOne({
      actorId: request.actorId,
      idempotencyKeyHash: request.idempotencyKeyHash
    }).lean();
    if (!existing) throw error;

    const disposition = getActionClaimDisposition(existing, request.requestFingerprint);
    if (disposition === "conflict") {
      throw new PlatformConflictError("La clave de idempotencia ya fue usada para otra solicitud");
    }
    if (disposition === "reclaim") {
      const reclaimed = await reclaimMongoAction(existing, request);
      if (reclaimed) return { claimed: true, record: reclaimed };
    }

    const latest = await PlatformActionModel.findById(existing._id).lean();
    return { claimed: false, record: latest || existing };
  }
}

async function completeAction(claim, safeResponse) {
  if (mongoose.connection.readyState !== 1) {
    claim.record.status = "completed";
    claim.record.safeResponse = safeResponse;
    claim.record.completedAt = new Date();
    actionMemory.set(claim.memoryKey, claim.record);
    return;
  }
  await PlatformActionModel.updateOne(
    { _id: claim.record._id, status: "processing" },
    { $set: { status: "completed", safeResponse, completedAt: new Date() } }
  );
}

async function failAction(claim) {
  if (mongoose.connection.readyState !== 1) {
    if (claim.memoryKey) actionMemory.delete(claim.memoryKey);
    return;
  }
  await PlatformActionModel.updateOne(
    { _id: claim.record._id, status: "processing" },
    { $set: { status: "failed", failedAt: new Date() } }
  );
}

async function activeOwnerCount(store) {
  const users = await loadPlatformUsers(store);
  return users.filter((user) => user.role === "platform_owner" && user.status === "active").length;
}

async function executeClaimedAction(store, actor, request, currentSessionId) {
  if (request.action.startsWith("platform.user")) {
    const target = await getGovernanceUser(store, request.targetId);
    if (target._id === actor.id && request.action !== "platform.user.reactivate") {
      throw new PlatformForbiddenError("No puedes modificar tu propia cuenta con esta acción");
    }
    if (target.role === "platform_owner" && target.status === "active") {
      const removesOwner = request.action === "platform.user.suspend"
        || (request.action === "platform.user.role.change" && request.nextRole !== "platform_owner");
      if (removesOwner && await activeOwnerCount(store) <= 1) {
        throw new PlatformConflictError("No puedes remover al último platform_owner activo");
      }
    }

    if (request.action === "platform.user.suspend") {
      const updated = await Promise.resolve(store.updatePlatformUser(target._id, {
        status: "suspended",
        suspendedAt: new Date(),
        suspendedReason: request.reason,
        updatedAt: new Date()
      }));
      const revokedCount = await revokeAllPlatformSessions(target._id, null, "platform_user_suspended");
      return { action: request.action, target: serializePlatformUser(updated), revokedCount };
    }
    if (request.action === "platform.user.reactivate") {
      const updated = await Promise.resolve(store.updatePlatformUser(target._id, {
        status: "active",
        suspendedAt: null,
        suspendedReason: "",
        failedLoginAttempts: 0,
        lockedUntil: null,
        updatedAt: new Date()
      }));
      return { action: request.action, target: serializePlatformUser(updated), revokedCount: 0 };
    }
    if (request.action === "platform.user.role.change") {
      const updated = await Promise.resolve(store.updatePlatformUser(target._id, {
        role: request.nextRole,
        mfaEnrollmentRequired: true,
        updatedAt: new Date()
      }));
      const revokedCount = await revokeAllPlatformSessions(target._id, null, "platform_role_changed");
      return { action: request.action, target: serializePlatformUser(updated), revokedCount };
    }
  }

  if (request.action === "platform.session.revoke") {
    const session = await getPlatformSessionById(request.targetId);
    if (!session) throw new PlatformNotFoundError("Sesión Platform no encontrada");
    if ((session._id || session.id) === currentSessionId) {
      throw new PlatformForbiddenError("Usa cerrar sesión para revocar la sesión actual");
    }
    const revoked = await revokePlatformSession(session.userId, session._id || session.id, request.reason);
    return { action: request.action, target: serializeGovernanceSession(revoked), revokedCount: revoked ? 1 : 0 };
  }

  if (request.action === "platform.sessions.revoke_all") {
    const target = await getGovernanceUser(store, request.targetId);
    const except = target._id === actor.id ? currentSessionId : null;
    const revokedCount = await revokeAllPlatformSessions(target._id, except, request.reason);
    return { action: request.action, target: serializePlatformUser(target), revokedCount };
  }

  throw new PlatformValidationError("Acción no implementada");
}

async function executeGovernanceAction(store, actor, idempotencyKey, payload, currentSessionId) {
  const request = validateActionRequest(actor.id, idempotencyKey, payload || {});
  const claim = await claimAction(request);
  if (!claim.claimed) {
    if (claim.record.status === "completed" && claim.record.safeResponse) {
      return { ...claim.record.safeResponse, replayed: true };
    }
    throw new PlatformConflictError("La acción equivalente todavía está en proceso");
  }

  try {
    const result = await executeClaimedAction(store, actor, request, currentSessionId);
    const safeResponse = { id: claim.record._id, ...result, replayed: false };
    await completeAction(claim, safeResponse);
    return safeResponse;
  } catch (error) {
    await failAction(claim);
    throw error;
  }
}

module.exports = {
  ACTION_PROCESSING_TIMEOUT_MS,
  ACTION_TYPES,
  USER_STATUSES,
  serializePlatformUser,
  serializeGovernanceSession,
  listGovernanceUsers,
  createGovernanceUser,
  listGovernanceSessions,
  validateActionRequest,
  isActionProcessingStale,
  getActionClaimDisposition,
  executeGovernanceAction
};
