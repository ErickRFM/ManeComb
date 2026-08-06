const { hasCapability, ENTERPRISE_CAPABILITY } = require("./access-control");
const { buildAuthContext } = require("../services/auth-context");
const logger = require("../services/logger");

const OPERATIONAL_BLOCK_MESSAGES = {
  account_blocked: "Tu cuenta no tiene acceso operativo",
  capability_denied: "Tu rol no tiene acceso a funciones operativas",
  inactive_plan: "Tu plan no está activo",
  missing_tenant: "La empresa aún no está lista para operar",
  no_plan: "Necesitas un plan activo para acceder al panel operativo",
  payment_pending: "El pago del plan aún no está confirmado",
  sync_error: "No fue posible confirmar el estado operativo",
  wrong_channel: "Esta cuenta pertenece a otro producto de ManeComb"
};

function getBlockLogPayload(user, authContext, reason = null) {
  return {
    userId: user?.id || null,
    tenantId: authContext?.tenant?.id || null,
    role: user?.role || null,
    accountChannel: authContext?.accountChannel || null,
    reason: reason || authContext?.operationalBlockReason || "sync_error",
    planStatus: authContext?.subscription?.status || null,
    tenantStatus: authContext?.tenant?.status || null
  };
}

async function buildOperationalAuthContext(store, user) {
  return buildAuthContext(store, user);
}

async function canUseOperationalFeatures(store, user) {
  const authContext = await buildOperationalAuthContext(store, user);
  return Boolean(
    authContext.canUseOperations === true &&
    hasCapability(user, ENTERPRISE_CAPABILITY.OPERATIONS_USE)
  );
}

async function requireOperationalAccess(req, res, next) {
  try {
    const authContext = await buildOperationalAuthContext(req.app.locals.store, req.user);
    req.authContext = authContext;
    const capabilityAllowed = hasCapability(req.user, ENTERPRISE_CAPABILITY.OPERATIONS_USE);

    if (authContext.canUseOperations === true && capabilityAllowed) {
      return next();
    }

    const reason = authContext.canUseOperations === true && !capabilityAllowed
      ? "capability_denied"
      : authContext.operationalBlockReason || "sync_error";

    logger.warn({
      action: "OperationalAccessBlocked",
      metadata: getBlockLogPayload(req.user, authContext, reason),
      module: "Access",
      organizationId: req.user?.organizationId,
      requestId: req.traceId,
      status: "blocked",
      userId: req.user?.id
    });

    return res.status(403).json({
      ok: false,
      code: capabilityAllowed ? "PLAN_REQUIRED" : "CAPABILITY_REQUIRED",
      reason,
      message: OPERATIONAL_BLOCK_MESSAGES[reason] || OPERATIONAL_BLOCK_MESSAGES.sync_error
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  buildOperationalAuthContext,
  canUseOperationalFeatures,
  getBlockLogPayload,
  requireOperationalAccess
};