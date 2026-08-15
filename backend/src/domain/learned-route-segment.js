function encodeBase64Url(value) {
  return Buffer.from(String(value || ""), "utf8").toString("base64url");
}

function decodeBase64Url(value) {
  try {
    return Buffer.from(String(value || ""), "base64url").toString("utf8");
  } catch {
    return "";
  }
}

function encodeSegmentGeometryVersion({
  formatVersion = "segment-v1",
  routeId,
  routeRevision,
  startDistanceMeters,
  endDistanceMeters
}) {
  const normalizedRouteId = String(routeId || "").trim();
  const revision = Math.max(0, Math.round(Number(routeRevision) || 0));
  const start = Math.max(0, Math.round(Number(startDistanceMeters) || 0));
  const end = Math.max(start, Math.round(Number(endDistanceMeters) || start));
  if (!normalizedRouteId || !revision || end <= start) return null;
  return [formatVersion, encodeBase64Url(normalizedRouteId), revision, start, end].join(":");
}

function decodeSegmentGeometryVersion(value) {
  const [formatVersion, encodedRouteId, revisionRaw, startRaw, endRaw, ...rest] = String(value || "").split(":");
  if (!formatVersion.startsWith("segment-") || rest.length) return null;
  const routeId = decodeBase64Url(encodedRouteId);
  const routeRevision = Number(revisionRaw);
  const startDistanceMeters = Number(startRaw);
  const endDistanceMeters = Number(endRaw);
  if (
    !routeId ||
    !Number.isInteger(routeRevision) || routeRevision < 1 ||
    !Number.isFinite(startDistanceMeters) || startDistanceMeters < 0 ||
    !Number.isFinite(endDistanceMeters) || endDistanceMeters <= startDistanceMeters
  ) {
    return null;
  }
  return {
    formatVersion,
    routeId,
    routeRevision,
    startDistanceMeters,
    endDistanceMeters
  };
}

function isSegmentCandidate(candidate, algorithmVersion = null) {
  if (!candidate || typeof candidate !== "object") return false;
  if (algorithmVersion && candidate.algorithmVersion !== algorithmVersion) return false;
  return Boolean(decodeSegmentGeometryVersion(candidate.geometryVersion));
}

module.exports = {
  decodeSegmentGeometryVersion,
  encodeSegmentGeometryVersion,
  isSegmentCandidate
};
