const bcrypt = require("bcryptjs");
const { createHash, randomBytes, randomUUID } = require("crypto");
const {
  getCommercialPlanById,
  getCommercialPlanPricing
} = require("../config/commercial-plans");
const { createSeedState } = require("./seedData");
const { createMongoStore } = require("./mongo-store");
const { buildBackendStore } = require("./backend-store");
const { isServiceDate, toServiceDate } = require("../utils/service-date");
const { validatePasswordStrength } = require("../utils/password-policy");
const { normalizeOperationalSchedule } = require("../utils/operational-schedule");
const { calculateVehicleRouteProgress } = require("../services/route-progress");
const {
  getClearedVehicleRouteFields,
  hasActiveAssignedRoute,
  normalizeRouteId,
  serializeVehicle
} = require("./serializers");
const {
  decodeCursor,
  encodeCursor,
  normalizeLimit
} = require("./repositories/chat-message-repository");
const { buildCheckoutReservation, CHECKOUT_LEASE_DURATION_MS } = require("../services/checkout-idempotency");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createEmbeddedStore() {
  const state = createSeedState();
  state.appEvents = Array.isArray(state.appEvents) ? state.appEvents : [];
  state.activationKeys = Array.isArray(state.activationKeys) ? state.activationKeys : [];
  state.chatMessages = Array.isArray(state.chatMessages) ? state.chatMessages : [];
  state.routeSessions = Array.isArray(state.routeSessions) ? state.routeSessions : [];
  state.routeSessionPositions = Array.isArray(state.routeSessionPositions) ? state.routeSessionPositions : [];
  state.routeEvents = Array.isArray(state.routeEvents) ? state.routeEvents : [];
  state.checkpointVisits = Array.isArray(state.checkpointVisits) ? state.checkpointVisits : [];
  state.learnedRouteCandidates = Array.isArray(state.learnedRouteCandidates) ? state.learnedRouteCandidates : [];
  state.autoRouteProcessing = Array.isArray(state.autoRouteProcessing) ? state.autoRouteProcessing : [];
  state.checkoutIdempotency = Array.isArray(state.checkoutIdempotency) ? state.checkoutIdempotency : [];
  state.trialEntitlements = Array.isArray(state.trialEntitlements) ? state.trialEntitlements : [];
  state.refundOperations = Array.isArray(state.refundOperations) ? state.refundOperations : [];
  state.chargebacks = Array.isArray(state.chargebacks) ? state.chargebacks : [];
  state.platformUsers = [];
  state.platformSessions = [];

  function getUserById(userId) {
    return state.users.find((user) => user.id === userId) || null;
  }

  function findUserByEmail(email) {
    const normalizedEmail = String(email || "").trim().toLowerCase();

    if (!normalizedEmail) {
      return null;
    }

    return sanitizeUser(
      state.users.find((user) => user.email.toLowerCase() === normalizedEmail) || null
    );
  }

  function generatePasswordResetToken(email) {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const user = state.users.find((entry) => entry.email.toLowerCase() === normalizedEmail);

    if (!user) return null;

    const token = randomBytes(32).toString("hex");
    const requestId = randomBytes(16).toString("hex");
    user.resetTokenHash = createHash("sha256").update(token).digest("hex");
    user.resetTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    return {
      token,
      requestId,
      email: user.email,
      name: user.name,
      userId: user.id,
      organizationId: user.organizationId || null
    };
  }

  function resetPasswordWithToken(token, newPassword) {
    if (!token || !newPassword) throw new Error("Token y nueva contrasena son obligatorios");

    const passwordValidationError = validatePasswordStrength(newPassword);
    if (passwordValidationError) throw new Error(passwordValidationError);

    const tokenHash = createHash("sha256").update(String(token)).digest("hex");
    const user = state.users.find(
      (entry) => entry.resetTokenHash === tokenHash
        && new Date(entry.resetTokenExpiresAt || 0).getTime() > Date.now()
    );

    if (!user) throw new Error("El enlace de recuperacion ha expirado o es invalido");

    user.passwordHash = bcrypt.hashSync(newPassword, 10);
    user.credentialVersion = Number(user.credentialVersion || 0) + 1;
    user.passwordChangedAt = new Date().toISOString();
    delete user.resetTokenHash;
    delete user.resetTokenExpiresAt;
    return sanitizeUser(user);
  }

  function getVehicleById(vehicleId) {
    return state.vehicles.find((vehicle) => vehicle.id === vehicleId) || null;
  }

  function deleteVehicle(vehicleId) {
    const index = state.vehicles.findIndex((vehicle) => vehicle.id === vehicleId);

    if (index < 0) {
      return null;
    }

    const [vehicle] = state.vehicles.splice(index, 1);
    return clone(vehicle);
  }

  function getRouteById(routeId) {
    return state.routes.find((route) => route.id === routeId) || null;
  }

  function listRoutes(user = null) {
    const organizationId = String(user?.organizationId || '').trim();
    return clone(state.routes.filter((route) => !organizationId || route.organizationId === organizationId));
  }

  function createRoute(payload) {
    const now = new Date().toISOString();
    const routeName = String(payload.name || "").trim();
    const orgId = String(payload.organizationId || "").trim();

    if (orgId && routeName) {
      const exists = state.routes.some((r) => String(r.organizationId || "").trim() === orgId && String(r.name || "").trim().toLowerCase() === routeName.toLowerCase());
      if (exists) throw new Error("Ya existe una ruta con ese nombre en esta organizacion");
    }

    const route = {
      id: payload.id || randomUUID(),
      name: routeName,
      code: String(payload.code || payload.name || "").trim(),
      color: payload.color || "#1473E6",
      origin: payload.origin || null,
      destination: payload.destination || null,
      originLabel: String(payload.originLabel || "").trim(),
      destinationLabel: String(payload.destinationLabel || "").trim(),
      stops: clone(payload.stops || []),
      distanceMeters: Math.max(0, Number(payload.distanceMeters) || 0),
      durationSeconds: Math.max(0, Number(payload.durationSeconds) || 0),
      durationInTrafficSeconds: Math.max(0, Number(payload.durationInTrafficSeconds) || 0),
      polyline: clone(payload.polyline || []),
      organizationId: orgId,
      createdBy: payload.createdBy || null,
      createdAt: now,
      updatedAt: now
    };

    state.routes.push(route);
    return clone(route);
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
      polyline: clone(route.polyline)
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
      routeId: route.id,
      routeName: route.name,
      routeCode: route.code,
      routeColor: route.color,
      originLabel: route.originLabel || route.name,
      origin,
      destinationLabel: route.destinationLabel || "",
      destination,
      stops: clone(route.stops || []),
      assignedBy: previousAssignment?.assignedBy || assignedBy || "system",
      assignedAt: previousAssignment?.assignedAt || new Date().toISOString(),
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
      stops: clone(assignedRoute.stops || []),
      distanceMeters: Math.max(0, Number(assignedRoute.route.distanceMeters) || 0),
      durationSeconds: Math.max(0, Number(assignedRoute.route.durationSeconds) || 0),
      durationInTrafficSeconds: Math.max(0, Number(assignedRoute.route.durationInTrafficSeconds) || 0),
      polyline: clone(assignedRoute.route.polyline || [])
    };

    return {
      routeId: assignedRouteId,
      assignedRoute: clone(assignedRoute),
      route,
      routeName: route.name,
      routeCode: route.code,
      routeColor: route.color
    };
  }

  function updateAssignedRouteSnapshots(route) {
    state.vehicles.forEach((vehicle) => {
      if (vehicle.routeId !== route.id) {
        return;
      }

      const nextAssignment = assignedRouteFromSavedRoute(route, vehicle.assignedRoute);

      if (!nextAssignment) {
        Object.assign(vehicle, getClearedVehicleRouteFields(), {
          updatedAt: new Date().toISOString()
        });
        return;
      }

      vehicle.routeId = route.id;
      vehicle.assignedRoute = nextAssignment;
      vehicle.updatedAt = new Date().toISOString();
    });
  }

  function updateRoute(routeId, payload) {
    const route = getRouteById(routeId);

    if (!route) {
      return null;
    }

    if (typeof payload.name !== "undefined") {
      const newName = String(payload.name || "").trim();
      const orgId = String(route.organizationId || "").trim();
      if (orgId && newName) {
        const exists = state.routes.some((r) => r.id !== routeId && String(r.organizationId || "").trim() === orgId && String(r.name || "").trim().toLowerCase() === newName.toLowerCase());
        if (exists) throw new Error("Ya existe una ruta con ese nombre en esta organizacion");
      }
      route.name = newName;
    }
    if (typeof payload.code !== "undefined") route.code = String(payload.code || "").trim();
    if (typeof payload.color !== "undefined") route.color = payload.color || "#1473E6";
    if (typeof payload.origin !== "undefined") route.origin = payload.origin || null;
    if (typeof payload.destination !== "undefined") route.destination = payload.destination || null;
    if (typeof payload.originLabel !== "undefined") route.originLabel = String(payload.originLabel || "").trim();
    if (typeof payload.destinationLabel !== "undefined") route.destinationLabel = String(payload.destinationLabel || "").trim();
    if (typeof payload.stops !== "undefined") route.stops = clone(payload.stops || []);
    if (typeof payload.distanceMeters !== "undefined") route.distanceMeters = Math.max(0, Number(payload.distanceMeters) || 0);
    if (typeof payload.durationSeconds !== "undefined") route.durationSeconds = Math.max(0, Number(payload.durationSeconds) || 0);
    if (typeof payload.durationInTrafficSeconds !== "undefined") {
      route.durationInTrafficSeconds = Math.max(0, Number(payload.durationInTrafficSeconds) || 0);
    }
    if (typeof payload.polyline !== "undefined") route.polyline = clone(payload.polyline || []);

    route.updatedAt = new Date().toISOString();
    updateAssignedRouteSnapshots(route);
    return clone(route);
  }

  function deleteRoute(routeId) {
    const index = state.routes.findIndex((route) => route.id === routeId);

    if (index < 0) {
      return null;
    }

    const [route] = state.routes.splice(index, 1);
    state.vehicles.forEach((vehicle) => {
      if (vehicle.routeId === routeId) {
        Object.assign(vehicle, getClearedVehicleRouteFields(), {
          updatedAt: new Date().toISOString()
        });
      }
    });
    return clone(route);
  }

  function getTripLogById(tripLogId) {
    return state.tripLogs.find((tripLog) => tripLog.id === tripLogId) || null;
  }

  function findDocumentById(documentId) {
    return state.documents.find((document) => document.id === documentId) || null;
  }

  function getDocumentById(documentId, filters = {}) {
    const document = findDocumentById(documentId);
    if (!document) return null;
    if (filters.organizationId && document.organizationId !== filters.organizationId) return null;
    if (!filters.includeDeleted && document.deletedAt) return null;
    return enrichDocument(document);
  }

  function getDocumentByStorageKey(storageKey, filters = {}) {
    return clone(
      state.documents.find(
        (document) =>
          document.storageKey === String(storageKey || "").trim() &&
          (!filters.organizationId || document.organizationId === filters.organizationId) &&
          (filters.includeDeleted || !document.deletedAt)
      ) || null
    );
  }

  function getCommercialOrderById(orderId) {
    return state.commercialOrders.find((order) => order.id === orderId) || null;
  }

  function getRtcSessionById(sessionId) {
    return state.rtcSessions.find((session) => session.id === sessionId) || null;
  }

  function sanitizeUser(user) {
    if (!user) {
      return null;
    }

    const { passwordHash, pushSubscriptions, e2eeBackups, ...safeUser } = user;
    safeUser.accountType = normalizeAccountType(safeUser.accountType, safeUser.role);
    safeUser.organizationId = getUserOrganizationId(safeUser);
    safeUser.userStatus = normalizeUserStatus(safeUser.userStatus);
    safeUser.lastAccessAt = safeUser.lastAccessAt || null;
    safeUser.invitedAt = safeUser.invitedAt || null;
    safeUser.suspendedAt = safeUser.userStatus === "suspended" ? safeUser.suspendedAt || null : null;
    safeUser.operationalSchedule = safeUser.operationalSchedule || null;
    return clone(safeUser);
  }

  function serializeE2eeBackupEntry(entry, includeCipher = false) {
    if (!entry) {
      return null;
    }

    const safeEntry = {
      deviceId: String(entry.deviceId || "").trim(),
      publicKey: String(entry.publicKey || "").trim(),
      backupVersion: String(entry.backupVersion || "secretbox-v1").trim() || "secretbox-v1",
      platform: String(entry.platform || "unknown").trim() || "unknown",
      label: String(entry.label || "").trim(),
      updatedAt: entry.updatedAt || new Date().toISOString(),
      restoredAt: entry.restoredAt || null,
    };

    if (includeCipher) {
      safeEntry.backupCipher = String(entry.backupCipher || "").trim();
    }

    return safeEntry;
  }

  function enrichVehicle(vehicle) {
    if (!vehicle) {
      return null;
    }

    const plain = serializeVehicle(vehicle);
    const driver = getUserById(plain.driverId);

    return {
      ...plain,
      ...vehicleRouteViewFromAssignment(plain),
      driver: driver ? sanitizeUser(driver) : null,
      driverName: driver?.name || "Pendiente asignacion"
    };
  }

  function syncDriverVehicleAssignment(userId, nextVehicleId = null) {
    state.vehicles.forEach((vehicle) => {
      if (vehicle.driverId === userId && vehicle.id !== nextVehicleId) {
        vehicle.driverId = null;
        vehicle.status = vehicle.status === "assigned" ? "available" : vehicle.status;
        vehicle.updatedAt = new Date().toISOString();
      }
    });

    if (!nextVehicleId) {
      return;
    }

    const targetVehicle = getVehicleById(nextVehicleId);

    if (!targetVehicle) {
      return;
    }

    if (targetVehicle.driverId && targetVehicle.driverId !== userId) {
      const previousDriver = getUserById(targetVehicle.driverId);
      if (previousDriver) {
        previousDriver.vehicleId = null;
      }
    }

    targetVehicle.driverId = userId;
    targetVehicle.status = "assigned";
    targetVehicle.updatedAt = new Date().toISOString();
  }

  function buildAlert(label, tone, meta) {
    return {
      id: randomUUID(),
      label,
      tone,
      ...meta
    };
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

  function slugifyOrganization(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function normalizeUserStatus(value) {
    return ["active", "pending", "suspended"].includes(String(value || "").trim())
      ? String(value || "").trim()
      : "active";
  }

  function resolveOrganizationId(payload = {}, fallbackEmail = "") {
    const explicit = String(payload.organizationId || "").trim();

    if (explicit) {
      return slugifyOrganization(explicit) || explicit;
    }

    const companyName =
      payload.companyProfile?.companyName ||
      payload.companyName ||
      payload.organizationSlug ||
      payload.name ||
      "";
    const fromCompany = slugifyOrganization(companyName);

    if (fromCompany) {
      return fromCompany;
    }

    const email = String(payload.email || fallbackEmail || "").trim().toLowerCase();
    return slugifyOrganization(email.split("@")[0] || "cuenta");
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

  function canAccessAllOrganizations(user) {
    return user?.role === "admin" && user?.accountType !== "company_owner";
  }

  function canAccessOrganizationResource(user, resource) {
    if (canAccessAllOrganizations(user)) {
      return true;
    }

    const organizationId = getUserOrganizationId(user);
    const resourceOrganizationId = String(resource?.organizationId || "").trim();

    return Boolean(
      organizationId &&
      resourceOrganizationId &&
      organizationId === resourceOrganizationId
    );
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

  function ensureUniqueEmail(email, ignoreUserId = null) {
    const normalizedEmail = String(email).trim().toLowerCase();
    const exists = state.users.some(
      (entry) => entry.email.toLowerCase() === normalizedEmail && entry.id !== ignoreUserId
    );

    if (exists) {
      throw new Error("El correo ya existe");
    }

    return normalizedEmail;
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

  function normalizePaymentMethod(method) {
    return ["card", "spei", "transfer"].includes(String(method || "").trim())
      ? String(method || "").trim()
      : "spei";
  }

  function mergeCompanyProfile(existing, payload, fallbackEmail) {
    const source = payload.companyProfile || {};
    const companyName = String(source.companyName || payload.companyName || existing?.companyName || "").trim();
    const legalName = String(source.legalName || payload.legalName || existing?.legalName || companyName).trim();

    return {
      companyName,
      legalName,
      taxId: String(source.taxId || payload.taxId || existing?.taxId || "").trim().toUpperCase(),
      billingEmail: String(
        source.billingEmail || payload.billingEmail || existing?.billingEmail || fallbackEmail || ""
      )
        .trim()
        .toLowerCase(),
      billingAddress: String(
        source.billingAddress || payload.billingAddress || existing?.billingAddress || ""
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

    return {
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
  }

  function normalizeConversationChannelMode(channelMode) {
    return channelMode === "radio" ? "radio" : "chat";
  }

  function normalizeConversationKind(kind, participants = []) {
    if (kind === "group" || kind === "direct") {
      return kind;
    }

    return participants.length > 2 ? "group" : "direct";
  }

  function buildStoredConversationMessage(senderId, input) {
    const safeInput = typeof input === "string" ? { text: input } : input || {};
    const kind = ["audio", "image", "video"].includes(safeInput.kind) ? safeInput.kind : "text";
    const text = String(safeInput.text || "").trim();
    const textPreview = String(safeInput.textPreview || "").trim();

    return {
      id: String(safeInput.messageId || "").trim() || String(safeInput.id || "").trim() || randomUUID(),
      senderId,
      kind,
      text,
      textPreview:
        textPreview ||
        (kind === "audio"
          ? text
            ? `Nota de voz: ${text}`
            : "Nota de voz"
          : kind === "image"
            ? text || "Imagen"
            : kind === "video"
              ? text || "Video"
              : text),
      audioUrl: String(safeInput.audioUrl || "").trim() || null,
      imageUrl: String(safeInput.imageUrl || "").trim() || null,
      videoUrl: String(safeInput.videoUrl || "").trim() || null,
      transcript: String(safeInput.transcript || "").trim(),
      durationSeconds: Math.max(0, Number(safeInput.durationSeconds) || 0),
      mimeType: String(safeInput.mimeType || "").trim(),
      transmissionId: String(safeInput.transmissionId || "").trim() || null,
      e2eeEnvelope:
        safeInput.e2eeEnvelope && typeof safeInput.e2eeEnvelope === "object"
          ? clone(safeInput.e2eeEnvelope)
          : null,
      encrypted: Boolean(safeInput.e2eeEnvelope || safeInput.encrypted),
      status: ["sent", "delivered", "read", "failed"].includes(safeInput.status)
        ? safeInput.status
        : "sent",
      createdAt: safeInput.createdAt || new Date().toISOString()
    };
  }

  function storeConversationMessage(conversation, message) {
    if (!conversation?.id || !message?.id) {
      return;
    }

    const exists = state.chatMessages.some(
      (entry) => entry.id === message.id && entry.conversationId === conversation.id
    );

    if (!exists) {
      state.chatMessages.push({
        ...message,
        conversationId: conversation.id,
        organizationId: String(conversation.organizationId || "").trim(),
        status: message.status || "sent"
      });
    }
  }

  function getStoredConversationMessages(conversationId) {
    return state.chatMessages
      .filter((message) => message.conversationId === conversationId)
      .sort((left, right) => {
        const leftDate = new Date(left.createdAt).getTime();
        const rightDate = new Date(right.createdAt).getTime();

        if (leftDate !== rightDate) {
          return leftDate - rightDate;
        }

        return String(left.id).localeCompare(String(right.id));
      });
  }

  function paginateConversationMessages(messages, options = {}) {
    const limit = normalizeLimit(options.limit);
    const cursor = decodeCursor(options.before);
    const filteredMessages = cursor
      ? messages.filter((message) => {
          const messageDate = new Date(message.createdAt).getTime();
          const cursorDate = cursor.createdAt.getTime();

          return messageDate < cursorDate || (messageDate === cursorDate && message.id < cursor.id);
        })
      : messages;
    const descending = [...filteredMessages].sort((left, right) => {
      const leftDate = new Date(left.createdAt).getTime();
      const rightDate = new Date(right.createdAt).getTime();

      if (leftDate !== rightDate) {
        return rightDate - leftDate;
      }

      return String(right.id).localeCompare(String(left.id));
    });
    const page = descending.slice(0, limit);

    return {
      items: page.slice().reverse(),
      pageInfo: {
        hasMore: descending.length > limit,
        nextCursor: descending.length > limit ? encodeCursor(page[page.length - 1]) : null
      }
    };
  }

  function ensureConversationRecord(conversation) {
    if (!conversation) {
      return null;
    }

    conversation.participants = Array.isArray(conversation.participants) ? conversation.participants : [];
    conversation.kind = normalizeConversationKind(conversation.kind, conversation.participants);
    conversation.channelMode = normalizeConversationChannelMode(conversation.channelMode);
    conversation.description =
      typeof conversation.description === "string" && conversation.description.trim()
        ? conversation.description
        : conversation.channelMode === "radio"
          ? conversation.kind === "group"
            ? "Canal general de radio para coordinacion operativa."
            : "Canal de radio punto a punto."
          : conversation.kind === "group"
            ? "Canal grupal para coordinacion y seguimiento."
            : "Canal directo entre operadores.";
    conversation.encrypted =
      typeof conversation.encrypted === "boolean"
        ? conversation.encrypted
        : conversation.kind === "direct";
    conversation.unreadBy = conversation.unreadBy && typeof conversation.unreadBy === "object"
      ? conversation.unreadBy
      : {};
    conversation.participants.forEach((participantId) => {
      conversation.unreadBy[participantId] = Number(conversation.unreadBy[participantId] || 0);
    });
    const embeddedMessages = Array.isArray(conversation.messages) ? conversation.messages : [];
    embeddedMessages.map((message) => {
      if (message?.id && message?.senderId) {
        return {
          ...buildStoredConversationMessage(message.senderId, {
            ...message,
            createdAt: message.createdAt
          }),
          id: message.id
        };
      }

      return buildStoredConversationMessage(message?.senderId || "", message || {});
    }).forEach((message) => storeConversationMessage(conversation, message));
    const storedMessages = getStoredConversationMessages(conversation.id);
    const lastMessage = storedMessages[storedMessages.length - 1] || null;
    conversation.lastMessage = conversation.lastMessage || lastMessage;
    conversation.lastActivityAt = conversation.lastActivityAt || lastMessage?.createdAt || null;
    conversation.messageCount = storedMessages.length;
    conversation.messages = [];

    return conversation;
  }

  function serializeConversationMessage(message, conversationId) {
    if (!message) {
      return null;
    }

    const safeMessage = buildStoredConversationMessage(message.senderId, message);

    return {
      ...safeMessage,
      id: message.id || safeMessage.id,
      conversationId,
      sender: sanitizeUser(getUserById(message.senderId))
    };
  }

  function buildConversationSummary(conversation, currentUserId) {
    const safeConversation = ensureConversationRecord(conversation);
    const participants = safeConversation.participants
      .map((participantId) => sanitizeUser(getUserById(participantId)))
      .filter(Boolean);
    const messages = getStoredConversationMessages(safeConversation.id);
    const lastMessage = safeConversation.lastMessage || messages[messages.length - 1];

    return {
      id: safeConversation.id,
      title: safeConversation.title,
      kind: safeConversation.kind,
      channelMode: safeConversation.channelMode,
      description: safeConversation.description,
      encrypted: safeConversation.encrypted,
      participants,
      lastMessage: lastMessage
        ? serializeConversationMessage(lastMessage, safeConversation.id)
        : undefined,
      unreadCount: Number(safeConversation.unreadBy[currentUserId] || 0)
    };
  }

  function sortConversationsByActivity(conversations) {
    return clone(
      [...conversations].sort((left, right) => {
        const leftDate = left.lastMessage?.createdAt ? new Date(left.lastMessage.createdAt).getTime() : 0;
        const rightDate = right.lastMessage?.createdAt ? new Date(right.lastMessage.createdAt).getTime() : 0;

        return rightDate - leftDate;
      })
    );
  }

  function enrichDocument(document) {
    if (!document) {
      return null;
    }

    return {
      ...clone(document),
      owner:
        document.ownerType === "driver"
          ? sanitizeUser(getUserById(document.ownerId))
          : enrichVehicle(getVehicleById(document.ownerId))
    };
  }

  function listUsers(currentUser = null) {
    const roleOrder = {
      admin: 0,
      supervisor: 1,
      driver: 2
    };
    const organizationId = getUserOrganizationId(currentUser);
    const canSeeAll = canAccessAllOrganizations(currentUser);

    return clone(
      state.users
        .filter((user) => !user.deletedAt)
        .filter((user) => canSeeAll || !organizationId || getUserOrganizationId(user) === organizationId)
        .map((user) => sanitizeUser(user))
        .sort((left, right) => {
          const leftOrder = roleOrder[left.role] ?? 99;
          const rightOrder = roleOrder[right.role] ?? 99;

          if (leftOrder !== rightOrder) {
            return leftOrder - rightOrder;
          }

          return left.name.localeCompare(right.name, "es-MX");
        })
    );
  }

  function createUser(payload, forcedRole = null) {
    const name = String(payload.name || "").trim();
    const password = String(payload.password || "").trim();

    if (!name || !payload.email || !password) {
      throw new Error("Nombre, correo y contraseña son obligatorios");
    }

    const passwordError = validatePasswordStrength(password);

    if (passwordError) {
      throw new Error(passwordError);
    }

    const role = forcedRole || normalizeRole(payload.role);
    const email = ensureUniqueEmail(payload.email);
    const accountType = normalizeAccountType(payload.accountType, role);
    const organizationId =
      payload.organizationId ||
      (accountType === "company_owner" ? resolveOrganizationId(payload, email) : resolveOrganizationId(payload, email));
    const userStatus = normalizeUserStatus(payload.userStatus || payload.statusAccount || "active");
    const user = {
      id: String(payload.id || "").trim() || randomUUID(),
      name,
      email,
      passwordHash: bcrypt.hashSync(password, 10),
      role,
      accountType,
      organizationId,
      userStatus,
      lastAccessAt: null,
      invitedAt: payload.invitedAt || new Date().toISOString(),
      suspendedAt: userStatus === "suspended" ? new Date().toISOString() : null,
      reactivatedAt: null,
      accountStatusVersion: 0,
      credentialVersion: 0,
      passwordChangedAt: null,
      emailChangedAt: null,
      phone: String(payload.phone || "").trim() || "Pendiente",
      shift: normalizeShift(payload.shift, role),
      status: normalizeStatus(payload.status, role),
      avatar: buildAvatar(name),
      avatarUrl: payload.avatarUrl || null,
      vehicleId: role === "driver" ? payload.vehicleId || null : null,
      activationKeyId: String(payload.activationKeyId || "").trim() || null,
      activatedAt: payload.activatedAt || null,
      e2eePublicKey: String(payload.e2eePublicKey || "").trim(),
      e2eeKeyRotatedAt: payload.e2eeKeyRotatedAt || new Date().toISOString(),
      e2eeBackups: [],
      companyProfile: mergeCompanyProfile(null, payload, email),
      paymentProfile: mergePaymentProfile(null, payload),
      pushSubscriptions: []
    };

    if (organizationId && user.companyProfile?.taxId) {
      const duplicateTaxId = state.users.some(
        (entry) => entry.id !== user.id && entry.organizationId === organizationId && entry.companyProfile?.taxId === user.companyProfile.taxId
      );
      if (duplicateTaxId) throw new Error("El RFC ya esta registrado por otro usuario en esta organizacion");
    }

    state.users.unshift(user);
    syncDriverVehicleAssignment(user.id, user.vehicleId);

    return sanitizeUser(user);
  }

  function registerUser(payload) {
    const isCommercialOwner = String(payload.accountType || "").trim() === "company_owner";
    return createUser(payload, isCommercialOwner ? "owner" : "driver");
  }

  function updateUser(userId, payload) {
    const user = getUserById(userId);

    if (!user) {
      return null;
    }

    if (payload.email) {
      const nextEmail = ensureUniqueEmail(payload.email, user.id);
      if (nextEmail !== user.email) {
        user.email = nextEmail;
        user.credentialVersion = Number(user.credentialVersion || 0) + 1;
        user.emailChangedAt = new Date().toISOString();
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
      user.e2eeKeyRotatedAt = payload.e2eeKeyRotatedAt;
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
          user.suspendedAt = new Date().toISOString();
          user.reactivatedAt = null;
        } else {
          user.reactivatedAt = previousStatus === "suspended" && nextStatus === "active"
            ? new Date().toISOString()
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
      const orgId = user.organizationId || resolveOrganizationId(user, user.email);
      if (orgId && nextProfile.taxId) {
        const duplicateTaxId = state.users.some(
          (entry) => entry.id !== user.id && entry.organizationId === orgId && entry.companyProfile?.taxId === nextProfile.taxId
        );
        if (duplicateTaxId) throw new Error("El RFC ya esta registrado por otro usuario en esta organizacion");
      }
      user.companyProfile = nextProfile;
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
    }

    if (Object.prototype.hasOwnProperty.call(payload, "operationalSchedule")) {
      user.operationalSchedule = payload.operationalSchedule
        ? normalizeOperationalSchedule(payload.operationalSchedule)
        : null;
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
      user.activatedAt = payload.activatedAt || null;
    }

    if (payload.password && String(payload.password).trim()) {
      const nextPassword = String(payload.password).trim();
      const passwordError = validatePasswordStrength(nextPassword);

      if (passwordError) {
        throw new Error(passwordError);
      }

      user.passwordHash = bcrypt.hashSync(nextPassword, 10);
      user.credentialVersion = Number(user.credentialVersion || 0) + 1;
      user.passwordChangedAt = new Date().toISOString();
    }

    syncDriverVehicleAssignment(user.id, nextVehicleId);

    return sanitizeUser(user);
  }

  function deleteUser(userId) {
    const user = getUserById(userId);

    if (!user) {
      return false;
    }

    state.users = state.users.filter((entry) => entry.id !== userId);
    state.vehicles.forEach((vehicle) => {
      if (vehicle.driverId === userId) {
        vehicle.driverId = null;
      }

      if (vehicle.supervisorId === userId) {
        vehicle.supervisorId = null;
      }
    });

    state.conversations = state.conversations
      .map((conversation) => {
        const participants = conversation.participants.filter((participantId) => participantId !== userId);
        const unreadBy = { ...conversation.unreadBy };
        delete unreadBy[userId];

        return {
          ...conversation,
          participants,
          unreadBy
        };
      })
      .filter((conversation) => conversation.participants.length > 0);

    state.documents = state.documents.filter(
      (document) => !(document.ownerType === "driver" && document.ownerId === userId)
    );
    state.notifications.forEach((notification) => {
      notification.readBy = notification.readBy.filter((entry) => entry !== userId);
      if (Array.isArray(notification.targetUserIds)) {
        notification.targetUserIds = notification.targetUserIds.filter((entry) => entry !== userId);
      }
    });

    return true;
  }

  function authenticate(email, password) {
    const user = state.users.find(
      (entry) => entry.email.toLowerCase() === String(email).trim().toLowerCase()
    );

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

    user.lastAccessAt = new Date().toISOString();

    return sanitizeUser(user);
  }

  function getUserE2eeBackup(userId, deviceId = "") {
    const user = getUserById(userId);

    if (!user) {
      return null;
    }

    const backups = Array.isArray(user.e2eeBackups) ? user.e2eeBackups : [];
    const safeDeviceId = String(deviceId || "").trim();
    const targetBackup =
      backups.find((entry) => String(entry.deviceId || "").trim() === safeDeviceId) ||
      backups.slice().sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt))[0] ||
      null;

    return serializeE2eeBackupEntry(targetBackup, true);
  }

  function upsertUserE2eeBackup(userId, payload) {
    const user = getUserById(userId);
    const deviceId = String(payload?.deviceId || "").trim();

    if (!user) {
      throw new Error("Usuario no encontrado");
    }

    if (!deviceId) {
      throw new Error("deviceId es obligatorio para el respaldo E2EE");
    }

    const nextEntry = {
      deviceId,
      publicKey: String(payload.publicKey || user.e2eePublicKey || "").trim(),
      backupCipher: String(payload.backupCipher || "").trim(),
      backupVersion: String(payload.backupVersion || "secretbox-v1").trim() || "secretbox-v1",
      platform: String(payload.platform || "unknown").trim() || "unknown",
      label: String(payload.label || "").trim(),
      updatedAt: new Date().toISOString(),
      restoredAt: payload.restoredAt ? new Date(payload.restoredAt).toISOString() : null,
    };

    const previousEntries = Array.isArray(user.e2eeBackups) ? user.e2eeBackups : [];
    const filteredEntries = previousEntries.filter(
      (entry) => String(entry.deviceId || "").trim() !== deviceId
    );
    user.e2eeBackups = [nextEntry, ...filteredEntries].slice(0, 8);

    if (nextEntry.publicKey && nextEntry.publicKey !== user.e2eePublicKey) {
      user.e2eePublicKey = nextEntry.publicKey;
      user.e2eeKeyRotatedAt = nextEntry.updatedAt;
    }

    return serializeE2eeBackupEntry(nextEntry, true);
  }

  function getDocumentsForUser(user) {
    const userDocuments = state.documents.filter((document) => {
      const userOrganizationId = getUserOrganizationId(user);
      const documentOrganizationId = String(document.organizationId || "").trim();

      if (
        !canAccessAllOrganizations(user) &&
        (!documentOrganizationId || documentOrganizationId !== userOrganizationId)
      ) {
        return false;
      }

      if (document.deletedAt || document.supersededByDocumentId) {
        return false;
      }

      if (user.role !== "driver") {
        return true;
      }

      if (document.ownerType === "driver") {
        return document.ownerId === user.id;
      }

      return document.ownerType === "vehicle" && document.ownerId === user.vehicleId;
    });

    return clone(
      userDocuments
        .map((document) => enrichDocument(document))
        .sort((left, right) => new Date(left.expiresAt) - new Date(right.expiresAt))
    );
  }

  function listDocuments(filters = {}) {
    return clone(
      state.documents
        .filter((document) => {
          if (!filters.includeDeleted && document.deletedAt) {
            return false;
          }

          if (!filters.includeSuperseded && document.supersededByDocumentId) {
            return false;
          }

          if (filters.ownerType && document.ownerType !== filters.ownerType) {
            return false;
          }

          if (filters.reviewStatus && document.reviewStatus !== filters.reviewStatus) {
            return false;
          }

          if (
            filters.organizationId &&
            document.organizationId !== filters.organizationId
          ) {
            return false;
          }

          return true;
        })
        .map((document) => enrichDocument(document))
        .sort((left, right) => new Date(left.expiresAt) - new Date(right.expiresAt))
    );
  }

  function createDocument(payload) {
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

    if (ownerType === "driver" && !getUserById(ownerId)) {
      throw new Error("Propietario del documento no encontrado");
    }

    if (ownerType === "vehicle" && !getVehicleById(ownerId)) {
      throw new Error("Unidad del documento no encontrada");
    }

    const document = {
      id: randomUUID(),
      organizationId: String(payload.organizationId || "").trim(),
      ownerType,
      ownerId,
      name,
      category: String(payload.category || "evidence").trim().toLowerCase() || "evidence",
      status: getDocumentStatus(expiresAt),
      expiresAt: expiresAt.toISOString(),
      fileUrl: payload.fileUrl || null,
      storageType: String(payload.storageType || "local").trim() || "local",
      mimeType: String(payload.mimeType || "").trim(),
      fileSize: Math.max(0, Number(payload.fileSize) || 0),
      uploadedAt: new Date().toISOString(),
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
    };

    state.documents.unshift(document);

    return enrichDocument(findDocumentById(document.id));
  }

  function reviewDocument(documentId, payload) {
    const document = findDocumentById(documentId);

    if (
      !document ||
      document.deletedAt ||
      (payload.organizationId && document.organizationId !== payload.organizationId)
    ) {
      return null;
    }

    const nextReviewStatus = normalizeReviewStatus(String(payload.reviewStatus || "").trim());
    const nextReviewNotes = String(payload.reviewNotes || "").trim();
    if (document.reviewStatus === nextReviewStatus && document.reviewNotes === nextReviewNotes) {
      return { ...enrichDocument(document), reviewChanged: false };
    }
    document.reviewStatus = nextReviewStatus;
    document.reviewNotes = nextReviewNotes;
    document.reviewedBy = String(payload.reviewedBy || "").trim() || null;
    document.reviewedAt = new Date().toISOString();
    document.reviewVersion = Number(document.reviewVersion || 0) + 1;

    return { ...enrichDocument(document), reviewChanged: true };
  }

  function updateDocument(documentId, payload = {}) {
    const document = findDocumentById(documentId);
    if (
      !document ||
      document.deletedAt ||
      (payload.organizationId && document.organizationId !== payload.organizationId)
    ) {
      return null;
    }

    const expiresAt = payload.expiresAt === undefined
      ? new Date(document.expiresAt)
      : new Date(payload.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) {
      throw new Error("La fecha de vencimiento no es valida");
    }

    const nextName = payload.name === undefined ? document.name : String(payload.name || "").trim();
    const nextCategory = payload.category === undefined
      ? document.category
      : String(payload.category || "").trim().toLowerCase();
    if (!nextName || !nextCategory) {
      throw new Error("name, category y expiresAt son obligatorios");
    }

    const changed = nextName !== document.name ||
      nextCategory !== document.category ||
      expiresAt.toISOString() !== new Date(document.expiresAt).toISOString();
    if (!changed) return { ...enrichDocument(document), metadataChanged: false };

    document.name = nextName;
    document.category = nextCategory;
    document.expiresAt = expiresAt.toISOString();
    document.status = getDocumentStatus(expiresAt);
    document.reviewStatus = "pending_review";
    document.reviewNotes = "";
    document.reviewedBy = null;
    document.reviewedAt = null;
    document.reviewVersion = Number(document.reviewVersion || 0) + 1;
    return { ...enrichDocument(document), metadataChanged: true };
  }

  function replaceDocument(documentId, payload = {}) {
    const previous = findDocumentById(documentId);
    if (
      !previous ||
      previous.deletedAt ||
      previous.supersededByDocumentId ||
      (payload.organizationId && previous.organizationId !== payload.organizationId)
    ) {
      return null;
    }

    const expiresAt = new Date(payload.expiresAt || previous.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) {
      throw new Error("La fecha de vencimiento no es valida");
    }

    const replacementId = randomUUID();
    const replacement = {
      id: replacementId,
      organizationId: previous.organizationId,
      ownerType: previous.ownerType,
      ownerId: previous.ownerId,
      name: String(payload.name || previous.name).trim(),
      category: previous.category,
      status: getDocumentStatus(expiresAt),
      expiresAt: expiresAt.toISOString(),
      fileUrl: payload.fileUrl || null,
      storageType: String(payload.storageType || "local").trim() || "local",
      mimeType: String(payload.mimeType || "").trim(),
      fileSize: Math.max(0, Number(payload.fileSize) || 0),
      uploadedAt: new Date().toISOString(),
      uploadedBy: String(payload.uploadedBy || "").trim(),
      originalFileName: String(payload.originalFileName || payload.name || previous.name).trim(),
      storageKey: String(payload.storageKey || "").trim(),
      reviewStatus: "pending_review",
      reviewedAt: null,
      reviewedBy: null,
      reviewNotes: "",
      reviewVersion: 0,
      replacesDocumentId: previous.id,
      supersededByDocumentId: null,
      version: Math.max(1, Number(previous.version) || 1) + 1,
      deletedAt: null,
      deletedBy: null,
      deleteReason: "",
      assetDeletedAt: null,
      assetDeletionError: "",
      assetDeletionAttempts: 0
    };

    previous.supersededByDocumentId = replacementId;
    state.documents.unshift(replacement);
    return enrichDocument(replacement);
  }

  function listDocumentVersions(documentId, filters = {}) {
    const start = findDocumentById(documentId);
    if (!start || (filters.organizationId && start.organizationId !== filters.organizationId)) {
      return [];
    }

    const scoped = state.documents.filter((document) =>
      document.organizationId === start.organizationId
    );
    const included = new Set([start.id]);
    let changed = true;
    while (changed) {
      changed = false;
      scoped.forEach((document) => {
        if (
          included.has(document.replacesDocumentId) ||
          included.has(document.supersededByDocumentId)
        ) {
          if (!included.has(document.id)) {
            included.add(document.id);
            changed = true;
          }
        }
      });
    }

    return clone(
      scoped
        .filter((document) => included.has(document.id))
        .map((document) => enrichDocument(document))
        .sort((left, right) => Number(left.version || 1) - Number(right.version || 1))
    );
  }

  function softDeleteDocument(documentId, payload = {}) {
    const document = findDocumentById(documentId);
    if (!document || (payload.organizationId && document.organizationId !== payload.organizationId)) {
      return null;
    }

    if (!document.deletedAt) {
      document.deletedAt = new Date().toISOString();
      document.deletedBy = String(payload.deletedBy || "").trim() || null;
      document.deleteReason = String(payload.deleteReason || "").trim();
    }

    if (payload.assetDeletedAt) {
      document.assetDeletedAt = new Date(payload.assetDeletedAt).toISOString();
      document.assetDeletionError = "";
    }
    if (payload.assetDeletionError !== undefined) {
      document.assetDeletionError = String(payload.assetDeletionError || "").trim();
    }
    if (payload.recordAssetAttempt) {
      document.assetDeletionAttempts = Number(document.assetDeletionAttempts || 0) + 1;
    }

    return enrichDocument(document);
  }

  function getNotificationsForUser(user) {
    const organizationId = getUserOrganizationId(user);

    return clone(
      state.notifications
        .filter((notification) => {
          const targetRoles = Array.isArray(notification.targetRoles) ? notification.targetRoles : [];
          const targetUserIds = Array.isArray(notification.targetUserIds) ? notification.targetUserIds : [];

          return (
            canAccessOrganizationResource(user, notification) &&
            (targetUserIds.includes(user.id) || targetRoles.includes(user.role))
          );
        })
        .map((notification) => ({
          ...notification,
          isRead: notification.readBy.includes(user.id)
        }))
        .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
    );
  }

  function markNotificationAsRead(notificationId, userId) {
    const notification = state.notifications.find((entry) => entry.id === notificationId);
    const user = getUserById(userId);

    if (
      !notification ||
      !user ||
      !getNotificationsForUser(user).some((entry) => entry.id === notificationId)
    ) {
      return null;
    }

    if (!notification.readBy.includes(userId)) {
      notification.readBy.push(userId);
    }

    return clone(notification);
  }

  function createNotification(payload) {
    const notification = {
      id: randomUUID(),
      organizationId: String(payload.organizationId || "").trim(),
      title: String(payload.title || "").trim(),
      body: String(payload.body || "").trim(),
      level: String(payload.level || "info").trim() || "info",
      category: String(payload.category || "system").trim() || "system",
      targetRoles: Array.isArray(payload.targetRoles) ? clone(payload.targetRoles) : [],
      targetUserIds: Array.isArray(payload.targetUserIds) ? clone(payload.targetUserIds) : [],
      data: payload.data || null,
      createdAt: new Date().toISOString(),
      readBy: []
    };

    state.notifications.unshift(notification);
    return clone(notification);
  }

  function registerPushSubscription(userId, payload) {
    const user = getUserById(userId);

    if (!user) {
      throw new Error("Usuario no encontrado");
    }

    const token = String(payload.token || "").trim();

    if (!token) {
      throw new Error("El token del dispositivo es obligatorio");
    }

    user.pushSubscriptions = Array.isArray(user.pushSubscriptions) ? user.pushSubscriptions : [];
    const existingSubscription = user.pushSubscriptions.find((entry) => entry.token === token);
    const nextSubscription = {
      token,
      platform: String(payload.platform || "unknown").trim() || "unknown",
      deviceName: String(payload.deviceName || "").trim(),
      updatedAt: new Date().toISOString()
    };

    if (existingSubscription) {
      Object.assign(existingSubscription, nextSubscription);
    } else {
      user.pushSubscriptions.push(nextSubscription);
    }

    return true;
  }

  function unregisterPushSubscription(userId, token) {
    const user = getUserById(userId);

    if (!user || !Array.isArray(user.pushSubscriptions)) {
      return false;
    }

    user.pushSubscriptions = user.pushSubscriptions.filter((entry) => entry.token !== token);
    return true;
  }

  function listPushSubscriptionsForUsers(userIds = []) {
    const safeUserIds = new Set((Array.isArray(userIds) ? userIds : []).map((entry) => String(entry)));

    return clone(
      state.users.flatMap((user) =>
        safeUserIds.has(user.id) && Array.isArray(user.pushSubscriptions) ? user.pushSubscriptions : []
      )
    );
  }

  function listPushSubscriptionsForRoles(roles = [], organizationId = "") {
    const safeRoles = new Set((Array.isArray(roles) ? roles : []).map((entry) => String(entry)));
    const safeOrganizationId = String(organizationId || "").trim();

    return clone(
      state.users.flatMap((user) =>
        safeRoles.has(user.role) &&
        safeOrganizationId &&
        getUserOrganizationId(user) === safeOrganizationId &&
        Array.isArray(user.pushSubscriptions)
          ? user.pushSubscriptions
          : []
      )
    );
  }

  function recordAppEvent(payload) {
    const event = {
      id: randomUUID(),
      type: String(payload.type || "event").trim() || "event",
      scope: String(payload.scope || "system").trim() || "system",
      level: String(payload.level || "info").trim() || "info",
      status: String(payload.status || "ok").trim() || "ok",
      route: String(payload.route || "").trim(),
      method: String(payload.method || "").trim(),
      userId: payload.userId ? String(payload.userId).trim() : null,
      entityId: payload.entityId ? String(payload.entityId).trim() : null,
      message: String(payload.message || "").trim(),
      durationMs: Math.max(0, Number(payload.durationMs) || 0),
      metadata: payload.metadata || null,
      createdAt: new Date().toISOString()
    };

    state.appEvents.unshift(event);
    state.appEvents = state.appEvents.slice(0, 250);

    return clone(event);
  }

  function getAppConfig() {
    return state.appConfig ? clone(state.appConfig) : null;
  }

  function updateAppConfig(data) {
    const appConfig = state.appConfig || {};

    if (data.name !== undefined) appConfig.name = data.name;
    if (data.version !== undefined) appConfig.version = data.version;
    if (data.status !== undefined) appConfig.status = data.status;
    if (data.apkUrl !== undefined) appConfig.apkUrl = data.apkUrl;
    if (data.androidMin !== undefined) appConfig.androidMin = data.androidMin;
    if (data.size !== undefined) appConfig.size = data.size;
    if (data.releaseDate !== undefined) appConfig.releaseDate = data.releaseDate;
    if (data.releaseNotes !== undefined) appConfig.releaseNotes = Array.isArray(data.releaseNotes) ? data.releaseNotes : [];
    if (data.versionHistory !== undefined) appConfig.versionHistory = Array.isArray(data.versionHistory) ? data.versionHistory : [];

    state.appConfig = appConfig;
    return clone(state.appConfig);
  }

  state.deviceVersions = state.deviceVersions || {};

  function recordDeviceVersion(userId, versionInfo) {
    state.deviceVersions[userId] = {
      version: versionInfo.version || "0.0.0",
      buildNumber: versionInfo.buildNumber || "",
      platform: versionInfo.platform || "",
      deviceModel: versionInfo.deviceModel || "",
      lastLogin: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  function getDeviceVersionStats() {
    const versions = Object.values(state.deviceVersions);
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
      lastPublication: state.appConfig?.releaseDate || null
    };
  }

  function getOperationalInsights({ hours = 24, limit = 10 } = {}) {
    const safeHours = Math.max(1, Number(hours) || 24);
    const safeLimit = Math.max(1, Math.min(25, Number(limit) || 10));
    const since = Date.now() - safeHours * 60 * 60 * 1000;
    const recentEvents = state.appEvents.filter(
      (event) => new Date(event.createdAt).getTime() >= since
    );
    const recentRtcSessions = clone(
      state.rtcSessions
        .slice()
        .sort((left, right) => new Date(right.startedAt) - new Date(left.startedAt))
        .slice(0, 20)
    );
    const completedRtcSessions = recentRtcSessions.filter((entry) => entry.status === "completed");

    return {
      windowHours: safeHours,
      apiErrors: recentEvents.filter(
        (event) => event.scope === "api" && (event.type === "api_error" || ["danger", "critical"].includes(event.level))
      ).length,
      slowRequests: recentEvents.filter((event) => event.type === "api_slow").length,
      pushDelivered: recentEvents.filter((event) => event.type === "push_sent").length,
      pushFailed: recentEvents.filter((event) => event.type === "push_failed").length,
      checkoutEvents: recentEvents.filter((event) => event.scope === "commercial").length,
      activeCriticalIncidents: state.incidents.filter(
        (incident) => incident.status !== "resolved" && incident.severity === "critical"
      ).length,
      rtc: {
        recentSessions: recentRtcSessions.length,
        completedSessions: completedRtcSessions.length,
        averageDurationSeconds: completedRtcSessions.length
          ? Math.round(
              completedRtcSessions.reduce((sum, entry) => sum + Number(entry.durationSeconds || 0), 0) /
                completedRtcSessions.length
            )
          : 0
      },
      recentEvents: clone(recentEvents.slice(0, safeLimit))
    };
  }

  function getFleetSummary(user = null) {
    return state.vehicles
      .filter(
        (vehicle) =>
          !vehicle.retiredAt &&
          (
            !user ||
            (
              canAccessOrganizationResource(user, vehicle) &&
              (user.role !== "driver" || vehicle.id === user.vehicleId)
            )
          )
      )
      .map((vehicle) => {
        if (vehicle.location && vehicle.locationTimestamp) return enrichVehicle(vehicle);
        const position = state.routeSessionPositions
          .filter((entry) => entry.vehicleId === vehicle.id)
          .sort((left, right) => new Date(right.timestamp) - new Date(left.timestamp))[0];
        return enrichVehicle(position ? {
          ...vehicle,
          location: { latitude: position.latitude, longitude: position.longitude },
          locationTimestamp: position.timestamp,
          heading: position.heading ?? vehicle.heading,
          speed: position.speed ?? vehicle.speed
        } : vehicle);
      });
  }

  function getLiveLocations() {
    return {
      updatedAt: new Date().toISOString(),
      center: {
        latitude: 19.4326,
        longitude: -99.1332
      },
      routes: clone(state.routes),
      vehicles: getFleetSummary(),
      incidents: clone(
        state.incidents.filter((incident) => incident.status !== "resolved").map((incident) => ({
          ...incident,
          route: getRouteById(incident.routeId),
          vehicle: getVehicleById(incident.vehicleId)
        }))
      )
    };
  }

  function getDashboardOverview(user) {
    const fleet = getFleetSummary(user);
    const openIncidents = state.incidents.filter(
      (incident) =>
        incident.status !== "resolved" &&
        canAccessOrganizationResource(user, incident) &&
        (
          user.role !== "driver" ||
          incident.reporterId === user.id ||
          incident.vehicleId === user.vehicleId
        )
    );
    const activeVehicles = fleet.filter((vehicle) => vehicle.status === "on-route");
    const averageOccupancy = activeVehicles.length
      ? Math.round(
          activeVehicles.reduce(
            (sum, vehicle) => sum + vehicle.occupancy / vehicle.capacity,
            0
          ) * 100 / activeVehicles.length
        )
      : 0;
    const expiringDocuments = state.documents.filter(
      (document) =>
        canAccessOrganizationResource(user, document) &&
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
        value: `${Math.max(84, 96 - openIncidents.length * 4)}%`,
        trend: openIncidents.length > 1 ? "Atencion en ruta R-21" : "Operacion estable",
        tone: openIncidents.length > 1 ? "warning" : "positive"
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

    const driverVehicle = user.vehicleId ? getVehicleById(user.vehicleId) : null;
    const tailoredFleet =
      user.role === "driver" && driverVehicle
        ? fleet.filter((vehicle) => vehicle.id === driverVehicle.id)
        : fleet;

    const alerts = [
      ...openIncidents.map((incident) =>
        buildAlert(incident.title, incident.severity, {
          subtitle: incident.description,
          status: incident.status
        })
      ),
      ...expiringDocuments.slice(0, 2).map((document) =>
        buildAlert(document.name, document.status === "vencido" ? "danger" : "warning", {
          subtitle: `Vence ${new Date(document.expiresAt).toLocaleDateString("es-MX")}`,
          status: document.status
        })
      )
    ].slice(0, 5);

    return {
      hero: roleHero[user.role] || roleHero.admin,
      metrics: baseMetrics,
      fleet: tailoredFleet,
      alerts,
      notifications: getNotificationsForUser(user).slice(0, 4),
      shift: {
        label: user.shift,
        startedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
        nextCheckpointInMinutes: user.role === "driver" ? 12 : 18
      }
    };
  }

  function getUserProfile(userId) {
    const user = getUserById(userId);
    const assignedVehicle = user?.vehicleId ? getVehicleById(user.vehicleId) : null;
    const vehicle =
      assignedVehicle && canAccessOrganizationResource(user, assignedVehicle)
        ? enrichVehicle(assignedVehicle)
        : null;

    return {
      user: sanitizeUser(user),
      vehicle,
      documents: getDocumentsForUser(user)
    };
  }

  function listTripLogs({ vehicleId, serviceDate, limit = 12 }) {
    if (!vehicleId) {
      return [];
    }

    const safeServiceDate = isServiceDate(serviceDate) ? serviceDate : null;

    return clone(
      state.tripLogs
        .filter((tripLog) => {
          if (tripLog.vehicleId !== vehicleId) {
            return false;
          }

          if (!safeServiceDate) {
            return true;
          }

          return tripLog.serviceDate === safeServiceDate;
        })
        .sort((left, right) => new Date(right.finishedAt) - new Date(left.finishedAt))
        .slice(0, Math.max(1, Number(limit) || 12))
    );
  }

  function createTripLog(payload) {
    const vehicle = getVehicleById(payload.vehicleId);
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
    const startedAtIso = startedAt.toISOString();
    const finishedAtIso = finishedAt.toISOString();
    const existingTripLog = state.tripLogs.find(
      (tripLog) =>
        tripLog.vehicleId === vehicle.id &&
        tripLog.serviceDate === serviceDate &&
        tripLog.startedAt === startedAtIso &&
        tripLog.finishedAt === finishedAtIso
    );

    if (existingTripLog) {
      return clone(existingTripLog);
    }

    const lap =
      state.tripLogs.filter(
        (tripLog) => tripLog.vehicleId === vehicle.id && tripLog.serviceDate === serviceDate
      ).length + 1;

    const tripLog = {
      id: randomUUID(),
      organizationId: String(vehicle.organizationId || "").trim(),
      vehicleId: vehicle.id,
      vehicleCode: payload.vehicleCode || vehicle.code,
      lap,
      serviceDate,
      originLabel: String(payload.originLabel || "").trim(),
      destinationLabel: String(payload.destinationLabel || "").trim(),
      origin: clone(payload.origin),
      destination: clone(payload.destination),
      startedAt: startedAtIso,
      finishedAt: finishedAtIso,
      durationSeconds: Math.max(1, Number(payload.durationSeconds) || 0),
      distanceMeters: Math.max(0, Number(payload.distanceMeters) || 0),
      plannedDurationSeconds: Math.max(0, Number(payload.plannedDurationSeconds) || 0),
      provider: payload.provider || "system",
      registeredBy: payload.registeredBy
    };

    state.tripLogs.unshift(tripLog);

    return clone(getTripLogById(tripLog.id));
  }

  function createCommercialOrder(payload) {
    const plan = getCommercialPlanById(payload.planId);

    if (!plan) {
      throw new Error("Plan comercial no encontrado");
    }

    const pricing = getCommercialPlanPricing(plan, payload.selectedAddOns || []);

    const order = {
      id: payload.id || randomUUID(),
      referenceCode: payload.referenceCode || `MNCB-${String(state.commercialOrders.length + 1).padStart(4, "0")}`,
      ownerUserId: String(payload.ownerUserId || "").trim() || null,
      ownerAccountEmail: String(payload.ownerAccountEmail || payload.email || "")
        .trim()
        .toLowerCase(),
      accountStatus: String(payload.accountStatus || "registered").trim() || "registered",
      organizationId: resolveOrganizationId(payload, payload.ownerAccountEmail || payload.email),
      organizationSlug: String(payload.organizationSlug || payload.companyName || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, ""),
      companyName: String(payload.companyName || "").trim(),
      contactName: String(payload.contactName || "").trim(),
      email: String(payload.email || "").trim().toLowerCase(),
      phone: String(payload.phone || "").trim(),
      billingProfile: mergeCompanyProfile(null, payload, payload.email),
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
      currentPeriodStart: null,
      currentPeriodEnd: null,
      paidUntil: null,
      nextBillingAt: null,
      cancelAtPeriodEnd: false,
      cancelledAt: null,
      financialStatus: null,
      refundedAmountMinor: 0,
      refundReservedMinor: 0,
      refundableAmountMinor: 0,
      chargebackStatus: null,
      serviceSuspendedReason: null,
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
      createdAt: new Date().toISOString()
    };

    state.commercialOrders.unshift(order);

    return clone(getCommercialOrderById(order.id));
  }

  function updateCommercialOrder(orderId, payload) {
    const order = getCommercialOrderById(orderId);

    if (!order) {
      return null;
    }

    Object.entries(payload || {}).forEach(([key, value]) => {
      if (typeof value === "undefined") {
        return;
      }

      order[key] = value;
    });

    return clone(order);
  }

  function claimCheckoutCreation({ scope, keyHash, requestFingerprint, workerId, now = new Date() }) {
    const current = state.checkoutIdempotency.find((entry) => entry.scope === scope && entry.keyHash === keyHash);
    if (!current) {
      const reservation = buildCheckoutReservation({ scope, keyHash, requestFingerprint, workerId, now });
      state.checkoutIdempotency.push(reservation);
      return { claimed: true, reason: "new", reservation: clone(reservation) };
    }
    if (current.requestFingerprint !== requestFingerprint) return { claimed: false, reason: "key_reused", reservation: clone(current) };
    if (current.status === "ready") return { claimed: false, reason: "ready", reservation: clone(current) };
    if (current.status === "failed_permanent") return { claimed: false, reason: "permanent_failure", reservation: clone(current) };
    if (current.status === "provider_result_unknown") return { claimed: false, reason: "provider_result_unknown", reservation: clone(current) };
    const nowMs = new Date(now).getTime();
    const leaseExpired = new Date(current.leaseUntil || 0).getTime() <= nowMs;
    if (current.status !== "failed_retryable" && !leaseExpired) {
      return { claimed: false, reason: "currently_processing", reservation: clone(current) };
    }
    const reason = current.status === "failed_retryable" ? "retry" : "expired_lease";
    Object.assign(current, {
      status: "initializing",
      attemptCount: Number(current.attemptCount || 0) + 1,
      leaseOwner: workerId,
      leaseUntil: new Date(nowMs + CHECKOUT_LEASE_DURATION_MS).toISOString(),
      updatedAt: new Date(nowMs).toISOString(),
      lastErrorCode: null
    });
    return { claimed: true, reason, reservation: clone(current) };
  }

  function claimTrialEntitlement({ organizationId, orderId, planId, trialStartedAt, trialEndsAt }) {
    const current = state.trialEntitlements.find((entry) => entry.organizationId === organizationId);
    if (current) return { claimed: current.orderId === orderId, reason: current.orderId === orderId ? "claimed" : "trial_already_consumed", entitlement: clone(current) };
    const entitlement = { id: randomUUID(), organizationId, orderId, planId, status: "active", trialStartedAt, trialEndsAt, consumedAt: trialStartedAt, createdAt: trialStartedAt };
    state.trialEntitlements.push(entitlement);
    return { claimed: true, reason: "claimed", entitlement: clone(entitlement) };
  }

  function claimRefundOperation(payload) {
    const now = payload.now || new Date();
    const current = state.refundOperations.find((entry) => entry.organizationId === payload.organizationId && entry.idempotencyKeyHash === payload.idempotencyKeyHash);
    if (current) {
      if (current.requestFingerprint !== payload.requestFingerprint) return { claimed: false, reason: "key_reused", operation: clone(current) };
      if (current.status === "confirmed") return { claimed: false, reason: "ready", operation: clone(current) };
      if (current.status === "provider_result_unknown") return { claimed: false, reason: "provider_result_unknown", operation: clone(current) };
      if (current.status === "processing" && new Date(current.leaseUntil) > now) return { claimed: false, reason: "currently_processing", operation: clone(current) };
      Object.assign(current, { status: "processing", leaseOwner: payload.workerId, leaseUntil: new Date(now.getTime() + 60_000).toISOString(), attemptCount: Number(current.attemptCount || 0) + 1 });
      return { claimed: true, reason: "recovered", operation: clone(current) };
    }
    const operation = { id: randomUUID(), provider: "mercado_pago", ...payload, status: "processing", requestedAt: now.toISOString(), leaseOwner: payload.workerId, leaseUntil: new Date(now.getTime() + 60_000).toISOString(), attemptCount: 1 };
    state.refundOperations.push(operation);
    return { claimed: true, reason: "new", operation: clone(operation) };
  }

  function completeRefundOperation({ operationId, workerId, providerRefundId, safeResponse }) {
    const operation = state.refundOperations.find((entry) => entry.id === operationId && entry.leaseOwner === workerId && entry.status === "processing");
    if (!operation) return null;
    Object.assign(operation, { status: "confirmed", providerRefundId, safeResponse, confirmedAt: new Date().toISOString(), leaseOwner: null, leaseUntil: null });
    return clone(operation);
  }

  function failRefundOperation({ operationId, workerId, status, errorCode }) {
    const operation = state.refundOperations.find((entry) => entry.id === operationId && entry.leaseOwner === workerId && entry.status === "processing");
    if (!operation) return null;
    Object.assign(operation, { status, lastErrorCode: errorCode, failedAt: new Date().toISOString(), leaseOwner: null, leaseUntil: null });
    return clone(operation);
  }

  const listRefundOperations = (orderId) => clone(state.refundOperations.filter((entry) => entry.orderId === orderId));
  function upsertChargeback(payload) {
    let record = state.chargebacks.find((entry) => entry.provider === payload.provider && entry.providerChargebackId === payload.providerChargebackId);
    if (record) Object.assign(record, payload);
    else { record = { id: randomUUID(), openedAt: payload.updatedAt, ...payload }; state.chargebacks.push(record); }
    return clone(record);
  }
  const listChargebacks = (orderId) => clone(state.chargebacks.filter((entry) => entry.orderId === orderId));
  const findCommercialOrderByProviderPaymentId = (paymentId) => clone(state.commercialOrders.find((entry) => entry.providerPaymentId === paymentId) || null);
  function reserveRefundAmount({ orderId, organizationId, amountMinor, paidAmountMinor }) {
    const order = state.commercialOrders.find((entry) => entry.id === orderId && entry.organizationId === organizationId && entry.paymentStatus === "paid");
    if (!order || Number(order.refundReservedMinor || 0) + amountMinor > paidAmountMinor) return null;
    order.refundReservedMinor = Number(order.refundReservedMinor || 0) + amountMinor;
    return clone(order);
  }

  function completeCheckoutCreation({ reservationId, workerId, safeResponse }) {
    const reservation = state.checkoutIdempotency.find((entry) => entry.id === reservationId);
    if (!reservation || reservation.status !== "initializing" || reservation.leaseOwner !== workerId) return null;
    Object.assign(reservation, { status: "ready", safeResponse: clone(safeResponse), readyAt: new Date().toISOString(), updatedAt: new Date().toISOString(), leaseOwner: null, leaseUntil: null });
    return clone(reservation);
  }

  function failCheckoutCreation({ reservationId, workerId, status, errorCode }) {
    const reservation = state.checkoutIdempotency.find((entry) => entry.id === reservationId);
    if (!reservation || reservation.status !== "initializing" || reservation.leaseOwner !== workerId) return null;
    Object.assign(reservation, { status, lastErrorCode: errorCode, failedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), leaseOwner: null, leaseUntil: null });
    return clone(reservation);
  }

  function applyPaymentTransitionAtomically({ orderId, provider, paymentId, incomingStatus, confirmation }) {
    const order = getCommercialOrderById(orderId);
    if (!order) return { applied: false, reason: "order_not_found", shouldActivate: false, shouldNotify: false };
    const conflict = state.commercialOrders.find(
      (candidate) => candidate.id !== orderId && candidate.providerPaymentId === paymentId
    );
    if (conflict || (order.providerPaymentId && order.providerPaymentId !== paymentId)) {
      return { applied: false, reason: "payment_linked_elsewhere", shouldActivate: false, shouldNotify: false };
    }
    const normalized = incomingStatus === "approved" ? "paid" : String(incomingStatus || "").toLowerCase();
    const transitionKey = `${paymentId}:${normalized}`;
    order.appliedPaymentTransitions = Array.isArray(order.appliedPaymentTransitions) ? order.appliedPaymentTransitions : [];
    if (order.appliedPaymentTransitions.includes(transitionKey)) {
      return { applied: false, reason: "already_applied", shouldActivate: false, shouldNotify: false, order: clone(order) };
    }
    if (order.paymentStatus === "paid" && normalized !== "paid") {
      return { applied: false, reason: "stale_transition", shouldActivate: false, shouldNotify: false, order: clone(order) };
    }
    if (!["pending", "paid", "rejected", "cancelled"].includes(normalized)) {
      return { applied: false, reason: "unknown_status", shouldActivate: false, shouldNotify: false, order: clone(order) };
    }
    const shouldActivate = normalized === "paid" && order.paymentStatus !== "paid";
    order.providerPaymentId = paymentId;
    order.paymentProvider = provider;
    order.paymentProviderReference = paymentId;
    order.paymentExternalReference = confirmation.paymentExternalReference;
    order.paymentStatus = normalized;
    order.paymentApprovedAt = normalized === "paid" ? confirmation.approvedAt : null;
    order.activationStatus = normalized === "paid" ? "ready_for_activation" : "pending_payment";
    order.appliedPaymentTransitions.push(transitionKey);
    if (shouldActivate) {
      order.paymentEffectsStatus = "pending";
      order.paymentEffectsTransition = transitionKey;
    }
    return { applied: true, previousStatus: shouldActivate ? "pending" : null, currentStatus: normalized, shouldActivate, shouldNotify: true, transitionKey, order: clone(order) };
  }

  function claimPaymentEffects({ orderId, transitionKey, workerId, leaseUntil, now = new Date() }) {
    const order = getCommercialOrderById(orderId);
    const expired = order?.paymentEffectsStatus === "processing" && new Date(order.paymentEffectsLeaseUntil || 0) <= now;
    if (!order || order.paymentEffectsTransition !== transitionKey || (!expired && order.paymentEffectsStatus !== "pending")) {
      return { claimed: false, order: clone(order) };
    }
    order.paymentEffectsStatus = "processing";
    order.paymentEffectsLeaseUntil = leaseUntil;
    order.paymentEffectsWorker = workerId;
    return { claimed: true, order: clone(order) };
  }

  function completePaymentEffects({ orderId, transitionKey, updates = {} }) {
    const order = getCommercialOrderById(orderId);
    if (!order || order.paymentEffectsTransition !== transitionKey || order.paymentEffectsStatus !== "processing") return clone(order);
    Object.assign(order, updates, {
      paymentEffectsStatus: "completed",
      paymentEffectsCompletedAt: new Date().toISOString(),
      paymentEffectsLeaseUntil: null,
      paymentEffectsWorker: null
    });
    return clone(order);
  }

  function listCommercialOrders() {
    return clone(
      state.commercialOrders.sort(
        (left, right) => new Date(right.createdAt) - new Date(left.createdAt)
      )
    );
  }

  function listCommercialOrdersForUser(user) {
    const normalizedEmail = String(user?.email || "").trim().toLowerCase();
    const organizationId = getUserOrganizationId(user);

    return clone(
      state.commercialOrders
        .filter(
          (order) =>
            order.ownerUserId === user?.id ||
            order.ownerAccountEmail === normalizedEmail ||
            order.email === normalizedEmail ||
            (organizationId && String(order.organizationId || order.organizationSlug || "").trim() === organizationId)
        )
        .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
    );
  }

  function findCommercialOrderByExternalReference(externalReference) {
    return clone(
      state.commercialOrders.find(
        (order) =>
          order.paymentExternalReference === externalReference ||
          order.referenceCode === externalReference
      ) || null
    );
  }

  function listActivationKeysForCompany(companyId) {
    const safeCompanyId = String(companyId || "").trim();

    if (!safeCompanyId) {
      return [];
    }

    return clone(
      state.activationKeys
        .filter((entry) => String(entry.companyId || "").trim() === safeCompanyId)
        .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
    );
  }

  function findActivationKeyByKey(keyValue) {
    const normalizedKey = String(keyValue || "").trim().toUpperCase();

    if (!normalizedKey) {
      return null;
    }

    return clone(
      state.activationKeys.find((entry) => String(entry.key || "").toUpperCase() === normalizedKey) || null
    );
  }

  function createActivationKey(payload) {
    const key = String(payload.key || "").trim().toUpperCase();

    if (!key) {
      throw new Error("La key de activacion es obligatoria");
    }

    if (state.activationKeys.some((entry) => String(entry.key || "").toUpperCase() === key)) {
      throw new Error("La key de activacion ya existe");
    }

    const activationKey = {
      id: String(payload.id || "").trim() || randomUUID(),
      key,
      companyId: String(payload.companyId || "").trim(),
      adminId: String(payload.adminId || "").trim(),
      planId: String(payload.planId || "").trim(),
      orderId: String(payload.orderId || "").trim() || null,
      status: payload.status || "available",
      usedByDriverId: payload.usedByDriverId || null,
      usedByDriverState: payload.usedByDriverState || null,
      expiresAt: payload.expiresAt,
      usedAt: payload.usedAt || null,
      sharedAt: payload.sharedAt || null,
      sharedBy: payload.sharedBy || null,
      shareCount: payload.shareCount || 0,
      createdAt: payload.createdAt || new Date().toISOString()
    };

    state.activationKeys.unshift(activationKey);

    return clone(activationKey);
  }

  function listVehiclesForOrganization(organizationId, { includeRetired = false } = {}) {
    const scope = String(organizationId || "").trim();
    return state.vehicles
      .filter((vehicle) => String(vehicle.organizationId || "").trim() === scope)
      .filter((vehicle) => includeRetired || !vehicle.retiredAt)
      .map((vehicle) => enrichVehicle(vehicle));
  }

  function createActivationKeyWithinCapacity(payload, { maxDrivers } = {}) {
    const companyId = String(payload.companyId || "").trim();
    const limit = Math.max(0, Number(maxDrivers) || 0);
    const activeDrivers = state.users.filter(
      (entry) =>
        !entry.deletedAt &&
        entry.role === "driver" &&
        getUserOrganizationId(entry) === companyId &&
        normalizeUserStatus(entry.userStatus) !== "suspended"
    ).length;
    const availableKeys = state.activationKeys.filter(
      (entry) =>
        entry.companyId === companyId &&
        entry.status === "available" &&
        new Date(entry.expiresAt || 0).getTime() > Date.now()
    ).length;

    if (!limit || activeDrivers + availableKeys >= limit) {
      return { capacityExceeded: true, activationKey: null };
    }

    return {
      capacityExceeded: false,
      activationKey: createActivationKey(payload)
    };
  }

  function deleteActivationKey(activationKeyId) {
    const index = state.activationKeys.findIndex((entry) => entry.id === activationKeyId);

    if (index < 0) {
      return null;
    }

    const [activationKey] = state.activationKeys.splice(index, 1);
    return clone(activationKey);
  }

  function updateActivationKey(activationKeyId, payload, filter = {}) {
    const activationKey = state.activationKeys.find((entry) => entry.id === activationKeyId);

    if (!activationKey) {
      return null;
    }

    if (filter.companyId && activationKey.companyId !== filter.companyId) {
      return null;
    }

    if (filter.status && activationKey.status !== filter.status) {
      return null;
    }

    Object.entries(payload || {}).forEach(([key, value]) => {
      if (typeof value !== "undefined") {
        activationKey[key] = value;
      }
    });

    return clone(activationKey);
  }

  function markActivationKeyUsed(activationKeyId, { companyId, driverId }) {
    return updateActivationKey(
      activationKeyId,
      {
        status: "used",
        usedByDriverId: String(driverId || "").trim() || null,
        usedByDriverState: "active",
        usedAt: new Date().toISOString()
      },
      {
        companyId,
        status: "available"
      }
    );
  }

  function createRtcSession(payload) {
    const session = {
      id: randomUUID(),
      organizationId: String(payload.organizationId || "").trim(),
      roomId: String(payload.roomId || "").trim(),
      initiatedBy: String(payload.initiatedBy || "").trim() || null,
      participantUserIds: clone(payload.participantUserIds || []),
      participantNames: clone(payload.participantNames || []),
      startedAt: new Date().toISOString(),
      endedAt: null,
      durationSeconds: 0,
      status: "active",
      endReason: null,
      mode: payload.mode ? String(payload.mode) : null,
      usedRelay: null,
      sharedScreen: Boolean(payload.sharedScreen),
      offerCount: Math.max(0, Number(payload.offerCount) || 0),
      lastEventAt: new Date().toISOString()
    };

    state.rtcSessions.unshift(session);

    return clone(getRtcSessionById(session.id));
  }

  function updateRtcSession(sessionId, payload) {
    const session = getRtcSessionById(sessionId);

    if (!session) {
      return null;
    }

    Object.entries(payload || {}).forEach(([key, value]) => {
      if (typeof value === "undefined") {
        return;
      }

      session[key] = value;
    });

    if (session.startedAt && session.endedAt) {
      session.durationSeconds = Math.max(
        0,
        Math.round(
          (new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) / 1000
        )
      );
    }

    session.lastEventAt = new Date().toISOString();
    return clone(session);
  }

  function listRtcSessions({ roomId, limit = 20 } = {}) {
    return clone(
      state.rtcSessions
        .filter((session) => !roomId || session.roomId === roomId)
        .sort((left, right) => new Date(right.startedAt) - new Date(left.startedAt))
        .slice(0, Math.max(1, Number(limit) || 20))
    );
  }

  function listIncidents(user) {
    const incidents = state.incidents.filter(
      (incident) =>
        canAccessOrganizationResource(user, incident) &&
        (
          user.role !== "driver" ||
          incident.reporterId === user.id ||
          incident.vehicleId === user.vehicleId
        )
    );

    return clone(
      incidents
        .map((incident) => {
          const route = getRouteById(incident.routeId);
          const vehicle = getVehicleById(incident.vehicleId);
          const reporter = getUserById(incident.reporterId);

          return {
            ...incident,
            route: route && canAccessOrganizationResource(user, route) ? route : null,
            vehicle: vehicle && canAccessOrganizationResource(user, vehicle) ? vehicle : null,
            reporter: reporter && canAccessOrganizationResource(user, reporter) ? sanitizeUser(reporter) : null
          };
        })
        .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
    );
  }

  function createIncident(user, payload) {
    const assignedVehicleId =
      payload.vehicleId ||
      user.vehicleId ||
      state.vehicles.find((vehicle) => vehicle.driverId === user.id)?.id;
    const assignedVehicle = getVehicleById(assignedVehicleId);
    const requestedRoute = payload.routeId ? getRouteById(payload.routeId) : null;
    const routeId =
      (requestedRoute && canAccessOrganizationResource(user, requestedRoute) ? requestedRoute.id : null) ||
      (hasActiveAssignedRoute(assignedVehicle?.assignedRoute)
        ? normalizeRouteId(assignedVehicle.routeId)
        : null);

    const incident = {
      id: randomUUID(),
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
      createdAt: new Date().toISOString(),
      media: payload.media || []
    };

    state.incidents.unshift(incident);

    return clone(incident);
  }

  function createVehicle(payload) {
    const organizationId = String(payload.organizationId || "").trim();
    const code = String(payload.code || "").trim();
    const plate = String(payload.plate || "").trim().toUpperCase();
    if (state.vehicles.some((entry) => entry.organizationId === organizationId && entry.code.toLowerCase() === code.toLowerCase())) {
      throw new Error("El numero economico ya esta registrado en esta organizacion");
    }
    if (state.vehicles.some((entry) => entry.organizationId === organizationId && entry.plate.toUpperCase() === plate)) {
      throw new Error("Ya existe una unidad con esas placas en esta organizacion");
    }
    const vehicle = {
      id: String(payload.id || "").trim() || randomUUID(),
      organizationId,
      code,
      plate,
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
      updatedAt: new Date().toISOString(),
      location: payload.location || null,
      assignedRoute: null,
      retiredAt: null,
      retiredBy: null,
      retirementReason: ""
    };

    if (!vehicle.code || !vehicle.plate) {
      throw new Error("Codigo y placa de unidad son obligatorios");
    }

    state.vehicles.unshift(vehicle);

    if (vehicle.driverId) {
      const driver = getUserById(vehicle.driverId);

      if (driver) {
        driver.vehicleId = vehicle.id;
      }
    }

    return enrichVehicle(vehicle);
  }

  function claimVehicleForDriver(vehicleId, { organizationId, driverId } = {}) {
    const vehicle = getVehicleById(vehicleId);

    if (!vehicle) {
      return null;
    }

    if (organizationId && String(vehicle.organizationId || "").trim() !== String(organizationId).trim()) {
      return null;
    }

    if (String(vehicle.status || "").trim().toLowerCase() !== "available") {
      return null;
    }

    if (vehicle.driverId && vehicle.driverId !== driverId) {
      return null;
    }

    vehicle.driverId = driverId;
    vehicle.status = "assigned";
    vehicle.updatedAt = new Date().toISOString();

    return clone(vehicle);
  }

  function releaseVehicleFromDriver(vehicleId, driverId) {
    const vehicle = getVehicleById(vehicleId);

    if (!vehicle || vehicle.driverId !== driverId) {
      return null;
    }

    vehicle.driverId = null;
    vehicle.status = vehicle.status === "assigned" ? "available" : vehicle.status;
    vehicle.updatedAt = new Date().toISOString();

    return clone(vehicle);
  }

  function getDriverLifecycleDependencies(userId, organizationId) {
    const user = getUserById(userId);

    if (!user || getUserOrganizationId(user) !== String(organizationId || "").trim()) {
      return null;
    }

    const vehicle = user.vehicleId ? getVehicleById(user.vehicleId) : null;
    const activeSession = vehicle ? getActiveRouteSession(vehicle.id) : null;
    const documents = state.documents.filter(
      (entry) =>
        entry.organizationId === organizationId &&
        entry.ownerType === "driver" &&
        entry.ownerId === userId
    );
    const historicalSessions = state.routeSessions.filter(
      (entry) => entry.organizationId === organizationId && entry.driverId === userId
    );

    return clone({
      user: sanitizeUser(user),
      vehicle: vehicle ? enrichVehicle(vehicle) : null,
      activeSession,
      documentCount: documents.length,
      historicalSessionCount: historicalSessions.length
    });
  }

  function getVehicleLifecycleDependencies(vehicleId, organizationId) {
    const vehicle = getVehicleById(vehicleId);

    if (!vehicle || String(vehicle.organizationId || "").trim() !== String(organizationId || "").trim()) {
      return null;
    }

    const routeSessions = state.routeSessions.filter(
      (entry) => entry.organizationId === organizationId && entry.vehicleId === vehicleId
    );
    const positionCount = state.routeSessionPositions.filter((entry) => entry.vehicleId === vehicleId).length;
    const documentCount = state.documents.filter(
      (entry) => entry.organizationId === organizationId && entry.ownerType === "vehicle" && entry.ownerId === vehicleId
    ).length;
    const incidentCount = state.incidents.filter(
      (entry) => entry.organizationId === organizationId && entry.vehicleId === vehicleId
    ).length;
    const tripLogCount = state.tripLogs.filter(
      (entry) => entry.organizationId === organizationId && entry.vehicleId === vehicleId
    ).length;

    return clone({
      vehicle: enrichVehicle(vehicle),
      driver: vehicle.driverId ? sanitizeUser(getUserById(vehicle.driverId)) : null,
      activeSession: getActiveRouteSession(vehicleId),
      routeSessionCount: routeSessions.length,
      positionCount,
      documentCount,
      incidentCount,
      tripLogCount
    });
  }

  function changeDriverVehicle({ organizationId, userId, vehicleId = null }) {
    const user = getUserById(userId);
    const scope = String(organizationId || "").trim();

    if (!user || user.deletedAt || getUserOrganizationId(user) !== scope || user.role !== "driver") {
      return { ok: false, code: "not_found" };
    }

    if (normalizeUserStatus(user.userStatus) === "suspended") {
      return { ok: false, code: "suspended" };
    }

    const previousVehicle = user.vehicleId ? getVehicleById(user.vehicleId) : null;
    if (previousVehicle && getActiveRouteSession(previousVehicle.id)) {
      return { ok: false, code: "active_session" };
    }

    if (vehicleId === user.vehicleId) {
      return {
        ok: true,
        changed: false,
        user: sanitizeUser(user),
        previousVehicle: previousVehicle ? enrichVehicle(previousVehicle) : null,
        vehicle: previousVehicle ? enrichVehicle(previousVehicle) : null
      };
    }

    const nextVehicle = vehicleId ? getVehicleById(vehicleId) : null;
    if (vehicleId && (!nextVehicle || nextVehicle.retiredAt || String(nextVehicle.organizationId || "").trim() !== scope)) {
      return { ok: false, code: "vehicle_not_found" };
    }
    if (
      nextVehicle &&
      (nextVehicle.status !== "available" || (nextVehicle.driverId && nextVehicle.driverId !== userId))
    ) {
      return { ok: false, code: "vehicle_taken" };
    }

    if (nextVehicle) {
      nextVehicle.driverId = userId;
      nextVehicle.status = "assigned";
      nextVehicle.updatedAt = new Date().toISOString();
    }
    if (previousVehicle && previousVehicle.id !== vehicleId && previousVehicle.driverId === userId) {
      previousVehicle.driverId = null;
      previousVehicle.status = previousVehicle.status === "assigned" ? "available" : previousVehicle.status;
      previousVehicle.updatedAt = new Date().toISOString();
    }
    user.vehicleId = vehicleId || null;
    user.fleetLifecycleVersion = Number(user.fleetLifecycleVersion || 0) + 1;

    return {
      ok: true,
      changed: true,
      user: sanitizeUser(user),
      previousVehicle: previousVehicle ? enrichVehicle(previousVehicle) : null,
      vehicle: nextVehicle ? enrichVehicle(nextVehicle) : null
    };
  }

  function offboardDriverState({ actorId, organizationId, reason, userId }) {
    const user = getUserById(userId);
    const scope = String(organizationId || "").trim();

    if (!user || user.deletedAt || getUserOrganizationId(user) !== scope || user.role !== "driver") {
      return { ok: false, code: "not_found" };
    }

    const vehicle = user.vehicleId ? getVehicleById(user.vehicleId) : null;
    if (vehicle && getActiveRouteSession(vehicle.id)) {
      return { ok: false, code: "active_session" };
    }

    const alreadyOffboarded = normalizeUserStatus(user.userStatus) === "suspended" && !user.vehicleId;
    if (vehicle?.driverId === userId) {
      vehicle.driverId = null;
      vehicle.status = vehicle.status === "assigned" ? "available" : vehicle.status;
      vehicle.updatedAt = new Date().toISOString();
    }

    const now = new Date().toISOString();
    user.vehicleId = null;
    user.userStatus = "suspended";
    user.status = "offline";
    user.suspendedAt = user.suspendedAt || now;
    user.offboardedAt = user.offboardedAt || now;
    user.offboardedBy = user.offboardedBy || actorId || null;
    user.offboardReason = user.offboardReason || String(reason || "").trim();
    user.accountStatusVersion = Number(user.accountStatusVersion || 0) + (alreadyOffboarded ? 0 : 1);
    user.fleetLifecycleVersion = Number(user.fleetLifecycleVersion || 0) + (alreadyOffboarded ? 0 : 1);

    return {
      ok: true,
      changed: !alreadyOffboarded,
      user: sanitizeUser(user),
      releasedVehicle: vehicle ? enrichVehicle(vehicle) : null
    };
  }

  function reactivateDriverWithinCapacity({ organizationId, userId, maxDrivers }) {
    const user = getUserById(userId);
    const scope = String(organizationId || "").trim();

    if (!user || user.deletedAt || getUserOrganizationId(user) !== scope || user.role !== "driver") {
      return { ok: false, code: "not_found" };
    }
    if (normalizeUserStatus(user.userStatus) !== "suspended") {
      return { ok: true, changed: false, user: sanitizeUser(user) };
    }

    const activeDrivers = state.users.filter(
      (entry) =>
        !entry.deletedAt && entry.role === "driver" && getUserOrganizationId(entry) === scope &&
        normalizeUserStatus(entry.userStatus) !== "suspended"
    ).length;
    const availableKeys = state.activationKeys.filter(
      (entry) => entry.companyId === scope && entry.status === "available" && new Date(entry.expiresAt || 0).getTime() > Date.now()
    ).length;

    if (activeDrivers + availableKeys >= Math.max(0, Number(maxDrivers) || 0)) {
      return { ok: false, code: "capacity" };
    }

    user.userStatus = "active";
    user.status = "offline";
    user.vehicleId = null;
    user.suspendedAt = null;
    user.reactivatedAt = new Date().toISOString();
    user.accountStatusVersion = Number(user.accountStatusVersion || 0) + 1;
    user.fleetLifecycleVersion = Number(user.fleetLifecycleVersion || 0) + 1;

    return { ok: true, changed: true, user: sanitizeUser(user) };
  }

  function deleteDriverSafely({ actorId, organizationId, reason, userId }) {
    const user = getUserById(userId);
    const scope = String(organizationId || "").trim();

    if (!user || user.deletedAt || getUserOrganizationId(user) !== scope || user.role !== "driver") {
      return { ok: false, code: "not_found" };
    }
    if (normalizeUserStatus(user.userStatus) !== "suspended") return { ok: false, code: "not_suspended" };
    if (user.vehicleId) return { ok: false, code: "vehicle_assigned" };
    if (state.routeSessions.some((entry) => entry.driverId === userId && ["RUNNING", "PAUSED"].includes(entry.status))) {
      return { ok: false, code: "active_session" };
    }

    const now = new Date().toISOString();
    user.deletedAt = now;
    user.deletedBy = actorId || null;
    user.deleteReason = String(reason || "").trim();
    user.status = "offline";
    user.fleetLifecycleVersion = Number(user.fleetLifecycleVersion || 0) + 1;

    return { ok: true, user: sanitizeUser(user) };
  }

  function retireVehicle({ actorId, organizationId, reason, vehicleId }) {
    const impact = getVehicleLifecycleDependencies(vehicleId, organizationId);
    if (!impact) return { ok: false, code: "not_found" };
    if (impact.vehicle.driverId) return { ok: false, code: "driver_assigned" };
    if (impact.vehicle.routeId || impact.vehicle.assignedRoute) return { ok: false, code: "route_assigned" };
    if (impact.activeSession) return { ok: false, code: "active_session" };

    const vehicle = getVehicleById(vehicleId);
    if (vehicle.retiredAt) return { ok: true, changed: false, vehicle: enrichVehicle(vehicle) };
    vehicle.status = "retired";
    vehicle.retiredAt = new Date().toISOString();
    vehicle.retiredBy = actorId || null;
    vehicle.retirementReason = String(reason || "").trim();
    vehicle.updatedAt = vehicle.retiredAt;
    return { ok: true, changed: true, vehicle: enrichVehicle(vehicle) };
  }

  function deleteUnusedVehicle({ organizationId, vehicleId }) {
    const impact = getVehicleLifecycleDependencies(vehicleId, organizationId);
    if (!impact) return { ok: false, code: "not_found" };
    const historicalCount = impact.routeSessionCount + impact.positionCount + impact.documentCount + impact.incidentCount + impact.tripLogCount;
    if (impact.vehicle.driverId || impact.vehicle.routeId || impact.vehicle.assignedRoute || impact.activeSession || historicalCount > 0) {
      return { ok: false, code: "has_dependencies" };
    }
    return { ok: true, vehicle: deleteVehicle(vehicleId) };
  }

  function updateVehicle(vehicleId, payload) {
    const vehicle = getVehicleById(vehicleId);

    if (!vehicle) {
      return null;
    }

    const nextCode = typeof payload.code !== "undefined" ? String(payload.code || "").trim() : vehicle.code;
    const nextPlate = typeof payload.plate !== "undefined" ? String(payload.plate || "").trim().toUpperCase() : vehicle.plate;
    if (state.vehicles.some((entry) => entry.id !== vehicleId && entry.organizationId === vehicle.organizationId && entry.code.toLowerCase() === nextCode.toLowerCase())) {
      throw new Error("El numero economico ya esta registrado en esta organizacion");
    }
    if (state.vehicles.some((entry) => entry.id !== vehicleId && entry.organizationId === vehicle.organizationId && entry.plate.toUpperCase() === nextPlate.toUpperCase())) {
      throw new Error("Ya existe una unidad con esas placas en esta organizacion");
    }

    if (typeof payload.code !== "undefined") {
      vehicle.code = String(payload.code || "").trim();
    }

    if (typeof payload.plate !== "undefined") {
      vehicle.plate = String(payload.plate || "").trim().toUpperCase();
    }

    if (typeof payload.status !== "undefined") {
      vehicle.status = String(payload.status || "available").trim() || "available";
    }

    if (typeof payload.currentKilometers !== "undefined") {
      vehicle.currentKilometers = Math.max(0, Number(payload.currentKilometers) || 0);
    }

    if (!vehicle.code || !vehicle.plate) {
      throw new Error("Codigo y placa de unidad son obligatorios");
    }

    if (vehicle.status === "maintenance" && vehicle.driverId) {
      throw new Error("Libera al conductor antes de poner la unidad en mantenimiento");
    }

    vehicle.updatedAt = new Date().toISOString();

    return enrichVehicle(vehicle);
  }

  function updateIncidentStatus(incidentId, status) {
    const incident = state.incidents.find((entry) => entry.id === incidentId);

    if (!incident) {
      return null;
    }

    incident.status = status;
    incident.updatedAt = new Date().toISOString();

    return clone(incident);
  }

  function getConversationById(conversationId) {
    const conversation = state.conversations.find((entry) => entry.id === conversationId) || null;
    return conversation ? ensureConversationRecord(conversation) : null;
  }

  function canUserAccessConversation(userId, conversationOrId) {
    const user = getUserById(userId);
    const conversation =
      typeof conversationOrId === "string"
        ? getConversationById(conversationOrId)
        : ensureConversationRecord(conversationOrId);
    const organizationId = getUserOrganizationId(user);

    return Boolean(
      user &&
      conversation &&
      organizationId &&
      String(conversation.organizationId || "").trim() === organizationId &&
      conversation.participants.includes(userId)
    );
  }

  function getConversationsForUser(userId) {
    return sortConversationsByActivity(
      state.conversations
        .map((conversation) => ensureConversationRecord(conversation))
        .filter((conversation) => canUserAccessConversation(userId, conversation))
        .map((conversation) => buildConversationSummary(conversation, userId))
    );
  }

  function getMessages(conversationId, userId, options = {}) {
    const conversation = getConversationById(conversationId);

    if (!canUserAccessConversation(userId, conversation)) {
      return null;
    }

    conversation.unreadBy[userId] = 0;

    const messages = getStoredConversationMessages(conversationId);

    if (options.paginated) {
      const page = paginateConversationMessages(messages, options);

      return clone({
        items: page.items.map((message) => serializeConversationMessage(message, conversationId)),
        pageInfo: page.pageInfo
      });
    }

    return clone(messages.map((message) => serializeConversationMessage(message, conversationId)));
  }

  function addMessage(conversationId, senderId, text) {
    const conversation = getConversationById(conversationId);

    if (!canUserAccessConversation(senderId, conversation)) {
      return null;
    }

    const message = buildStoredConversationMessage(senderId, text);
    const existingMessage = getStoredConversationMessages(conversationId).find(
      (entry) => entry.id === message.id
    );
    if (existingMessage) {
      return clone(serializeConversationMessage(existingMessage, conversationId));
    }

    storeConversationMessage(conversation, message);
    conversation.lastMessage = message;
    conversation.lastActivityAt = message.createdAt;
    conversation.messageCount = getStoredConversationMessages(conversationId).length;
    conversation.participants
      .filter((participantId) => participantId !== senderId)
      .forEach((participantId) => {
        conversation.unreadBy[participantId] = (conversation.unreadBy[participantId] || 0) + 1;
      });

    return clone(serializeConversationMessage(message, conversationId));
  }

  function canUserAccessChatMedia(userId, storageKey) {
    const mediaPath = `/api/chat/media/${encodeURIComponent(String(storageKey || "").trim())}`;

    return state.conversations
      .map((conversation) => ensureConversationRecord(conversation))
      .some(
        (conversation) =>
          canUserAccessConversation(userId, conversation) &&
          getStoredConversationMessages(conversation.id).some(
            (message) =>
              message.audioUrl === mediaPath ||
              message.imageUrl === mediaPath ||
              message.videoUrl === mediaPath
          )
      );
  }

  function markConversationMessageRead(conversationId, messageId, userId) {
    const conversation = getConversationById(conversationId);
    if (!canUserAccessConversation(userId, conversation)) return null;
    const message = getStoredConversationMessages(conversationId).find(
      (entry) => entry.id === messageId
    );
    if (!message) return null;
    message.status = "read";
    conversation.unreadBy[userId] = 0;
    return clone(serializeConversationMessage(message, conversationId));
  }

  function markConversationMessageDelivered(conversationId, messageId, userId) {
    const conversation = getConversationById(conversationId);
    if (!canUserAccessConversation(userId, conversation)) return null;
    const message = getStoredConversationMessages(conversationId).find(
      (entry) => entry.id === messageId
    );
    if (!message || message.senderId === userId) return null;
    if (message.status === 'sent') message.status = 'delivered';
    return clone(serializeConversationMessage(message, conversationId));
  }

  function listChatContactsForUser(userId) {
    const organizationId = getUserOrganizationId(getUserById(userId));
    const safeConversations = state.conversations.map((conversation) => ensureConversationRecord(conversation));

    return clone(
      state.users
        .filter(
          (user) =>
            user.id !== userId &&
            organizationId &&
            getUserOrganizationId(user) === organizationId
        )
        .map((user) => {
          const directConversation = safeConversations.find(
            (conversation) =>
              conversation.kind === "direct" &&
              conversation.channelMode === "chat" &&
              conversation.participants.includes(userId) &&
              conversation.participants.includes(user.id)
          );
          const radioConversation = safeConversations.find(
            (conversation) =>
              conversation.kind === "direct" &&
              conversation.channelMode === "radio" &&
              conversation.participants.includes(userId) &&
              conversation.participants.includes(user.id)
          );

          return {
            ...sanitizeUser(user),
            directConversationId: directConversation?.id || null,
            radioConversationId: radioConversation?.id || null
          };
        })
        .sort((left, right) => left.name.localeCompare(right.name, "es-MX"))
    );
  }

  function ensureGeneralConversation(userId, channelMode = "chat") {
    const normalizedChannelMode = normalizeConversationChannelMode(channelMode);
    const organizationId = getUserOrganizationId(getUserById(userId));
    const participantIds = state.users
      .filter((user) => getUserOrganizationId(user) === organizationId)
      .map((user) => user.id);
    let conversation = state.conversations
      .map((entry) => ensureConversationRecord(entry))
      .find(
        (entry) =>
          entry.kind === "group" &&
          entry.channelMode === normalizedChannelMode &&
          String(entry.organizationId || "").trim() === organizationId
      );

    if (!conversation) {
      conversation = ensureConversationRecord({
        id: `${normalizedChannelMode === "radio" ? "conversation-radio-general" : "conversation-ops"}:${organizationId}`,
        organizationId,
        title: normalizedChannelMode === "radio" ? "Radio general" : "General operativo",
        kind: "group",
        channelMode: normalizedChannelMode,
        description:
          normalizedChannelMode === "radio"
            ? "Canal general para voz, avisos y coordinacion inmediata."
            : "Canal grupal para anuncios y coordinacion del equipo.",
        encrypted: false,
        participants: participantIds,
        unreadBy: Object.fromEntries(participantIds.map((participantId) => [participantId, 0])),
        messages: [
          buildStoredConversationMessage(
            state.users.find((user) => participantIds.includes(user.id))?.id || userId,
            {
            text:
              normalizedChannelMode === "radio"
                ? "Canal de radio general listo para la operacion."
                : "Canal general operativo listo para el turno."
            }
          )
        ]
      });
      state.conversations.unshift(conversation);
    } else {
      conversation.participants = participantIds;
      conversation.unreadBy = {
        ...Object.fromEntries(participantIds.map((participantId) => [participantId, 0])),
        ...Object.fromEntries(
          Object.entries(conversation.unreadBy || {}).filter(([participantId]) => participantIds.includes(participantId))
        )
      };
    }

    return clone(buildConversationSummary(conversation, userId));
  }

  function ensureDirectConversation(userId, targetUserId, { channelMode = "chat" } = {}) {
    const safeTargetUserId = String(targetUserId || "").trim();

    if (!safeTargetUserId || safeTargetUserId === userId) {
      throw new Error("Selecciona otro participante para abrir el canal");
    }

    const sourceUser = getUserById(userId);
    const targetUser = getUserById(safeTargetUserId);

    if (!sourceUser || !targetUser) {
      throw new Error("Participante no encontrado");
    }

    const organizationId = getUserOrganizationId(sourceUser);

    if (!organizationId || getUserOrganizationId(targetUser) !== organizationId) {
      throw new Error("Participante no encontrado");
    }

    const normalizedChannelMode = normalizeConversationChannelMode(channelMode);
    const participantIds = [userId, safeTargetUserId].sort();
    let conversation = state.conversations
      .map((entry) => ensureConversationRecord(entry))
      .find(
        (entry) =>
          entry.kind === "direct" &&
          entry.channelMode === normalizedChannelMode &&
          entry.participants.length === 2 &&
          entry.participants.slice().sort().join("|") === participantIds.join("|")
      );

    if (!conversation) {
      conversation = ensureConversationRecord({
        id: randomUUID(),
        organizationId,
        title: normalizedChannelMode === "radio" ? `Radio directo: ${targetUser.name}` : `Directo: ${targetUser.name}`,
        kind: "direct",
        channelMode: normalizedChannelMode,
        description:
          normalizedChannelMode === "radio"
            ? `Canal de radio punto a punto entre ${sourceUser.name} y ${targetUser.name}.`
            : `Conversacion directa entre ${sourceUser.name} y ${targetUser.name}.`,
        encrypted: normalizedChannelMode === "chat",
        participants: [userId, safeTargetUserId],
        unreadBy: {
          [userId]: 0,
          [safeTargetUserId]: 0
        },
        messages: [
          buildStoredConversationMessage(userId, {
            text:
              normalizedChannelMode === "radio"
                ? `Canal de radio abierto con ${targetUser.name}.`
                : `Canal directo abierto con ${targetUser.name}.`
          })
        ]
      });
      state.conversations.unshift(conversation);
    }

    return clone(buildConversationSummary(conversation, userId));
  }

  function updateVehicleLocation({ vehicleId, coordinates, heading, speed, timestamp, temporal = null, packetId = null }) {
    const vehicle = getVehicleById(vehicleId);

    if (!vehicle) {
      return null;
    }

    const incomingTime = new Date(timestamp || temporal?.receivedAt || vehicle.updatedAt).getTime();
    const currentTime = vehicle.locationTimestamp
      ? new Date(vehicle.locationTimestamp).getTime()
      : vehicle.locationReceivedAt
        ? new Date(vehicle.locationReceivedAt).getTime()
        : -Infinity;
    if (packetId && vehicle.locationPacketId === packetId) {
      return { ...enrichVehicle(vehicle), locationUpdateApplied: false, locationUpdateReason: "duplicate" };
    }
    if (Number.isFinite(currentTime) && Number.isFinite(incomingTime) && incomingTime < currentTime) {
      return { ...enrichVehicle(vehicle), locationUpdateApplied: false, locationUpdateReason: "out_of_order" };
    }
    vehicle.location = {
      latitude: Number(coordinates.latitude),
      longitude: Number(coordinates.longitude)
    };
    vehicle.updatedAt = new Date().toISOString();

    if (typeof speed === "number") {
      vehicle.speed = speed;
    }

    if (typeof heading === "number" && Number.isFinite(heading)) {
      vehicle.heading = heading;
    }

    if (timestamp) {
      const parsedTimestamp = new Date(timestamp);

      if (!Number.isNaN(parsedTimestamp.getTime())) {
        vehicle.locationTimestamp = parsedTimestamp.toISOString();
      }
    }
    if (temporal) {
      vehicle.locationClientTimestamp = temporal.clientTimestamp;
      vehicle.locationReceivedAt = temporal.receivedAt;
      vehicle.locationTimestampSource = temporal.timestampSource;
      vehicle.locationClockSkewMs = temporal.clockSkewMs;
    }
    vehicle.locationPacketId = packetId || null;

    const routeProgress = calculateVehicleRouteProgress({
      coordinates: vehicle.location,
      heading: vehicle.heading,
      speed: vehicle.speed,
      timestamp: vehicle.locationTimestamp || vehicle.updatedAt,
      vehicle
    });
    vehicle.activeRouteProgress = routeProgress;

    if (routeProgress) {
      vehicle.etaMinutes = Math.max(0, Math.round(routeProgress.timeRemainingSeconds / 60));
    }

    return { ...enrichVehicle(vehicle), locationUpdateApplied: true, locationUpdateReason: "accepted" };
  }

  function assignRouteToVehicle({ vehicleId, routeId = null, assignment, assignedBy = null }) {
    const vehicle = getVehicleById(vehicleId);

    if (!vehicle) {
      return null;
    }

    let nextAssignment;
    let actualRouteId = null;

    if (routeId) {
      const route = getRouteById(routeId);
      nextAssignment = route ? assignedRouteFromSavedRoute(route, assignment, assignedBy) : null;
      if (!route || !nextAssignment) throw new Error("Ruta no encontrada");
      actualRouteId = route.id;
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
        assignedAt: new Date().toISOString(),
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

    vehicle.routeId = actualRouteId;
    vehicle.assignedRoute = nextAssignment;
    vehicle.updatedAt = new Date().toISOString();

    return enrichVehicle(vehicle);
  }

  function clearAssignedRouteFromVehicle(vehicleId) {
    const vehicle = getVehicleById(vehicleId);

    if (!vehicle) {
      return null;
    }

    vehicle.routeId = null;
    vehicle.assignedRoute = null;
    vehicle.updatedAt = new Date().toISOString();

    return enrichVehicle(vehicle);
  }

  function getActiveRouteSession(vehicleId) {
    const session = state.routeSessions.find(
      (entry) => entry.vehicleId === vehicleId && ["RUNNING", "PAUSED"].includes(entry.status)
    );
    return session ? clone(session) : null;
  }

  function getRouteSessionById(sessionId) {
    const session = state.routeSessions.find((entry) => entry.id === sessionId);
    return session ? clone(session) : null;
  }

  function listRouteSessions({ dateFrom, dateTo, driverId, organizationId, routeId, status, vehicleId, limit = 50, offset = 0, includeTotal = false } = {}) {
    const fromTime = dateFrom ? new Date(dateFrom).getTime() : null;
    const toTime = dateTo ? new Date(dateTo).getTime() : null;
    const normalizedStatus = status ? String(status).trim().toUpperCase() : "";

    const filtered = state.routeSessions
      .filter((entry) => {
          const startedAt = new Date(entry.startedAt).getTime();
          if (organizationId && entry.organizationId !== organizationId) return false;
          if (vehicleId && entry.vehicleId !== vehicleId) return false;
          if (driverId && entry.driverId !== driverId) return false;
          if (routeId && entry.routeId !== routeId) return false;
          if (normalizedStatus && entry.status !== normalizedStatus) return false;
          if (fromTime && startedAt < fromTime) return false;
          if (toTime && startedAt > toTime) return false;
          return true;
        })
      .sort((left, right) => new Date(right.startedAt) - new Date(left.startedAt));
    const safeLimit = Math.max(1, Math.min(5000, Number(limit) || 50));
    const safeOffset = Math.max(0, Number(offset) || 0);
    const items = clone(filtered.slice(safeOffset, safeOffset + safeLimit));
    return includeTotal ? { items, limit: safeLimit, offset: safeOffset, total: filtered.length } : items;
  }

  function createRouteSession(payload) {
    const active = getActiveRouteSession(payload.vehicleId);
    if (active) return { ...active, creationApplied: false };
    const now = new Date().toISOString();
    const session = { id: randomUUID(), ...clone(payload), activeKey: payload.vehicleId, status: "RUNNING", startedAt: payload.startedAt || now,
      finishedAt: null, statisticsReady: false, processingStatus: "PENDING", createdAt: now, updatedAt: now };
    state.routeSessions.push(session);
    return { ...clone(session), creationApplied: true };
  }

  function updateRouteSession(sessionId, payload) {
    const session = state.routeSessions.find((entry) => entry.id === sessionId);
    if (!session) return null;
    if (payload.expectedStatus && session.status !== payload.expectedStatus) return { ...clone(session), transitionApplied: false };
    const { expectedStatus, ...updates } = payload;
    Object.assign(session, clone(updates));
    if (["FINISHED", "CANCELLED"].includes(session.status)) session.activeKey = null;
    session.finishedAt = updates.finishedAt || session.finishedAt || null;
    session.updatedAt = new Date().toISOString();
    return { ...clone(session), transitionApplied: true };
  }

  function createRouteSessionPosition(payload) {
    if (payload.packetId) {
      const existing = state.routeSessionPositions.find(
        (entry) => entry.sessionId === payload.sessionId && entry.packetId === payload.packetId
      );
      if (existing) return { ...clone(existing), duplicateSkipped: true };
    }
    const position = { id: randomUUID(), ...clone(payload), createdAt: new Date().toISOString() };
    state.routeSessionPositions.push(position);
    return clone(position);
  }

  function listRouteSessionPositions({ sessionId, limit = 50, offset = 0, includeTotal = false }) {
    const filtered = state.routeSessionPositions
      .filter((entry) => !sessionId || entry.sessionId === sessionId)
      .sort((left, right) => new Date(right.timestamp) - new Date(left.timestamp));
    const safeLimit = Math.max(1, Math.min(50000, Number(limit) || 50));
    const safeOffset = Math.max(0, Number(offset) || 0);
    const items = clone(filtered.slice(safeOffset, safeOffset + safeLimit));
    return includeTotal ? { items, limit: safeLimit, offset: safeOffset, total: filtered.length } : items;
  }

  function claimAutoRouteProcessing({ sessionId, organizationId, algorithmVersion }) {
    const id = `${sessionId}:${algorithmVersion}`;
    const existing = state.autoRouteProcessing.find((entry) => entry.id === id);
    if (existing) return { ...clone(existing), claimed: false };
    const now = new Date().toISOString();
    const record = { id, sessionId, organizationId, algorithmVersion, status: "PROCESSING", reason: null,
      candidateId: null, createdAt: now, updatedAt: now };
    state.autoRouteProcessing.push(record);
    return { ...clone(record), claimed: true };
  }

  function completeAutoRouteProcessing(id, payload) {
    const record = state.autoRouteProcessing.find((entry) => entry.id === id);
    if (!record) return null;
    Object.assign(record, clone(payload), { updatedAt: new Date().toISOString() });
    return clone(record);
  }

  function upsertLearnedRouteCandidate(payload) {
    let candidate = state.learnedRouteCandidates.find(
      (entry) => entry.organizationId === payload.organizationId && entry.groupKey === payload.groupKey
    );
    const now = new Date().toISOString();
    if (!candidate) {
      candidate = { id: randomUUID(), ...clone(payload), evidenceSessionIds: [], evidenceVehicleIds: [],
        evidenceCount: 0, vehicleCount: 0,
        confidence: 0, status: "COLLECTING", approvedRouteId: null, reviewedBy: null,
        reviewedAt: null, rejectionReason: null, createdAt: now, updatedAt: now };
      state.learnedRouteCandidates.push(candidate);
    }
    if (!candidate.evidenceSessionIds.includes(payload.sessionId)) {
      candidate.evidenceSessionIds.push(payload.sessionId);
      if (!candidate.evidenceVehicleIds.includes(payload.vehicleId)) {
        candidate.evidenceVehicleIds.push(payload.vehicleId);
      }
      candidate.evidenceCount = candidate.evidenceSessionIds.length;
      candidate.vehicleCount = candidate.evidenceVehicleIds.length;
      candidate.distanceMeters = Math.round(((candidate.distanceMeters || 0) * (candidate.evidenceCount - 1) + payload.distanceMeters) / candidate.evidenceCount);
      candidate.durationSeconds = Math.round(((candidate.durationSeconds || 0) * (candidate.evidenceCount - 1) + payload.durationSeconds) / candidate.evidenceCount);
      candidate.confidence = Math.min(1, candidate.evidenceCount / payload.minimumEvidenceCount);
      if (candidate.evidenceCount >= payload.minimumEvidenceCount && candidate.status === "COLLECTING") {
        candidate.status = "READY_FOR_REVIEW";
      }
      candidate.updatedAt = now;
    }
    return clone(candidate);
  }

  function listLearnedRouteCandidates({ organizationId, status } = {}) {
    return clone(state.learnedRouteCandidates.filter((entry) =>
      (!organizationId || entry.organizationId === organizationId) && (!status || entry.status === status)
    ));
  }

  function getLearnedRouteCandidateById(id) {
    return clone(state.learnedRouteCandidates.find((entry) => entry.id === id) || null);
  }

  function updateLearnedRouteCandidate(id, payload) {
    const candidate = state.learnedRouteCandidates.find((entry) => entry.id === id);
    if (!candidate) return null;
    Object.assign(candidate, clone(payload), { updatedAt: new Date().toISOString() });
    return clone(candidate);
  }

  function getLastRouteEvent(sessionId, eventType = null) {
    return clone(
      state.routeEvents
        .filter((entry) => entry.sessionId === sessionId && (!eventType || entry.eventType === eventType))
        .sort((left, right) => new Date(right.timestamp) - new Date(left.timestamp))[0] || null
    );
  }

  function createRouteEvent(payload) {
    const lastEvent = getLastRouteEvent(payload.sessionId);
    if (lastEvent?.eventType === payload.eventType) {
      return { ...lastEvent, duplicateSkipped: true };
    }

    const event = {
      id: String(payload.id || "").trim() || randomUUID(),
      organizationId: String(payload.organizationId || "").trim(),
      sessionId: String(payload.sessionId || "").trim(),
      vehicleId: String(payload.vehicleId || "").trim(),
      routeId: String(payload.routeId || "").trim(),
      driverId: String(payload.driverId || "").trim(),
      eventType: String(payload.eventType || "").trim(),
      timestamp: payload.timestamp || new Date().toISOString(),
      latitude: Number.isFinite(Number(payload.latitude)) ? Number(payload.latitude) : null,
      longitude: Number.isFinite(Number(payload.longitude)) ? Number(payload.longitude) : null,
      metadata: payload.metadata ? clone(payload.metadata) : null,
      createdAt: new Date().toISOString()
    };

    state.routeEvents.push(event);
    return clone(event);
  }

  function listRouteEvents({ sessionId, eventType, limit = 500 }) {
    return clone(
      state.routeEvents
        .filter((entry) => (!sessionId || entry.sessionId === sessionId) && (!eventType || entry.eventType === eventType))
        .sort((left, right) => new Date(left.timestamp) - new Date(right.timestamp))
        .slice(0, Math.max(1, Math.min(50000, Number(limit) || 500)))
    );
  }

  function createCheckpointVisit(payload) {
    const sessionId = String(payload.sessionId || "").trim();
    const checkpointId = String(payload.checkpointId || "").trim();
    const previousVisit = state.checkpointVisits
      .filter((entry) => entry.sessionId === sessionId)
      .sort((left, right) => right.visitOrder - left.visitOrder || new Date(right.timestamp) - new Date(left.timestamp))[0];

    if (previousVisit?.checkpointId === checkpointId) {
      return { ...clone(previousVisit), duplicateSkipped: true };
    }

    const visitOrder = Math.max(
      Math.max(
        0,
        ...state.checkpointVisits
          .filter((entry) => entry.sessionId === sessionId)
          .map((entry) => Number(entry.visitOrder) || 0)
      ) + 1,
      Number(payload.visitOrder) || 1
    );

    const visit = {
      id: String(payload.id || "").trim() || randomUUID(),
      organizationId: String(payload.organizationId || "").trim(),
      sessionId,
      checkpointId,
      timestamp: payload.timestamp || new Date().toISOString(),
      distance: Number.isFinite(Number(payload.distance)) ? Number(payload.distance) : null,
      visitOrder,
      latitude: Number.isFinite(Number(payload.latitude)) ? Number(payload.latitude) : null,
      longitude: Number.isFinite(Number(payload.longitude)) ? Number(payload.longitude) : null,
      createdAt: new Date().toISOString()
    };

    state.checkpointVisits.push(visit);
    return clone(visit);
  }

  function listCheckpointVisits({ sessionId, limit = 500 }) {
    return clone(
      state.checkpointVisits
        .filter((entry) => !sessionId || entry.sessionId === sessionId)
        .sort((left, right) => left.visitOrder - right.visitOrder || new Date(left.timestamp) - new Date(right.timestamp))
        .slice(0, Math.max(1, Math.min(50000, Number(limit) || 500)))
    );
  }

  function countPlatformOwners() {
    return state.platformUsers.filter((u) => u.role === "platform_owner").length;
  }

  function countVehiclesByStatus() {
    const on_route = state.vehicles.filter((v) => v.status === "on-route" || v.status === "on_route").length;
    const maintenance = state.vehicles.filter((v) => v.status === "maintenance").length;
    const idle = state.vehicles.length - on_route - maintenance;
    return { total: state.vehicles.length, on_route, maintenance, idle };
  }

  function getPlatformUserById(userId) {
    return state.platformUsers.find((u) => u.id === userId) || null;
  }

  function getPlatformUserByEmail(email) {
    const normalizedEmail = String(email).trim().toLowerCase();
    return state.platformUsers.find((u) => u.email === normalizedEmail) || null;
  }

  function createPlatformUser(payload) {
    const name = String(payload.name || "").trim();
    const email = String(payload.email || "").trim().toLowerCase();
    const password = String(payload.password || "").trim();
    if (!name || !email || !password) {
      throw new Error("Nombre, correo y contraseña son obligatorios");
    }
    if (state.platformUsers.find((u) => u.email === email)) {
      throw new Error("El correo ya existe");
    }
    const id = randomUUID();
    const user = {
      id,
      _id: id,
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
    };
    state.platformUsers.push(user);
    return clone(user);
  }

  function updatePlatformUser(userId, updates) {
    const user = state.platformUsers.find((u) => u.id === userId || u._id === userId);
    if (!user) return null;
    Object.keys(updates).forEach((key) => {
      if (updates[key] !== undefined) user[key] = updates[key];
    });
    user.updatedAt = new Date();
    return clone(user);
  }

  return buildBackendStore({
    authenticate,
    addMessage,
    assignRouteToVehicle,
    clearAssignedRouteFromVehicle,
    countPlatformOwners,
    countVehiclesByStatus,
    createPlatformUser,
    getPlatformUserById,
    getPlatformUserByEmail,
    updatePlatformUser,
    assignRouteToVehicle,
    clearAssignedRouteFromVehicle,
    createRoute,
    deleteRoute,
    deleteVehicle,
    canUserAccessConversation,
    canUserAccessChatMedia,
    createActivationKey,
    createActivationKeyWithinCapacity,
    deleteActivationKey,
    createCommercialOrder,
    applyPaymentTransitionAtomically,
    claimPaymentEffects,
    completePaymentEffects,
    claimCheckoutCreation,
    claimTrialEntitlement,
    claimRefundOperation,
    completeRefundOperation,
    failRefundOperation,
    listRefundOperations,
    upsertChargeback,
    listChargebacks,
    findCommercialOrderByProviderPaymentId,
    reserveRefundAmount,
    completeCheckoutCreation,
    failCheckoutCreation,
    createNotification,
    createIncident,
    createRtcSession,
    createVehicle,
    createUser,
    deleteUser,
    deleteDriverSafely,
    deleteUnusedVehicle,
    ensureDirectConversation,
    ensureGeneralConversation,
    findCommercialOrderByExternalReference,
    findActivationKeyByKey,
    findUserByEmail,
    generatePasswordResetToken,
    getConversationById,
    getConversationsForUser,
    getDashboardOverview,
    getDocumentById,
    getDocumentByStorageKey,
    getDocumentsForUser,
    getLiveLocations,
    getMessages,
    getNotificationsForUser,
    getOperationalInsights,
    getRouteById,
    listRoutes,
    getUserE2eeBackup,
    getUserById,
    getUserProfile,
    getVehicleById,
    getDriverLifecycleDependencies,
    getVehicleLifecycleDependencies,
    getCommercialOrderById: (orderId) => clone(getCommercialOrderById(orderId)),
    listChatContactsForUser,
    listActivationKeysForCompany,
    listCommercialOrders,
    listCommercialOrdersForUser,
    listDocuments,
    listDocumentVersions,
    listPushSubscriptionsForRoles,
    listPushSubscriptionsForUsers,
    listUsers,
    listIncidents,
    listRtcSessions,
    listTripLogs,
    listVehiclesForOrganization,
    markNotificationAsRead,
    markConversationMessageDelivered,
    markConversationMessageRead,
    markActivationKeyUsed,
    claimVehicleForDriver,
    changeDriverVehicle,
    offboardDriverState,
    reactivateDriverWithinCapacity,
    releaseVehicleFromDriver,
    retireVehicle,
    recordAppEvent,
    getAppConfig,
    updateAppConfig,
    recordDeviceVersion,
    getDeviceVersionStats,
    registerPushSubscription,
    registerUser,
    resetPasswordWithToken,
    createDocument,
    replaceDocument,
    reviewDocument,
    softDeleteDocument,
    upsertUserE2eeBackup,
    unregisterPushSubscription,
    updateUser,
    updateDocument,
    updateIncidentStatus,
    updateVehicleLocation,
    updateVehicle,
    createTripLog,
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
    updateCommercialOrder,
    updateActivationKey,
    updateRtcSession
  });
}

module.exports = {
  createEmbeddedStore,
  createMongoStore
};
