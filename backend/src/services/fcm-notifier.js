const { createSign } = require("crypto");
const fs = require("fs");

const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const ACCESS_TOKEN_SAFETY_WINDOW_MS = 60 * 1000;
const DEFAULT_CHAT_TTL_SECONDS = 24 * 60 * 60;
const DEFAULT_CALL_TTL_SECONDS = 40;

function base64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function normalizePrivateKey(value) {
  return String(value || "").replace(/\\n/g, "\n").trim();
}

function readJsonFile(filePath, readFile = fs.readFileSync) {
  if (!filePath) return null;

  try {
    return JSON.parse(readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

function resolveServiceAccount(env = process.env, readFile = fs.readFileSync) {
  const fromFile = readJsonFile(String(env.GOOGLE_APPLICATION_CREDENTIALS || "").trim(), readFile);
  const projectId = String(
    env.FCM_PROJECT_ID ||
      env.FIREBASE_PROJECT_ID ||
      fromFile?.project_id ||
      ""
  ).trim();
  const clientEmail = String(
    env.FCM_CLIENT_EMAIL ||
      env.FIREBASE_CLIENT_EMAIL ||
      fromFile?.client_email ||
      ""
  ).trim();
  const privateKey = normalizePrivateKey(
    env.FCM_PRIVATE_KEY ||
      env.FIREBASE_PRIVATE_KEY ||
      fromFile?.private_key ||
      ""
  );

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  return { projectId, clientEmail, privateKey };
}

function createServiceAccountAssertion(credentials, nowMs = Date.now()) {
  const issuedAt = Math.floor(nowMs / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(
    JSON.stringify({
      iss: credentials.clientEmail,
      scope: FCM_SCOPE,
      aud: GOOGLE_OAUTH_TOKEN_URL,
      iat: issuedAt,
      exp: issuedAt + 3600
    })
  );
  const unsigned = `${header}.${claims}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  return `${unsigned}.${base64Url(signer.sign(credentials.privateKey))}`;
}

function stringifyDataValue(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function buildDataPayload(payload = {}) {
  const category = String(payload.category || payload.data?.category || "notifications").trim();
  const type = String(
    payload.data?.type ||
      (category === "call" ? "incoming_call" : category === "chat" ? "chat_message" : "notification")
  ).trim();
  const raw = {
    ...(payload.data || {}),
    type,
    category,
    title: String(payload.title || "").trim(),
    body: String(payload.body || "").trim(),
    deepLink: String(payload.deepLink || payload.data?.deepLink || "").trim(),
    silent: Boolean(payload.silent)
  };

  return Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key, stringifyDataValue(value)])
  );
}

function isUrgentPayload(payload = {}) {
  const category = String(payload.category || payload.data?.category || "").toLowerCase();
  return (
    payload.level === "critical" ||
    category === "call" ||
    category === "chat" ||
    category === "sos" ||
    category === "emergency"
  );
}

function resolveTtlSeconds(payload = {}) {
  const explicit = Number(payload.ttlSeconds);
  if (Number.isFinite(explicit) && explicit > 0) {
    return Math.max(1, Math.floor(explicit));
  }

  return String(payload.category || "").toLowerCase() === "call"
    ? DEFAULT_CALL_TTL_SECONDS
    : DEFAULT_CHAT_TTL_SECONDS;
}

function buildFcmMessage(token, payload = {}) {
  const category = String(payload.category || payload.data?.category || "notifications").trim();
  const conversationId = String(payload.data?.conversationId || "").trim();
  const callId = String(payload.data?.callId || "").trim();
  const tag = callId
    ? `manecomb-call-${callId}`
    : conversationId
      ? `manecomb-chat-${conversationId}`
      : undefined;

  return {
    token,
    data: buildDataPayload(payload),
    android: {
      priority: isUrgentPayload(payload) ? "HIGH" : "NORMAL",
      ttl: `${resolveTtlSeconds(payload)}s`,
      ...(tag ? { collapse_key: tag } : {})
    }
  };
}

function isInvalidRegistrationError(status, responsePayload) {
  if (status === 404) return true;
  const statusName = String(responsePayload?.error?.status || "").toUpperCase();
  const details = Array.isArray(responsePayload?.error?.details)
    ? responsePayload.error.details
    : [];
  return (
    statusName === "NOT_FOUND" ||
    details.some((entry) => String(entry?.errorCode || "").toUpperCase() === "UNREGISTERED")
  );
}

function createFcmNotifier({
  env = process.env,
  fetchImpl = global.fetch,
  now = () => Date.now(),
  readFile = fs.readFileSync
} = {}) {
  const credentials = resolveServiceAccount(env, readFile);
  let cachedAccessToken = null;
  let accessTokenExpiresAt = 0;

  async function getAccessToken() {
    if (!credentials) return null;
    const currentTime = now();
    if (
      cachedAccessToken &&
      accessTokenExpiresAt - ACCESS_TOKEN_SAFETY_WINDOW_MS > currentTime
    ) {
      return cachedAccessToken;
    }
    if (typeof fetchImpl !== "function") {
      throw new Error("Fetch no esta disponible para autenticar FCM");
    }

    const assertion = createServiceAccountAssertion(credentials, currentTime);
    const response = await fetchImpl(GOOGLE_OAUTH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion
      }).toString()
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok || !body.access_token) {
      throw new Error(body.error_description || body.error || "No fue posible autenticar FCM");
    }

    cachedAccessToken = String(body.access_token);
    accessTokenExpiresAt = currentTime + Math.max(60, Number(body.expires_in) || 3600) * 1000;
    return cachedAccessToken;
  }

  async function sendOne(subscription, payload) {
    if (!credentials) {
      return { ok: false, skipped: true, token: subscription.token, reason: "not_configured" };
    }
    const accessToken = await getAccessToken();
    const response = await fetchImpl(
      `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(credentials.projectId)}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ message: buildFcmMessage(subscription.token, payload) })
      }
    );
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        ok: false,
        token: subscription.token,
        invalidToken: isInvalidRegistrationError(response.status, body),
        reason: String(body?.error?.status || response.status || "fcm_error"),
        error: String(body?.error?.message || "FCM rechazo el mensaje")
      };
    }

    return { ok: true, token: subscription.token, messageId: body.name || null };
  }

  async function sendMany(subscriptions, payload) {
    const safeSubscriptions = (Array.isArray(subscriptions) ? subscriptions : [])
      .map((entry) => ({ ...entry, token: String(entry?.token || "").trim() }))
      .filter((entry) => entry.token && !/^ExponentPushToken\[.+\]$/.test(entry.token));

    if (!safeSubscriptions.length) {
      return {
        ok: true,
        configured: Boolean(credentials),
        sent: 0,
        failed: 0,
        skipped: 0,
        invalidTokens: [],
        results: []
      };
    }

    const results = [];
    for (const subscription of safeSubscriptions) {
      try {
        results.push(await sendOne(subscription, payload));
      } catch (error) {
        results.push({
          ok: false,
          token: subscription.token,
          reason: "transport_error",
          error: error.message || "No fue posible enviar FCM"
        });
      }
    }

    const sent = results.filter((entry) => entry.ok).length;
    const skipped = results.filter((entry) => entry.skipped).length;
    const failed = results.length - sent - skipped;
    return {
      ok: failed === 0,
      configured: Boolean(credentials),
      sent,
      failed,
      skipped,
      invalidTokens: results.filter((entry) => entry.invalidToken).map((entry) => entry.token),
      results
    };
  }

  return {
    configured: Boolean(credentials),
    getAccessToken,
    sendMany,
    _credentials: credentials
  };
}

async function sendFcmPushNotifications(subscriptions, payload) {
  return createFcmNotifier().sendMany(subscriptions, payload);
}

module.exports = {
  ACCESS_TOKEN_SAFETY_WINDOW_MS,
  DEFAULT_CALL_TTL_SECONDS,
  buildDataPayload,
  buildFcmMessage,
  createFcmNotifier,
  createServiceAccountAssertion,
  resolveServiceAccount,
  sendFcmPushNotifications
};
