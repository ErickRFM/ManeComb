const MAX_CLIENT_CLOCK_SKEW_MS = Math.max(0, Number(process.env.TRACKING_MAX_CLOCK_SKEW_MS) || 5 * 60 * 1000);
const GPS_FRESHNESS_MS = Math.max(30_000, Number(process.env.TRACKING_GPS_FRESHNESS_MS) || 2 * 60 * 1000);

function normalizeTrackingTime(clientTimestamp, receivedAt = new Date()) {
  const received = new Date(receivedAt);
  const safeReceived = Number.isNaN(received.getTime()) ? new Date() : received;
  const parsedClient = clientTimestamp ? new Date(clientTimestamp) : null;
  const hasValidClientTime = parsedClient && !Number.isNaN(parsedClient.getTime());
  const skewMs = hasValidClientTime ? parsedClient.getTime() - safeReceived.getTime() : null;
  const withinAcceptedSkew = skewMs !== null && Math.abs(skewMs) <= MAX_CLIENT_CLOCK_SKEW_MS;

  return {
    clientTimestamp: hasValidClientTime ? parsedClient.toISOString() : null,
    receivedAt: safeReceived.toISOString(),
    processedTimestamp: withinAcceptedSkew ? parsedClient.toISOString() : safeReceived.toISOString(),
    clockSkewMs: skewMs,
    timestampSource: withinAcceptedSkew ? "client" : "server",
    discardReason: clientTimestamp && !hasValidClientTime
      ? "invalid_client_timestamp"
      : skewMs !== null && !withinAcceptedSkew
        ? (skewMs > 0 ? "client_clock_ahead" : "client_clock_behind")
        : null
  };
}

function buildGpsFreshness(locationTimestamp, evaluatedAt = new Date()) {
  const timestamp = locationTimestamp ? new Date(locationTimestamp) : null;
  const evaluated = new Date(evaluatedAt);
  const valid = timestamp && !Number.isNaN(timestamp.getTime());
  const freshUntil = valid ? new Date(timestamp.getTime() + GPS_FRESHNESS_MS) : null;
  const isFresh = Boolean(valid && freshUntil.getTime() >= evaluated.getTime());

  return {
    state: valid ? (isFresh ? "fresh" : "stale") : "missing",
    isFresh,
    thresholdMs: GPS_FRESHNESS_MS,
    evaluatedAt: evaluated.toISOString(),
    freshUntil: freshUntil ? freshUntil.toISOString() : null
  };
}

module.exports = { GPS_FRESHNESS_MS, MAX_CLIENT_CLOCK_SKEW_MS, buildGpsFreshness, normalizeTrackingTime };
