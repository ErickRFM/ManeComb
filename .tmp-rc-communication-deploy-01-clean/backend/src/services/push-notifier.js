const EXPO_PUSH_CHUNK_SIZE = 100;

async function sendExpoPushNotifications(subscriptions, payload) {
  const safeSubscriptions = Array.isArray(subscriptions)
    ? subscriptions.filter(
        (entry) => entry?.token && /^ExponentPushToken\[.+\]$/.test(String(entry.token).trim())
      )
    : [];

  if (!safeSubscriptions.length) {
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

module.exports = {
  sendExpoPushNotifications
};
