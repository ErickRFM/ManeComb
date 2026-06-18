const { buildAuthContext } = require("../services/auth-context");

function getBlockLogPayload(user, authContext) {
  return {
    userId: user?.id || null,
    tenantId: authContext?.tenant?.id || null,
    role: user?.role || null,
    reason: authContext?.mobileBlockReason || "sync_error",
    planStatus: authContext?.subscription?.status || null,
    tenantStatus: authContext?.tenant?.status || null
  };
}

async function buildOperationalAuthContext(store, user) {
  return buildAuthContext(store, user);
}

async function canUseOperationalFeatures(store, user) {
  const authContext = await buildOperationalAuthContext(store, user);
  return authContext.canUseOperations === true;
}

async function requireOperationalAccess(req, res, next) {
  try {
    const authContext = await buildOperationalAuthContext(req.app.locals.store, req.user);
    req.authContext = authContext;

    if (authContext.canUseOperations === true) {
      return next();
    }

    console.warn("[access] operational access blocked", getBlockLogPayload(req.user, authContext));

    return res.status(403).json({
      ok: false,
      code: "PLAN_REQUIRED",
      reason: authContext.mobileBlockReason || "sync_error",
      message: "Necesitas un plan activo para acceder al panel operativo"
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
