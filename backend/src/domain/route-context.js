const { createHash } = require("crypto");
const { normalizePolyline } = require("./route-geometry");

function geometryHash(polyline) {
  const normalized = normalizePolyline(polyline).map((point) => [
    Number(point.latitude.toFixed(6)),
    Number(point.longitude.toFixed(6))
  ]);
  if (normalized.length < 2) return null;
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex").slice(0, 32);
}

function buildRouteContext(route) {
  if (!route || typeof route !== "object") return null;
  const routeId = String(route.id || route._id || "").trim();
  const revision = Number(route.revision);
  const routeGeometryHash = geometryHash(route.polyline);
  if (!routeId || !Number.isInteger(revision) || revision < 1 || !routeGeometryHash) return null;
  return {
    routeId,
    routeRevision: revision,
    geometryHash: routeGeometryHash
  };
}

function routeContextMatches(context, route) {
  const current = buildRouteContext(route);
  if (!context || !current) return false;
  return String(context.routeId || "") === current.routeId &&
    Number(context.routeRevision) === current.routeRevision &&
    String(context.geometryHash || "") === current.geometryHash;
}

function isTechnicalRouteId(routeId) {
  const value = String(routeId || "").trim();
  return !value || value.startsWith("recording:") || value.startsWith("assigned:");
}

module.exports = {
  buildRouteContext,
  geometryHash,
  isTechnicalRouteId,
  routeContextMatches
};
