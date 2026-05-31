const ENTERPRISE_ROLES = [
  "owner",
  "admin",
  "dispatcher",
  "supervisor",
  "billing_manager",
  "support",
  "viewer",
  "driver"
];

const ALL_PERMISSIONS = [
  "canManageUsers",
  "canManageBilling",
  "canManageVehicles",
  "canViewAnalytics",
  "canAccessRTC",
  "canManageRoutes",
  "canManageDocuments",
  "canManageIncidents"
];

const ROLE_PERMISSIONS = {
  owner: ALL_PERMISSIONS,
  admin: ALL_PERMISSIONS,
  dispatcher: [
    "canManageVehicles",
    "canViewAnalytics",
    "canAccessRTC",
    "canManageRoutes",
    "canManageIncidents"
  ],
  supervisor: [
    "canManageVehicles",
    "canViewAnalytics",
    "canAccessRTC",
    "canManageRoutes",
    "canManageDocuments",
    "canManageIncidents"
  ],
  billing_manager: ["canManageBilling", "canViewAnalytics"],
  support: ["canViewAnalytics", "canManageIncidents"],
  viewer: ["canViewAnalytics"],
  driver: ["canAccessRTC"]
};

function getOrganizationId(user) {
  return String(user?.organizationId || user?.companyId || "").trim();
}

function getEffectiveRole(user) {
  const role = String(user?.role || "").trim();

  if (user?.accountType === "company_owner") {
    return ENTERPRISE_ROLES.includes(role) && !["dispatcher", "supervisor", "driver"].includes(role)
      ? role
      : "owner";
  }

  return ENTERPRISE_ROLES.includes(role) ? role : "viewer";
}

function canAccessAllTenants(user) {
  return user?.role === "admin" && user?.accountType !== "company_owner";
}

function hasPermission(user, permission) {
  if (!permission) {
    return true;
  }

  if (canAccessAllTenants(user)) {
    return true;
  }

  return (ROLE_PERMISSIONS[getEffectiveRole(user)] || []).includes(permission);
}

function requireOrganization(req, res, next) {
  const organizationId = getOrganizationId(req.user);

  if (!organizationId && !canAccessAllTenants(req.user)) {
    return res.status(403).json({
      ok: false,
      message: "La cuenta no tiene organizacion asignada"
    });
  }

  req.tenant = {
    organizationId,
    companyId: organizationId
  };

  return next();
}

function requireRole(...roles) {
  const allowedRoles = new Set(roles.flat().filter(Boolean));

  return (req, res, next) => {
    const role = getEffectiveRole(req.user);

    if (!allowedRoles.has(role)) {
      return res.status(403).json({
        ok: false,
        message: "No tienes el rol necesario para acceder a este recurso"
      });
    }

    return next();
  };
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!hasPermission(req.user, permission)) {
      return res.status(403).json({
        ok: false,
        message: "No tienes permiso para realizar esta accion"
      });
    }

    return next();
  };
}

function canAccessTenantResource(user, resource = {}) {
  if (canAccessAllTenants(user)) {
    return true;
  }

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

function requireTenantAccess(resolveResource) {
  return async (req, res, next) => {
    const resource = await resolveResource(req);

    if (!resource) {
      return res.status(404).json({
        ok: false,
        message: "Recurso no encontrado"
      });
    }

    if (!canAccessTenantResource(req.user, resource)) {
      return res.status(403).json({
        ok: false,
        message: "No tienes acceso a recursos de otra organizacion"
      });
    }

    req.tenantResource = resource;
    return next();
  };
}

function filterTenantList(user, items = []) {
  if (canAccessAllTenants(user)) {
    return items;
  }

  const organizationId = getOrganizationId(user);

  return items.filter((item) => {
    const itemOrganizationId = String(item?.organizationId || item?.companyId || "").trim();
    const belongsToTenant = Boolean(organizationId && itemOrganizationId === organizationId);

    if (user?.role === "driver") {
      return belongsToTenant && item?.id === user.vehicleId;
    }

    return belongsToTenant;
  });
}

module.exports = {
  ALL_PERMISSIONS,
  ENTERPRISE_ROLES,
  ROLE_PERMISSIONS,
  canAccessAllTenants,
  canAccessTenantResource,
  filterTenantList,
  getEffectiveRole,
  getOrganizationId,
  hasPermission,
  requireOrganization,
  requirePermission,
  requireRole,
  requireTenantAccess
};
