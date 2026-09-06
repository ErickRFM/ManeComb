const bcrypt = require("bcryptjs");
const { isLearnedRouteReadyForReview, learnedRouteConfidence } = require("../domain/learned-route-evidence");
const { createHash, randomBytes, randomUUID } = require("crypto");
const {
  getCommercialPlanById,
  getCommercialPlanPricing
} = require("../config/commercial-plans");
const { createSeedState } = require("./seedData");
const { decryptChatPayload, encryptChatPayload } = require("../utils/chat-crypto");
const { validatePasswordStrength } = require("../utils/password-policy");
const { isServiceDate, toServiceDate } = require("../utils/service-date");
const {
  ActivationKeyModel,
  AppEventModel,
  AutoRouteProcessingModel,
  ChatAttachmentModel,
  ChatMessageModel,
  CheckpointVisitModel,
  CheckoutIdempotencyModel,
  ChargebackModel,
  CommercialLeadModel,
  ConversationModel,
  DocumentModel,
  IncidentModel,
  LearnedRouteCandidateModel,
  NotificationModel,
  PlatformUserModel,
  RtcSessionModel,
  RouteEventModel,
  RouteModel,
  RouteSessionModel,
  RouteSessionPositionModel,
  SessionModel,
  RefundOperationModel,
  TripLogModel,
  TrialEntitlementModel,
  UserModel,
  VehicleModel,
  VehicleRouteAssignmentModel
} = require("./models");
const { AttachmentRepository } = require("./repositories/attachment-repository");
const { ChatMessageRepository } = require("./repositories/chat-message-repository");
const { ConversationRepository } = require("./repositories/conversation-repository");
const { buildBackendStore } = require("./backend-store");
const { normalizeOperationalSchedule } = require("../utils/operational-schedule");
const { calculateVehicleRouteProgress } = require("../services/route-progress");
const { hasRouteOperationalChange, nextRouteRevision } = require("../domain/route-revision");
const {
  STATUS: ASSIGNMENT_STATUS,
  validateAssignmentInput,
  serializeVehicleRouteAssignment
} = require("../domain/vehicle-route-assignment");
const { activateVehicleRouteAssignmentMongo } = require("./mongo-activation");
const {
  getClearedVehicleRouteFields,
  hasActiveAssignedRoute,
  normalizeRouteId,
  serializeVehicle
} = require("./serializers");

async function updateMongoPasswordWithResetToken({
  userModel,
  tokenHash,
  passwordHash,
  passwordChangedAt = new Date()
}) {
  const query = userModel.findOneAndUpdate(
    {
      resetTokenHash: tokenHash,
      resetTokenExpiresAt: { $gt: passwordChangedAt }
    },
    {
      $set: {
        passwordHash,
        passwordChangedAt
      },
      $inc: { credentialVersion: 1 },
      $unset: { resetTokenHash: "", resetToken: "", resetTokenExpiresAt: "" }
    },
    { returnDocument: "after" }
  );

  return typeof query?.lean === "function" ? query.lean() : query;
}

function buildAvatar(name) {
  return String(name)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((chunk) => chunk[0]?.toUpperCase() || "")
    .join("");
}

function normalizeRole(role) {
  return [
    "owner",
    "admin",
    "dispatcher",
    "supervisor",
    "billing_manager",
    "support",
    "viewer",
    "driver"
  ].includes(role) ? role : "driver";
}

function normalizeAccountType(accountType, role = "driver") {
  if (String(accountType || "").trim() === "company_owner") {
    return "company_owner";
  }

  return role === "supervisor" && String(accountType || "").trim() === "customer"
    ? "company_owner"
    : "operations";
}

function normalizeUserStatus(value) {
  return ["active", "pending", "suspended"].includes(String(value || "").trim())
    ? String(value || "").trim()
    : "active";
}

function resolveOrganizationId(payload = {}, fallbackEmail = "") {
  const explicit = String(payload.organizationId || "").trim();

  if (explicit) {
    return slugifyCompanyName(explicit) || explicit;
  }

  const companyName =
    payload.companyProfile?.companyName ||
    payload.companyName ||
    payload.organizationSlug ||
    payload.name ||
    "";
  const fromCompany = slugifyCompanyName(companyName);

  if (fromCompany) {
    return fromCompany;
  }

  const email = String(payload.email || fallbackEmail || "").trim().toLowerCase();
  return slugifyCompanyName(email.split("@")[0] || "cuenta");
}

function getUserOrganizationId(user) {
  if (!user) {
    return "";
  }

  return (
    String(user.organizationId || "").trim() ||
    resolveOrganizationId(
      {
        companyProfile: user.companyProfile,
        companyName: user.companyProfile?.companyName,
        name: user.name,
        email: user.email
      },
      user.email
    )
  );
}

function getOrganizationQuery(user) {
  if (!user) {
    return {};
  }

  const organizationId = getUserOrganizationId(user);
  return organizationId ? { organizationId } : { organizationId: "__missing__" };
}

function normalizeStatus(status, role) {
  if (status && typeof status === "string") {
    return status;
  }

  return "offline";
}

function normalizeShift(shift, role) {
  if (shift && typeof shift === "string") {
    return shift;
  }

  if (role === "admin") {
    return "Centro de control";
  }

  return "Pendiente asignacion";
}

function normalizePaymentMethod(method) {
  return ["card", "spei", "transfer"].includes(String(method || "").trim())
    ? String(method || "").trim()
    : "spei";
}

function slugifyCompanyName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toPlain(doc) {
  if (!doc) {
    return null;
  }

  const plain = typeof doc.toObject === "function" ? doc.toObject({ flattenMaps: true }) : { ...doc };
  const { _id, __v, ...rest } = plain;

  return {
    id: _id,
    ...rest
  };
}

function sanitizeUser(doc) {
  if (!doc) {
    return null;
  }

  const plain = toPlain(doc);
  const { passwordHash, pushSubscriptions, e2eeBackups, ...safeUser } = plain;
  safeUser.accountType = normalizeAccountType(safeUser.accountType, safeUser.role);
  safeUser.organizationId = getUserOrganizationId(safeUser);
  safeUser.userStatus = normalizeUserStatus(safeUser.userStatus);
  safeUser.lastAccessAt = safeUser.lastAccessAt || null;
  safeUser.invitedAt = safeUser.invitedAt || null;
  safeUser.suspendedAt = safeUser.userStatus === "suspended" ? safeUser.suspendedAt || null : null;
  safeUser.operationalSchedule = safeUser.operationalSchedule || null;
  return safeUser;
}

function serializeE2eeBackupEntry(entry, includeCipher = false) {
  if (!entry) {
    return null;
  }

  const plain = typeof entry.toObject === "function" ? entry.toObject() : { ...entry };
  const safeEntry = {
    deviceId: String(plain.deviceId || "").trim(),
    publicKey: String(plain.publicKey || "").trim(),
    backupVersion: String(plain.backupVersion || "secretbox-v1").trim() || "secretbox-v1",
    platform: String(plain.platform || "unknown").trim() || "unknown",
    label: String(plain.label || "").trim(),
    updatedAt: plain.updatedAt || new Date().toISOString(),
    restoredAt: plain.restoredAt || null
  };

  if (includeCipher) {
    safeEntry.backupCipher = String(plain.backupCipher || "").trim();
  }

  return safeEntry;
}

function serializeRoute(doc) {
  return toPlain(doc);
}

function serializeIncident(doc) {
  return toPlain(doc);
}

function serializeDocument(doc) {
  return toPlain(doc);
}

function serializeNotification(doc) {
  return toPlain(doc);
}

function serializeConversation(doc) {
  return toPlain(doc);
}

function serializeTripLog(doc) {
  return toPlain(doc);
}

function serializeCommercialOrder(doc) {
  return toPlain(doc);
}

function normalizeConversationKind(kind, participants = []) {
  if (kind === "group" || kind === "direct") {
    return kind;
  }

  return participants.length > 2 ? "group" : "direct";
}

function normalizeConversationChannelMode(channelMode) {
  return channelMode === "radio" ? "radio" : "chat";
}

function getStoredMessagePayload(message) {
  if (message?.payloadEncrypted) {
    return decryptChatPayload(message.payloadEncrypted);
  }

  return null;
}

function serializeChatMessageEntry(message, conversationId, userMap = null) {
  if (!message) {
    return null;
  }

  const plainMessage =
    typeof message.toObject === "function" ? message.toObject() : { ...message };
  const decryptedPayload = getStoredMessagePayload(plainMessage) || {};
  const kind = ["audio", "image", "video"].includes(plainMessage.kind)
    ? plainMessage.kind
    : "text";
  const e2eeEnvelope =
    decryptedPayload.e2eeEnvelope && typeof decryptedPayload.e2eeEnvelope === "object"
      ? decryptedPayload.e2eeEnvelope
      : null;
  const text =
    typeof decryptedPayload.text === "string"
      ? decryptedPayload.text
      : typeof plainMessage.text === "string"
        ? plainMessage.text
        : "";
  const transcript =
    typeof decryptedPayload.transcript === "string"
      ? decryptedPayload.transcript
      : typeof plainMessage.transcript === "string"
        ? plainMessage.transcript
        : "";
  const textPreview =
    typeof plainMessage.textPreview === "string" && plainMessage.textPreview.trim()
      ? plainMessage.textPreview.trim()
      : kind === "audio"
        ? transcript
          ? `Audio: ${transcript}`
          : text
            ? `Nota de voz: ${text}`
            : "Nota de voz"
        : e2eeEnvelope
          ? "Mensaje cifrado de extremo a extremo"
          : text;

  return {
    id: plainMessage.id || plainMessage._id,
    senderId: plainMessage.senderId,
    conversationId,
    kind,
    text,
    textPreview,
    audioUrl:
      typeof decryptedPayload.audioUrl === "string"
        ? decryptedPayload.audioUrl
        : typeof plainMessage.audioUrl === "string"
          ? plainMessage.audioUrl
          : null,
    imageUrl:
      typeof decryptedPayload.imageUrl === "string"
        ? decryptedPayload.imageUrl
        : typeof plainMessage.imageUrl === "string"
          ? plainMessage.imageUrl
          : null,
    videoUrl:
      typeof decryptedPayload.videoUrl === "string"
        ? decryptedPayload.videoUrl
        : typeof plainMessage.videoUrl === "string"
          ? plainMessage.videoUrl
          : null,
    transcript,
    durationSeconds: Number(
      decryptedPayload.durationSeconds || plainMessage.durationSeconds || 0
    ),
    mimeType:
      String(decryptedPayload.mimeType || plainMessage.mimeType || "").trim() || "",
    transmissionId: String(plainMessage.transmissionId || "").trim() || null,
    e2eeEnvelope,
    encrypted: Boolean(plainMessage.isEncrypted || plainMessage.payloadEncrypted),
    status: String(plainMessage.status || "sent"),
    createdAt: plainMessage.createdAt,
    sender: userMap?.get(plainMessage.senderId) || null
  };
}

function buildStoredChatMessage(senderId, input) {
  const safeInput =
    typeof input === "string"
      ? {
          text: input,
          kind: "text"
        }
      : input || {};
  const kind = ["audio", "image", "video"].includes(safeInput.kind) ? safeInput.kind : "text";
  const e2eeEnvelope =
    safeInput.e2eeEnvelope && typeof safeInput.e2eeEnvelope === "object"
      ? {
          version: String(safeInput.e2eeEnvelope.version || "x25519-xsalsa20-poly1305"),
          nonce: String(safeInput.e2eeEnvelope.nonce || "").trim(),
          ciphertext: String(safeInput.e2eeEnvelope.ciphertext || "").trim(),
          recipientId: String(safeInput.e2eeEnvelope.recipientId || "").trim(),
          senderPublicKey: String(safeInput.e2eeEnvelope.senderPublicKey || "").trim()
        }
      : null;
  const text = String(safeInput.text || "").trim();
  const transcript = String(safeInput.transcript || "").trim();
  const textPreview = String(safeInput.textPreview || "").trim();
  const payload = {
    text: e2eeEnvelope ? "" : text,
    audioUrl: String(safeInput.audioUrl || "").trim() || null,
    imageUrl: String(safeInput.imageUrl || "").trim() || null,
    videoUrl: String(safeInput.videoUrl || "").trim() || null,
    transcript,
    mimeType: String(safeInput.mimeType || "").trim() || "",
    durationSeconds: Math.max(0, Number(safeInput.durationSeconds) || 0),
    e2eeEnvelope
  };

  return {
    id: String(safeInput.messageId || "").trim() || randomUUID(),
    senderId,
    kind,
    text: kind === "text" && !e2eeEnvelope ? text : "",
    textPreview:
      kind === "audio"
        ? transcript
          ? `Audio: ${transcript}`
          : text
            ? `Nota de voz: ${text}`
            : "Nota de voz"
        : kind === "image"
          ? text || "Imagen"
          : kind === "video"
            ? text || "Video"
            : textPreview || (e2eeEnvelope ? "Mensaje cifrado de extremo a extremo" : text),
    payloadEncrypted: encryptChatPayload(payload),
    isEncrypted: true,
    transcript,
    audioUrl: payload.audioUrl,
    imageUrl: payload.imageUrl,
    videoUrl: payload.videoUrl,
    mimeType: payload.mimeType,
    durationSeconds: payload.durationSeconds,
    transmissionId: String(safeInput.transmissionId || "").trim() || undefined,
    createdAt: new Date()
  };
}

function buildChatMessageDocument(message, conversation) {
  return {
    _id: message.id || message._id || randomUUID(),
    conversationId: conversation._id || conversation.id,
    organizationId: String(conversation.organizationId || "").trim(),
    senderId: message.senderId,
    kind: message.kind || "text",
    text: message.text || "",
    textPreview: message.textPreview || "",
    payloadEncrypted: message.payloadEncrypted || "",
    isEncrypted: Boolean(message.isEncrypted || message.payloadEncrypted),
    transcript: message.transcript || "",
    audioUrl: message.audioUrl || null,
    imageUrl: message.imageUrl || null,
    videoUrl: message.videoUrl || null,
    mimeType: message.mimeType || "",
    durationSeconds: Number(message.durationSeconds || 0),
    transmissionId: message.transmissionId || undefined,
    status: message.status || "sent",
    createdAt: message.createdAt || new Date()
  };
}

function buildConversationSummary(conversation, currentUserId, userMap) {
  const plain = serializeConversation(conversation);
  const participants = plain.participants
    .map((participantId) => userMap.get(participantId))
    .filter(Boolean);
  const conversationKind = normalizeConversationKind(plain.kind, plain.participants);
  const directCounterpart =
    conversationKind === "direct"
      ? participants.find((participant) => participant.id !== currentUserId) || participants[0]
      : null;
  const lastMessage = plain.lastMessage || plain.messages[plain.messages.length - 1];

  return {
    id: plain.id,
    title: directCounterpart?.name || plain.title,
    kind: conversationKind,
    channelMode: normalizeConversationChannelMode(plain.channelMode),
    description: String(plain.description || "").trim(),
    encrypted: plain.encrypted !== false,
    participants,
    lastMessage: serializeChatMessageEntry(lastMessage, plain.id, userMap),
    unreadCount: Number(toUnreadByObject(plain.unreadBy)[currentUserId] || 0)
  };
}

function sortConversationsByActivity(conversations) {
  return [...conversations].sort((left, right) => {
    const leftDate = left.lastMessage?.createdAt ? new Date(left.lastMessage.createdAt).getTime() : 0;
    const rightDate = right.lastMessage?.createdAt ? new Date(right.lastMessage.createdAt).getTime() : 0;

    if (leftDate !== rightDate) {
      return rightDate - leftDate;
    }

    if (left.channelMode !== right.channelMode) {
      return left.channelMode === "chat" ? -1 : 1;
    }

    if (left.kind !== right.kind) {
      return left.kind === "group" ? -1 : 1;
    }

    return left.title.localeCompare(right.title, "es-MX");
  });
}

function toUnreadByObject(unreadBy) {
  if (!unreadBy) {
    return {};
  }

  if (typeof unreadBy.get === "function") {
    return Object.fromEntries(unreadBy.entries());
  }

  if (unreadBy instanceof Map) {
    return Object.fromEntries(unreadBy.entries());
  }

  return { ...unreadBy };
}

function buildAlert(label, tone, meta) {
  return {
    id: randomUUID(),
    label,
    tone,
    ...meta
  };
}

function getDocumentStatus(expiresAt) {
  const safeExpiresAt = new Date(expiresAt);

  if (Number.isNaN(safeExpiresAt.getTime())) {
    return "vigente";
  }

  const remainingTime = safeExpiresAt.getTime() - Date.now();

  if (remainingTime < 0) {
    return "vencido";
  }

  if (remainingTime <= 14 * 24 * 60 * 60 * 1000) {
    return "por_vencer";
  }

  return "vigente";
}

function normalizeReviewStatus(reviewStatus) {
  if (["approved", "rejected", "pending_review"].includes(reviewStatus)) {
    return reviewStatus;
  }

  return "pending_review";
}

async function ensureUniqueEmail(email, ignoreUserId = null) {
  const normalizedEmail = String(email).trim().toLowerCase();
  const existing = await UserModel.findOne({ email: normalizedEmail }).lean();

  if (existing && existing._id !== ignoreUserId) {
    throw new Error("El correo ya existe");
  }

  return normalizedEmail;
}

function buildCompanyProfile(payload, email) {
  const source = payload.companyProfile || {};
  const companyName =
    String(source.companyName || payload.companyName || "").trim();
  const legalName =
    String(source.legalName || payload.legalName || companyName).trim();
  const billingEmail =
    String(source.billingEmail || payload.billingEmail || email || "").trim().toLowerCase();

  return {
    companyName,
    legalName,
    taxId: String(source.taxId || payload.taxId || "").trim().toUpperCase(),
    billingEmail,
    billingAddress: String(source.billingAddress || payload.billingAddress || "").trim()
  };
}

function mergeCompanyProfile(existing, payload, fallbackEmail) {
  const next = {
    companyName: String(existing?.companyName || "").trim(),
    legalName: String(existing?.legalName || "").trim(),
    taxId: String(existing?.taxId || "").trim(),
    billingEmail: String(existing?.billingEmail || fallbackEmail || "").trim().toLowerCase(),
    billingAddress: String(existing?.billingAddress || "").trim()
  };
  const source = payload.companyProfile || {};

  if (typeof payload.companyName === "string" || typeof source.companyName === "string") {
    next.companyName = String(source.companyName || payload.companyName || "").trim();
  }

  if (typeof payload.legalName === "string" || typeof source.legalName === "string") {
    next.legalName = String(source.legalName || payload.legalName || "").trim();
  } else if (!next.legalName && next.companyName) {
    next.legalName = next.companyName;
  }

  if (typeof payload.taxId === "string" || typeof source.taxId === "string") {
    next.taxId = String(source.taxId || payload.taxId || "").trim().toUpperCase();
  }

  if (typeof payload.billingEmail === "string" || typeof source.billingEmail === "string") {
    next.billingEmail = String(source.billingEmail || payload.billingEmail || "").trim().toLowerCase();
  }

  if (
    typeof payload.billingAddress === "string" ||
    typeof source.billingAddress === "string"
  ) {
    next.billingAddress = String(source.billingAddress || payload.billingAddress || "").trim();
  }

  return next;
}

function buildPaymentProfile(payload) {
  const source = payload.paymentProfile || {};

  return {
    preferredMethod: normalizePaymentMethod(source.preferredMethod || payload.preferredMethod),
    cardholderName: String(source.cardholderName || payload.cardholderName || "").trim(),
    cardBrand: String(source.cardBrand || payload.cardBrand || "").trim(),
    cardLast4: String(source.cardLast4 || payload.cardLast4 || "").replace(/[^\d]/g, "").slice(-4),
    cardExpMonth: String(source.cardExpMonth || payload.cardExpMonth || "").replace(/[^\d]/g, "").slice(0, 2),
    cardExpYear: String(source.cardExpYear || payload.cardExpYear || "").replace(/[^\d]/g, "").slice(-2),
    customerReference: String(
      source.customerReference || payload.customerReference || ""
    ).trim()
  };
}

function mergePaymentProfile(existing, payload) {
  const source = payload.paymentProfile || {};
  const pick = (field) => {
    if (Object.prototype.hasOwnProperty.call(source, field)) {
      return source[field];
    }

    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      return payload[field];
    }

    return existing?.[field];
  };
  const next = {
    preferredMethod: normalizePaymentMethod(pick("preferredMethod")),
    cardholderName: String(pick("cardholderName") || "").trim(),
    cardBrand: String(pick("cardBrand") || "").trim(),
    cardLast4: String(pick("cardLast4") || "")
      .replace(/[^\d]/g, "")
      .slice(-4),
    cardExpMonth: String(pick("cardExpMonth") || "")
      .replace(/[^\d]/g, "")
      .slice(0, 2),
    cardExpYear: String(pick("cardExpYear") || "")
      .replace(/[^\d]/g, "")
      .slice(-2),
    customerReference: String(pick("customerReference") || "").trim()
  };

  return next;
}

async function syncDriverVehicleAssignment(userId, nextVehicleId = null) {
  const now = new Date();
  await VehicleModel.updateMany(
    {
      driverId: userId,
      ...(nextVehicleId ? { _id: { $ne: nextVehicleId } } : {}),
      status: "assigned"
    },
    {
      $set: {
        status: "available",
        updatedAt: now
      }
    }
  );
  await VehicleModel.updateMany(
    {
      driverId: userId,
      ...(nextVehicleId ? { _id: { $ne: nextVehicleId } } : {})
    },
    {
      $set: {
        driverId: null,
        updatedAt: now
      }
    }
  );

  if (!nextVehicleId) {
    return;
  }

  const targetVehicle = await VehicleModel.findById(nextVehicleId).lean();

  if (targetVehicle?.driverId && targetVehicle.driverId !== userId) {
    await UserModel.updateOne(
      { _id: targetVehicle.driverId },
      {
        $set: {
          vehicleId: null
        }
      }
    );
  }

  await VehicleModel.updateOne(
    { _id: nextVehicleId },
    {
      $set: {
        driverId: userId,
        status: "assigned",
        updatedAt: now
      }
    }
  );
}

async function ensureMongoSeedData() {
  const removedDemoRouteIds = ["route-1", "route-2", "route-3"];
  await Promise.all([
    RouteModel.deleteMany({ _id: { $in: removedDemoRouteIds } }),
    VehicleModel.updateMany(
      { routeId: { $in: removedDemoRouteIds } },
      { $set: { routeId: null }, $unset: { assignedRoute: "" } }
    ),
    IncidentModel.updateMany(
      { routeId: { $in: removedDemoRouteIds } },
      { $set: { routeId: null } }
    )
  ]);

  const counts = await Promise.all([
    UserModel.countDocuments(),
    RouteModel.countDocuments(),
    VehicleModel.countDocuments(),
    IncidentModel.countDocuments(),
    ConversationModel.countDocuments(),
    DocumentModel.countDocuments(),
    NotificationModel.countDocuments(),
    TripLogModel.countDocuments(),
    CommercialLeadModel.countDocuments()
  ]);

  if (counts.slice(0, 8).every((count) => count > 0)) {
    return;
  }

  const seed = createSeedState();

  if (counts[0] === 0) {
    await UserModel.insertMany(
      seed.users.map((user) => ({
        _id: user.id,
        ...user,
        avatarUrl: user.avatarUrl || null
      })),
      { ordered: false }
    );
  }

  if (counts[1] === 0 && seed.routes.length > 0) {
    await RouteModel.insertMany(
      seed.routes.map((route) => ({
        _id: route.id,
        ...route
      })),
      { ordered: false }
    );
  }

  if (counts[2] === 0) {
    await VehicleModel.insertMany(
      seed.vehicles.map((vehicle) => ({
        _id: vehicle.id,
        ...vehicle
      })),
      { ordered: false }
    );
  }

  if (counts[3] === 0) {
    await IncidentModel.insertMany(
      seed.incidents.map((incident) => ({
        _id: incident.id,
        ...incident
      })),
      { ordered: false }
    );
  }

  if (counts[4] === 0) {
    await ConversationModel.insertMany(
      seed.conversations.map((conversation) => {
        const lastMessage = conversation.messages[conversation.messages.length - 1] || null;

        return {
          _id: conversation.id,
          organizationId: conversation.organizationId,
          title: conversation.title,
          kind: normalizeConversationKind(conversation.kind, conversation.participants),
          channelMode: normalizeConversationChannelMode(conversation.channelMode),
          description: conversation.description || "",
          encrypted: conversation.encrypted !== false,
          participants: conversation.participants,
          unreadBy: conversation.unreadBy,
          lastMessage,
          lastActivityAt: lastMessage?.createdAt || null,
          messageCount: conversation.messages.length,
          messages: []
        };
      }),
      { ordered: false }
    );
    await ChatMessageModel.insertMany(
      seed.conversations.flatMap((conversation) =>
        conversation.messages.map((message) =>
          buildChatMessageDocument(message, {
            _id: conversation.id,
            organizationId: conversation.organizationId
          })
        )
      ),
      { ordered: false }
    );
  }

  if (counts[5] === 0) {
    await DocumentModel.insertMany(
      seed.documents.map((document) => ({
        _id: document.id,
        ...document
      })),
      { ordered: false }
    );
  }

  if (counts[6] === 0) {
    await NotificationModel.insertMany(
      seed.notifications.map((notification) => ({
        _id: notification.id,
        ...notification
      })),
      { ordered: false }
    );
  }

  if (counts[7] === 0) {
    await TripLogModel.insertMany(
      seed.tripLogs.map((tripLog) => ({
        _id: tripLog.id,
        ...tripLog
      })),
      { ordered: false }
    );
  }

  if (counts[0] === 0 && counts[8] === 0) {
    await CommercialLeadModel.insertMany(
      seed.commercialOrders.map((order) => ({
        _id: order.id,
        ...order
      })),
      { ordered: false }
    );
  }
}

async function createMongoStore() {
  await ensureMongoSeedData();
  const attachmentRepository = new AttachmentRepository(ChatAttachmentModel);
  const messageRepository = new ChatMessageRepository(ChatMessageModel);
  const conversationRepository = new ConversationRepository(ConversationModel);

  async function migrateEmbeddedMessagesToCollection(conversation) {
    const plainConversation =
      typeof conversation?.toObject === "function" ? conversation.toObject() : conversation;
    const embeddedMessages = Array.isArray(plainConversation?.messages)
      ? plainConversation.messages
      : [];

    if (!plainConversation?._id || !embeddedMessages.length) {
      return;
    }

    const documents = embeddedMessages.map((message) =>
      buildChatMessageDocument(message, plainConversation)
    );

    await messageRepository.upsertMany(documents);
    const [storedCount, latestMessage] = await Promise.all([
      messageRepository.countByConversation(plainConversation._id),
      ChatMessageModel.findOne({ conversationId: plainConversation._id })
        .sort({ createdAt: -1, _id: -1 })
        .lean()
    ]);

    await ConversationModel.updateOne(
      { _id: plainConversation._id },
      {
        $set: {
          lastMessage: latestMessage || null,
          lastActivityAt: latestMessage?.createdAt || null,
          messageCount: storedCount
        }
      }
    );
  }

  async function readConversationMessages(conversation, options = {}) {
    await migrateEmbeddedMessagesToCollection(conversation);

    if (options.paginated) {
      return messageRepository.listByConversation(conversation._id, options);
    }

    const messages = await messageRepository.listAllByConversation(conversation._id);

    if (messages.length) {
      return {
        messages,
        pageInfo: null
      };
    }

    return {
      messages: Array.isArray(conversation.messages) ? conversation.messages : [],
      pageInfo: null
    };
  }

  async function getVehicleById(vehicleId) {
    if (!vehicleId) {
      return null;
    }

    const vehicle = await VehicleModel.findById(vehicleId).lean();
    return serializeVehicle(vehicle);
  }

  async function getRouteById(routeId) {
    if (!routeId) {
      return null;
    }

    const route = await RouteModel.findById(routeId).lean();
    return serializeRoute(route);
  }

  async function listRoutes(user = null) {
    const routes = await RouteModel.find(getOrganizationQuery(user)).sort({ updatedAt: -1 }).lean();
    return routes.map(serializeRoute);
  }

  async function createRoute(payload) {
    const now = new Date();
    const organizationId = String(payload.organizationId || "").trim();
    const routeName = String(payload.name || "").trim();

    if (organizationId && routeName) {
      const existing = await RouteModel.findOne({ organizationId, name: routeName }).lean();
      if (existing) throw new Error("Ya existe una ruta con ese nombre en esta organizacion");
    }

    const doc = await RouteModel.create({
      _id: payload.id || randomUUID(),
      name: routeName,
      code: String(payload.code || payload.name || "").trim(),
      color: payload.color || "#1473E6",
      origin: payload.origin || null,
      destination: payload.destination || null,
      originLabel: String(payload.originLabel || "").trim(),
      destinationLabel: String(payload.destinationLabel || "").trim(),
      stops: payload.stops || [],
      distanceMeters: Math.max(0, Number(payload.distanceMeters) || 0),
      durationSeconds: Math.max(0, Number(payload.durationSeconds) || 0),
      durationInTrafficSeconds: Math.max(0, Number(payload.durationInTrafficSeconds) || 0),
      polyline: payload.polyline || [],
      organizationId,
      createdBy: payload.createdBy || null,
      createdAt: now,
      updatedAt: now
    });

    return serializeRoute(doc);
  }

  function routeOptionFromRoute(route) {
    if (!route || !Array.isArray(route.polyline) || route.polyline.length < 2) {
      return null;
    }

    return {
      label: String(route.name || "Ruta asignada").trim() || "Ruta asignada",
      distanceMeters: Math.max(0, Number(route.distanceMeters) || 0),
      durationSeconds: Math.max(0, Number(route.durationSeconds) || 0),
      durationInTrafficSeconds: Math.max(0, Number(route.durationInTrafficSeconds) || 0),
      trafficLevel: "low",
      polyline: route.polyline
    };
  }

  function assignedRouteFromSavedRoute(route, previousAssignment = null, assignedBy = null) {
    const routeOption = routeOptionFromRoute(route);

    if (!routeOption) {
      return null;
    }

    const origin = route.origin || routeOption.polyline[0] || null;
    const destination = route.destination || routeOption.polyline[routeOption.polyline.length - 1] || null;

    if (!origin || !destination) {
      return null;
    }

    return {
      routeId: route.id || route._id,
      routeName: route.name,
      routeCode: route.code,
      routeColor: route.color,
      originLabel: route.originLabel || route.name,
      origin,
      destinationLabel: route.destinationLabel || "",
      destination,
      stops: route.stops || [],
      assignedBy: previousAssignment?.assignedBy || assignedBy || "system",
      assignedAt: previousAssignment?.assignedAt || new Date(),
      provider: previousAssignment?.provider || "system",
      route: routeOption,
      alternatives: []
    };
  }

  function vehicleRouteViewFromAssignment(vehicle) {
    const assignedRoute = hasActiveAssignedRoute(vehicle?.assignedRoute) ? vehicle.assignedRoute : null;
    const assignedRouteId = normalizeRouteId(assignedRoute?.routeId);

    if (!assignedRoute || !assignedRouteId) {
      return {
        ...getClearedVehicleRouteFields(),
        route: null,
        routeName: "Sin ruta",
        routeCode: "N/A",
        routeColor: null
      };
    }

    const route = {
      id: assignedRouteId,
      name: assignedRoute.routeName || assignedRoute.route.label,
      code: assignedRoute.routeCode || "N/A",
      color: assignedRoute.routeColor || null,
      origin: assignedRoute.origin || assignedRoute.route.polyline[0] || null,
      destination: assignedRoute.destination || assignedRoute.route.polyline[assignedRoute.route.polyline.length - 1] || null,
      stops: assignedRoute.stops || [],
      distanceMeters: Math.max(0, Number(assignedRoute.route.distanceMeters) || 0),
      durationSeconds: Math.max(0, Number(assignedRoute.route.durationSeconds) || 0),
      durationInTrafficSeconds: Math.max(0, Number(assignedRoute.route.durationInTrafficSeconds) || 0),
      polyline: assignedRoute.route.polyline || []
    };

    return {
      routeId: assignedRouteId,
      assignedRoute,
      route,
      routeName: route.name,
      routeCode: route.code,
      routeColor: route.color
    };
  }

  async function updateAssignedRouteSnapshots(route) {
    const vehicles = await VehicleModel.find({ routeId: route._id || route.id }).lean();

    await Promise.all(vehicles.map((vehicle) => {
      const nextAssignment = assignedRouteFromSavedRoute(route, vehicle.assignedRoute);

      if (!nextAssignment) {
        return VehicleModel.findByIdAndUpdate(
          vehicle._id,
          {
            $set: {
              ...getClearedVehicleRouteFields(),
              updatedAt: new Date()
            }
          }
        );
      }

      return VehicleModel.findByIdAndUpdate(
        vehicle._id,
        {
          $set: {
            routeId: route._id || route.id,
            assignedRoute: nextAssignment,
            updatedAt: new Date()
          }
        }
      );
    }));
  }

  async function updateRoute(routeId, payload, user = null) {
    const update = {};

    if (typeof payload.name !== "undefined") update.name = String(payload.name || "").trim();
    if (typeof payload.code !== "undefined") update.code = String(payload.code || "").trim();
    if (typeof payload.color !== "undefined") update.color = payload.color || "#1473E6";
    if (typeof payload.origin !== "undefined") update.origin = payload.origin || null;
    if (typeof payload.destination !== "undefined") update.destination = payload.destination || null;
    if (typeof payload.originLabel !== "undefined") update.originLabel = String(payload.originLabel || "").trim();
    if (typeof payload.destinationLabel !== "undefined") update.destinationLabel = String(payload.destinationLabel || "").trim();
    if (typeof payload.stops !== "undefined") update.stops = payload.stops || [];
    if (typeof payload.distanceMeters !== "undefined") update.distanceMeters = Math.max(0, Number(payload.distanceMeters) || 0);
    if (typeof payload.durationSeconds !== "undefined") update.durationSeconds = Math.max(0, Number(payload.durationSeconds) || 0);
    if (typeof payload.durationInTrafficSeconds !== "undefined") {
      update.durationInTrafficSeconds = Math.max(0, Number(payload.durationInTrafficSeconds) || 0);
    }
    if (typeof payload.polyline !== "undefined") update.polyline = payload.polyline || [];

    const current = await RouteModel.findOne({ _id: routeId, ...getOrganizationQuery(user) }).lean();
    if (!current) {
      return null;
    }

    if (typeof update.name !== "undefined" && update.name) {
      const orgId = String(current.organizationId || (user ? getOrganizationId(user) : "") || "").trim();
      if (orgId) {
        const duplicate = await RouteModel.findOne({ organizationId: orgId, name: update.name, _id: { $ne: routeId } }).lean();
        if (duplicate) throw new Error("Ya existe una ruta con ese nombre en esta organizacion");
      }
    }

    // RC-MULTI-ROUTE-DRIVER-01 F3: incrementar revision SOLO si cambia la ruta operativa.
    // Se compara sobre la ruta fusionada (current + update) para no confundir "campo ausente
    // en el payload" con "campo borrado". Cambios cosmeticos (name/code/color) no la mueven.
    if (hasRouteOperationalChange(current, { ...current, ...update })) {
      update.revision = nextRouteRevision(current.revision, true);
    }

    update.updatedAt = new Date();

    const route = await RouteModel.findOneAndUpdate(
      {
        _id: routeId,
        ...getOrganizationQuery(user)
      },
      { $set: update },
      { returnDocument: "after" }
    ).lean();

    if (!route) {
      return null;
    }

    await updateAssignedRouteSnapshots(route);
    return serializeRoute(route);
  }

  async function deleteVehicle(vehicleId) {
    const vehicle = await VehicleModel.findByIdAndDelete(vehicleId).lean();
    return vehicle ? serializeVehicle(vehicle) : null;
  }

  async function deleteRoute(routeId, user = null) {
    const route = await RouteModel.findOneAndDelete({
      _id: routeId,
      ...getOrganizationQuery(user)
    }).lean();

    if (!route) {
      return null;
    }

    await VehicleModel.updateMany(
      { routeId },
      {
        $set: {
          ...getClearedVehicleRouteFields(),
          updatedAt: new Date()
        }
      }
    );

    return serializeRoute(route);
  }

  async function listTripLogs({ vehicleId, serviceDate, limit = 12 }) {
    if (!vehicleId) {
      return [];
    }

    const safeLimit = Math.max(1, Math.min(50, Number(limit) || 12));
    const filter = {
      vehicleId
    };

    if (isServiceDate(serviceDate)) {
      filter.serviceDate = serviceDate;
    }

    const tripLogs = await TripLogModel.find(filter).sort({ finishedAt: -1 }).limit(safeLimit).lean();

    return tripLogs.map((tripLog) => serializeTripLog(tripLog));
  }

  async function createTripLog(payload) {
    const vehicle = await VehicleModel.findById(payload.vehicleId).lean();
    const startedAt = new Date(payload.startedAt);
    const finishedAt = new Date(payload.finishedAt);

    if (!vehicle) {
      throw new Error("Unidad no encontrada");
    }

    if (Number.isNaN(startedAt.getTime()) || Number.isNaN(finishedAt.getTime())) {
      throw new Error("Las fechas del recorrido no son validas");
    }

    const serviceDate =
      (isServiceDate(payload.serviceDate) ? payload.serviceDate : null) ||
      toServiceDate(finishedAt) ||
      toServiceDate(startedAt);
    const existingTripLog = await TripLogModel.findOne({
      vehicleId: vehicle._id,
      serviceDate,
      startedAt,
      finishedAt
    }).lean();

    if (existingTripLog) {
      return serializeTripLog(existingTripLog);
    }

    const existingLaps = await TripLogModel.countDocuments({
      vehicleId: vehicle._id,
      serviceDate
    });

    const tripLog = await TripLogModel.create({
      _id: randomUUID(),
      organizationId: String(vehicle.organizationId || "").trim(),
      vehicleId: vehicle._id,
      vehicleCode: payload.vehicleCode || vehicle.code,
      lap: existingLaps + 1,
      serviceDate,
      originLabel: String(payload.originLabel || "").trim(),
      destinationLabel: String(payload.destinationLabel || "").trim(),
      origin: payload.origin,
      destination: payload.destination,
      startedAt,
      finishedAt,
      durationSeconds: Math.max(1, Number(payload.durationSeconds) || 0),
      distanceMeters: Math.max(0, Number(payload.distanceMeters) || 0),
      plannedDurationSeconds: Math.max(0, Number(payload.plannedDurationSeconds) || 0),
      provider: payload.provider || "system",
      registeredBy: payload.registeredBy
    });

    return serializeTripLog(tripLog);
  }

  async function getDocumentById(documentId, filters = {}) {
    const query = {
      _id: documentId,
      ...(filters.organizationId ? { organizationId: filters.organizationId } : {}),
      ...(filters.includeDeleted ? {} : { deletedAt: null })
    };
    const document = await DocumentModel.findOne(query).lean();
    return document ? serializeDocument(document) : null;
  }

  async function createDocument(payload) {
    const ownerType = payload.ownerType === "vehicle" ? "vehicle" : "driver";
    const ownerId = String(payload.ownerId || "").trim();
    const expiresAt = new Date(payload.expiresAt);
    const name = String(payload.name || payload.originalFileName || "Documento").trim();

    if (!ownerId || !name) {
      throw new Error("ownerId y name son obligatorios");
    }

    if (Number.isNaN(expiresAt.getTime())) {
      throw new Error("La fecha de vencimiento no es valida");
    }

    if (ownerType === "driver") {
      const owner = await UserModel.findById(ownerId).lean();

      if (!owner) {
        throw new Error("Propietario del documento no encontrado");
      }
    }

    if (ownerType === "vehicle") {
      const owner = await VehicleModel.findById(ownerId).lean();

      if (!owner) {
        throw new Error("Unidad del documento no encontrada");
      }
    }

    const document = await DocumentModel.create({
      _id: randomUUID(),
      organizationId: String(payload.organizationId || "").trim(),
      ownerType,
      ownerId,
      name,
      category: String(payload.category || "evidence").trim().toLowerCase() || "evidence",
      status: getDocumentStatus(expiresAt),
      expiresAt,
      fileUrl: payload.fileUrl || null,
      storageType: String(payload.storageType || "local").trim() || "local",
      mimeType: String(payload.mimeType || "").trim(),
      fileSize: Math.max(0, Number(payload.fileSize) || 0),
      uploadedAt: new Date(),
      uploadedBy: String(payload.uploadedBy || "").trim(),
      originalFileName: String(payload.originalFileName || name).trim(),
      storageKey: String(payload.storageKey || "").trim(),
      reviewStatus: normalizeReviewStatus(payload.reviewStatus),
      reviewedAt: payload.reviewedAt || null,
      reviewedBy: payload.reviewedBy || null,
      reviewNotes: String(payload.reviewNotes || "").trim(),
      reviewVersion: 0,
      replacesDocumentId: payload.replacesDocumentId || null,
      supersededByDocumentId: null,
      version: Math.max(1, Number(payload.version) || 1),
      deletedAt: null,
      deletedBy: null,
      deleteReason: "",
      assetDeletedAt: null,
      assetDeletionError: "",
      assetDeletionAttempts: 0
    });

    return serializeDocument(document);
  }

  async function reviewDocument(documentId, payload) {
    const nextReviewStatus = normalizeReviewStatus(String(payload.reviewStatus || "").trim());
    const nextReviewNotes = String(payload.reviewNotes || "").trim();
    const document = await DocumentModel.findOneAndUpdate(
      {
        _id: documentId,
        ...(payload.organizationId ? { organizationId: payload.organizationId } : {}),
        deletedAt: null,
        $or: [
          { reviewStatus: { $ne: nextReviewStatus } },
          { reviewNotes: { $ne: nextReviewNotes } }
        ]
      },
      {
        $set: {
          reviewStatus: nextReviewStatus,
          reviewNotes: nextReviewNotes,
          reviewedBy: String(payload.reviewedBy || "").trim() || null,
          reviewedAt: new Date()
        },
        $inc: { reviewVersion: 1 }
      },
      { returnDocument: "after" }
    ).lean();

    if (document) return { ...serializeDocument(document), reviewChanged: true };
    const currentDocument = await DocumentModel.findOne({
      _id: documentId,
      ...(payload.organizationId ? { organizationId: payload.organizationId } : {}),
      deletedAt: null
    }).lean();
    return currentDocument ? { ...serializeDocument(currentDocument), reviewChanged: false } : null;
  }

  async function updateDocument(documentId, payload = {}) {
    const current = await DocumentModel.findOne({
      _id: documentId,
      ...(payload.organizationId ? { organizationId: payload.organizationId } : {}),
      deletedAt: null
    }).lean();
    if (!current) return null;

    const expiresAt = payload.expiresAt === undefined ? new Date(current.expiresAt) : new Date(payload.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) throw new Error("La fecha de vencimiento no es valida");
    const name = payload.name === undefined ? current.name : String(payload.name || "").trim();
    const category = payload.category === undefined
      ? current.category
      : String(payload.category || "").trim().toLowerCase();
    if (!name || !category) throw new Error("name, category y expiresAt son obligatorios");

    const changed = name !== current.name ||
      category !== current.category ||
      expiresAt.toISOString() !== new Date(current.expiresAt).toISOString();
    if (!changed) return { ...serializeDocument(current), metadataChanged: false };

    const updated = await DocumentModel.findOneAndUpdate(
      {
        _id: documentId,
        ...(payload.organizationId ? { organizationId: payload.organizationId } : {}),
        deletedAt: null
      },
      {
        $set: {
          name,
          category,
          expiresAt,
          status: getDocumentStatus(expiresAt),
          reviewStatus: "pending_review",
          reviewNotes: "",
          reviewedBy: null,
          reviewedAt: null
        },
        $inc: { reviewVersion: 1 }
      },
      { returnDocument: "after" }
    ).lean();
    return updated ? { ...serializeDocument(updated), metadataChanged: true } : null;
  }

  async function replaceDocument(documentId, payload = {}) {
    const replacementId = randomUUID();
    const previous = await DocumentModel.findOneAndUpdate(
      {
        _id: documentId,
        ...(payload.organizationId ? { organizationId: payload.organizationId } : {}),
        deletedAt: null,
        supersededByDocumentId: null
      },
      { $set: { supersededByDocumentId: replacementId } },
      { returnDocument: "before" }
    ).lean();
    if (!previous) return null;

    const expiresAt = new Date(payload.expiresAt || previous.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) {
      await DocumentModel.updateOne(
        { _id: previous._id, supersededByDocumentId: replacementId },
        { $set: { supersededByDocumentId: null } }
      );
      throw new Error("La fecha de vencimiento no es valida");
    }

    try {
      const replacement = await DocumentModel.create({
        _id: replacementId,
        organizationId: previous.organizationId,
        ownerType: previous.ownerType,
        ownerId: previous.ownerId,
        name: String(payload.name || previous.name).trim(),
        category: previous.category,
        status: getDocumentStatus(expiresAt),
        expiresAt,
        fileUrl: payload.fileUrl || null,
        storageType: String(payload.storageType || "local").trim() || "local",
        mimeType: String(payload.mimeType || "").trim(),
        fileSize: Math.max(0, Number(payload.fileSize) || 0),
        uploadedAt: new Date(),
        uploadedBy: String(payload.uploadedBy || "").trim(),
        originalFileName: String(payload.originalFileName || payload.name || previous.name).trim(),
        storageKey: String(payload.storageKey || "").trim(),
        reviewStatus: "pending_review",
        reviewedAt: null,
        reviewedBy: null,
        reviewNotes: "",
        reviewVersion: 0,
        replacesDocumentId: previous._id,
        supersededByDocumentId: null,
        version: Math.max(1, Number(previous.version) || 1) + 1
      });
      return serializeDocument(replacement);
    } catch (error) {
      await DocumentModel.updateOne(
        { _id: previous._id, supersededByDocumentId: replacementId },
        { $set: { supersededByDocumentId: null } }
      );
      throw error;
    }
  }

  async function listDocumentVersions(documentId, filters = {}) {
    const start = await DocumentModel.findOne({
      _id: documentId,
      ...(filters.organizationId ? { organizationId: filters.organizationId } : {})
    }).lean();
    if (!start) return [];

    const documents = await DocumentModel.find({ organizationId: start.organizationId }).lean();
    const included = new Set([String(start._id)]);
    let changed = true;
    while (changed) {
      changed = false;
      documents.forEach((document) => {
        if (
          included.has(String(document.replacesDocumentId || "")) ||
          included.has(String(document.supersededByDocumentId || ""))
        ) {
          const id = String(document._id);
          if (!included.has(id)) {
            included.add(id);
            changed = true;
          }
        }
      });
    }

    return documents
      .filter((document) => included.has(String(document._id)))
      .map(serializeDocument)
      .sort((left, right) => Number(left.version || 1) - Number(right.version || 1));
  }

  async function softDeleteDocument(documentId, payload = {}) {
    const now = new Date();
    const setPayload = {};
    if (payload.assetDeletedAt) {
      setPayload.assetDeletedAt = new Date(payload.assetDeletedAt);
      setPayload.assetDeletionError = "";
    }
    if (payload.assetDeletionError !== undefined) {
      setPayload.assetDeletionError = String(payload.assetDeletionError || "").trim();
    }

    const update = {
      $set: setPayload,
      ...(payload.recordAssetAttempt ? { $inc: { assetDeletionAttempts: 1 } } : {})
    };
    if (!payload.assetDeletedAt && payload.assetDeletionError === undefined) {
      Object.assign(update.$set, {
        deletedAt: now,
        deletedBy: String(payload.deletedBy || "").trim() || null,
        deleteReason: String(payload.deleteReason || "").trim()
      });
    }

    const document = await DocumentModel.findOneAndUpdate(
      {
        _id: documentId,
        ...(payload.organizationId ? { organizationId: payload.organizationId } : {})
      },
      update,
      { returnDocument: "after" }
    ).lean();
    return document ? serializeDocument(document) : null;
  }

  async function createCommercialOrder(payload) {
    const plan = getCommercialPlanById(payload.planId);

    if (!plan) {
      throw new Error("Plan comercial no encontrado");
    }

    const orderCount = await CommercialLeadModel.countDocuments();
    const billingProfile = buildCompanyProfile(payload, payload.email);
    const pricing = getCommercialPlanPricing(plan, payload.selectedAddOns);
    const order = await CommercialLeadModel.create({
      _id: payload.id || randomUUID(),
      referenceCode: payload.referenceCode || `MNCB-${String(orderCount + 1).padStart(4, "0")}`,
      ownerUserId: String(payload.ownerUserId || "").trim() || null,
      ownerAccountEmail: String(payload.ownerAccountEmail || payload.email || "")
        .trim()
        .toLowerCase(),
      organizationId: resolveOrganizationId(payload, payload.ownerAccountEmail || payload.email),
      organizationSlug:
        slugifyCompanyName(payload.organizationSlug || payload.companyName) ||
        `cuenta-${orderCount + 1}`,
      accountStatus: String(payload.accountStatus || "registered").trim() || "registered",
      companyName: String(payload.companyName || "").trim(),
      contactName: String(payload.contactName || "").trim(),
      email: String(payload.email || "").trim().toLowerCase(),
      phone: String(payload.phone || "").trim(),
      billingProfile,
      planId: plan.id,
      planName: plan.name,
      fleetSize: plan.units,
      basePlanPrice: pricing.basePlanPrice,
      addOns: pricing.addOns,
      addOnsTotal: pricing.addOnsTotal,
      radioFeatureEnabled: pricing.radioFeatureEnabled,
      totalPrice: pricing.totalPrice,
      pricePerVehicle: plan.pricePerVehicle,
      strategy: plan.strategy,
      paymentMethod: String(payload.paymentMethod || "card").trim() || "card",
      paymentProvider: String(payload.paymentProvider || "manual").trim() || "manual",
      checkoutUrl: payload.checkoutUrl || null,
      paymentExternalReference: String(payload.paymentExternalReference || "").trim(),
      paymentProviderReference: String(payload.paymentProviderReference || "").trim(),
      paymentStatus: "pending",
      paymentApprovedAt: null,
      status: "new",
      source: String(payload.source || "landing-web").trim() || "landing-web",
      needsOnboarding:
        typeof payload.needsOnboarding === "boolean" ? payload.needsOnboarding : true,
      needsInvoice: typeof payload.needsInvoice === "boolean" ? payload.needsInvoice : true,
      requestTrial: Boolean(payload.requestTrial),
      trialDays: Boolean(payload.requestTrial) ? Math.max(1, Number(plan.trialDays) || 7) : 0,
      trialStartedAt: null,
      trialEndsAt: null,
      trialStatus: Boolean(payload.requestTrial) ? "requested" : "not_requested",
      notes: String(payload.notes || "").trim(),
      activationStatus: "pending_payment",
      activationStartedAt: null,
      activatedAt: null,
      activationNotes: "",
      onboardingStatus: "pending",
      onboardingChecklist: [],
      fleetSetupStatus: "pending",
      starterFleet: [],
      launchSummary: "",
      lastEmailStatus: "pending",
      lastEmailError: null,
      lastEmailProvider: null,
      lastEmailTemplate: null,
      lastNotificationDeliveryId: null,
      lastNotificationStatus: null,
      lastNotificationAt: null,
      lastWhatsappStatus: "pending",
      lastContactedAt: null,
      createdAt: new Date()
    });

    return serializeCommercialOrder(order);
  }

  async function listActivationKeysForCompany(companyId) {
    const safeCompanyId = String(companyId || "").trim();

    if (!safeCompanyId) {
      return [];
    }

    const keys = await ActivationKeyModel.find({ companyId: safeCompanyId })
      .sort({ createdAt: -1 })
      .lean();

    return keys.map((entry) => toPlain(entry));
  }

  async function findActivationKeyByKey(keyValue) {
    const normalizedKey = String(keyValue || "").trim().toUpperCase();

    if (!normalizedKey) {
      return null;
    }

    const activationKey = await ActivationKeyModel.findOne({ key: normalizedKey }).lean();
    return toPlain(activationKey);
  }

  async function createActivationKey(payload) {
    const activationKey = await ActivationKeyModel.create({
      _id: String(payload.id || "").trim() || randomUUID(),
      key: String(payload.key || "").trim().toUpperCase(),
      companyId: String(payload.companyId || "").trim(),
      adminId: String(payload.adminId || "").trim(),
      planId: String(payload.planId || "").trim(),
      orderId: String(payload.orderId || "").trim() || null,
      status: payload.status || "available",
      usedByDriverId: payload.usedByDriverId || null,
      usedByDriverState: payload.usedByDriverState || null,
      expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : new Date(),
      usedAt: payload.usedAt ? new Date(payload.usedAt) : null,
      sharedAt: payload.sharedAt ? new Date(payload.sharedAt) : null,
      sharedBy: payload.sharedBy || null,
      shareCount: payload.shareCount || 0,
      createdAt: payload.createdAt ? new Date(payload.createdAt) : new Date()
    });

    return toPlain(activationKey);
  }

  async function runFleetLifecycleTransaction(work) {
    const session = await CommercialLeadModel.db.startSession();
    let result;

    try {
      await session.withTransaction(async () => {
        result = await work(session);
      });
      return result;
    } finally {
      await session.endSession();
    }
  }

  async function lockFleetCapacity(orderId, organizationId, session) {
    if (!orderId) return null;

    return CommercialLeadModel.findOneAndUpdate(
      {
        _id: orderId,
        organizationId: String(organizationId || "").trim()
      },
      { $inc: { fleetLifecycleVersion: 1 } },
      { returnDocument: "after", session }
    ).lean();
  }

  async function countReservedDriverSlots(organizationId, session) {
    const now = new Date();
    const [activeDrivers, availableKeys] = await Promise.all([
      UserModel.countDocuments({
        organizationId,
        role: "driver",
        userStatus: { $ne: "suspended" },
        deletedAt: null
      }).session(session),
      ActivationKeyModel.countDocuments({
        companyId: organizationId,
        status: "available",
        expiresAt: { $gt: now }
      }).session(session)
    ]);

    return activeDrivers + availableKeys;
  }

  async function createActivationKeyWithinCapacity(payload, { maxDrivers } = {}) {
    return runFleetLifecycleTransaction(async (session) => {
      const companyId = String(payload.companyId || "").trim();
      const order = await lockFleetCapacity(payload.orderId, companyId, session);

      if (!order) return { capacityExceeded: true, activationKey: null };

      const reservedSlots = await countReservedDriverSlots(companyId, session);
      if (reservedSlots >= Math.max(0, Number(maxDrivers) || 0)) {
        return { capacityExceeded: true, activationKey: null };
      }

      const [activationKey] = await ActivationKeyModel.create([
        {
          _id: String(payload.id || "").trim() || randomUUID(),
          key: String(payload.key || "").trim().toUpperCase(),
          companyId,
          adminId: String(payload.adminId || "").trim(),
          planId: String(payload.planId || "").trim(),
          orderId: String(payload.orderId || "").trim() || null,
          status: payload.status || "available",
          usedByDriverId: payload.usedByDriverId || null,
          usedByDriverState: payload.usedByDriverState || null,
          expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : new Date(),
          createdAt: payload.createdAt ? new Date(payload.createdAt) : new Date()
        }
      ], { session });

      return { capacityExceeded: false, activationKey: toPlain(activationKey) };
    });
  }

  async function deleteActivationKey(activationKeyId) {
    const activationKey = await ActivationKeyModel.findByIdAndDelete(activationKeyId).lean();
    return activationKey ? toPlain(activationKey) : null;
  }

  async function updateActivationKey(activationKeyId, payload, filter = {}) {
    const update = {};

    Object.entries(payload || {}).forEach(([key, value]) => {
      if (typeof value === "undefined") {
        return;
      }

      update[key] = ["expiresAt", "usedAt", "sharedAt", "createdAt"].includes(key) && value ? new Date(value) : value;
    });

    const activationKey = await ActivationKeyModel.findOneAndUpdate(
      {
        _id: activationKeyId,
        ...(filter.companyId ? { companyId: filter.companyId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
        ...(Object.prototype.hasOwnProperty.call(filter, "usedByDriverId")
          ? { usedByDriverId: filter.usedByDriverId }
          : {})
      },
      {
        $set: update
      },
      { returnDocument: "after" }
    ).lean();

    return toPlain(activationKey);
  }

  async function markActivationKeyUsed(activationKeyId, { companyId, driverId }) {
    const activationKey = await ActivationKeyModel.findOneAndUpdate(
      {
        _id: activationKeyId,
        companyId,
        status: "available",
        usedByDriverId: null
      },
      {
        $set: {
          status: "used",
          usedByDriverId: String(driverId || "").trim() || null,
          usedByDriverState: "active",
          usedAt: new Date()
        }
      },
      { returnDocument: "after" }
    ).lean();

    return toPlain(activationKey);
  }

  async function enrichVehicle(vehicleDoc, routeMap = null, userMap = null) {
    if (!vehicleDoc) {
      return null;
    }

    const plain = serializeVehicle(vehicleDoc);
    const driver =
      userMap?.get(plain.driverId) ||
      (plain.driverId ? await UserModel.findById(plain.driverId).lean().then(sanitizeUser) : null);

    return {
      ...plain,
      ...vehicleRouteViewFromAssignment(plain),
      driver: driver || null,
      driverName: driver?.name || "Pendiente asignacion"
    };
  }

  async function authenticate(email, password) {
    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await UserModel.findOne({ email: normalizedEmail }).lean();

    if (!user) {
      return null;
    }

    const isValid = bcrypt.compareSync(password, user.passwordHash);
    if (!isValid) {
      return null;
    }

    if (normalizeUserStatus(user.userStatus) === "suspended") {
      return null;
    }

    await UserModel.updateOne(
      { _id: user._id },
      {
        $set: {
          lastAccessAt: new Date(),
          organizationId: getUserOrganizationId(user)
        }
      }
    );

    return sanitizeUser({
      ...user,
      lastAccessAt: new Date(),
      organizationId: getUserOrganizationId(user)
    });
  }

  async function listUsers(currentUser = null) {
    const roleOrder = {
      admin: 0,
      supervisor: 1,
      driver: 2
    };
    const organizationId = getUserOrganizationId(currentUser);
    const filter = {
      ...(!currentUser
        ? {}
        : organizationId
          ? { organizationId }
          : { organizationId: "__missing__" }),
      deletedAt: null
    };

    const users = await UserModel.find(filter).lean();

    return users
      .map((user) => sanitizeUser(user))
      .sort((left, right) => {
        const leftOrder = roleOrder[left.role] ?? 99;
        const rightOrder = roleOrder[right.role] ?? 99;

        if (leftOrder !== rightOrder) {
          return leftOrder - rightOrder;
        }

        return left.name.localeCompare(right.name, "es-MX");
      });
  }

  async function createUser(payload, forcedRole = null) {
    const name = String(payload.name || "").trim();
    const password = String(payload.password || "").trim();

    if (!name || !payload.email || !password) {
      throw new Error("Nombre, correo y contraseña son obligatorios");
    }

    const passwordValidationError = validatePasswordStrength(password);
    if (passwordValidationError) {
      throw new Error(passwordValidationError);
    }

    const role = forcedRole || normalizeRole(payload.role);
    const email = await ensureUniqueEmail(payload.email);
    const userId = String(payload.id || "").trim() || randomUUID();
    const nextVehicleId = role === "driver" ? payload.vehicleId || null : null;
    const companyProfile = buildCompanyProfile(payload, email);
    const paymentProfile = buildPaymentProfile(payload);
    const e2eePublicKey = String(payload.e2eePublicKey || "").trim();
    const accountType = normalizeAccountType(payload.accountType, role);
    const organizationId = resolveOrganizationId(
      {
        ...payload,
        companyProfile
      },
      email
    );
    const userStatus = normalizeUserStatus(payload.userStatus || "active");

    if (organizationId && companyProfile.taxId) {
      const duplicateTaxId = await UserModel.findOne({
        organizationId,
        "companyProfile.taxId": companyProfile.taxId
      }).lean();
      if (duplicateTaxId) throw new Error("El RFC ya esta registrado por otro usuario en esta organizacion");
    }

    const user = await UserModel.create({
      _id: userId,
      name,
      email,
      passwordHash: bcrypt.hashSync(password, 10),
      role,
      accountType,
      organizationId,
      userStatus,
      lastAccessAt: null,
      invitedAt: payload.invitedAt ? new Date(payload.invitedAt) : new Date(),
      suspendedAt: userStatus === "suspended" ? new Date() : null,
      phone: String(payload.phone || "").trim() || "Pendiente",
      shift: normalizeShift(payload.shift, role),
      status: normalizeStatus(payload.status, role),
      avatar: buildAvatar(name),
      avatarUrl: payload.avatarUrl || null,
      vehicleId: nextVehicleId,
      activationKeyId: String(payload.activationKeyId || "").trim() || null,
      activatedAt: payload.activatedAt ? new Date(payload.activatedAt) : null,
      e2eePublicKey,
      e2eeKeyRotatedAt: payload.e2eeKeyRotatedAt || new Date(),
      e2eeBackups: [],
      companyProfile,
      paymentProfile
    });

    await syncDriverVehicleAssignment(userId, nextVehicleId);
    return sanitizeUser(user);
  }

  async function registerUser(payload) {
    const isCommercialOwner = String(payload.accountType || "").trim() === "company_owner";
    return createUser(payload, isCommercialOwner ? "owner" : "driver");
  }

  async function updateUser(userId, payload) {
    const user = await UserModel.findById(userId);

    if (!user) {
      return null;
    }

    if (payload.email) {
      const nextEmail = await ensureUniqueEmail(payload.email, user._id);
      if (nextEmail !== user.email) {
        user.email = nextEmail;
        user.credentialVersion = Number(user.credentialVersion || 0) + 1;
        user.emailChangedAt = new Date();
      }
    }

    if (payload.name) {
      user.name = String(payload.name).trim();
      user.avatar = buildAvatar(user.name);
    }

    if (typeof payload.avatarUrl !== "undefined") {
      user.avatarUrl = payload.avatarUrl || null;
    }

    if (typeof payload.e2eePublicKey === "string") {
      user.e2eePublicKey = payload.e2eePublicKey.trim();
    }

    if (payload.e2eeKeyRotatedAt) {
      user.e2eeKeyRotatedAt = new Date(payload.e2eeKeyRotatedAt);
    }

    if (typeof payload.phone === "string") {
      user.phone = payload.phone.trim() || "Pendiente";
    }

    if (typeof payload.organizationId === "string") {
      user.organizationId = resolveOrganizationId(payload, user.email);
    }

    if (typeof payload.userStatus === "string") {
      const previousStatus = normalizeUserStatus(user.userStatus);
      const nextStatus = normalizeUserStatus(payload.userStatus);
      if (previousStatus !== nextStatus) {
        user.accountStatusVersion = Number(user.accountStatusVersion || 0) + 1;
        user.userStatus = nextStatus;
        if (nextStatus === "suspended") {
          user.suspendedAt = new Date();
          user.reactivatedAt = null;
        } else {
          user.reactivatedAt = previousStatus === "suspended" && nextStatus === "active"
            ? new Date()
            : user.reactivatedAt || null;
          user.suspendedAt = null;
        }
      }
    }

    if (
      payload.companyProfile ||
      typeof payload.companyName === "string" ||
      typeof payload.legalName === "string" ||
      typeof payload.taxId === "string" ||
      typeof payload.billingEmail === "string" ||
      typeof payload.billingAddress === "string"
    ) {
      const nextProfile = mergeCompanyProfile(user.companyProfile, payload, user.email);
      const orgId = getUserOrganizationId({ ...user.toObject(), ...(payload.organizationId ? { organizationId: payload.organizationId } : {}) });
      if (orgId && nextProfile.taxId) {
        const duplicateTaxId = await UserModel.findOne({
          _id: { $ne: user._id },
          organizationId: orgId,
          "companyProfile.taxId": nextProfile.taxId
        }).lean();
        if (duplicateTaxId) throw new Error("El RFC ya esta registrado por otro usuario en esta organizacion");
      }
      user.companyProfile = nextProfile;
      user.markModified("companyProfile");
    }

    if (
      payload.paymentProfile ||
      typeof payload.preferredMethod === "string" ||
      typeof payload.cardholderName === "string" ||
      typeof payload.cardBrand === "string" ||
      typeof payload.cardLast4 === "string" ||
      typeof payload.cardExpMonth === "string" ||
      typeof payload.cardExpYear === "string" ||
      typeof payload.customerReference === "string"
    ) {
      user.paymentProfile = mergePaymentProfile(user.paymentProfile, payload);
      user.markModified("paymentProfile");
    }

    if (Object.prototype.hasOwnProperty.call(payload, "operationalSchedule")) {
      user.operationalSchedule = payload.operationalSchedule
        ? normalizeOperationalSchedule(payload.operationalSchedule)
        : null;
      user.markModified("operationalSchedule");
    }

    if (typeof payload.shift === "string") {
      user.shift = payload.shift.trim() || normalizeShift("", user.role);
    }

    const nextRole = payload.role ? normalizeRole(payload.role) : user.role;
    user.role = nextRole;
    if (typeof payload.accountType === "string") {
      user.accountType = normalizeAccountType(payload.accountType, nextRole);
    } else {
      user.accountType = normalizeAccountType(user.accountType, nextRole);
    }
    if (!user.organizationId) {
      user.organizationId = resolveOrganizationId(user, user.email);
    }
    user.status = normalizeStatus(payload.status || user.status, nextRole);

    let nextVehicleId = user.vehicleId;
    if (typeof payload.vehicleId !== "undefined") {
      nextVehicleId = nextRole === "driver" ? payload.vehicleId || null : null;
    } else if (nextRole !== "driver") {
      nextVehicleId = null;
    }

    user.vehicleId = nextVehicleId;

    if (typeof payload.activationKeyId !== "undefined") {
      user.activationKeyId = String(payload.activationKeyId || "").trim() || null;
    }

    if (typeof payload.activatedAt !== "undefined") {
      user.activatedAt = payload.activatedAt ? new Date(payload.activatedAt) : null;
    }

    if (payload.password && String(payload.password).trim()) {
      const nextPassword = String(payload.password).trim();
      const passwordValidationError = validatePasswordStrength(nextPassword);

      if (passwordValidationError) {
        throw new Error(passwordValidationError);
      }

      user.passwordHash = bcrypt.hashSync(nextPassword, 10);
      user.credentialVersion = Number(user.credentialVersion || 0) + 1;
      user.passwordChangedAt = new Date();
    }

    await user.save();
    await syncDriverVehicleAssignment(user._id, nextVehicleId);

    return sanitizeUser(user.toObject());
  }

  async function generatePasswordResetToken(email) {
    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await UserModel.findOne({ email: normalizedEmail }).lean();

    if (!user) {
      return null;
    }

    const token = randomBytes(32).toString("hex");
    const requestId = randomBytes(16).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await UserModel.updateOne(
      { _id: user._id },
      {
        $set: { resetTokenHash: tokenHash, resetTokenExpiresAt: expiresAt },
        $unset: { resetToken: "" }
      }
    );

    return {
      token,
      requestId,
      email: user.email,
      name: user.name,
      userId: String(user._id),
      organizationId: user.organizationId ? String(user.organizationId) : null
    };
  }

  async function resetPasswordWithToken(token, newPassword) {
    if (!token || !newPassword) {
      throw new Error("Token y nueva contrasena son obligatorios");
    }

    const passwordValidationError = validatePasswordStrength(newPassword);
    if (passwordValidationError) {
      throw new Error(passwordValidationError);
    }

    const tokenHash = createHash("sha256").update(String(token)).digest("hex");
    const updatedUser = await updateMongoPasswordWithResetToken({
      userModel: UserModel,
      tokenHash,
      passwordHash: bcrypt.hashSync(newPassword, 10)
    });

    if (!updatedUser) {
      throw new Error("El enlace de recuperacion ha expirado o es invalido");
    }

    return sanitizeUser(updatedUser);
  }

  async function deleteUser(userId) {
    const user = await UserModel.findById(userId).lean();

    if (!user) {
      return false;
    }

    await UserModel.deleteOne({ _id: userId });
    await VehicleModel.updateMany(
      { driverId: userId },
      {
        $set: {
          driverId: null,
          updatedAt: new Date()
        }
      }
    );
    await VehicleModel.updateMany(
      { supervisorId: userId },
      {
        $set: {
          supervisorId: null,
          updatedAt: new Date()
        }
      }
    );

    const conversations = await ConversationModel.find({ participants: userId });
    await Promise.all(
      conversations.map(async (conversation) => {
        conversation.participants = conversation.participants.filter((participantId) => participantId !== userId);
        const unreadBy = toUnreadByObject(conversation.unreadBy);
        delete unreadBy[userId];
        conversation.unreadBy = new Map(Object.entries(unreadBy));
        conversation.markModified("unreadBy");

        if (!conversation.participants.length) {
          await ConversationModel.deleteOne({ _id: conversation._id });
          return;
        }

        await conversation.save();
      })
    );

    await DocumentModel.deleteMany({
      ownerType: "driver",
      ownerId: userId
    });

    await NotificationModel.updateMany(
      {},
      {
        $pull: {
          readBy: userId
        }
      }
    );

    return true;
  }

  async function getDocumentsForUser(user) {
    const tenantFilter = [
      getOrganizationQuery(user),
      { deletedAt: null },
      { supersededByDocumentId: null }
    ];
    const filter =
      user.role === "driver"
        ? {
            $and: [
              ...tenantFilter,
              {
                $or: [
                  { ownerType: "driver", ownerId: user.id },
                  { ownerType: "vehicle", ownerId: user.vehicleId }
                ]
              }
            ]
          }
        : { $and: tenantFilter };

    const [documents, users, vehicles, routes] = await Promise.all([
      DocumentModel.find(filter).sort({ expiresAt: 1 }).lean(),
      UserModel.find().lean(),
      VehicleModel.find().lean(),
      RouteModel.find().lean()
    ]);

    const userMap = new Map(users.map((entry) => [entry._id, sanitizeUser(entry)]));
    const routeMap = new Map(routes.map((entry) => [entry._id, serializeRoute(entry)]));
    const vehicleMap = new Map(vehicles.map((entry) => [entry._id, entry]));

    return Promise.all(
      documents.map(async (document) => {
        const plain = serializeDocument(document);

        return {
          ...plain,
          owner:
            plain.ownerType === "driver"
              ? userMap.get(plain.ownerId) || null
              : await enrichVehicle(vehicleMap.get(plain.ownerId), routeMap, userMap)
        };
      })
    );
  }

  async function listDocuments(filters = {}) {
    const query = {
      ...(filters.includeDeleted ? {} : { deletedAt: null }),
      ...(filters.includeSuperseded ? {} : { supersededByDocumentId: null })
    };

    if (filters.ownerType) {
      query.ownerType = filters.ownerType;
    }

    if (filters.reviewStatus) {
      query.reviewStatus = filters.reviewStatus;
    }

    if (filters.organizationId) {
      query.organizationId = filters.organizationId;
    }

    const [documents, users, vehicles, routes] = await Promise.all([
      DocumentModel.find(query).sort({ expiresAt: 1 }).lean(),
      UserModel.find().lean(),
      VehicleModel.find().lean(),
      RouteModel.find().lean()
    ]);

    const userMap = new Map(users.map((entry) => [entry._id, sanitizeUser(entry)]));
    const routeMap = new Map(routes.map((entry) => [entry._id, serializeRoute(entry)]));
    const vehicleMap = new Map(vehicles.map((entry) => [entry._id, entry]));

    return await Promise.all(
      documents.map(async (document) => {
        const plain = serializeDocument(document);

        return {
          ...plain,
          owner:
            plain.ownerType === "driver"
              ? userMap.get(plain.ownerId) || null
              : await enrichVehicle(vehicleMap.get(plain.ownerId), routeMap, userMap)
        };
      })
    );
  }

  async function getNotificationsForUser(user) {
    const organizationId = getUserOrganizationId(user);
    const organizationQuery = getOrganizationQuery(user);
    const roleAudience = {
      organizationId: organizationId || "__missing__",
      targetRoles: user.role
    };
    const notifications = await NotificationModel.find({
      ...organizationQuery,
      $or: [
        roleAudience,
        { targetUserIds: user.id }
      ]
    })
      .sort({ createdAt: -1 })
      .lean();

    return notifications.map((notification) => {
      const plain = serializeNotification(notification);

      return {
        ...plain,
        isRead: plain.readBy.includes(user.id)
      };
    });
  }

  async function markNotificationAsRead(notificationId, userId) {
    const user = await UserModel.findById(userId).lean();
    const allowedNotificationIds = new Set(
      (user ? await getNotificationsForUser(user) : []).map((notification) => notification.id)
    );

    if (!allowedNotificationIds.has(notificationId)) {
      return null;
    }

    const notification = await NotificationModel.findByIdAndUpdate(
      notificationId,
      {
        $addToSet: {
          readBy: userId
        }
      },
      { returnDocument: "after" }
    ).lean();

    if (!notification) {
      return null;
    }

    const plain = serializeNotification(notification);
    return {
      ...plain,
      isRead: true
    };
  }

  async function createNotification(payload) {
    const notification = await NotificationModel.create({
      _id: randomUUID(),
      organizationId: String(payload.organizationId || "").trim(),
      title: String(payload.title || "").trim(),
      body: String(payload.body || "").trim(),
      level: String(payload.level || "info").trim() || "info",
      targetRoles: Array.isArray(payload.targetRoles) ? payload.targetRoles : [],
      targetUserIds: Array.isArray(payload.targetUserIds) ? payload.targetUserIds : [],
      category: String(payload.category || "system").trim() || "system",
      data: payload.data || null,
      createdAt: new Date(),
      readBy: []
    });

    return serializeNotification(notification);
  }

  async function registerPushSubscription(userId, payload) {
    const safeToken = String(payload?.token || "").trim();

    if (!safeToken) {
      throw new Error("El token push es obligatorio");
    }

    const user = await UserModel.findById(userId);

    if (!user) {
      throw new Error("Usuario no encontrado");
    }

    // Rebind the installation before attaching it to the current identity.
    // Push delivery must never retain a logged-out account as a recipient.
    await UserModel.updateMany(
      { _id: { $ne: user._id }, "pushSubscriptions.token": safeToken },
      { $pull: { pushSubscriptions: { token: safeToken } } }
    );

    const currentSubscriptions = Array.isArray(user.pushSubscriptions)
      ? user.pushSubscriptions.map((entry) => ({
          token: String(entry.token || "").trim(),
          platform: String(entry.platform || "unknown").trim() || "unknown",
          deviceName: String(entry.deviceName || "").trim(),
          updatedAt: entry.updatedAt || new Date()
        }))
      : [];

    const nextSubscriptions = [
      {
        token: safeToken,
        platform: String(payload?.platform || "unknown").trim() || "unknown",
        deviceName: String(payload?.deviceName || "").trim(),
        updatedAt: new Date()
      },
      ...currentSubscriptions.filter((entry) => entry.token !== safeToken)
    ].slice(0, 8);

    user.pushSubscriptions = nextSubscriptions;
    user.markModified("pushSubscriptions");
    await user.save();

    return nextSubscriptions;
  }

  async function unregisterPushSubscription(userId, token) {
    const safeToken = String(token || "").trim();

    if (!safeToken) {
      return [];
    }

    const user = await UserModel.findById(userId);

    if (!user) {
      return [];
    }

    user.pushSubscriptions = (user.pushSubscriptions || []).filter(
      (entry) => String(entry.token || "").trim() !== safeToken
    );
    user.markModified("pushSubscriptions");
    await user.save();

    return user.pushSubscriptions;
  }

  async function getUserE2eeBackup(userId, deviceId = "") {
    const user = await UserModel.findById(userId).lean();

    if (!user) {
      return null;
    }

    const safeDeviceId = String(deviceId || "").trim();
    const backups = Array.isArray(user.e2eeBackups) ? user.e2eeBackups : [];
    const targetBackup =
      backups.find((entry) => String(entry.deviceId || "").trim() === safeDeviceId) ||
      backups
        .slice()
        .sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt))[0] ||
      null;

    return serializeE2eeBackupEntry(targetBackup, true);
  }

  async function upsertUserE2eeBackup(userId, payload) {
    const deviceId = String(payload?.deviceId || "").trim();

    if (!deviceId) {
      throw new Error("deviceId es obligatorio para el respaldo E2EE");
    }

    const user = await UserModel.findById(userId);

    if (!user) {
      throw new Error("Usuario no encontrado");
    }

    const nextEntry = {
      deviceId,
      publicKey: String(payload.publicKey || user.e2eePublicKey || "").trim(),
      backupCipher: String(payload.backupCipher || "").trim(),
      backupVersion: String(payload.backupVersion || "secretbox-v1").trim() || "secretbox-v1",
      platform: String(payload.platform || "unknown").trim() || "unknown",
      label: String(payload.label || "").trim(),
      updatedAt: new Date(),
      restoredAt: payload.restoredAt ? new Date(payload.restoredAt) : null
    };

    const currentBackups = Array.isArray(user.e2eeBackups)
      ? user.e2eeBackups.map((entry) => ({
          deviceId: String(entry.deviceId || "").trim(),
          publicKey: String(entry.publicKey || "").trim(),
          backupCipher: String(entry.backupCipher || "").trim(),
          backupVersion: String(entry.backupVersion || "secretbox-v1").trim() || "secretbox-v1",
          platform: String(entry.platform || "unknown").trim() || "unknown",
          label: String(entry.label || "").trim(),
          updatedAt: entry.updatedAt || new Date(),
          restoredAt: entry.restoredAt || null
        }))
      : [];

    user.e2eeBackups = [nextEntry, ...currentBackups.filter((entry) => entry.deviceId !== deviceId)].slice(0, 8);
    user.markModified("e2eeBackups");

    if (nextEntry.publicKey && nextEntry.publicKey !== user.e2eePublicKey) {
      user.e2eePublicKey = nextEntry.publicKey;
      user.e2eeKeyRotatedAt = nextEntry.updatedAt;
    }

    await user.save();

    return serializeE2eeBackupEntry(nextEntry, true);
  }

  async function listPushSubscriptionsForUsers(userIds = []) {
    const safeUserIds = Array.from(
      new Set((Array.isArray(userIds) ? userIds : []).map((entry) => String(entry || "").trim()).filter(Boolean))
    );

    if (!safeUserIds.length) {
      return [];
    }

    const users = await UserModel.find({
      _id: { $in: safeUserIds },
      "pushSubscriptions.0": { $exists: true }
    }).lean();

    return users.flatMap((entry) =>
      (entry.pushSubscriptions || []).map((subscription) => ({
        userId: entry._id,
        role: entry.role,
        name: entry.name,
        token: String(subscription.token || "").trim(),
        platform: String(subscription.platform || "unknown").trim() || "unknown",
        deviceName: String(subscription.deviceName || "").trim()
      }))
    );
  }

  async function listPushSubscriptionsForRoles(roles = [], organizationId = "") {
    const safeRoles = Array.from(
      new Set((Array.isArray(roles) ? roles : []).map((entry) => String(entry || "").trim()).filter(Boolean))
    );

    if (!safeRoles.length) {
      return [];
    }

    const users = await UserModel.find({
      role: { $in: safeRoles },
      organizationId: String(organizationId || "").trim(),
      "pushSubscriptions.0": { $exists: true }
    }).lean();

    return users.flatMap((entry) =>
      (entry.pushSubscriptions || []).map((subscription) => ({
        userId: entry._id,
        role: entry.role,
        name: entry.name,
        token: String(subscription.token || "").trim(),
        platform: String(subscription.platform || "unknown").trim() || "unknown",
        deviceName: String(subscription.deviceName || "").trim()
      }))
    );
  }

  async function getOperationalInsights({ hours = 24, limit = 10 } = {}) {
    const safeHours = Math.max(1, Number(hours) || 24);
    const safeLimit = Math.max(1, Math.min(25, Number(limit) || 10));
    const since = new Date(Date.now() - safeHours * 60 * 60 * 1000);

    const [
      apiErrors,
      slowRequests,
      pushDelivered,
      pushFailed,
      checkoutEvents,
      latestEvents,
      activeCriticalIncidents,
      recentRtcSessions
    ] = await Promise.all([
      AppEventModel.countDocuments({
        scope: "api",
        createdAt: { $gte: since },
        $or: [{ type: "api_error" }, { level: "danger" }, { level: "critical" }]
      }),
      AppEventModel.countDocuments({
        type: "api_slow",
        createdAt: { $gte: since }
      }),
      AppEventModel.countDocuments({
        type: "push_sent",
        createdAt: { $gte: since }
      }),
      AppEventModel.countDocuments({
        type: "push_failed",
        createdAt: { $gte: since }
      }),
      AppEventModel.countDocuments({
        scope: "commercial",
        createdAt: { $gte: since }
      }),
      AppEventModel.find({
        createdAt: { $gte: since }
      })
        .sort({ createdAt: -1 })
        .limit(safeLimit)
        .lean(),
      IncidentModel.countDocuments({
        status: { $ne: "resolved" },
        severity: "critical"
      }),
      RtcSessionModel.find({})
        .sort({ startedAt: -1 })
        .limit(20)
        .lean()
    ]);

    const completedRtcSessions = recentRtcSessions.filter((entry) => entry.status === "completed");
    const averageRtcDurationSeconds = completedRtcSessions.length
      ? Math.round(
          completedRtcSessions.reduce((sum, entry) => sum + Number(entry.durationSeconds || 0), 0) /
            completedRtcSessions.length
        )
      : 0;

    return {
      windowHours: safeHours,
      apiErrors,
      slowRequests,
      pushDelivered,
      pushFailed,
      checkoutEvents,
      activeCriticalIncidents,
      rtc: {
        recentSessions: recentRtcSessions.length,
        completedSessions: completedRtcSessions.length,
        averageDurationSeconds: averageRtcDurationSeconds
      },
      recentEvents: latestEvents.map((entry) => toPlain(entry))
    };
  }

  async function getFleetSummary(user = null) {
    const [vehicles, routes, users] = await Promise.all([
      VehicleModel.find({
        ...getOrganizationQuery(user),
        retiredAt: null,
        ...(user?.role === "driver" ? { _id: user.vehicleId } : {})
      }).lean(),
      RouteModel.find().lean(),
      UserModel.find().lean()
    ]);

    const vehiclesMissingGpsTime = vehicles
      .filter((vehicle) => !vehicle.locationTimestamp || !vehicle.location)
      .map((vehicle) => String(vehicle._id));
    const recoveredPositions = vehiclesMissingGpsTime.length
      ? await RouteSessionPositionModel.aggregate([
          { $match: { vehicleId: { $in: vehiclesMissingGpsTime } } },
          { $sort: { timestamp: -1 } },
          { $group: { _id: "$vehicleId", position: { $first: "$$ROOT" } } }
        ])
      : [];
    const recoveredPositionByVehicle = new Map(
      recoveredPositions.map((entry) => [String(entry._id), entry.position])
    );
    const recoveredVehicles = vehicles.map((vehicle) => {
      if (vehicle.location && vehicle.locationTimestamp) return vehicle;
      const position = recoveredPositionByVehicle.get(String(vehicle._id));
      if (!position) return vehicle;
      return {
        ...vehicle,
        location: { latitude: position.latitude, longitude: position.longitude },
        locationTimestamp: position.timestamp,
        heading: position.heading ?? vehicle.heading,
        speed: position.speed ?? vehicle.speed
      };
    });

    const routeMap = new Map(routes.map((route) => [route._id, serializeRoute(route)]));
    const userMap = new Map(users.map((entry) => [entry._id, sanitizeUser(entry)]));

    return Promise.all(recoveredVehicles.map((vehicle) => enrichVehicle(vehicle, routeMap, userMap)));
  }

  async function getLiveLocations() {
    const [fleet, routes, incidents] = await Promise.all([
      getFleetSummary(),
      RouteModel.find().lean(),
      IncidentModel.find({ status: { $ne: "resolved" } }).lean()
    ]);

    const routeMap = new Map(routes.map((route) => [route._id, serializeRoute(route)]));
    const fleetMap = new Map(fleet.map((vehicle) => [vehicle.id, vehicle]));

    return {
      updatedAt: new Date().toISOString(),
      center: {
        latitude: 19.4326,
        longitude: -99.1332
      },
      routes: routes.map((route) => serializeRoute(route)),
      vehicles: fleet,
      incidents: incidents.map((incident) => {
        const plain = serializeIncident(incident);

        return {
          ...plain,
          route: routeMap.get(plain.routeId) || null,
          vehicle: fleetMap.get(plain.vehicleId) || null
        };
      })
    };
  }

  async function getDashboardOverview(user) {
    const organizationQuery = getOrganizationQuery(user);
    const [fleet, incidents, documents, notifications] = await Promise.all([
      getFleetSummary(user),
      IncidentModel.find({
        ...organizationQuery,
        status: { $ne: "resolved" },
        ...(user.role === "driver"
          ? {
              $or: [
                { reporterId: user.id },
                { vehicleId: user.vehicleId }
              ]
            }
          : {})
      }).lean(),
      DocumentModel.find(organizationQuery).lean(),
      getNotificationsForUser(user)
    ]);

    const activeVehicles = fleet.filter((vehicle) => vehicle.status === "on-route");
    const averageOccupancy = activeVehicles.length
      ? Math.round(
          activeVehicles.reduce(
            (sum, vehicle) => sum + vehicle.occupancy / vehicle.capacity,
            0
          ) * 100 / activeVehicles.length
        )
      : 0;

    const expiringDocuments = documents.filter(
      (document) =>
        new Date(document.expiresAt).getTime() - Date.now() <= 14 * 24 * 60 * 60 * 1000
    );

    const baseMetrics = [
      {
        id: "units-on-route",
        label: "Unidades activas",
        value: `${activeVehicles.length}/${fleet.length}`,
        trend: "+1 vs ayer",
        tone: "positive"
      },
      {
        id: "punctuality",
        label: "Puntualidad",
        value: `${Math.max(84, 96 - incidents.length * 4)}%`,
        trend: incidents.length > 1 ? "Atencion en ruta R-21" : "Operacion estable",
        tone: incidents.length > 1 ? "warning" : "positive"
      },
      {
        id: "occupancy",
        label: "Aforo promedio",
        value: `${averageOccupancy}%`,
        trend: averageOccupancy > 75 ? "Carga alta en hora pico" : "Carga controlada",
        tone: averageOccupancy > 75 ? "warning" : "info"
      },
      {
        id: "documents",
        label: "Documentos urgentes",
        value: `${expiringDocuments.length}`,
        trend: "Requieren seguimiento",
        tone: expiringDocuments.length ? "danger" : "positive"
      }
    ];

    const roleHero = {
      admin: {
        eyebrow: "Centro de control",
        title: "Visibilidad total de la flotilla en un vistazo",
        description: "Monitorea unidades, incidencias y documentos con una sola consola movil."
      },
      supervisor: {
        eyebrow: "Operacion en campo",
        title: "Prioriza retrasos, bloqueos y checklist criticos",
        description: "Resuelve incidencias antes de que peguen en el servicio."
      },
      driver: {
        eyebrow: "Cabina",
        title: "Tu turno, tu ruta y tu respaldo operativo",
        description: "Consulta tu avance, reporta incidencias y mantente comunicado sin distraerte."
      }
    };

    const tailoredFleet =
      user.role === "driver" && user.vehicleId
        ? fleet.filter((vehicle) => vehicle.id === user.vehicleId)
        : fleet;

    const alerts = [
      ...incidents.map((incident) => {
        const plain = serializeIncident(incident);

        return buildAlert(plain.title, plain.severity, {
          subtitle: plain.description,
          status: plain.status
        });
      }),
      ...expiringDocuments.slice(0, 2).map((document) => {
        const plain = serializeDocument(document);

        return buildAlert(plain.name, plain.status === "vencido" ? "danger" : "warning", {
          subtitle: `Vence ${new Date(plain.expiresAt).toLocaleDateString("es-MX")}`,
          status: plain.status
        });
      })
    ].slice(0, 5);

    return {
      hero: roleHero[user.role] || roleHero.admin,
      metrics: baseMetrics,
      fleet: tailoredFleet,
      alerts,
      notifications: notifications.slice(0, 4),
      shift: {
        label: user.shift,
        startedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
        nextCheckpointInMinutes: user.role === "driver" ? 12 : 18
      }
    };
  }

  async function getUserProfile(userId) {
    const [user, vehicle] = await Promise.all([
      UserModel.findById(userId).lean(),
      UserModel.findById(userId)
        .lean()
        .then(async (entry) => {
          if (!entry?.vehicleId) {
            return null;
          }

          const [vehicleDoc, routeDoc, driverDoc] = await Promise.all([
            VehicleModel.findOne({
              _id: entry.vehicleId,
              ...getOrganizationQuery(entry)
            }).lean(),
            VehicleModel.findOne({
              _id: entry.vehicleId,
              ...getOrganizationQuery(entry)
            })
              .lean()
              .then((vehicleEntry) =>
                vehicleEntry?.routeId ? RouteModel.findById(vehicleEntry.routeId).lean() : null
              ),
            VehicleModel.findOne({
              _id: entry.vehicleId,
              ...getOrganizationQuery(entry)
            })
              .lean()
              .then((vehicleEntry) =>
                vehicleEntry?.driverId ? UserModel.findById(vehicleEntry.driverId).lean() : null
              )
          ]);

          const routeMap = new Map(routeDoc ? [[routeDoc._id, serializeRoute(routeDoc)]] : []);
          const userMap = new Map(driverDoc ? [[driverDoc._id, sanitizeUser(driverDoc)]] : []);

          return enrichVehicle(vehicleDoc, routeMap, userMap);
        })
    ]);

    const safeUser = sanitizeUser(user);

    return {
      user: safeUser,
      vehicle,
      documents: safeUser ? await getDocumentsForUser(safeUser) : []
    };
  }

  async function listIncidents(user) {
    const filter = {
      ...getOrganizationQuery(user),
      ...(user.role === "driver"
        ? {
            $or: [
              { reporterId: user.id },
              { vehicleId: user.vehicleId }
            ]
          }
        : {})
    };

    const [incidents, routes, vehicles, users] = await Promise.all([
      IncidentModel.find(filter).sort({ createdAt: -1 }).lean(),
      RouteModel.find(getOrganizationQuery(user)).lean(),
      VehicleModel.find(getOrganizationQuery(user)).lean(),
      UserModel.find(getOrganizationQuery(user)).lean()
    ]);

    const routeMap = new Map(routes.map((entry) => [entry._id, serializeRoute(entry)]));
    const vehicleMap = new Map(vehicles.map((entry) => [entry._id, serializeVehicle(entry)]));
    const userMap = new Map(users.map((entry) => [entry._id, sanitizeUser(entry)]));

    return incidents.map((incident) => {
      const plain = serializeIncident(incident);

      return {
        ...plain,
        route: routeMap.get(plain.routeId) || null,
        vehicle: vehicleMap.get(plain.vehicleId) || null,
        reporter: userMap.get(plain.reporterId) || null
      };
    });
  }

  async function createIncident(user, payload) {
    const fleet = await getFleetSummary(user);
    const assignedVehicleId =
      payload.vehicleId ||
      user.vehicleId ||
      fleet.find((vehicle) => vehicle.driverId === user.id)?.id;
    const assignedVehicle = fleet.find((vehicle) => vehicle.id === assignedVehicleId);
    const requestedRoute = payload.routeId
      ? await RouteModel.findOne({ _id: payload.routeId, ...getOrganizationQuery(user) }).lean()
      : null;
    const routeId =
      requestedRoute?._id ||
      (hasActiveAssignedRoute(assignedVehicle?.assignedRoute)
        ? normalizeRouteId(assignedVehicle.routeId)
        : null);

    const incident = await IncidentModel.create({
      _id: randomUUID(),
      organizationId: getUserOrganizationId(user) || String(assignedVehicle?.organizationId || "").trim(),
      title: payload.title,
      type: payload.type,
      severity: payload.severity || "medium",
      status: "open",
      routeId,
      vehicleId: assignedVehicleId || null,
      reporterId: user.id,
      description: payload.description,
      location: payload.location || null,
      locationState: payload.locationState || (payload.location ? "fresh" : "missing"),
      locationSourceTimestamp: payload.locationSourceTimestamp || payload.location?.timestamp || null,
      createdAt: new Date(),
      updatedAt: null,
      media: payload.media || []
    });

    return serializeIncident(incident);
  }

  async function createVehicle(payload) {
    let vehicle;
    try {
      vehicle = await VehicleModel.create({
      _id: String(payload.id || "").trim() || randomUUID(),
      organizationId: String(payload.organizationId || "").trim(),
      code: String(payload.code || "").trim(),
      plate: String(payload.plate || "").trim(),
      routeId: String(payload.routeId || "").trim() || null,
      driverId: String(payload.driverId || "").trim() || null,
      supervisorId: String(payload.supervisorId || "").trim() || null,
      status: String(payload.status || "available").trim() || "available",
      occupancy: Math.max(0, Number(payload.occupancy) || 0),
      capacity: Math.max(1, Number(payload.capacity) || 18),
      etaMinutes: null,
      delayMinutes: 0,
      speed: 0,
      fuel: Math.max(0, Math.min(100, Number(payload.fuel) || 100)),
      currentKilometers: Math.max(0, Number(payload.currentKilometers) || 0),
      updatedAt: new Date(),
      location: payload.location || null,
      assignedRoute: null
      });
    } catch (error) {
      if (error?.code === 11000) {
        const keyPattern = error?.keyPattern || {};
        if (keyPattern.code) throw new Error("El numero economico ya esta registrado en esta organizacion");
        if (keyPattern.plate) throw new Error("Ya existe una unidad con esas placas en esta organizacion");
        throw new Error("Ya existe una unidad con ese nombre o placas en esta organizacion");
      }
      throw error;
    }

    return enrichVehicle(vehicle.toObject());
  }

  async function claimVehicleForDriver(vehicleId, { organizationId, driverId } = {}) {
    const vehicle = await VehicleModel.findOneAndUpdate(
      {
        _id: vehicleId,
        ...(organizationId ? { organizationId } : {}),
        status: "available",
        $or: [{ driverId: null }, { driverId: { $exists: false } }]
      },
      {
        $set: {
          driverId,
          status: "assigned",
          updatedAt: new Date()
        }
      },
      { returnDocument: "after" }
    ).lean();

    return toPlain(vehicle);
  }

  async function releaseVehicleFromDriver(vehicleId, driverId) {
    const vehicle = await VehicleModel.findOneAndUpdate(
      {
        _id: vehicleId,
        driverId
      },
      {
        $set: {
          driverId: null,
          status: "available",
          updatedAt: new Date()
        }
      },
      { returnDocument: "after" }
    ).lean();

    return toPlain(vehicle);
  }

  async function listVehiclesForOrganization(organizationId, { includeRetired = false } = {}) {
    const scope = String(organizationId || "").trim();
    const vehicles = await VehicleModel.find({
      organizationId: scope,
      ...(includeRetired ? {} : { retiredAt: null })
    }).sort({ updatedAt: -1 }).lean();
    return Promise.all(vehicles.map((vehicle) => enrichVehicle(vehicle)));
  }

  async function getDriverLifecycleDependencies(userId, organizationId) {
    const scope = String(organizationId || "").trim();
    const user = await UserModel.findOne({ _id: userId, organizationId: scope }).lean();
    if (!user) return null;

    const vehicle = user.vehicleId
      ? await VehicleModel.findOne({ _id: user.vehicleId, organizationId: scope }).lean()
      : null;
    const [activeSession, documentCount, historicalSessionCount, activeSessionCount] = await Promise.all([
      vehicle
        ? RouteSessionModel.findOne({ vehicleId: vehicle._id, organizationId: scope, status: { $in: ["RUNNING", "PAUSED"] } }).lean()
        : null,
      DocumentModel.countDocuments({ organizationId: scope, ownerType: "driver", ownerId: userId }),
      RouteSessionModel.countDocuments({ organizationId: scope, driverId: userId }),
      SessionModel.countDocuments({ userId, organizationId: scope, isActive: true, revokedAt: null })
    ]);

    return {
      user: sanitizeUser(user),
      vehicle: vehicle ? await enrichVehicle(vehicle) : null,
      activeSession: toPlain(activeSession),
      activeSessionCount,
      documentCount,
      historicalSessionCount
    };
  }

  async function getVehicleLifecycleDependencies(vehicleId, organizationId) {
    const scope = String(organizationId || "").trim();
    const vehicle = await VehicleModel.findOne({ _id: vehicleId, organizationId: scope }).lean();
    if (!vehicle) return null;

    const [driver, activeSession, routeSessionCount, positionCount, documentCount, incidentCount, tripLogCount] = await Promise.all([
      vehicle.driverId ? UserModel.findOne({ _id: vehicle.driverId, organizationId: scope }).lean() : null,
      RouteSessionModel.findOne({ vehicleId, organizationId: scope, status: { $in: ["RUNNING", "PAUSED"] } }).lean(),
      RouteSessionModel.countDocuments({ vehicleId, organizationId: scope }),
      RouteSessionPositionModel.countDocuments({ vehicleId }),
      DocumentModel.countDocuments({ organizationId: scope, ownerType: "vehicle", ownerId: vehicleId }),
      IncidentModel.countDocuments({ organizationId: scope, vehicleId }),
      TripLogModel.countDocuments({ organizationId: scope, vehicleId })
    ]);

    return {
      vehicle: await enrichVehicle(vehicle),
      driver: sanitizeUser(driver),
      activeSession: toPlain(activeSession),
      routeSessionCount,
      positionCount,
      documentCount,
      incidentCount,
      tripLogCount
    };
  }

  async function changeDriverVehicle({ organizationId, userId, vehicleId = null }) {
    const scope = String(organizationId || "").trim();

    return runFleetLifecycleTransaction(async (session) => {
      const user = await UserModel.findOneAndUpdate(
        {
          _id: userId,
          organizationId: scope,
          role: "driver",
          userStatus: { $ne: "suspended" },
          deletedAt: null
        },
        { $inc: { fleetLifecycleVersion: 1 } },
        { returnDocument: "after", session }
      ).lean();
      if (!user) return { ok: false, code: "not_found" };

      const previousVehicleId = user.vehicleId || null;
      const previousVehicle = previousVehicleId
        ? await VehicleModel.findOne({ _id: previousVehicleId, organizationId: scope }).session(session).lean()
        : null;
      if (previousVehicleId) {
        const activeSession = await RouteSessionModel.findOne({
          vehicleId: previousVehicleId,
          organizationId: scope,
          status: { $in: ["RUNNING", "PAUSED"] }
        }).session(session).lean();
        if (activeSession) return { ok: false, code: "active_session" };
      }

      if (vehicleId === previousVehicleId) {
        return {
          ok: true,
          changed: false,
          user: sanitizeUser(user),
          previousVehicle: toPlain(previousVehicle),
          vehicle: toPlain(previousVehicle)
        };
      }

      let nextVehicle = null;
      if (vehicleId) {
        nextVehicle = await VehicleModel.findOneAndUpdate(
          {
            _id: vehicleId,
            organizationId: scope,
            retiredAt: null,
            status: "available",
            $or: [{ driverId: null }, { driverId: { $exists: false } }]
          },
          {
            $set: { driverId: userId, status: "assigned", updatedAt: new Date() },
            $inc: { fleetLifecycleVersion: 1 }
          },
          { returnDocument: "after", session }
        ).lean();
        if (!nextVehicle) return { ok: false, code: "vehicle_taken" };
      }

      if (previousVehicleId && previousVehicleId !== vehicleId) {
        await VehicleModel.updateOne(
          { _id: previousVehicleId, organizationId: scope, driverId: userId },
          {
            $set: { driverId: null, status: "available", updatedAt: new Date() },
            $inc: { fleetLifecycleVersion: 1 }
          },
          { session }
        );
      }
      await UserModel.updateOne(
        { _id: userId, organizationId: scope },
        { $set: { vehicleId: vehicleId || null } },
        { session }
      );

      return {
        ok: true,
        changed: true,
        user: sanitizeUser({ ...user, vehicleId: vehicleId || null }),
        previousVehicle: toPlain(previousVehicle),
        vehicle: toPlain(nextVehicle)
      };
    });
  }

  async function offboardDriverState({ actorId, organizationId, orderId, reason, userId }) {
    const scope = String(organizationId || "").trim();

    return runFleetLifecycleTransaction(async (session) => {
      if (orderId && !(await lockFleetCapacity(orderId, scope, session))) {
        return { ok: false, code: "plan_inactive" };
      }
      const user = await UserModel.findOneAndUpdate(
        { _id: userId, organizationId: scope, role: "driver", deletedAt: null },
        { $inc: { fleetLifecycleVersion: 1 } },
        { returnDocument: "after", session }
      ).lean();
      if (!user) return { ok: false, code: "not_found" };

      const vehicle = user.vehicleId
        ? await VehicleModel.findOne({ _id: user.vehicleId, organizationId: scope }).session(session).lean()
        : null;
      if (vehicle) {
        const activeSession = await RouteSessionModel.findOne({
          vehicleId: vehicle._id,
          organizationId: scope,
          status: { $in: ["RUNNING", "PAUSED"] }
        }).session(session).lean();
        if (activeSession) return { ok: false, code: "active_session" };
      }

      const alreadyOffboarded = user.userStatus === "suspended" && !user.vehicleId;
      if (vehicle?.driverId === userId) {
        await VehicleModel.updateOne(
          { _id: vehicle._id, organizationId: scope, driverId: userId },
          {
            $set: { driverId: null, status: "available", updatedAt: new Date() },
            $inc: { fleetLifecycleVersion: 1 }
          },
          { session }
        );
      }

      const now = new Date();
      const updates = {
        vehicleId: null,
        userStatus: "suspended",
        status: "offline",
        suspendedAt: user.suspendedAt || now,
        offboardedAt: user.offboardedAt || now,
        offboardedBy: user.offboardedBy || actorId || null,
        offboardReason: user.offboardReason || String(reason || "").trim()
      };
      if (!alreadyOffboarded) updates.accountStatusVersion = Number(user.accountStatusVersion || 0) + 1;
      await UserModel.updateOne({ _id: userId, organizationId: scope }, { $set: updates }, { session });

      return {
        ok: true,
        changed: !alreadyOffboarded,
        user: sanitizeUser({ ...user, ...updates }),
        releasedVehicle: vehicle ? { ...toPlain(vehicle), driverId: null, status: "available" } : null
      };
    });
  }

  async function reactivateDriverWithinCapacity({ organizationId, orderId, userId, maxDrivers }) {
    const scope = String(organizationId || "").trim();

    return runFleetLifecycleTransaction(async (session) => {
      if (!(await lockFleetCapacity(orderId, scope, session))) return { ok: false, code: "plan_inactive" };
      const user = await UserModel.findOneAndUpdate(
        { _id: userId, organizationId: scope, role: "driver", deletedAt: null },
        { $inc: { fleetLifecycleVersion: 1 } },
        { returnDocument: "after", session }
      ).lean();
      if (!user) return { ok: false, code: "not_found" };
      if (user.userStatus !== "suspended") return { ok: true, changed: false, user: sanitizeUser(user) };

      const reservedSlots = await countReservedDriverSlots(scope, session);
      if (reservedSlots >= Math.max(0, Number(maxDrivers) || 0)) return { ok: false, code: "capacity" };

      const updates = {
        userStatus: "active",
        status: "offline",
        vehicleId: null,
        suspendedAt: null,
        reactivatedAt: new Date(),
        accountStatusVersion: Number(user.accountStatusVersion || 0) + 1
      };
      await UserModel.updateOne({ _id: userId, organizationId: scope }, { $set: updates }, { session });
      return { ok: true, changed: true, user: sanitizeUser({ ...user, ...updates }) };
    });
  }

  async function deleteDriverSafely({ actorId, organizationId, reason, userId }) {
    const scope = String(organizationId || "").trim();
    return runFleetLifecycleTransaction(async (session) => {
      const user = await UserModel.findOneAndUpdate(
        { _id: userId, organizationId: scope, role: "driver", deletedAt: null },
        { $inc: { fleetLifecycleVersion: 1 } },
        { returnDocument: "after", session }
      ).lean();
      if (!user) return { ok: false, code: "not_found" };
      if (user.userStatus !== "suspended") return { ok: false, code: "not_suspended" };
      if (user.vehicleId) return { ok: false, code: "vehicle_assigned" };

      const activeSession = await RouteSessionModel.findOne({
        driverId: userId,
        organizationId: scope,
        status: { $in: ["RUNNING", "PAUSED"] }
      }).session(session).lean();
      if (activeSession) return { ok: false, code: "active_session" };

      const updates = {
        deletedAt: new Date(),
        deletedBy: actorId || null,
        deleteReason: String(reason || "").trim(),
        status: "offline"
      };
      await UserModel.updateOne({ _id: userId, organizationId: scope }, { $set: updates }, { session });
      return { ok: true, user: sanitizeUser({ ...user, ...updates }) };
    });
  }

  async function retireVehicle({ actorId, organizationId, reason, vehicleId }) {
    const scope = String(organizationId || "").trim();
    return runFleetLifecycleTransaction(async (session) => {
      const vehicle = await VehicleModel.findOneAndUpdate(
        { _id: vehicleId, organizationId: scope },
        { $inc: { fleetLifecycleVersion: 1 } },
        { returnDocument: "after", session }
      ).lean();
      if (!vehicle) return { ok: false, code: "not_found" };
      if (vehicle.retiredAt) return { ok: true, changed: false, vehicle: toPlain(vehicle) };
      if (vehicle.driverId) return { ok: false, code: "driver_assigned" };
      if (vehicle.routeId || vehicle.assignedRoute) return { ok: false, code: "route_assigned" };
      const activeSession = await RouteSessionModel.findOne({
        vehicleId,
        organizationId: scope,
        status: { $in: ["RUNNING", "PAUSED"] }
      }).session(session).lean();
      if (activeSession) return { ok: false, code: "active_session" };

      const updates = {
        status: "retired",
        retiredAt: new Date(),
        retiredBy: actorId || null,
        retirementReason: String(reason || "").trim(),
        updatedAt: new Date()
      };
      await VehicleModel.updateOne({ _id: vehicleId, organizationId: scope }, { $set: updates }, { session });
      return { ok: true, changed: true, vehicle: { ...toPlain(vehicle), ...updates } };
    });
  }

  async function deleteUnusedVehicle({ organizationId, vehicleId }) {
    const scope = String(organizationId || "").trim();
    return runFleetLifecycleTransaction(async (session) => {
      const vehicle = await VehicleModel.findOneAndUpdate(
        { _id: vehicleId, organizationId: scope },
        { $inc: { fleetLifecycleVersion: 1 } },
        { returnDocument: "after", session }
      ).lean();
      if (!vehicle) return { ok: false, code: "not_found" };

      const [activeSession, routeSessionCount, positionCount, documentCount, incidentCount, tripLogCount] = await Promise.all([
        RouteSessionModel.findOne({ vehicleId, organizationId: scope, status: { $in: ["RUNNING", "PAUSED"] } }).session(session).lean(),
        RouteSessionModel.countDocuments({ vehicleId, organizationId: scope }).session(session),
        RouteSessionPositionModel.countDocuments({ vehicleId }).session(session),
        DocumentModel.countDocuments({ organizationId: scope, ownerType: "vehicle", ownerId: vehicleId }).session(session),
        IncidentModel.countDocuments({ organizationId: scope, vehicleId }).session(session),
        TripLogModel.countDocuments({ organizationId: scope, vehicleId }).session(session)
      ]);
      if (
        vehicle.driverId || vehicle.routeId || vehicle.assignedRoute || activeSession ||
        routeSessionCount + positionCount + documentCount + incidentCount + tripLogCount > 0
      ) {
        return { ok: false, code: "has_dependencies" };
      }

      await VehicleModel.deleteOne({ _id: vehicleId, organizationId: scope }, { session });
      return { ok: true, vehicle: toPlain(vehicle) };
    });
  }

  // RC-MULTI-ROUTE-DRIVER-01 F3 (§17): allow-list ESTRICTA. NO agregar routeId / assignedRoute /
  // activeRouteProgress aqui: la proyeccion de ruta la escribe SOLO activateVehicleRouteAssignment
  // (motor F3) y, de forma legada hasta F6, assignRouteToVehicle. Un update generico jamas la toca.
  async function updateVehicle(vehicleId, payload) {
    const updates = {};

    if (typeof payload.code !== "undefined") {
      updates.code = String(payload.code || "").trim();
    }

    if (typeof payload.plate !== "undefined") {
      updates.plate = String(payload.plate || "").trim().toUpperCase();
    }

    if (typeof payload.status !== "undefined") {
      updates.status = String(payload.status || "available").trim() || "available";
    }

    if (typeof payload.currentKilometers !== "undefined") {
      updates.currentKilometers = Math.max(0, Number(payload.currentKilometers) || 0);
    }

    if (Object.prototype.hasOwnProperty.call(updates, "code") && !updates.code) {
      throw new Error("Codigo y placa de unidad son obligatorios");
    }

    if (Object.prototype.hasOwnProperty.call(updates, "plate") && !updates.plate) {
      throw new Error("Codigo y placa de unidad son obligatorios");
    }

    updates.updatedAt = new Date();

    if (updates.status === "maintenance") {
      const currentVehicle = await VehicleModel.findById(vehicleId).lean();
      if (currentVehicle?.driverId) {
        throw new Error("Libera al conductor antes de poner la unidad en mantenimiento");
      }
    }

    let vehicle;
    try {
      vehicle = await VehicleModel.findByIdAndUpdate(
        vehicleId,
        { $set: updates },
        { returnDocument: "after" }
      ).lean();
    } catch (error) {
      if (error?.code === 11000) {
        const keyPattern = error?.keyPattern || {};
        if (keyPattern.code) throw new Error("El numero economico ya esta registrado en esta organizacion");
        if (keyPattern.plate) throw new Error("Ya existe una unidad con esas placas en esta organizacion");
        throw new Error("Ya existe una unidad con ese nombre o placas en esta organizacion");
      }
      throw error;
    }

    return enrichVehicle(vehicle);
  }

  async function updateIncidentStatus(incidentId, status) {
    const incident = await IncidentModel.findByIdAndUpdate(
      incidentId,
      {
        $set: {
          status,
          updatedAt: new Date()
        }
      },
      { returnDocument: "after" }
    ).lean();

    return serializeIncident(incident);
  }

  async function getConversationById(conversationId) {
    const conversation = await ConversationModel.findById(conversationId).lean();
    return serializeConversation(conversation);
  }

  async function canUserAccessConversation(userId, conversationOrId) {
    const [user, conversation] = await Promise.all([
      UserModel.findById(userId).lean(),
      typeof conversationOrId === "string"
        ? ConversationModel.findById(conversationOrId).lean()
        : Promise.resolve(conversationOrId)
    ]);
    const organizationId = getUserOrganizationId(user);

    return Boolean(
      user &&
      conversation &&
      organizationId &&
      String(conversation.organizationId || "").trim() === organizationId &&
      conversation.participants.includes(userId)
    );
  }

  async function ensureCoreConversation({
    id,
    organizationId,
    title,
    description,
    channelMode = "chat"
  }) {
    const users = await UserModel.find({ organizationId }).lean();
    const participantIds = users.map((entry) => entry._id);
    const unreadSeed = {};

    participantIds.forEach((participantId) => {
      unreadSeed[participantId] = 0;
    });

    const existingConversation = await ConversationModel.findById(id);

    if (!existingConversation) {
      const defaultSender = users.find((entry) => entry.role === "admin") || users[0];
      const welcomeText =
        channelMode === "radio"
          ? "Canal general de radio listo. Usa notas de voz para coordinacion rapida."
          : "Canal general listo. Aqui puede coordinarse toda la operacion.";
      const welcomeMessage = defaultSender
        ? buildStoredChatMessage(defaultSender._id, {
            kind: "text",
            text: welcomeText
          })
        : null;

      await ConversationModel.create({
        _id: id,
        organizationId,
        title,
        kind: "group",
        channelMode: normalizeConversationChannelMode(channelMode),
        description: String(description || "").trim(),
        encrypted: true,
        participants: participantIds,
        unreadBy: unreadSeed,
        lastMessage: welcomeMessage,
        lastActivityAt: welcomeMessage?.createdAt || null,
        messageCount: welcomeMessage ? 1 : 0,
        messages: []
      });
      if (welcomeMessage) {
        await messageRepository.create(buildChatMessageDocument(welcomeMessage, { _id: id, organizationId }));
      }

      return;
    }

    const unreadBy = {
      ...unreadSeed,
      ...toUnreadByObject(existingConversation.unreadBy)
    };

    existingConversation.title = title;
    existingConversation.organizationId = organizationId;
    existingConversation.kind = "group";
    existingConversation.channelMode = normalizeConversationChannelMode(channelMode);
    existingConversation.description = String(description || "").trim();
    existingConversation.encrypted = true;
    existingConversation.participants = participantIds;
    existingConversation.unreadBy = new Map(Object.entries(unreadBy));
    existingConversation.markModified("unreadBy");
    await existingConversation.save();
  }

  async function ensureCoreChatConversations(userId) {
    const user = await UserModel.findById(userId).lean();
    const organizationId = getUserOrganizationId(user);

    if (!organizationId) {
      throw new Error("La cuenta no tiene organizacion asignada");
    }

    await ensureCoreConversation({
      id: `conversation-ops:${organizationId}`,
      organizationId,
      title: "General operativo",
      description: "Canal grupal para anuncios, estado de ruta y coordinacion de toda la operacion.",
      channelMode: "chat"
    });
    await ensureCoreConversation({
      id: `conversation-radio-general:${organizationId}`,
      organizationId,
      title: "Radio general",
      description: "Canal de radio para notas de voz cortas, avisos y coordinacion inmediata.",
      channelMode: "radio"
    });

    return {
      chatConversationId: `conversation-ops:${organizationId}`,
      organizationId,
      radioConversationId: `conversation-radio-general:${organizationId}`
    };
  }

  async function listChatContactsForUser(userId) {
    const currentUser = await UserModel.findById(userId).lean();
    const organizationId = getUserOrganizationId(currentUser);
    const [users, conversations] = await Promise.all([
      UserModel.find({ _id: { $ne: userId }, organizationId }).lean(),
      ConversationModel.find({
        kind: "direct",
        organizationId,
        participants: userId
      }).lean()
    ]);

    return users
      .map((entry) => {
        const safeUser = sanitizeUser(entry);
        const directConversation = conversations.find(
          (conversation) =>
            normalizeConversationChannelMode(conversation.channelMode) === "chat" &&
            conversation.participants.includes(entry._id)
        );
        const radioConversation = conversations.find(
          (conversation) =>
            normalizeConversationChannelMode(conversation.channelMode) === "radio" &&
            conversation.participants.includes(entry._id)
        );

        return {
          ...safeUser,
          directConversationId: directConversation?._id || null,
          radioConversationId: radioConversation?._id || null
        };
      })
      .sort((left, right) => {
        const leftRoleOrder = { admin: 0, supervisor: 1, driver: 2 }[left.role] ?? 99;
        const rightRoleOrder = { admin: 0, supervisor: 1, driver: 2 }[right.role] ?? 99;

        if (leftRoleOrder !== rightRoleOrder) {
          return leftRoleOrder - rightRoleOrder;
        }

        return left.name.localeCompare(right.name, "es-MX");
      });
  }

  async function ensureGeneralConversation(userId, channelMode = "chat") {
    const core = await ensureCoreChatConversations(userId);
    const conversationId =
      normalizeConversationChannelMode(channelMode) === "radio"
        ? core.radioConversationId
        : core.chatConversationId;
    const [conversation, users] = await Promise.all([
      ConversationModel.findById(conversationId).lean(),
      UserModel.find({ organizationId: core.organizationId }).lean()
    ]);
    const userMap = new Map(users.map((entry) => [entry._id, sanitizeUser(entry)]));

    return buildConversationSummary(conversation, userId, userMap);
  }

  async function ensureDirectConversation(userId, targetUserId, { channelMode = "chat" } = {}) {
    const safeTargetUserId = String(targetUserId || "").trim();

    if (!safeTargetUserId || safeTargetUserId === userId) {
      throw new Error("Selecciona otro participante para abrir el canal");
    }

    const [sourceUser, targetUser] = await Promise.all([
      UserModel.findById(userId).lean(),
      UserModel.findById(safeTargetUserId).lean()
    ]);

    if (!sourceUser || !targetUser) {
      throw new Error("Participante no encontrado");
    }

    const organizationId = getUserOrganizationId(sourceUser);

    if (!organizationId || getUserOrganizationId(targetUser) !== organizationId) {
      throw new Error("Participante no encontrado");
    }

    const normalizedChannelMode = normalizeConversationChannelMode(channelMode);
    const directConversations = await ConversationModel.find({
      kind: "direct",
      organizationId,
      channelMode: normalizedChannelMode,
      participants: { $all: [userId, safeTargetUserId] }
    });
    const existingConversation = directConversations.find(
      (conversation) => conversation.participants.length === 2
    );

    if (existingConversation) {
      const userMap = new Map([
        [sourceUser._id, sanitizeUser(sourceUser)],
        [targetUser._id, sanitizeUser(targetUser)]
      ]);

      return buildConversationSummary(existingConversation.toObject(), userId, userMap);
    }

    const unreadBy = {
      [userId]: 0,
      [safeTargetUserId]: 0
    };
    const titlePrefix = normalizedChannelMode === "radio" ? "Radio directo" : "Directo";
    const openingMessage = buildStoredChatMessage(userId, {
      kind: "text",
      text:
        normalizedChannelMode === "radio"
          ? `Canal de radio abierto con ${targetUser.name}.`
          : `Canal directo abierto con ${targetUser.name}.`
    });
    const conversation = await ConversationModel.create({
      _id: randomUUID(),
      organizationId,
      title: `${titlePrefix}: ${targetUser.name}`,
      kind: "direct",
      channelMode: normalizedChannelMode,
      description:
        normalizedChannelMode === "radio"
          ? `Canal de voz directo entre ${sourceUser.name} y ${targetUser.name}.`
          : `Conversacion directa entre ${sourceUser.name} y ${targetUser.name}.`,
      encrypted: true,
      participants: [userId, safeTargetUserId],
      unreadBy,
      lastMessage: openingMessage,
      lastActivityAt: openingMessage.createdAt,
      messageCount: 1,
      messages: []
    });
    await messageRepository.create(buildChatMessageDocument(openingMessage, conversation.toObject()));
    const userMap = new Map([
      [sourceUser._id, sanitizeUser(sourceUser)],
      [targetUser._id, sanitizeUser(targetUser)]
    ]);

    return buildConversationSummary(conversation.toObject(), userId, userMap);
  }

  async function getConversationsForUser(userId) {
    const core = await ensureCoreChatConversations(userId);

    const [conversations, users] = await Promise.all([
      ConversationModel.find({ participants: userId, organizationId: core.organizationId }).lean(),
      UserModel.find({ organizationId: core.organizationId }).lean()
    ]);

    const userMap = new Map(users.map((entry) => [entry._id, sanitizeUser(entry)]));

    return sortConversationsByActivity(
      conversations.map((conversation) => buildConversationSummary(conversation, userId, userMap))
    );
  }

  async function getMessages(conversationId, userId, options = {}) {
    const conversation = await ConversationModel.findById(conversationId);

    if (!conversation || !(await canUserAccessConversation(userId, conversation))) {
      return null;
    }

    const unreadBy = toUnreadByObject(conversation.unreadBy);
    unreadBy[userId] = 0;
    conversation.unreadBy = new Map(Object.entries(unreadBy));
    conversation.markModified("unreadBy");
    await conversation.save();

    const { messages, pageInfo } = await readConversationMessages(conversation.toObject(), options);
    const users = await UserModel.find({
      _id: { $in: messages.map((message) => message.senderId) }
    }).lean();
    const userMap = new Map(users.map((entry) => [entry._id, sanitizeUser(entry)]));
    const serializedMessages = messages.map((message) =>
      serializeChatMessageEntry(message, conversationId, userMap)
    );

    return options.paginated
      ? {
          items: serializedMessages,
          pageInfo
        }
      : serializedMessages;
  }

  async function addMessage(conversationId, senderId, input) {
    const conversation = await ConversationModel.findById(conversationId);

    if (!conversation || !(await canUserAccessConversation(senderId, conversation))) {
      return null;
    }

    const message = buildStoredChatMessage(senderId, input);
    const existingMessage = await ChatMessageModel.findById(message.id).lean();
    if (existingMessage) {
      if (String(existingMessage.conversationId) !== String(conversationId)) {
        throw new Error("El messageId ya pertenece a otra conversacion");
      }
      const existingSender = await UserModel.findById(existingMessage.senderId).lean();
      return {
        ...serializeChatMessageEntry(existingMessage, conversationId),
        sender: sanitizeUser(existingSender)
      };
    }

    const unreadBy = toUnreadByObject(conversation.unreadBy);
    conversation.participants
      .filter((participantId) => participantId !== senderId)
      .forEach((participantId) => {
        unreadBy[participantId] = (unreadBy[participantId] || 0) + 1;
    });
    const plainConversation = conversation.toObject();
    try {
      await messageRepository.create(buildChatMessageDocument(message, plainConversation));
    } catch (error) {
      if (error?.code !== 11000) throw error;
      const duplicate = await ChatMessageModel.findById(message.id).lean();
      if (!duplicate || String(duplicate.conversationId) !== String(conversationId)) throw error;
      const duplicateSender = await UserModel.findById(duplicate.senderId).lean();
      return {
        deduplicated: true,
        ...serializeChatMessageEntry(duplicate, conversationId),
        sender: sanitizeUser(duplicateSender)
      };
    }
    await attachmentRepository.createForMessage(message, plainConversation);
    await conversationRepository.updateAggregates(conversationId, {
      lastMessage: message,
      unreadBy,
      incrementMessageCount: 1
    });

    const sender = await UserModel.findById(senderId).lean();

    return {
      deduplicated: false,
      ...serializeChatMessageEntry(message, conversationId),
      sender: sanitizeUser(sender)
    };
  }

  async function canUserAccessChatMedia(userId, storageKey) {
    const mediaPath = `/api/chat/media/${encodeURIComponent(String(storageKey || "").trim())}`;
    const user = await UserModel.findById(userId).lean();
    const organizationId = getUserOrganizationId(user);
    const conversations = await ConversationModel.find({ participants: userId, organizationId }).lean();
    const conversationIds = conversations.map((conversation) => conversation._id);
    const storedMessages = await ChatMessageModel.find({
      conversationId: { $in: conversationIds },
      $or: [
        { audioUrl: mediaPath },
        { imageUrl: mediaPath },
        { videoUrl: mediaPath },
        { payloadEncrypted: { $ne: "" } }
      ]
    }).lean();

    if (
      storedMessages.some((message) => {
        if (
          message.audioUrl === mediaPath ||
          message.imageUrl === mediaPath ||
          message.videoUrl === mediaPath
        ) {
          return true;
        }

        const payload = decryptChatPayload(message.payloadEncrypted);
        return [payload?.audioUrl, payload?.imageUrl, payload?.videoUrl].includes(mediaPath);
      })
    ) {
      return true;
    }

    return conversations.some((conversation) =>
      conversation.messages.some((message) => {
        const payload = decryptChatPayload(message.payloadEncrypted);
        return [payload?.audioUrl, payload?.imageUrl, payload?.videoUrl].includes(mediaPath);
      })
    );
  }

  async function markConversationMessageRead(conversationId, messageId, userId) {
    const conversation = await ConversationModel.findById(conversationId);
    if (!conversation || !(await canUserAccessConversation(userId, conversation))) return null;
    const message = await ChatMessageModel.findOneAndUpdate(
      { _id: messageId, conversationId },
      { $set: { status: "read" } },
      { new: true }
    ).lean();
    if (!message) return null;
    const unreadBy = toUnreadByObject(conversation.unreadBy);
    unreadBy[userId] = 0;
    conversation.unreadBy = new Map(Object.entries(unreadBy));
    conversation.markModified("unreadBy");
    await conversation.save();
    return serializeChatMessageEntry(message, conversationId);
  }

  async function markConversationMessageDelivered(conversationId, messageId, userId) {
    const conversation = await ConversationModel.findById(conversationId);
    if (!conversation || !(await canUserAccessConversation(userId, conversation))) return null;
    const message = await ChatMessageModel.findOneAndUpdate(
      {
        _id: messageId,
        conversationId,
        senderId: { $ne: userId },
        status: 'sent'
      },
      { $set: { status: 'delivered' } },
      { new: true }
    ).lean();
    if (message) return serializeChatMessageEntry(message, conversationId);
    const current = await ChatMessageModel.findOne({ _id: messageId, conversationId }).lean();
    return current && current.senderId !== userId
      ? serializeChatMessageEntry(current, conversationId)
      : null;
  }

  async function updateVehicleLocation({ vehicleId, coordinates, heading, speed, timestamp, temporal = null, packetId = null }) {
    const currentVehicle = await VehicleModel.findById(vehicleId).lean();

    if (!currentVehicle) {
      return null;
    }

    const update = {
      location: {
        latitude: Number(coordinates.latitude),
        longitude: Number(coordinates.longitude)
      },
      updatedAt: new Date()
    };

    if (typeof speed === "number") {
      update.speed = speed;
    }

    if (typeof heading === "number" && Number.isFinite(heading)) {
      update.heading = heading;
    }

    if (timestamp) {
      const parsedTimestamp = new Date(timestamp);

      if (!Number.isNaN(parsedTimestamp.getTime())) {
        update.locationTimestamp = parsedTimestamp;
      }
    }
    if (temporal) {
      update.locationClientTimestamp = temporal.clientTimestamp;
      update.locationReceivedAt = temporal.receivedAt;
      update.locationTimestampSource = temporal.timestampSource;
      update.locationClockSkewMs = temporal.clockSkewMs;
    }
    update.locationPacketId = packetId || null;

    const routeProgress = calculateVehicleRouteProgress({
      coordinates: update.location,
      heading: update.heading ?? currentVehicle.heading,
      speed: update.speed ?? currentVehicle.speed,
      timestamp: update.locationTimestamp || update.updatedAt,
      vehicle: currentVehicle
    });
    update.activeRouteProgress = routeProgress;

    if (routeProgress) {
      update.etaMinutes = Math.max(0, Math.round(routeProgress.timeRemainingSeconds / 60));
    }

    const incomingTimestamp = update.locationTimestamp || update.locationReceivedAt || update.updatedAt;
    const updatedVehicle = await VehicleModel.findOneAndUpdate(
      {
        _id: vehicleId,
        ...(packetId ? { locationPacketId: { $ne: packetId } } : {}),
        $or: [
          { locationTimestamp: null },
          { locationTimestamp: { $exists: false } },
          { locationTimestamp: { $lte: incomingTimestamp } }
        ]
      },
      {
        $set: update
      },
      { returnDocument: "after" }
    ).lean();
    const vehicle = updatedVehicle || currentVehicle;

    if (!vehicle) {
      return null;
    }

    return {
      ...(await enrichVehicle(vehicle)),
      locationUpdateApplied: Boolean(updatedVehicle),
      locationUpdateReason: updatedVehicle
        ? "accepted"
        : packetId && currentVehicle.locationPacketId === packetId
          ? "duplicate"
          : "out_of_order"
    };
  }

  // RC-MULTI-ROUTE-DRIVER-01 F3: escritor LEGADO de routeId/assignedRoute (endpoint /navigation/assign).
  // Se conserva su comportamiento (incl. cambio de ruta y modo manual sin Route). El cutover al motor
  // activateVehicleRouteAssignment se hace en F6 (switch sin jornada), donde vive la semantica de
  // reemplazo de la ACTIVE previa. En F3 el motor es escritor unico del flujo NUEVO (APIs F4/F5).
  async function assignRouteToVehicle({ vehicleId, routeId = null, assignment, assignedBy = null }) {
    let nextAssignment;
    let actualRouteId = null;

    if (routeId) {
      const route = await RouteModel.findById(routeId).lean();
      nextAssignment = route ? assignedRouteFromSavedRoute(route, assignment, assignedBy) : null;
      if (!route || !nextAssignment) throw new Error("Ruta no encontrada");
      actualRouteId = route._id;
    } else if (assignment && assignment.origin && assignment.destination) {
      const originLabel = String(assignment.originLabel || "").trim() || "Origen";
      const destinationLabel = String(assignment.destinationLabel || "").trim() || "Destino";
      nextAssignment = {
        routeId: `manual:${vehicleId}:${Date.now()}`,
        routeName: `${originLabel} → ${destinationLabel}`,
        originLabel,
        origin: assignment.origin,
        destinationLabel,
        destination: assignment.destination,
        stops: [],
        assignedBy: assignedBy || "system",
        assignedAt: new Date(),
        provider: assignment.provider || "manual",
        route: {
          label: `${originLabel} → ${destinationLabel}`,
          distanceMeters: 0,
          durationSeconds: 0,
          durationInTrafficSeconds: 0,
          trafficLevel: "low",
          polyline: [assignment.origin, assignment.destination],
        },
        alternatives: [],
      };
    } else {
      throw new Error("Se requiere routeId o datos de ruta completos");
    }

    if (!nextAssignment) throw new Error("No fue posible construir la asignacion de ruta");

    const vehicle = await VehicleModel.findByIdAndUpdate(
      vehicleId,
      {
        $set: {
          routeId: actualRouteId,
          assignedRoute: nextAssignment,
          updatedAt: new Date()
        }
      },
      { returnDocument: "after" }
    ).lean();

    if (!vehicle) {
      return null;
    }

    return enrichVehicle(vehicle);
  }

  async function clearAssignedRouteFromVehicle(vehicleId) {
    const vehicle = await VehicleModel.findByIdAndUpdate(
      vehicleId,
      {
        $set: {
          routeId: null,
          assignedRoute: null,
          updatedAt: new Date()
        }
      },
      { returnDocument: "after" }
    ).lean();

    if (!vehicle) {
      return null;
    }

    return enrichVehicle(vehicle);
  }

  async function getActiveRouteSession(vehicleId) {
    const doc = await RouteSessionModel.findOne({ vehicleId, status: { $in: ["RUNNING", "PAUSED"] } }).lean();
    return doc ? { ...doc, id: String(doc._id), _id: undefined } : null;
  }

  async function getRouteSessionById(sessionId) {
    const doc = await RouteSessionModel.findById(sessionId).lean();
    return doc ? { ...doc, id: String(doc._id), _id: undefined } : null;
  }

  async function listRouteSessions({ dateFrom, dateTo, driverId, organizationId, routeId, status, vehicleId, limit = 50, offset = 0, includeTotal = false } = {}) {
    const query = {
      ...(organizationId ? { organizationId } : {}),
      ...(vehicleId ? { vehicleId } : {}),
      ...(driverId ? { driverId } : {}),
      ...(routeId ? { routeId } : {}),
      ...(status ? { status: String(status).trim().toUpperCase() } : {})
    };
    const startedAt = {};

    if (dateFrom && !Number.isNaN(new Date(dateFrom).getTime())) {
      startedAt.$gte = new Date(dateFrom);
    }

    if (dateTo && !Number.isNaN(new Date(dateTo).getTime())) {
      startedAt.$lte = new Date(dateTo);
    }

    if (Object.keys(startedAt).length) {
      query.startedAt = startedAt;
    }

    const safeLimit = Math.max(1, Math.min(5000, Number(limit) || 50));
    const safeOffset = Math.max(0, Number(offset) || 0);
    const docs = await RouteSessionModel.find(query)
      .sort({ startedAt: -1 })
      .skip(safeOffset)
      .limit(safeLimit)
      .lean();
    const items = docs.map((doc) => ({ ...doc, id: String(doc._id), _id: undefined }));
    if (!includeTotal) return items;
    const total = await RouteSessionModel.countDocuments(query);
    return { items, limit: safeLimit, offset: safeOffset, total };
  }

  async function createRouteSession(payload) {
    const active = await getActiveRouteSession(payload.vehicleId);
    if (active) return { ...active, creationApplied: false };
    const now = new Date();
    let doc;
    try {
      doc = await RouteSessionModel.create({ _id: randomUUID(), ...payload, activeKey: payload.vehicleId, status: "RUNNING",
        startedAt: payload.startedAt || now, finishedAt: null, statisticsReady: false, processingStatus: "PENDING", createdAt: now, updatedAt: now });
    } catch (error) {
      if (error?.code === 11000) {
        const existing = await getActiveRouteSession(payload.vehicleId);
        return existing ? { ...existing, creationApplied: false } : null;
      }
      throw error;
    }
    const plain = doc.toObject();
    return { ...plain, id: String(plain._id), _id: undefined, creationApplied: true };
  }

  async function updateRouteSession(sessionId, payload) {
    const { expectedStatus, ...updates } = payload;
    const doc = await RouteSessionModel.findOneAndUpdate(
      { _id: sessionId, ...(expectedStatus ? { status: expectedStatus } : {}) },
      { $set: { ...updates, ...(["FINISHED", "CANCELLED"].includes(updates.status) ? { activeKey: null } : {}), updatedAt: new Date() } },
      { returnDocument: "after" }).lean();
    if (doc) return { ...doc, id: String(doc._id), _id: undefined, transitionApplied: true };
    const existing = await getRouteSessionById(sessionId);
    return existing ? { ...existing, transitionApplied: false } : null;
  }

  // --- RC-MULTI-ROUTE-DRIVER-01 F3 (etapa 3): CRUD interno minimo de asignaciones ruta-vehiculo.
  // Solo persistencia (create/getById/list por org+vehicle). La ACTIVACION atomica (etapa 4/5) es
  // otro escritor; este CRUD NO decide estados ni toca Vehicle.assignedRoute.
  async function createVehicleRouteAssignment(payload = {}) {
    const validation = validateAssignmentInput(payload);
    if (!validation.ok) {
      throw new Error(`invalid_assignment_input:${validation.errors.join(",")}`);
    }
    const now = new Date();
    const doc = await VehicleRouteAssignmentModel.create({
      _id: payload.id || randomUUID(),
      organizationId: String(payload.organizationId || "").trim() || null,
      vehicleId: payload.vehicleId == null ? null : String(payload.vehicleId),
      routeId: payload.routeId == null ? null : String(payload.routeId),
      status: payload.status || ASSIGNMENT_STATUS.AVAILABLE,
      priority: payload.priority == null ? 0 : Math.max(0, Number(payload.priority) || 0),
      selectableByDriver: payload.selectableByDriver !== false,
      scheduledFrom: payload.scheduledFrom ? new Date(payload.scheduledFrom) : null,
      scheduledUntil: payload.scheduledUntil ? new Date(payload.scheduledUntil) : null,
      assignedBy: payload.assignedBy == null ? null : String(payload.assignedBy),
      assignedAt: payload.assignedAt ? new Date(payload.assignedAt) : now,
      activationVersion: payload.activationVersion == null ? 0 : Math.max(0, Number(payload.activationVersion) || 0),
      routeRevision: payload.routeRevision == null ? 0 : Math.max(0, Number(payload.routeRevision) || 0),
      createdAt: now,
      updatedAt: now
    });
    return serializeVehicleRouteAssignment(doc);
  }

  async function getVehicleRouteAssignmentById(assignmentId) {
    const doc = await VehicleRouteAssignmentModel.findById(assignmentId).lean();
    return doc ? serializeVehicleRouteAssignment(doc) : null;
  }

  async function listVehicleRouteAssignments({ organizationId, vehicleId, status, statuses } = {}) {
    const query = {};
    if (organizationId) query.organizationId = organizationId;
    if (vehicleId) query.vehicleId = String(vehicleId);
    const statusFilter = Array.isArray(statuses) && statuses.length ? statuses : status ? [status] : null;
    if (statusFilter) query.status = { $in: statusFilter };
    const docs = await VehicleRouteAssignmentModel.find(query)
      .sort({ priority: 1, scheduledFrom: 1, createdAt: 1 })
      .lean();
    return docs.map(serializeVehicleRouteAssignment);
  }

  // ESCRITOR UNICO (F3) del estado ACTIVE + Vehicle.routeId + Vehicle.assignedRoute (camino Mongo).
  // La orquestacion transaccional vive en ./mongo-activation (inyeccion de dependencias) para poder
  // validar el contrato de integracion con dobles. El store inyecta sus modelos + builder de proyeccion.
  async function activateVehicleRouteAssignment(params = {}) {
    return activateVehicleRouteAssignmentMongo(
      {
        VehicleRouteAssignmentModel,
        VehicleModel,
        RouteModel,
        RouteSessionModel,
        assignedRouteFromSavedRoute
      },
      params
    );
  }

  async function createRouteSessionPosition(payload) {
    if (payload.packetId) {
      const existing = await RouteSessionPositionModel.findOne({ sessionId: payload.sessionId, packetId: payload.packetId }).lean();
      if (existing) return { ...existing, id: String(existing._id), _id: undefined, duplicateSkipped: true };
    }
    let doc;
    try {
      doc = await RouteSessionPositionModel.create({ _id: randomUUID(), ...payload });
    } catch (error) {
      if (error?.code !== 11000 || !payload.packetId) throw error;
      const existing = await RouteSessionPositionModel.findOne({ sessionId: payload.sessionId, packetId: payload.packetId }).lean();
      if (existing) return { ...existing, id: String(existing._id), _id: undefined, duplicateSkipped: true };
      throw error;
    }
    const plain = doc.toObject();
    return { ...plain, id: String(plain._id), _id: undefined };
  }

  async function listRouteSessionPositions({ sessionId, limit = 50, offset = 0, includeTotal = false }) {
    const query = sessionId ? { sessionId } : {};
    const safeLimit = Math.max(1, Math.min(50000, Number(limit) || 50));
    const safeOffset = Math.max(0, Number(offset) || 0);
    const docs = await RouteSessionPositionModel.find(query)
      .sort({ timestamp: -1 })
      .skip(safeOffset)
      .limit(safeLimit)
      .lean();
    const items = docs.map((doc) => ({ ...doc, id: String(doc._id), _id: undefined }));
    if (!includeTotal) return items;
    const total = await RouteSessionPositionModel.countDocuments(query);
    return { items, limit: safeLimit, offset: safeOffset, total };
  }

  async function claimAutoRouteProcessing({ sessionId, organizationId, algorithmVersion }) {
    const id = `${sessionId}:${algorithmVersion}`;
    try {
      const doc = await AutoRouteProcessingModel.create({
        _id: id,
        sessionId,
        organizationId,
        algorithmVersion,
        status: "PROCESSING"
      });
      const plain = doc.toObject();
      return { ...plain, id: String(plain._id), _id: undefined, claimed: true };
    } catch (error) {
      if (error?.code !== 11000) throw error;
      const existing = await AutoRouteProcessingModel.findById(id).lean();
      return existing ? { ...existing, id: String(existing._id), _id: undefined, claimed: false } : null;
    }
  }

  async function completeAutoRouteProcessing(id, payload) {
    const doc = await AutoRouteProcessingModel.findByIdAndUpdate(
      id,
      { $set: { ...payload, updatedAt: new Date() } },
      { returnDocument: "after" }
    ).lean();
    return doc ? { ...doc, id: String(doc._id), _id: undefined } : null;
  }

  async function upsertLearnedRouteCandidate(payload) {
    const filter = {
      organizationId: payload.organizationId,
      groupKey: payload.groupKey,
      evidenceSessionIds: { $ne: payload.sessionId }
    };
    const update = {
      $setOnInsert: {
        _id: randomUUID(),
        organizationId: payload.organizationId,
        groupKey: payload.groupKey,
        corridorCluster: payload.corridorCluster,
        vehicleId: payload.vehicleId,
        direction: payload.direction,
        algorithmVersion: payload.algorithmVersion,
        geometryVersion: payload.geometryVersion,
        representativeSessionId: payload.representativeSessionId,
        origin: payload.origin,
        destination: payload.destination,
        polyline: payload.polyline,
        createdAt: new Date()
      },
      $set: {
        updatedAt: new Date()
      },
      $addToSet: {
        evidenceSessionIds: payload.sessionId,
        evidenceVehicleIds: payload.vehicleId,
        // Dia operativo (zona de operacion) en que se observo el corredor.
        // `$addToSet` deja que varias vueltas del mismo turno cuenten como un
        // solo dia, que es justo lo que distingue un patron de un servicio.
        ...(payload.serviceDate ? { evidenceServiceDates: payload.serviceDate } : {})
      },
      $inc: { evidenceCount: 1 },
      $min: { firstSeenAt: payload.observedAt ? new Date(payload.observedAt) : new Date() },
      $max: { lastSeenAt: payload.observedAt ? new Date(payload.observedAt) : new Date() }
    };
    let doc;
    let evidenceApplied = true;
    try {
      doc = await LearnedRouteCandidateModel.findOneAndUpdate(filter, update, {
        upsert: true,
        returnDocument: "after"
      }).lean();
    } catch (error) {
      if (error?.code !== 11000) throw error;
      doc = await LearnedRouteCandidateModel.findOneAndUpdate(filter, update, { returnDocument: "after" }).lean();
    }
    if (!doc) {
      evidenceApplied = false;
      doc = await LearnedRouteCandidateModel.findOne({
        organizationId: payload.organizationId,
        groupKey: payload.groupKey
      }).lean();
    }
    if (!doc) return null;
    if (!evidenceApplied) return { ...doc, id: String(doc._id), _id: undefined };
    const evidenceCount = Number(doc.evidenceCount) || doc.evidenceSessionIds?.length || 0;
    const vehicleCount = doc.evidenceVehicleIds?.length || 0;
    const distinctServiceDays = doc.evidenceServiceDates?.length || 0;
    // Misma regla que el store embebido: la autoridad vive en
    // domain/learned-route-evidence.js para que memoria y produccion no deriven.
    const maturity = { evidenceCount, distinctServiceDays };
    const finalized = await LearnedRouteCandidateModel.findByIdAndUpdate(
      doc._id,
      {
        $set: {
          distanceMeters: Math.round(((Number(doc.distanceMeters) || 0) * Math.max(0, evidenceCount - 1) + payload.distanceMeters) / Math.max(1, evidenceCount)),
          durationSeconds: Math.round(((Number(doc.durationSeconds) || 0) * Math.max(0, evidenceCount - 1) + payload.durationSeconds) / Math.max(1, evidenceCount)),
          confidence: learnedRouteConfidence(maturity, payload),
          vehicleCount,
          distinctServiceDays,
          ...(doc.status === "COLLECTING" && isLearnedRouteReadyForReview(maturity, payload)
            ? { status: "READY_FOR_REVIEW" }
            : {})
        }
      },
      { returnDocument: "after" }
    ).lean();
    return { ...finalized, id: String(finalized._id), _id: undefined };
  }

  async function listLearnedRouteCandidates({ organizationId, status } = {}) {
    const docs = await LearnedRouteCandidateModel.find({
      ...(organizationId ? { organizationId } : {}),
      ...(status ? { status } : {})
    }).sort({ updatedAt: -1 }).lean();
    return docs.map((doc) => ({ ...doc, id: String(doc._id), _id: undefined }));
  }

  async function getLearnedRouteCandidateById(id) {
    const doc = await LearnedRouteCandidateModel.findById(id).lean();
    return doc ? { ...doc, id: String(doc._id), _id: undefined } : null;
  }

  async function updateLearnedRouteCandidate(id, payload) {
    const doc = await LearnedRouteCandidateModel.findByIdAndUpdate(
      id,
      { $set: { ...payload, updatedAt: new Date() } },
      { returnDocument: "after" }
    ).lean();
    return doc ? { ...doc, id: String(doc._id), _id: undefined } : null;
  }

  async function getLastRouteEvent(sessionId, eventType = null) {
    const doc = await RouteEventModel.findOne({
      sessionId,
      ...(eventType ? { eventType } : {})
    }).sort({ timestamp: -1 }).lean();
    return doc ? { ...doc, id: String(doc._id), _id: undefined } : null;
  }

  async function createRouteEvent(payload) {
    const lastEvent = await getLastRouteEvent(payload.sessionId);
    if (lastEvent?.eventType === payload.eventType) {
      return { ...lastEvent, duplicateSkipped: true };
    }

    const doc = await RouteEventModel.create({
      _id: String(payload.id || "").trim() || randomUUID(),
      organizationId: String(payload.organizationId || "").trim(),
      sessionId: String(payload.sessionId || "").trim(),
      vehicleId: String(payload.vehicleId || "").trim(),
      routeId: String(payload.routeId || "").trim(),
      driverId: String(payload.driverId || "").trim(),
      eventType: String(payload.eventType || "").trim(),
      timestamp: payload.timestamp || new Date(),
      latitude: Number.isFinite(Number(payload.latitude)) ? Number(payload.latitude) : null,
      longitude: Number.isFinite(Number(payload.longitude)) ? Number(payload.longitude) : null,
      metadata: payload.metadata || null
    });
    const plain = doc.toObject();
    return { ...plain, id: String(plain._id), _id: undefined };
  }

  async function listRouteEvents({ sessionId, eventType, limit = 500 }) {
    const docs = await RouteEventModel.find({
      ...(sessionId ? { sessionId } : {}),
      ...(eventType ? { eventType } : {})
    })
      .sort({ timestamp: 1 })
      .limit(Math.max(1, Math.min(50000, Number(limit) || 500)))
      .lean();
    return docs.map((doc) => ({ ...doc, id: String(doc._id), _id: undefined }));
  }

  async function createCheckpointVisit(payload) {
    const sessionId = String(payload.sessionId || "").trim();
    const checkpointId = String(payload.checkpointId || "").trim();
    const previousVisit = await CheckpointVisitModel.findOne({ sessionId }).sort({ visitOrder: -1, timestamp: -1 }).lean();

    if (previousVisit?.checkpointId === checkpointId) {
      return { ...previousVisit, id: String(previousVisit._id), _id: undefined, duplicateSkipped: true };
    }

    const lastVisitOrder = Math.max(0, Number(previousVisit?.visitOrder) || 0);

    const doc = await CheckpointVisitModel.create({
      _id: String(payload.id || "").trim() || randomUUID(),
      organizationId: String(payload.organizationId || "").trim(),
      sessionId,
      checkpointId,
      timestamp: payload.timestamp || new Date(),
      distance: Number.isFinite(Number(payload.distance)) ? Number(payload.distance) : null,
      visitOrder: Math.max(lastVisitOrder + 1, Number(payload.visitOrder) || 1),
      latitude: Number.isFinite(Number(payload.latitude)) ? Number(payload.latitude) : null,
      longitude: Number.isFinite(Number(payload.longitude)) ? Number(payload.longitude) : null
    });
    const plain = doc.toObject();
    return { ...plain, id: String(plain._id), _id: undefined };
  }

  async function listCheckpointVisits({ sessionId, limit = 500 }) {
    const docs = await CheckpointVisitModel.find(sessionId ? { sessionId } : {})
      .sort({ visitOrder: 1, timestamp: 1 })
      .limit(Math.max(1, Math.min(50000, Number(limit) || 500)))
      .lean();
    return docs.map((doc) => ({ ...doc, id: String(doc._id), _id: undefined }));
  }

  const seed = createSeedState();
  let appConfigStore = seed.appConfig ? JSON.parse(JSON.stringify(seed.appConfig)) : null;
  const deviceVersionsStore = {};

  function getAppConfig() {
    return appConfigStore ? JSON.parse(JSON.stringify(appConfigStore)) : null;
  }

  function updateAppConfig(data, options = {}) {
    const appConfig = appConfigStore || {};
    const hasReleasePrecondition =
      options.expectedSourceCommit !== undefined || options.expectedSha256 !== undefined;
    if (
      hasReleasePrecondition
      && (
        String(appConfig.sourceCommit || "") !== String(options.expectedSourceCommit || "")
        || String(appConfig.sha256 || "") !== String(options.expectedSha256 || "")
      )
    ) {
      const error = new Error("La autoridad de release cambió durante la publicación");
      error.code = "APP_CONFIG_CONFLICT";
      error.statusCode = 409;
      throw error;
    }

    if (data.name !== undefined) appConfig.name = data.name;
    if (data.version !== undefined) appConfig.version = data.version;
    if (data.buildNumber !== undefined) appConfig.buildNumber = data.buildNumber;
    if (data.sourceCommit !== undefined) appConfig.sourceCommit = data.sourceCommit;
    if (data.sha256 !== undefined) appConfig.sha256 = data.sha256;
    if (data.status !== undefined) appConfig.status = data.status;
    if (data.apkUrl !== undefined) appConfig.apkUrl = data.apkUrl;
    if (data.androidMin !== undefined) appConfig.androidMin = data.androidMin;
    if (data.size !== undefined) appConfig.size = data.size;
    if (data.releaseDate !== undefined) appConfig.releaseDate = data.releaseDate;
    if (data.releaseNotes !== undefined) appConfig.releaseNotes = Array.isArray(data.releaseNotes) ? data.releaseNotes : [];
    if (data.mandatory !== undefined) appConfig.mandatory = Boolean(data.mandatory);
    if (data.versionHistory !== undefined) appConfig.versionHistory = Array.isArray(data.versionHistory) ? data.versionHistory : [];

    appConfigStore = appConfig;
    return JSON.parse(JSON.stringify(appConfigStore));
  }

  function recordDeviceVersion(userId, versionInfo) {
    deviceVersionsStore[userId] = {
      version: versionInfo.version || "0.0.0",
      buildNumber: versionInfo.buildNumber || "",
      platform: versionInfo.platform || "",
      deviceModel: versionInfo.deviceModel || "",
      lastLogin: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  function getDeviceVersionStats() {
    const versions = Object.values(deviceVersionsStore);
    const total = versions.length;
    if (total === 0) {
      return { total: 0, versions: {}, mostUsedVersion: null, lastPublication: null };
    }

    const versionCounts = {};
    let mostUsedVersion = null;
    let maxCount = 0;

    for (const entry of versions) {
      const v = entry.version || "unknown";
      versionCounts[v] = (versionCounts[v] || 0) + 1;
      if (versionCounts[v] > maxCount) {
        maxCount = versionCounts[v];
        mostUsedVersion = v;
      }
    }

    return {
      total,
      versions: versionCounts,
      mostUsedVersion,
      lastPublication: appConfigStore?.releaseDate || null
    };
  }

  async function countPlatformOwners() {
    return PlatformUserModel.countDocuments({ role: "platform_owner" });
  }

  async function countVehiclesByStatus() {
    const total = await VehicleModel.countDocuments();
    const on_route = await VehicleModel.countDocuments({ status: { $in: ["on-route", "on_route"] } });
    const maintenance = await VehicleModel.countDocuments({ status: "maintenance" });
    const idle = total - on_route - maintenance;
    return { total, on_route, maintenance, idle };
  }

  async function getPlatformUserById(userId) {
    if (!userId) return null;
    return PlatformUserModel.findById(userId).lean();
  }

  async function getPlatformUserByEmail(email) {
    const normalizedEmail = String(email).trim().toLowerCase();
    if (!normalizedEmail) return null;
    return PlatformUserModel.findOne({ email: normalizedEmail }).lean();
  }

  async function createPlatformUser(payload) {
    const name = String(payload.name || "").trim();
    const email = String(payload.email || "").trim().toLowerCase();
    const password = String(payload.password || "").trim();
    if (!name || !email || !password) {
      throw new Error("Nombre, correo y contraseña son obligatorios");
    }
    const passwordError = validatePasswordStrength(password);
    if (passwordError) throw new Error(passwordError);

    const existing = await PlatformUserModel.findOne({ email }).lean();
    if (existing) throw new Error("El correo ya existe");

    return PlatformUserModel.create({
      _id: randomUUID(),
      name,
      email,
      passwordHash: bcrypt.hashSync(password, 10),
      role: payload.role || "platform_viewer",
      status: payload.status || "active",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastLoginAt: null,
      passwordChangedAt: null,
      failedLoginAttempts: 0,
      lockedUntil: null,
      createdBy: payload.createdBy || null,
      suspendedAt: null,
      suspendedReason: "",
      mfaEnabled: false,
      mfaEnrollmentRequired: payload.mfaEnrollmentRequired !== undefined ? payload.mfaEnrollmentRequired : false,
      mfaSecretEncrypted: null,
      mfaBackupCodes: [],
      mfaSetupCompletedAt: null,
      mfaFailedAttempts: 0,
      mfaLockedUntil: null
    });
  }

  async function updatePlatformUser(userId, updates) {
    const setFields = {};
    if (updates.name !== undefined) setFields.name = String(updates.name).trim();
    if (updates.role !== undefined) setFields.role = updates.role;
    if (updates.status !== undefined) setFields.status = updates.status;
    if (updates.lastLoginAt !== undefined) setFields.lastLoginAt = updates.lastLoginAt;
    if (updates.failedLoginAttempts !== undefined) setFields.failedLoginAttempts = updates.failedLoginAttempts;
    if (updates.lockedUntil !== undefined) setFields.lockedUntil = updates.lockedUntil;
    if (updates.passwordHash !== undefined) setFields.passwordHash = updates.passwordHash;
    if (updates.passwordChangedAt !== undefined) setFields.passwordChangedAt = updates.passwordChangedAt;
    if (updates.suspendedAt !== undefined) setFields.suspendedAt = updates.suspendedAt;
    if (updates.suspendedReason !== undefined) setFields.suspendedReason = updates.suspendedReason;
    if (updates.mfaEnabled !== undefined) setFields.mfaEnabled = updates.mfaEnabled;
    if (updates.mfaEnrollmentRequired !== undefined) setFields.mfaEnrollmentRequired = updates.mfaEnrollmentRequired;
    if (updates.mfaSecretEncrypted !== undefined) setFields.mfaSecretEncrypted = updates.mfaSecretEncrypted;
    if (updates.mfaBackupCodes !== undefined) setFields.mfaBackupCodes = updates.mfaBackupCodes;
    if (updates.mfaSetupCompletedAt !== undefined) setFields.mfaSetupCompletedAt = updates.mfaSetupCompletedAt;
    if (updates.mfaFailedAttempts !== undefined) setFields.mfaFailedAttempts = updates.mfaFailedAttempts;
    if (updates.mfaLockedUntil !== undefined) setFields.mfaLockedUntil = updates.mfaLockedUntil;
    setFields.updatedAt = new Date();

    return PlatformUserModel.findByIdAndUpdate(
      userId,
      { $set: setFields },
      { returnDocument: "after" }
    ).lean();
  }

  return buildBackendStore({
    addMessage,
    assignRouteToVehicle,
    clearAssignedRouteFromVehicle,
    countPlatformOwners,
    countVehiclesByStatus,
    createPlatformUser,
    getPlatformUserById,
    getPlatformUserByEmail,
    updatePlatformUser,
    clearAssignedRouteFromVehicle,
    createRoute,
    deleteRoute,
    deleteVehicle,
    authenticate,
    canUserAccessConversation,
    canUserAccessChatMedia,
    createActivationKey,
    createActivationKeyWithinCapacity,
    deleteActivationKey,
    createNotification,
    createCommercialOrder,
    createIncident,
    createVehicle,
    createUser,
    deleteDriverSafely,
    deleteUnusedVehicle,
    deleteUser,
    ensureDirectConversation,
    ensureGeneralConversation,
    findActivationKeyByKey,
    getAppConfig,
    updateAppConfig,
    recordDeviceVersion,
    getDeviceVersionStats,
    getConversationById,
    getConversationsForUser,
    getDashboardOverview,
    getDocumentById,
    getDocumentsForUser,
    getLiveLocations,
    getMessages,
    getNotificationsForUser,
    getOperationalInsights,
    getRouteById,
    listRoutes,
    getUserE2eeBackup,
    getUserProfile,
    getVehicleById,
    getDriverLifecycleDependencies,
    getVehicleLifecycleDependencies,
    listActivationKeysForCompany,
    listChatContactsForUser,
    listDocuments,
    listDocumentVersions,
    listIncidents,
    listPushSubscriptionsForRoles,
    listPushSubscriptionsForUsers,
    listTripLogs,
    listVehiclesForOrganization,
    listUsers,
    markActivationKeyUsed,
    claimVehicleForDriver,
    changeDriverVehicle,
    offboardDriverState,
    reactivateDriverWithinCapacity,
    releaseVehicleFromDriver,
    retireVehicle,
    markNotificationAsRead,
    markConversationMessageDelivered,
    markConversationMessageRead,
    registerPushSubscription,
    registerUser,
    reviewDocument,
    replaceDocument,
    softDeleteDocument,
    upsertUserE2eeBackup,
    unregisterPushSubscription,
    updateIncidentStatus,
    updateDocument,
    updateActivationKey,
    updateUser,
    updateVehicleLocation,
    updateVehicle,
    createDocument,
    generatePasswordResetToken,
    resetPasswordWithToken,
    createVehicleRouteAssignment,
    getVehicleRouteAssignmentById,
    listVehicleRouteAssignments,
    activateVehicleRouteAssignment,
    createRouteSession,
    createRouteSessionPosition,
    claimAutoRouteProcessing,
    completeAutoRouteProcessing,
    upsertLearnedRouteCandidate,
    listLearnedRouteCandidates,
    getLearnedRouteCandidateById,
    updateLearnedRouteCandidate,
    createRouteEvent,
    createCheckpointVisit,
    getActiveRouteSession,
    getLastRouteEvent,
    getRouteSessionById,
    listCheckpointVisits,
    listRouteEvents,
    listRouteSessions,
    listRouteSessionPositions,
    updateRouteSession,
    updateRoute,
    createTripLog,
  }, {
    models: {
      AppEventModel,
      ChargebackModel,
      CheckoutIdempotencyModel,
      CommercialLeadModel,
      DocumentModel,
      RtcSessionModel,
      RefundOperationModel,
      TrialEntitlementModel,
      UserModel
    }
  });
}

module.exports = {
  createMongoStore,
  updateMongoPasswordWithResetToken
};
