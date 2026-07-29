const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_WHATSAPP_FROM
} = require("../config/env");
const communication = require("../../modules/communication");

function canSendWhatsapp() {
  return Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_WHATSAPP_FROM);
}

function getNotifierReadiness() {
  const emailReadiness = communication.getReadiness();
  return {
    email: {
      ready: emailReadiness.ready,
      status: emailReadiness.status,
      durable: emailReadiness.durable,
      provider: emailReadiness.provider,
      missing: ["disabled", "dry_run"].includes(emailReadiness.status)
        ? []
        : communication.isConfigured() ? [] : ["EMAIL_FROM", "RESEND_API_KEY"]
    },
    whatsapp: {
      ready: canSendWhatsapp(),
      missing: canSendWhatsapp()
        ? []
        : ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_WHATSAPP_FROM"]
    }
  };
}

function getCommercialEventContext(order, event, template) {
  const provider = String(order.paymentProvider || "manual");
  const paymentId = String(order.providerPaymentId || order.paymentProviderReference || order.paymentExternalReference || order.id);
  const statusVersion = String(order.paymentStatus || order.status || "unknown");
  const subscriptionId = String(order.subscriptionId || order.organizationId || order.id);
  const periodStart = String(order.currentPeriodStart || order.trialStartedAt || order.activatedAt || order.createdAt || "initial");
  const cancellationVersion = String(order.cancelledAt || order.cancelAt || statusVersion);
  const contexts = {
    "order-created": ["ORDER_CREATED", `order-created:${order.id || order.referenceCode}`],
    "payment-approved": ["PAYMENT_CONFIRMED", `payment-approved:${provider}:${paymentId}`],
    "payment-rejected": ["PAYMENT_FAILED", `payment-rejected:${provider}:${paymentId}:${statusVersion}`],
    "payment-pending": ["PAYMENT_PENDING", `payment-pending:${provider}:${paymentId}:${statusVersion}`],
    "subscription-activated": ["SUBSCRIPTION_ACTIVATED", `subscription-activated:${subscriptionId}:${periodStart}`],
    "subscription-cancelled": ["SUBSCRIPTION_CANCELLED", `subscription-cancelled:${subscriptionId}:${cancellationVersion}`]
  };
  const [eventType, idempotencyKey] = contexts[template];
  return {
    eventType,
    idempotencyKey,
    organizationId: String(order.organizationId || ""),
    tenantScope: order.organizationId ? `organization:${order.organizationId}` : `order:${order.id || order.referenceCode}`
  };
}

function normalizePhone(phone) {
  const digits = String(phone || "").replace(/[^\d+]/g, "");

  if (!digits) {
    return "";
  }

  return digits.startsWith("+") ? digits : `+${digits}`;
}

const REJECTED_PAYMENT_STATUSES = new Set(["cancelled", "failed", "rejected"]);
const PENDING_PAYMENT_STATUSES = new Set([
  "pending",
  "pending_configuration",
  "pending_manual_confirmation",
  "pending_payment"
]);

function selectCommercialEmailTemplate(order, event = "payment_status") {
  if (event === "order_created") return "order-created";
  if (event === "subscription_cancelled") return "subscription-cancelled";
  if (event === "subscription_activated") return "subscription-activated";

  const status = String(order?.paymentStatus || "").trim().toLowerCase();
  if (["paid", "paid_test", "approved"].includes(status)) return "payment-approved";
  if (REJECTED_PAYMENT_STATUSES.has(status)) return "payment-rejected";
  if (PENDING_PAYMENT_STATUSES.has(status) || !status) return "payment-pending";
  return "payment-pending";
}

function getEmailDeliveryState(result) {
  if (result?.queued) return { error: null, status: "pending" };
  if (result?.success === true) return { error: null, status: "sent" };
  return {
    error: String(result?.error || "El proveedor no confirmó el envío"),
    status: result?.errorCategory === "rate_limit" ? "retry" : "failed"
  };
}

async function sendEmailNotification(order, event) {
  const template = selectCommercialEmailTemplate(order, event);
  const context = getCommercialEventContext(order, event, template);
  try {
    const result = await communication.sendEmail({
      recipient: { email: order.email, name: order.contactName },
      template,
      ...context,
      data: {
        name: order.contactName,
        referenceCode: order.referenceCode,
        planName: order.planName,
        amount: `$${order.totalPrice} MXN`,
        paymentMethod: order.paymentMethod,
        checkoutUrl: order.checkoutUrl,
        statusLabel: order.paymentStatus,
        date: new Date().toLocaleDateString("es-MX"),
        dashboardUrl: order.dashboardUrl,
        userId: order.userId,
        organizationId: order.organizationId
      }
    });
    const delivery = getEmailDeliveryState(result);
    return {
      lastNotificationDeliveryId: result?.deliveryId || null,
      lastNotificationStatus: result?.status || delivery.status,
      lastNotificationAt: new Date().toISOString()
    };
  } catch (error) {
    return {
      lastNotificationDeliveryId: null,
      lastNotificationStatus: "failed",
      lastNotificationAt: new Date().toISOString()
    };
  }
}

async function sendWhatsappNotification(order, message) {
  if (!canSendWhatsapp()) {
    return "skipped_not_configured";
  }

  const accountSid = TWILIO_ACCOUNT_SID;
  const authToken = TWILIO_AUTH_TOKEN;
  const body = new URLSearchParams({
    From: TWILIO_WHATSAPP_FROM,
    To: `whatsapp:${normalizePhone(order.phone)}`,
    Body: message
  });

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    }
  );

  return response.ok ? "sent" : "failed";
}

function buildOrderMessage(order, nextStep) {
  const instructions = order.paymentInstructions;

  return [
    `Hola ${order.contactName}, tu orden ${order.referenceCode} para ${order.planName} ya fue registrada.`,
    `Empresa: ${order.companyName}.`,
    `Monto: $${order.totalPrice} MXN.`,
    order.requestTrial && order.trialEndsAt
      ? `Prueba activa hasta ${new Date(order.trialEndsAt).toLocaleDateString("es-MX")}.`
      : "",
    order.checkoutUrl ? `Pago seguro: ${order.checkoutUrl}` : "",
    instructions?.accountHolder ? `Titular SPEI: ${instructions.accountHolder}` : "",
    instructions?.clabe ? `CLABE: ${instructions.clabe}` : "",
    instructions?.bankName ? `Banco: ${instructions.bankName}` : "",
    instructions?.reference ? `Referencia: ${instructions.reference}` : "",
    order.launchSummary || "",
    nextStep || "Te compartiremos los siguientes pasos de activación."
  ]
    .filter(Boolean)
    .join("\n");
}

async function notifyCommercialOrder(order, nextStep, event = "payment_status") {
  const message = buildOrderMessage(order, nextStep);
  const [emailStatus, lastWhatsappStatus] = await Promise.all([
    sendEmailNotification(order, event).catch((error) => ({
      lastNotificationDeliveryId: null,
      lastNotificationStatus: "failed",
      lastNotificationAt: new Date().toISOString()
    })),
    sendWhatsappNotification(order, message).catch(() => "failed")
  ]);

  return {
    ...emailStatus,
    lastWhatsappStatus,
    lastContactedAt: new Date().toISOString()
  };
}

module.exports = {
  getNotifierReadiness,
  getEmailDeliveryState,
  getCommercialEventContext,
  notifyCommercialOrder,
  selectCommercialEmailTemplate
};
