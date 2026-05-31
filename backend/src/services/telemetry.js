const { randomUUID } = require("crypto");
const { SENTRY_DSN, SENTRY_ENVIRONMENT } = require("../config/env");

function getOrCreateTraceId(rawTraceId) {
  const safeTraceId = String(rawTraceId || "").trim();
  return safeTraceId || randomUUID();
}

function recordAppEventSafely(store, payload) {
  try {
    void Promise.resolve(store?.recordAppEvent?.(payload)).catch(() => undefined);
  } catch {
    // Telemetry must never affect the request lifecycle.
  }
}

function parseSentryDsn() {
  if (!SENTRY_DSN) {
    return null;
  }

  try {
    const url = new URL(SENTRY_DSN);
    const projectId = url.pathname.replace(/^\/+/, "");

    if (!projectId || !url.username) {
      return null;
    }

    return {
      host: url.host,
      projectId,
      protocol: url.protocol,
      publicKey: url.username
    };
  } catch {
    return null;
  }
}

async function sendSentryErrorEvent(payload) {
  const sentry = parseSentryDsn();

  if (!sentry) {
    return false;
  }

  const eventId = randomUUID().replace(/-/g, "");
  const envelopeHeader = {
    event_id: eventId,
    sent_at: new Date().toISOString(),
    dsn: SENTRY_DSN
  };
  const eventPayload = {
    event_id: eventId,
    platform: "node",
    level: payload.level || "error",
    environment: SENTRY_ENVIRONMENT,
    message: payload.message || "Backend error",
    tags: payload.tags || {},
    request: payload.request || undefined,
    extra: payload.extra || undefined
  };
  const envelope = `${JSON.stringify(envelopeHeader)}\n${JSON.stringify({ type: "event" })}\n${JSON.stringify(eventPayload)}\n`;
  const endpoint = `${sentry.protocol}//${sentry.host}/api/${sentry.projectId}/envelope/`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-sentry-envelope",
      "X-Sentry-Auth": `Sentry sentry_key=${sentry.publicKey}, sentry_version=7`
    },
    body: envelope
  });

  return response.ok;
}

module.exports = {
  getOrCreateTraceId,
  recordAppEventSafely,
  sendSentryErrorEvent
};
