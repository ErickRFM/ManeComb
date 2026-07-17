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
  return {
    email: {
      ready: communication.isConfigured(),
      missing: communication.isConfigured() ? [] : ["RESEND_API_KEY", "RESEND_FROM_EMAIL"]
    },
    whatsapp: {
      ready: canSendWhatsapp(),
      missing: canSendWhatsapp()
        ? []
        : ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_WHATSAPP_FROM"]
    }
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
  if (!communication.isConfigured()) {
    return {
      lastEmailError: "RESEND_API_KEY o RESEND_FROM_EMAIL no configurados",
      lastEmailProvider: "resend",
      lastEmailStatus: "skipped_not_configured",
      lastEmailTemplate: selectCommercialEmailTemplate(order, event)
    };
  }

  const template = selectCommercialEmailTemplate(order, event);
  try {
    const result = await communication.sendEmail({
      to: order.email,
      template,
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
      lastEmailError: delivery.error,
      lastEmailProvider: result?.provider || "resend",
      lastEmailStatus: delivery.status,
      lastEmailTemplate: template
    };
  } catch (error) {
    return {
      lastEmailError: error?.message || String(error),
      lastEmailProvider: "resend",
      lastEmailStatus: "failed",
      lastEmailTemplate: template
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
      lastEmailError: error?.message || String(error),
      lastEmailProvider: "resend",
      lastEmailStatus: "failed",
      lastEmailTemplate: selectCommercialEmailTemplate(order, event)
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
  notifyCommercialOrder,
  selectCommercialEmailTemplate
};
