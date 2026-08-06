const {
  ENTERPRISE_CAPABILITY,
  getOrganizationId,
  hasCapability
} = require("./access-control");

// Compatibilidad documental. La autorización real usa portal.access.
const PORTAL_ROLES = new Set([
  "owner",
  "admin",
  "billing_manager",
  "support",
  "viewer"
]);

function requirePortalAccess(req, res, next) {
  if (
    getOrganizationId(req.user) &&
    hasCapability(req.user, ENTERPRISE_CAPABILITY.PORTAL_ACCESS)
  ) {
    return next();
  }

  return res.status(403).json({
    ok: false,
    code: "PORTAL_ACCESS_DENIED",
    message: "No tienes acceso al portal administrativo"
  });
}

module.exports = {
  PORTAL_ROLES,
  requirePortalAccess
};