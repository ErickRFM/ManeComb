const { TEMPLATE, TEMPLATE_META, PRIORITY, PRIORITY_LABEL, CHANNEL, PROVIDER } = require("./types");

function isValidEmail(value) {
  if (typeof value !== "string") return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidTemplate(value) {
  return Object.values(TEMPLATE).includes(value);
}

function isValidPriority(value) {
  return Object.values(PRIORITY).includes(value) || Object.values(PRIORITY_LABEL).includes(value);
}

function isValidChannel(value) {
  return Object.values(CHANNEL).includes(value);
}

function isValidProvider(value) {
  return Object.values(PROVIDER).includes(value);
}

function normalizePriority(value) {
  if (typeof value === "number") return value;
  if (value === "critical") return PRIORITY.CRITICAL;
  if (value === "high") return PRIORITY.HIGH;
  if (value === "normal") return PRIORITY.NORMAL;
  if (value === "low") return PRIORITY.LOW;
  return PRIORITY.NORMAL;
}

function validateSendEmailInput({ to, recipient, template, eventType, idempotencyKey, tenantScope, tenantId, organizationId, data }) {
  const errors = [];
  const target = recipient?.email || to;

  if (!target) {
    errors.push("El destinatario es obligatorio");
  } else if (typeof target === "string" && !isValidEmail(target)) {
    errors.push("El correo del destinatario no es válido");
  } else if (Array.isArray(target)) {
    const invalid = target.filter((addr) => !isValidEmail(addr));
    if (invalid.length) {
      errors.push(`Correos inválidos: ${invalid.join(", ")}`);
    }
  }

  if (!template) {
    errors.push("La plantilla es obligatoria");
  } else if (!isValidTemplate(template)) {
    errors.push(`Plantilla no válida: ${template}`);
  }

  if (typeof eventType !== "string" || !eventType.trim()) {
    errors.push("El tipo de evento es obligatorio");
  } else if (!/^[A-Z][A-Z0-9_]*$/.test(eventType)) {
    errors.push("El tipo de evento no es valido");
  }
  if (typeof idempotencyKey !== "string" || !idempotencyKey.trim()) {
    errors.push("La clave idempotente es obligatoria");
  }
  if (typeof tenantScope !== "string" || !tenantScope.trim()) {
    errors.push("El scope del tenant es obligatorio");
  }

  const multiTenantEvents = new Set([
    "ORDER_CREATED",
    "PAYMENT_CONFIRMED",
    "PAYMENT_FAILED",
    "PAYMENT_PENDING",
    "SUBSCRIPTION_ACTIVATED",
    "SUBSCRIPTION_CANCELLED",
    "REFUND_CONFIRMED",
    "CHARGEBACK_UPDATED",
    "DOCUMENT_UPLOADED",
    "DOCUMENT_APPROVED",
    "DOCUMENT_REJECTED",
    "ACCOUNT_SUSPENDED",
    "ACCOUNT_REACTIVATED"
  ]);
  if (multiTenantEvents.has(eventType) && !organizationId && !tenantId) {
    errors.push("La organizacion es obligatoria para eventos comerciales");
  }

  if (data && typeof data !== "object") {
    errors.push("Los datos deben ser un objeto");
  }

  const requiredData = {
    welcome: ["name"],
    "password-reset": ["name", "resetUrl"],
    "order-created": ["name", "referenceCode"],
    "payment-approved": ["name", "referenceCode"],
    "payment-rejected": ["name", "referenceCode"],
    "payment-pending": ["name", "referenceCode"],
    "subscription-activated": ["name", "planName"],
    "subscription-cancelled": ["name", "planName"],
    "password-changed": ["name"],
    "email-changed": ["name", "newEmail"],
    "account-suspended": ["name", "suspensionDate"],
    "account-reactivated": ["name", "dashboardUrl"],
    "refund-confirmed": ["name", "referenceCode", "amount", "currency", "refundStatus", "supportUrl"],
    "chargeback-updated": ["name", "referenceCode", "amount", "currency", "chargebackStatus", "supportUrl"],
    "document-uploaded": ["documentType", "vehicleOrDriverLabel", "reviewStatus", "reviewDate", "portalUrl"],
    "document-approved": ["documentType", "vehicleOrDriverLabel", "reviewStatus", "reviewDate", "portalUrl"],
    "document-rejected": ["documentType", "vehicleOrDriverLabel", "reviewStatus", "reviewDate", "portalUrl"]
  };
  for (const field of requiredData[template] || []) {
    if (data?.[field] === undefined || data?.[field] === null || data?.[field] === "") {
      errors.push(`El dato ${field} es obligatorio para ${template}`);
    }
  }

  if (data && template) {
    const meta = TEMPLATE_META[template];
    if (!data.subject && meta?.subject) {
      data.subject = meta.subject;
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

function validateProviderConfig(provider, config) {
  const errors = [];

  switch (provider) {
    case PROVIDER.RESEND:
      if (!config?.apiKey) errors.push("RESEND_API_KEY es obligatorio");
      if (!config?.fromEmail) errors.push("RESEND_FROM_EMAIL es obligatorio");
      break;
    case PROVIDER.SMTP:
      if (!config?.host) errors.push("SMTP_HOST es obligatorio");
      if (!config?.port) errors.push("SMTP_PORT es obligatorio");
      if (!config?.auth?.user) errors.push("SMTP_USER es obligatorio");
      if (!config?.auth?.pass) errors.push("SMTP_PASS es obligatorio");
      break;
    case PROVIDER.SES:
      if (!config?.region) errors.push("SES_REGION es obligatorio");
      if (!config?.accessKeyId) errors.push("SES_ACCESS_KEY_ID es obligatorio");
      if (!config?.secretAccessKey) errors.push("SES_SECRET_ACCESS_KEY es obligatorio");
      break;
    case PROVIDER.MAILGUN:
      if (!config?.domain) errors.push("MAILGUN_DOMAIN es obligatorio");
      if (!config?.apiKey) errors.push("MAILGUN_API_KEY es obligatorio");
      break;
    case PROVIDER.POSTMARK:
      if (!config?.serverToken) errors.push("POSTMARK_SERVER_TOKEN es obligatorio");
      break;
    case PROVIDER.SENDGRID:
      if (!config?.apiKey) errors.push("SENDGRID_API_KEY es obligatorio");
      break;
    default:
      errors.push(`Proveedor desconocido: ${provider}`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  isValidEmail,
  isValidTemplate,
  isValidPriority,
  isValidChannel,
  isValidProvider,
  normalizePriority,
  validateSendEmailInput,
  validateProviderConfig
};
