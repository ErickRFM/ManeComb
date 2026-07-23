const { hasPlatformPermission, getPlatformPermissions } = require("../config/platform-roles");

function requirePlatformRole(...roles) {
  return (req, res, next) => {
    const userRole = req.platformUser?.role;
    if (!userRole || !roles.includes(userRole)) {
      return res.status(403).json({ ok: false, message: "No tienes permisos suficientes" });
    }
    return next();
  };
}

function requirePlatformPermission(permission) {
  return (req, res, next) => {
    const userRole = req.platformUser?.role;
    if (!userRole || !hasPlatformPermission(userRole, permission)) {
      return res.status(403).json({ ok: false, message: "No tienes permiso para realizar esta acción" });
    }
    return next();
  };
}

function requirePlatformStatus(...statuses) {
  return (req, res, next) => {
    const userStatus = req.platformUser?.status;
    if (!userStatus || !statuses.includes(userStatus)) {
      return res.status(403).json({ ok: false, message: "Cuenta no activa" });
    }
    return next();
  };
}

module.exports = {
  requirePlatformRole,
  requirePlatformPermission,
  requirePlatformStatus
};
