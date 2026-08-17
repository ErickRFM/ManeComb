const { hasCapability, resolveCapabilityName } = require("../services/enterprise-capabilities");

function requireEnterpriseCapability(permission) {
  const capability = resolveCapabilityName(permission);
  if (!capability) {
    throw new Error(`Capability desconocida: ${String(permission || "")}`);
  }

  return function enterpriseCapabilityAccess(req, res, next) {
    if (req.user && hasCapability(req.user, capability)) {
      return next();
    }

    return res.status(403).json({
      ok: false,
      code: "CAPABILITY_REQUIRED",
      reason: "capability_denied",
      message: "Tu rol no tiene acceso a esta función"
    });
  };
}

module.exports = {
  requireEnterpriseCapability
};
