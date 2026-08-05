const mongoose = require("mongoose");
const { AuditLogModel } = require("../../data/models");
const { getCommercialPlanById } = require("../../config/commercial-plans");
const { getRuntimeReadiness } = require("../../services/runtime-readiness");
const { sanitizeEnum, sanitizeText, sanitizeDate } = require("../../utils/platform-filters");
const { parsePagination, buildPaginationMeta } = require("../../utils/platform-pagination");
const { PlatformNotFoundError } = require("../../utils/platform-errors");

const COMMERCIAL_SORTS = ["createdAt", "updatedAt", "companyName", "totalPrice"];
const AUDIT_SORTS = ["createdAt", "action", "severity"];
const PAYMENT_STATUSES = ["pending", "approved", "paid", "active", "completed", "cancelled", "refunded", "failed", "expired"];
const ACTIVATION_STATUSES = ["pending_payment", "pending_activation", "active", "blocked", "cancelled"];
const AUDIT_SEVERITIES = ["debug", "info", "warn", "warning", "error", "critical"];
const AUDIT_FILTER_KEYS = new Set([
  "search", "q", "planId", "paymentStatus", "activationStatus",
  "onboardingStatus", "organizationId", "action", "actorId",
  "severity", "since", "until", "page", "limit", "sort", "order"
]);

function timestamp(value) {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function iso(value) {
  const time = timestamp(value);
  return time ? new Date(time).toISOString() : null;
}

function normalizeIdentifier(value) {
  const normalized = sanitizeText(value, 128);
  return normalized && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(normalized) ? normalized : null;
}

function serializeCommercialOrder(order) {
  const plan = order.planId ? getCommercialPlanById(order.planId) : null;
  const hasPlan = Boolean(plan || order.planId || order.planName);
  return {
    id: order.id,
    organizationId: order.organizationId || null,
    organizationSlug: order.organizationSlug || null,
    companyName: order.companyName || order.ownerAccountName || order.organizationId || "Empresa sin nombre",
    owner: {
      userId: order.ownerUserId || null,
      name: order.ownerAccountName || null,
      email: order.ownerAccountEmail || null
    },
    plan: hasPlan
      ? {
          id: plan?.id || order.planId || null,
          name: plan?.name || order.planName || "Plan no identificado",
          units: Number(plan?.units || order.fleetSize || 0),
          price: Number(plan?.price || order.basePlanPrice || 0),
          radioIncluded: Boolean(plan?.includesRadioModule || order.radioFeatureEnabled)
        }
      : null,
    pricing: {
      basePlanPrice: Number(order.basePlanPrice || 0),
      radioFeaturePrice: Number(order.radioFeaturePrice || 0),
      totalPrice: Number(order.totalPrice || 0),
      currency: "MXN"
    },
    status: {
      order: order.status || null,
      account: order.accountStatus || null,
      payment: order.paymentStatus || null,
      activation: order.activationStatus || null,
      onboarding: order.onboardingStatus || null,
      trial: order.trialStatus || null,
      financial: order.financialStatus || null,
      chargeback: order.chargebackStatus || null
    },
    billing: {
      paymentMethod: order.paymentMethod || null,
      paymentProvider: order.paymentProvider || null,
      currentPeriodEnd: iso(order.currentPeriodEnd),
      paidUntil: iso(order.paidUntil),
      nextBillingAt: iso(order.nextBillingAt),
      cancelAtPeriodEnd: Boolean(order.cancelAtPeriodEnd),
      refundableAmountMinor: Number(order.refundableAmountMinor || 0)
    },
    lifecycle: {
      activatedAt: iso(order.activatedAt),
      onboardingCompletedAt: iso(order.onboardingCompletedAt),
      cancelledAt: iso(order.cancelledAt),
      refundedAt: iso(order.refundedAt),
      chargebackAt: iso(order.chargebackAt)
    },
    createdAt: iso(order.createdAt),
    updatedAt: iso(order.updatedAt)
  };
}

function filterCommercialOrders(items, query) {
  const search = sanitizeText(query.search || query.q, 100).toLowerCase();
  const paymentStatus = sanitizeEnum(query.paymentStatus, PAYMENT_STATUSES);
  const activationStatus = sanitizeEnum(query.activationStatus, ACTIVATION_STATUSES);
  const planId = sanitizeText(query.planId, 80);
  const organizationId = sanitizeText(query.organizationId, 128);

  return items.filter((item) => {
    if (search) {
      const haystack = [item.id, item.companyName, item.organizationId, item.owner.name, item.owner.email]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    if (paymentStatus && item.status.payment !== paymentStatus) return false;
    if (activationStatus && item.status.activation !== activationStatus) return false;
    if (planId && item.plan?.id !== planId) return false;
    if (organizationId && item.organizationId !== organizationId) return false;
    return true;
  });
}

function sortCommercialOrders(items, { sort, order }) {
  const direction = order === "asc" ? 1 : -1;
  return [...items].sort((left, right) => {
    if (sort === "companyName") return left.companyName.localeCompare(right.companyName, "es", { sensitivity: "base" }) * direction;
    if (sort === "totalPrice") return (left.pricing.totalPrice - right.pricing.totalPrice) * direction;
    return (timestamp(left[sort]) - timestamp(right[sort])) * direction;
  });
}

async function listPlatformCommercialOrders(store, query = {}) {
  const pagination = parsePagination(query, COMMERCIAL_SORTS);
  const orders = await Promise.resolve(store.listCommercialOrders());
  const serialized = (orders || []).map(serializeCommercialOrder);
  const filtered = filterCommercialOrders(serialized, query);
  const sorted = sortCommercialOrders(filtered, pagination);
  const items = sorted.slice(pagination.skip, pagination.skip + pagination.limit);

  return {
    items,
    pagination: buildPaginationMeta(filtered.length, pagination.page, pagination.limit),
    filters: {
      search: sanitizeText(query.search || query.q, 100),
      paymentStatus: sanitizeEnum(query.paymentStatus, PAYMENT_STATUSES),
      activationStatus: sanitizeEnum(query.activationStatus, ACTIVATION_STATUSES),
      planId: sanitizeText(query.planId, 80) || null,
      organizationId: sanitizeText(query.organizationId, 128) || null,
      sort: pagination.sort,
      order: pagination.order
    }
  };
}

async function getPlatformCommercialOrder(store, rawOrderId) {
  const orderId = normalizeIdentifier(rawOrderId);
  if (!orderId) throw new PlatformNotFoundError("Orden comercial no encontrada");
  const order = await Promise.resolve(store.getCommercialOrderById(orderId));
  if (!order) throw new PlatformNotFoundError("Orden comercial no encontrada");
  return serializeCommercialOrder(order);
}

function safeComponent(component, fallbackStatus = "unknown") {
  if (!component || typeof component !== "object") return { status: fallbackStatus };
  const output = {};
  for (const key of ["status", "ready", "connected", "configured", "enabled", "provider", "mode", "environment", "persistence", "healthy"]) {
    if (["string", "boolean", "number"].includes(typeof component[key])) output[key] = component[key];
  }
  if (Array.isArray(component.issues)) output.issues = component.issues.slice(0, 20).map((issue) => sanitizeText(issue, 160));
  return output;
}

function serializeRuntimeReadiness(readiness) {
  return {
    generatedAt: new Date().toISOString(),
    status: readiness.status || "unknown",
    database: safeComponent(readiness.database),
    storage: safeComponent(readiness.storage),
    payments: safeComponent(readiness.payments),
    redis: safeComponent(readiness.redis),
    queues: safeComponent(readiness.queues),
    communication: safeComponent(readiness.communication),
    email: safeComponent(readiness.notifications?.email),
    whatsapp: safeComponent(readiness.notifications?.whatsapp),
    rtc: safeComponent(readiness.rtc),
    transcription: safeComponent(readiness.transcription)
  };
}

function getPlatformSystemReadiness(dbState) {
  return serializeRuntimeReadiness(getRuntimeReadiness(dbState));
}

function sanitizeAuditMetadata(metadata) {
  const source = metadata && typeof metadata === "object" ? metadata : {};
  const safe = {};
  for (const key of [
    "actorType", "platformRole", "result", "reasonCode", "affectedOrganizationId",
    "role", "sessionId", "page", "limit", "total", "revokedCount", "companies",
    "users", "vehicles", "orders", "statusCode"
  ]) {
    const value = source[key];
    if (["string", "boolean", "number"].includes(typeof value)) {
      safe[key] = typeof value === "string" ? sanitizeText(value, 160) : value;
    }
  }

  if (source.filters && typeof source.filters === "object") {
    safe.filters = Object.fromEntries(
      Object.entries(source.filters)
        .filter(([key, value]) => AUDIT_FILTER_KEYS.has(key) && (["string", "boolean", "number"].includes(typeof value) || value === null))
        .slice(0, AUDIT_FILTER_KEYS.size)
        .map(([key, value]) => [key, typeof value === "string" ? sanitizeText(value, 120) : value])
    );
  }

  return safe;
}

function serializeAuditEntry(entry) {
  return {
    id: String(entry._id || entry.id),
    actorId: entry.actorId || null,
    action: entry.action || "platform.unknown",
    targetType: entry.targetType || null,
    targetId: entry.targetId || null,
    organizationId: entry.organizationId || null,
    severity: entry.severity || "info",
    result: entry.metadata?.result || null,
    platformRole: entry.metadata?.platformRole || null,
    metadata: sanitizeAuditMetadata(entry.metadata),
    createdAt: iso(entry.createdAt)
  };
}

async function loadAuditEntries(query, pagination) {
  if (mongoose.connection.readyState !== 1) return [];
  const mongoQuery = { "metadata.actorType": "platform" };
  const since = sanitizeDate(query.since);
  const until = sanitizeDate(query.until);
  if (since || until) {
    mongoQuery.createdAt = {};
    if (since) mongoQuery.createdAt.$gte = new Date(since);
    if (until) mongoQuery.createdAt.$lte = new Date(until);
  }
  if (query.action) mongoQuery.action = sanitizeText(query.action, 120);
  if (query.actorId) mongoQuery.actorId = sanitizeText(query.actorId, 128);
  if (query.organizationId) mongoQuery.organizationId = sanitizeText(query.organizationId, 128);
  const severity = sanitizeEnum(query.severity, AUDIT_SEVERITIES);
  if (severity) mongoQuery.severity = severity;

  const [entries, total] = await Promise.all([
    AuditLogModel.find(mongoQuery)
      .sort({ [pagination.sort]: pagination.order === "asc" ? 1 : -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),
    AuditLogModel.countDocuments(mongoQuery)
  ]);
  return { entries, total };
}

async function listPlatformAudit(query = {}) {
  const pagination = parsePagination(query, AUDIT_SORTS);
  const loaded = await loadAuditEntries(query, pagination);
  const entries = Array.isArray(loaded) ? loaded : loaded.entries;
  const total = Array.isArray(loaded) ? 0 : loaded.total;
  return {
    items: entries.map(serializeAuditEntry),
    pagination: buildPaginationMeta(total, pagination.page, pagination.limit),
    filters: {
      action: sanitizeText(query.action, 120) || null,
      actorId: sanitizeText(query.actorId, 128) || null,
      organizationId: sanitizeText(query.organizationId, 128) || null,
      severity: sanitizeEnum(query.severity, AUDIT_SEVERITIES),
      since: sanitizeDate(query.since),
      until: sanitizeDate(query.until),
      sort: pagination.sort,
      order: pagination.order
    },
    persistent: mongoose.connection.readyState === 1
  };
}

module.exports = {
  serializeCommercialOrder,
  listPlatformCommercialOrders,
  getPlatformCommercialOrder,
  serializeRuntimeReadiness,
  getPlatformSystemReadiness,
  sanitizeAuditMetadata,
  serializeAuditEntry,
  listPlatformAudit
};
