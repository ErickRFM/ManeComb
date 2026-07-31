const { Router } = require("express");
const { authenticate } = require("../../middlewares/authenticate");
const {
  getOrganizationId,
  getRolesWithPermission,
  requireOrganization,
  requirePermission
} = require("../../middlewares/access-control");
const { recordAuditLog } = require("../../services/audit");
const {
  ActivationKeyError,
  generateActivationKeyForAdmin,
  listAdminActivationKeys,
  registerDriverWithActivationKey,
  deleteActivationKeyForAdmin,
  revokeActivationKeyForAdmin,
  shareActivationKeyForAdmin,
  validateDriverActivationKey
} = require("../../services/activation-keys");
const { buildAuthContext } = require("../../services/auth-context");
const { createSessionForRequest } = require("../../services/sessions");
const { buildAuthSession } = require("../../utils/jwt");
const { enterpriseRateLimit } = require("../../middlewares/enterprise-rate-limit");
const { sendWelcomeEmail } = require("../../services/domain-email-events");

const adminActivationKeyRoutes = Router();
const driverActivationRoutes = Router();

// Rutas anonimas: /validate devuelve unidades de la organizacion de la key, asi
// que se limita por IP mas estrecho que el limite global de /api (200/15min).
const driverActivationLimiter = enterpriseRateLimit({
  scope: "driver-activation",
  max: 10,
  windowMs: 60 * 1000,
  message: "Demasiados intentos de activación. Intenta de nuevo en un minuto."
});

function handleActivationError(res, error) {
  if (error instanceof ActivationKeyError) {
    return res.status(error.statusCode || 400).json({
      ok: false,
      message: error.message
    });
  }

  return res.status(400).json({
    ok: false,
    message: error.message || "No se pudo activar la cuenta. Intenta nuevamente."
  });
}

function emitActivationKeysUpdated(req, payload) {
  const organizationId = getOrganizationId(req.user);

  if (organizationId) {
    getRolesWithPermission("canManageUsers").forEach((role) => {
      req.app.locals.io?.to(`org:${organizationId}:role:${role}`).emit("activation-keys:updated", payload);
    });
  }

  req.app.locals.io?.to(`user:${req.user.id}`).emit("activation-keys:updated", payload);
}

async function buildDriverLoginResponse(req, res, user, activation) {
  const refresh = await createSessionForRequest(req, user);
  const session = buildAuthSession(user, refresh.session.id);
  const authContext = await buildAuthContext(req.app.locals.store, user);

  await recordAuditLog(req, {
    actorId: user.id,
    organizationId: user.organizationId,
    action: "driver.activation.register",
    targetType: "activation_key",
    targetId: activation.activationKey?.id || null,
    severity: "info",
    metadata: {
      companyId: activation.company?.id,
      vehicleId: activation.vehicle?.id || null
    }
  });

  return res.status(201).json({
    ok: true,
    token: session.token,
    tokenExpiresAt: session.tokenExpiresAt,
    refreshToken: refresh.refreshToken,
    refreshTokenExpiresAt: refresh.session.expiresAt,
    session: refresh.session,
    user,
    authContext,
    canAccessMobile: authContext.canAccessMobile,
    mobileBlockReason: authContext.mobileBlockReason,
    tenant: authContext.tenant,
    subscription: authContext.subscription,
    onboarding: authContext.onboarding,
    postLoginRoute: authContext.route,
    dashboard: authContext.canUseOperations
      ? await req.app.locals.store.getDashboardOverview(user)
      : null,
    activation
  });
}

adminActivationKeyRoutes.get(
  "/",
  authenticate,
  requireOrganization,
  requirePermission("canManageUsers"),
  async (req, res) => {
    try {
      return res.json({
        ok: true,
        data: await listAdminActivationKeys(req.app.locals.store, req.user)
      });
    } catch (error) {
      return handleActivationError(res, error);
    }
  }
);

adminActivationKeyRoutes.post(
  "/generate",
  authenticate,
  requireOrganization,
  requirePermission("canManageUsers"),
  async (req, res) => {
    try {
      const data = await generateActivationKeyForAdmin(req.app.locals.store, req.user, {
        expiresInDays: req.body?.expiresInDays
      });

      await recordAuditLog(req, {
        action: "activation_key.generate",
        targetType: "activation_key",
        targetId: data.activationKey?.id || null,
        severity: "info",
        metadata: {
          organizationId: getOrganizationId(req.user),
          planId: data.summary?.planId
        }
      });
      emitActivationKeysUpdated(req, {
        ...data,
        organizationId: getOrganizationId(req.user),
        updatedAt: new Date().toISOString()
      });

      return res.status(201).json({
        ok: true,
        data
      });
    } catch (error) {
      return handleActivationError(res, error);
    }
  }
);

adminActivationKeyRoutes.delete(
  "/:id",
  authenticate,
  requireOrganization,
  requirePermission("canManageUsers"),
  async (req, res) => {
    try {
      const data = await deleteActivationKeyForAdmin(
        req.app.locals.store,
        req.user,
        req.params.id
      );

      await recordAuditLog(req, {
        action: "activation_key.delete",
        targetType: "activation_key",
        targetId: req.params.id,
        severity: "warning",
        metadata: {
          organizationId: getOrganizationId(req.user)
        }
      });
      emitActivationKeysUpdated(req, {
        ...data,
        organizationId: getOrganizationId(req.user),
        updatedAt: new Date().toISOString()
      });

      return res.json({
        ok: true,
        data
      });
    } catch (error) {
      return handleActivationError(res, error);
    }
  }
);

adminActivationKeyRoutes.patch(
  "/:id/revoke",
  authenticate,
  requireOrganization,
  requirePermission("canManageUsers"),
  async (req, res) => {
    try {
      const data = await revokeActivationKeyForAdmin(
        req.app.locals.store,
        req.user,
        req.params.id
      );

      await recordAuditLog(req, {
        action: "activation_key.revoke",
        targetType: "activation_key",
        targetId: req.params.id,
        severity: "warning",
        metadata: {
          organizationId: getOrganizationId(req.user)
        }
      });
      emitActivationKeysUpdated(req, {
        ...data,
        organizationId: getOrganizationId(req.user),
        updatedAt: new Date().toISOString()
      });

      return res.json({
        ok: true,
        data
      });
    } catch (error) {
      return handleActivationError(res, error);
    }
  }
);

adminActivationKeyRoutes.post(
  "/:id/share",
  authenticate,
  requireOrganization,
  requirePermission("canManageUsers"),
  async (req, res) => {
    try {
      const data = await shareActivationKeyForAdmin(
        req.app.locals.store,
        req.user,
        req.params.id
      );

      await recordAuditLog(req, {
        action: "activation_key.share",
        targetType: "activation_key",
        targetId: req.params.id,
        severity: "info",
        metadata: {
          organizationId: getOrganizationId(req.user)
        }
      });
      emitActivationKeysUpdated(req, {
        ...data,
        organizationId: getOrganizationId(req.user),
        updatedAt: new Date().toISOString()
      });

      return res.json({
        ok: true,
        data
      });
    } catch (error) {
      return handleActivationError(res, error);
    }
  }
);

driverActivationRoutes.post("/validate", driverActivationLimiter, async (req, res) => {
  try {
    const data = await validateDriverActivationKey(req.app.locals.store, req.body?.key);

    await req.app.locals.store.recordAppEvent?.({
      type: "driver_activation_key_validated",
      scope: "activation",
      level: "info",
      status: "ok",
      entityId: data.keyId,
      message: `Key validada para ${data.companyName}`,
      metadata: {
        companyId: data.companyId,
        planId: data.planId,
        traceId: req.traceId
      }
    });

    return res.json({
      ok: true,
      data
    });
  } catch (error) {
    return handleActivationError(res, error);
  }
});

driverActivationRoutes.post("/register", driverActivationLimiter, async (req, res) => {
  try {
    const activation = await registerDriverWithActivationKey(req.app.locals.store, req.body || {});

    getRolesWithPermission("canManageUsers").forEach((role) => {
      req.app.locals.io?.to(`org:${activation.company.id}:role:${role}`).emit("users:invited", {
        user: activation.user,
        organizationId: activation.company.id,
        activationKeyId: activation.activationKey?.id || null,
        createdAt: new Date().toISOString()
      });
    });

    await sendWelcomeEmail(activation.user);

    return buildDriverLoginResponse(req, res, activation.user, activation);
  } catch (error) {
    return handleActivationError(res, error);
  }
});

module.exports = {
  adminActivationKeyRoutes,
  driverActivationRoutes
};
