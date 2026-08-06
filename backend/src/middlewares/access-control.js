const { ACCOUNT_CHANNEL, resolveAccountChannel } = require("../services/account-channel");
const {
  ENTERPRISE_CAPABILITY,
  LEGACY_PERMISSION_ALIASES,
  getCapabilitiesForUser,
  getRolesWithCapability,
  hasCapability,
  resolveCapabilityName
} = require("../services/enterprise-capabilities");

const ENTERPRISE_ROLES = [
  "owner",
  "admin",
  "dispatcher",
  "supervisor",
  "billing_manager",
  "support",
  "viewer",
  "driver",
  "conductor"
];

// Compatibilidad temporal para módulos que todavía usan los nombres canManage*.
// La autoridad real es enterprise-capabilities.js y esta tabla ya no concede acceso.
const ALL_PERMISSIONS = Object.freeze(Object.keys(LEGACY_PERMISSION_ALIASES));
const ROLE_PERMISSIONS = Object.freeze({
  owner: ALL_PERMISSIONS,
  admin: ALL_PERMISSIONS,
  dispatcher: Object.freeze([
    "canManageVehicles",
    "canViewAnalytics",
    "canAccessRTC",
    "canManageRoutes",
    "canManageIncidents"
  ]),
  supervisor: Object.freeze([
    "canManageVehicles",
    "canViewAnalytics",
    "canAccessRTC",
    "canManageRoutes",
    "canManageDocuments",
    "canManageIncidents"
  ]),
  billing_manager: Object.freeze(["canManageBilling", "canViewAnalytics"]),
  support: Object.freeze(["canViewAnalytics", "canManageIncidents"]),
  viewer: Object.freeze(["canViewAnalytics"]),
  driver: Object.freeze(["canAccessRTC"]),
  conductor: Object.freeze(["canAccessRTC"])
});

function getOrganizationId(user) {
  return String(user?.organizationId || user?.companyId || "").trim();
}

function getEffectiveRole(user) {
  const accountChannel = resolveAccountChannel(user);
  if (![ACCOUNT_CHANNEL.COMPANY_PORTAL, ACCOUNT_CHANNEL.MOBILE_OPERATIONS].includes(accountChannel.channel)) {
    return null;
  }

  const role = String(user?.role || "").trim().toLowerCase();
  return getCapabilitiesForUser(user).length && ENTERPRISE_ROLES.includes(role) ? role : null;
}

// Las APIs empresariales nunca tienen alcance multiempresa. Admin Global usa
// req.platformUser, Cloudflare Access y requirePlatformPermission en /platform.
function canAccessAllTenants() {
  return false;
}

function hasPermission(user, permission) {
  return hasCapability(user, permission);
}

function getRolesWithPermission(permission) {
  return getRolesWithCapability(permission);
}

function requireOrganization(req, res, next) {
  const organizationId = getOrganizationId(req.user);

  if (!organizationId) {
    return res.status(403).json({
      ok: false,
      code: "TENANT_REQUIRED",
      message: "La cuenta no tiene organizacion asignada"
    });
  }

  if (!hasCapability(req.user, ENTERPRISE_CAPABILITY.TENANT_ACCESS)) {
    return res.status(403).json({
      ok: false,
      code: "TENANT_ACCESS_DENIED",
      message: "La cuenta no tiene acceso al tenant asignado"
    });
  }

  req.tenant = {
    organizationId,
    companyId: organizationId
  };

  return next();
}

function requireCapability(permission) {
  const capability = resolveCapabilityName(permission);

  return (req, res, next) => {
    if (!capability || !hasCapability(req.user, capability)) {
      return res.status(403).json({
        ok: false,
        code: "CAPABILITY_REQUIRED",
        message: "No tienes permiso para realizar esta accion",
        requiredCapability: capability || String(permission || "")
      });
    }

    return next();
  };
}

const requirePermission = requireCapability;

function canAccessTenantResource(user, resource = {}) {
  if (!hasCapability(user, ENTERPRISE_CAPABILITY.TENANT_ACCESS)) return false;

  const organizationId = getOrganizationId(user);
  const resourceOrganizationId = String(
    resource.organizationId || resource.companyId || ""
  ).trim();

  return Boolean(
    organizationId &&
    resourceOrganizationId &&
    organizationId === resourceOrganizationId
  );
}

function filterTenantList(user, items = []) {
  if (!hasCapability(user, ENTERPRISE_CAPABILITY.TENANT_ACCESS)) return [];

  const organizationId = getOrganizationId(user);
  if (!organizationId) return [];

  const tenantItems = items.filter((item) => {
    const itemOrganizationId = String(item?.organizationId || item?.companyId || "").trim();
    return Boolean(itemOrganizationId && itemOrganizationId === organizationId);
  });

  const role = String(user?.role || "").trim().toLowerCase();
  if (!["driver", "conductor"].includes(role)) return tenantItems;

  const vehicleId = String(user?.vehicleId || "").trim();
  if (!vehicleId) return [];
  return tenantItems.filter((item) => String(item?.id || item?._id || "") === vehicleId);
}

module.exports = {
  ALL_PERMISSIONS,
  ENTERPRISE_CAPABILITY,
  ENTERPRISE_ROLES,
  ROLE_PERMISSIONS,
  canAccessAllTenants,
  canAccessTenantResource,
  filterTenantList,
  getCapabilitiesForUser,
  getEffectiveRole,
  getOrganizationId,
  getRolesWithPermission,
  hasCapability,
  hasPermission,
  requireCapability,
  requireOrganization,
  requirePermission
};