const {
  RESEND_API_KEY,
  RESEND_FROM_EMAIL,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_WHATSAPP_FROM
} = require("../config/env");
const communication = require("../../modules/communication");

function canSendEmail() {
  return Boolean(RESEND_API_KEY && RESEND_FROM_EMAIL);
}

function canSendWhatsapp() {
  return Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_WHATSAPP_FROM);
}

function getNotifierReadiness() {
  return {
    email: {
      ready: communication.isConfigured() || canSendEmail(),
      missing: canSendEmail() ? [] : ["RESEND_API_KEY", "RESEND_FROM_EMAIL"]
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

async function sendEmailNotification(order, message) {
  if (communication.isConfigured()) {
    try {
      await communication.sendEmail({
        to: order.email,
        template: "payment-approved",
        data: {
          name: order.contactName,
          referenceCode: order.referenceCode,
          planName: order.planName,
          amount: `$${order.totalPrice} MXN`,
          date: new Date().toLocaleDateString("es-MX"),
          dashboardUrl: order.dashboardUrl,
          userId: order.userId,
          organizationId: order.organizationId
        }
      });
      return "sent";
    } catch {
      return "failed";
    }
  }

  if (!canSendEmail()) {
    return "skipped_not_configured";
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to: [order.email],
      subject: `ManeComb ${order.referenceCode}`,
      html: `<p>${message.replace(/\n/g, "<br />")}</p>`
    })
  });

  return response.ok ? "sent" : "failed";
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

async function notifyCommercialOrder(order, nextStep) {
  const message = buildOrderMessage(order, nextStep);
  const [lastEmailStatus, lastWhatsappStatus] = await Promise.all([
    sendEmailNotification(order, message).catch(() => "failed"),
    sendWhatsappNotification(order, message).catch(() => "failed")
  ]);

  return {
    lastEmailStatus,
    lastWhatsappStatus,
    lastContactedAt: new Date().toISOString()
  };
}

module.exports = {
  getNotifierReadiness,
  notifyCommercialOrder
};
