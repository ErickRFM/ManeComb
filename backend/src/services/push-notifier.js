const { sendFcmPushNotifications } = require("./fcm-notifier");

const EXPO_PUSH_CHUNK_SIZE = 100;

function isExpoPushToken(token) {
  return /^ExponentPushToken\[.+\]$/.test(String(token || "").trim());
}

async function sendExpoPushNotifications(subscriptions, payload) {
  const safeSubscriptions = Array.isArray(subscriptions)
    ? subscriptions.filter((entry) => entry?.token && isExpoPushToken(entry.token))
    : [];

  if (!safeSubscriptions.length || payload?.silent) {
    return {
      ok: true,
      sent: 0,
      failed: 0,
      tickets: []
    };
  }

  const messages = safeSubscriptions.map((entry) => ({
    to: String(entry.token).trim(),
    sound: "default",
    title: String(payload.title || "").trim(),
    body: String(payload.body || "").trim(),
    data: payload.data || {},
    priority: payload.level === "critical" ? "high" : "default",
    channelId: payload.category === "sos" ? "sos-critical" : "operacion-general"
  }));

  const tickets = [];

  for (let index = 0; index < messages.length; index += EXPO_PUSH_CHUNK_SIZE) {
    const chunk = messages.slice(index, index + EXPO_PUSH_CHUNK_SIZE);
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(chunk)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || "Expo Push devolvio un error");
    }

    const result = await response.json();
    const chunkTickets = Array.isArray(result?.data) ? result.data : [];
    tickets.push(...chunkTickets);
  }
  const failed = tickets.filter((entry) => entry?.status === "error").length;

  return {
    ok: failed === 0,
    sent: tickets.length - failed,
    failed,
    tickets
  };
}

async function sendPushNotifications(subscriptions, payload) {
  const safeSubscriptions = Array.isArray(subscriptions)
    ? subscriptions.filter((entry) => String(entry?.token || "").trim())
    : [];
  const expoSubscriptions = safeSubscriptions.filter((entry) => isExpoPushToken(entry.token));
  const fcmSubscriptions = safeSubscriptions.filter((entry) => !isExpoPushToken(entry.token));

  const [expoResult, fcmResult] = await Promise.all([
    sendExpoPushNotifications(expoSubscriptions, payload),
    sendFcmPushNotifications(fcmSubscriptions, payload)
  ]);

  return {
    ok: expoResult.ok && fcmResult.ok,
    sent: expoResult.sent + fcmResult.sent,
    failed: expoResult.failed + fcmResult.failed,
    skipped: fcmResult.skipped || 0,
    invalidTokens: fcmResult.invalidTokens || [],
    providers: {
      expo: expoResult,
      fcm: fcmResult
    },
    tickets: expoResult.tickets || []
  };
}

module.exports = {
  isExpoPushToken,
  sendExpoPushNotifications,
  sendPushNotifications
};
