const crypto = require("crypto");

function maskEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  const [local = "", domain = ""] = email.split("@");
  const [host = "", ...suffix] = domain.split(".");
  if (!local || !host) return "***";
  return `${local[0]}***@${host[0]}***${suffix.length ? `.${suffix.join(".")}` : ""}`;
}

function hashRecipient(value) {
  return crypto.createHash("sha256").update(String(value || "").trim().toLowerCase()).digest("hex");
}

function sanitizeProviderError(error) {
  const source = String(error?.message || error || "provider_error");
  return source
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, (email) => maskEmail(email))
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [redacted]")
    .replace(/([?&](?:token|code|key)=)[^&\s]+/gi, "$1[redacted]")
    .replace(/\b(?:re_|SG\.|AKIA)[A-Za-z0-9._-]{12,}\b/g, "[redacted]")
    .replace(/\s+/g, " ")
    .slice(0, 240);
}

function classifyEmailError(error, provider) {
  return require("../errors").classifyError(error, provider);
}

function safeDeliveryLog(data = {}) {
  const recipient = data.recipient?.email || (Array.isArray(data.to) ? data.to[0] : data.to);
  return {
    deliveryId: data.deliveryId || null,
    eventType: data.eventType || null,
    template: data.template || null,
    provider: data.provider || null,
    recipientMasked: data.recipientMasked || (recipient ? maskEmail(recipient) : null),
    status: data.status || null,
    error: data.error ? sanitizeProviderError(data.error) : null
  };
}

module.exports = { maskEmail, hashRecipient, sanitizeProviderError, classifyEmailError, safeDeliveryLog };
