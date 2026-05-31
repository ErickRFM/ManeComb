const { getEffectiveRole } = require("./access-control");

const PORTAL_ROLES = new Set([
  "owner",
  "admin",
  "billing_manager",
  "support",
  "viewer"
]);

function requirePortalAccess(req, res, next) {
  if (PORTAL_ROLES.has(getEffectiveRole(req.user))) {
    return next();
  }

  return res.status(403).json({
    ok: false,
    message: "No tienes acceso al portal administrativo"
  });
}

module.exports = {
  PORTAL_ROLES,
  requirePortalAccess
};
