const communication = require("../../modules/communication");
const { PORTAL_PUBLIC_URL } = require("../config/env");

const { createDeliveryResult } = communication.deliveryResults;

function getTenantContext(entity = {}) {
  const organizationId = String(entity.organizationId || "").trim();
  const userId = String(entity.id || entity.userId || "").trim();
  return {
    organizationId: organizationId || undefined,
    tenantScope: organizationId ? `organization:${organizationId}` : `user:${userId}`
  };
}

function getTrustedUserRecipient(user = {}) {
  return {
    email: String(user.email || "").trim().toLowerCase(),
    name: String(user.name || "").trim()
  };
}

function getTrustedOrderRecipient(order = {}) {
  return {
    email: String(order.ownerAccountEmail || order.email || "").trim().toLowerCase(),
    name: String(order.contactName || "").trim()
  };
}

function formatMoney(amountMinor, currency) {
  const amount = Number(amountMinor);
  return Number.isInteger(amount) && amount >= 0
    ? (amount / 100).toFixed(2)
    : "0.00";
}

function formatEventDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Fecha no disponible" : date.toISOString();
}

async function sendEmailSafely(input) {
  try {
    return await communication.sendEmail(input);
  } catch (error) {
    return createDeliveryResult({
      status: "failed",
      error: communication.security.sanitizeProviderError(error)
    });
  }
}

function sendWelcomeEmail(user) {
  return sendEmailSafely({
    recipient: getTrustedUserRecipient(user),
    template: "welcome",
    eventType: "WELCOME",
    ...getTenantContext(user),
    idempotencyKey: `welcome:${user.id}`,
    data: {
      name: user.name,
      dashboardUrl: PORTAL_PUBLIC_URL,
      userId: user.id,
      organizationId: user.organizationId
    }
  });
}

function sendAccountLifecycleEmail(user, eventType) {
  const suspended = eventType === "ACCOUNT_SUSPENDED";
  const version = suspended ? user.suspendedAt : user.accountStatusVersion;
  return sendEmailSafely({
    recipient: getTrustedUserRecipient(user),
    template: suspended ? "account-suspended" : "account-reactivated",
    eventType,
    ...getTenantContext(user),
    idempotencyKey: suspended
      ? `account-suspended:${user.id}:${formatEventDate(version)}`
      : `account-reactivated:${user.id}:${version}`,
    data: {
      name: user.name,
      reason: user.suspensionReason || "Suspensión administrativa",
      suspensionDate: formatEventDate(user.suspendedAt),
      dashboardUrl: PORTAL_PUBLIC_URL,
      userId: user.id,
      organizationId: user.organizationId
    }
  });
}

function sendSecurityChangeEmail(user, eventType) {
  const passwordChanged = eventType === "PASSWORD_CHANGED";
  return sendEmailSafely({
    recipient: getTrustedUserRecipient(user),
    template: passwordChanged ? "password-changed" : "email-changed",
    eventType,
    ...getTenantContext(user),
    idempotencyKey: passwordChanged
      ? `password-changed:${user.id}:${user.credentialVersion}`
      : `email-changed:${user.id}:${user.credentialVersion}`,
    data: {
      name: user.name,
      newEmail: user.email,
      userId: user.id,
      organizationId: user.organizationId
    }
  });
}

function sendRefundConfirmedEmail(order, refund) {
  return sendEmailSafely({
    recipient: getTrustedOrderRecipient(order),
    template: "refund-confirmed",
    eventType: "REFUND_CONFIRMED",
    ...getTenantContext(order),
    idempotencyKey: `refund-confirmed:${refund.providerRefundId}`,
    data: {
      name: order.contactName,
      referenceCode: order.referenceCode,
      amount: formatMoney(refund.amountMinor, refund.currency),
      currency: refund.currency,
      refundStatus: refund.status,
      supportUrl: PORTAL_PUBLIC_URL,
      userId: order.ownerUserId,
      organizationId: order.organizationId
    }
  });
}

const NOTIFIABLE_CHARGEBACK_STATUSES = new Set([
  "open",
  "in_process",
  "in_review",
  "won",
  "lost",
  "covered",
  "closed_won",
  "closed_lost"
]);

function isChargebackNotifiableStatus(status) {
  return NOTIFIABLE_CHARGEBACK_STATUSES.has(String(status || "").trim().toLowerCase());
}

function sendChargebackUpdatedEmail(order, chargeback) {
  if (!isChargebackNotifiableStatus(chargeback.status)) {
    return Promise.resolve(createDeliveryResult({ status: "skipped" }));
  }
  return sendEmailSafely({
    recipient: getTrustedOrderRecipient(order),
    template: "chargeback-updated",
    eventType: "CHARGEBACK_UPDATED",
    ...getTenantContext(order),
    idempotencyKey: `chargeback:${chargeback.providerChargebackId}:${chargeback.status}`,
    data: {
      name: order.contactName,
      referenceCode: order.referenceCode,
      amount: formatMoney(chargeback.amountMinor, chargeback.currency),
      currency: chargeback.currency,
      chargebackStatus: chargeback.status,
      supportUrl: PORTAL_PUBLIC_URL,
      userId: order.ownerUserId,
      organizationId: order.organizationId
    }
  });
}

async function resolveDocumentRecipient(store, document) {
  let user = null;
  let label = "";
  if (document.ownerType === "driver") {
    const profile = await store.getUserProfile(document.ownerId);
    user = profile?.user || profile;
    label = user?.name || "Conductor";
  } else if (document.ownerType === "vehicle") {
    const vehicle = await store.getVehicleById(document.ownerId);
    label = vehicle?.label || vehicle?.code || vehicle?.plate || "Unidad";
    const profile = vehicle?.driverId ? await store.getUserProfile(vehicle.driverId) : null;
    user = profile?.user || profile;
  }
  if (!user || String(user.organizationId || "").trim() !== String(document.organizationId || "").trim()) {
    return null;
  }
  return { user, label };
}

function sendDocumentEmail(document, recipientContext, eventType) {
  const templateByEvent = {
    DOCUMENT_UPLOADED: "document-uploaded",
    DOCUMENT_APPROVED: "document-approved",
    DOCUMENT_REJECTED: "document-rejected"
  };
  const template = templateByEvent[eventType];
  const reviewEvent = eventType !== "DOCUMENT_UPLOADED";
  const version = reviewEvent ? document.reviewVersion : `recipient:${recipientContext.user.id}`;
  return sendEmailSafely({
    recipient: getTrustedUserRecipient(recipientContext.user),
    template,
    eventType,
    ...getTenantContext(document),
    idempotencyKey: reviewEvent
      ? `${template}:${document.id}:${version}`
      : `document-uploaded:${document.id}:${version}`,
    data: {
      documentType: document.category || document.name,
      vehicleOrDriverLabel: recipientContext.label,
      reviewStatus: document.reviewStatus,
      reviewDate: formatEventDate(document.reviewedAt || document.uploadedAt),
      portalUrl: PORTAL_PUBLIC_URL,
      userId: recipientContext.user.id,
      organizationId: document.organizationId
    }
  });
}

module.exports = {
  formatEventDate,
  formatMoney,
  getTenantContext,
  getTrustedOrderRecipient,
  getTrustedUserRecipient,
  isChargebackNotifiableStatus,
  resolveDocumentRecipient,
  sendAccountLifecycleEmail,
  sendChargebackUpdatedEmail,
  sendDocumentEmail,
  sendEmailSafely,
  sendRefundConfirmedEmail,
  sendSecurityChangeEmail,
  sendWelcomeEmail
};
