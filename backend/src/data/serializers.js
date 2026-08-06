const { applyAccountChannel } = require("../services/account-channel");
const { applyEnterpriseCapabilities } = require("../services/enterprise-capabilities");

function toPlain(doc) {
  if (!doc) {
    return null;
  }

  const plain = typeof doc.toObject === "function" ? doc.toObject({ flattenMaps: true }) : { ...doc };
  const { _id, __v, ...rest } = plain;

  return {
    id: _id,
    ...rest
  };
}

function normalizeAccountType(accountType, role = "driver") {
  if (String(accountType || "").trim() === "company_owner") {
    return "company_owner";
  }

  return role === "supervisor" && String(accountType || "").trim() === "customer"
    ? "company_owner"
    : "operations";
}

function normalizeUserStatus(value) {
  return ["active", "pending", "suspended"].includes(String(value || "").trim())
    ? String(value || "").trim()
    : "active";
}

function getUserOrganizationId(user) {
  if (!user) {
    return null;
  }

  return (
    String(user.organizationId || "").trim() ||
    String(user.companyId || "").trim() ||
    String(user.tenantId || "").trim() ||
    null
  );
}

function sanitizeUser(doc) {
  if (!doc) {
    return null;
  }

  const plain = toPlain(doc);
  const { passwordHash, pushSubscriptions, e2eeBackups, ...safeUser } = plain;
  safeUser.accountType = normalizeAccountType(safeUser.accountType, safeUser.role);
  safeUser.organizationId = getUserOrganizationId(safeUser);
  safeUser.userStatus = normalizeUserStatus(safeUser.userStatus);
  safeUser.lastAccessAt = safeUser.lastAccessAt || null;
  safeUser.invitedAt = safeUser.invitedAt || null;
  safeUser.suspendedAt = safeUser.userStatus === "suspended" ? safeUser.suspendedAt || null : null;
  safeUser.operationalSchedule = safeUser.operationalSchedule || null;
  applyAccountChannel(safeUser);
  return applyEnterpriseCapabilities(safeUser);
}

function normalizeRouteId(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function getAssignedRoutePolyline(assignedRoute) {
  if (!assignedRoute || typeof assignedRoute !== "object") {
    return [];
  }

  const route = assignedRoute.route;
  if (!route || typeof route !== "object") {
    return [];
  }

  return Array.isArray(route.polyline) ? route.polyline : [];
}

function hasActiveAssignedRoute(assignedRoute) {
  return getAssignedRoutePolyline(assignedRoute).length >= 2;
}

function getClearedVehicleRouteFields() {
  return {
    routeId: null,
    assignedRoute: null,
    activeRouteProgress: null,
    etaMinutes: null
  };
}

function serializeVehicle(doc) {
  return toPlain(doc);
}

module.exports = {
  getAssignedRoutePolyline,
  getClearedVehicleRouteFields,
  getUserOrganizationId,
  hasActiveAssignedRoute,
  normalizeAccountType,
  normalizeRouteId,
  normalizeUserStatus,
  sanitizeUser,
  serializeVehicle,
  toPlain
};