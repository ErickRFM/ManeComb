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
const { countUsedUnitSlots } = require("../../services/portal-account");
const { createSessionForRequest } = require("../../services/sessions");
const { buildAuthSession } = require("../../utils/jwt");
const { enterpriseRateLimit } = require("../../middlewares/enterprise-rate-limit");
const { sendWelcomeEmail } = require("../../services/domain-email-events");
const logger = require("../../services/logger");

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
      code: error.code,
      message: error.message
    });
  }

  logger.error({
    action: "ActivationRequest",
    module: "ActivationKeys",
    status: "failed",
    message: "Fallo inesperado durante la activación",
    metadata: {
      errorName: String(error?.name || "Error").slice(0, 80)
    }
  });

  return res.status(500).json({
    ok: false,
    code: "activation_unavailable",
    message: "No fue posible completar la activación. Intenta nuevamente."
  });
}

async function withRegisteredUnitSummary(req, data) {
  if (!data?.summary) return data;

  const organizationId = getOrganizationId(req.user);
  const store = req.app.locals.store;
  let vehicles = [];

  if (organizationId && typeof store.listVehiclesForOrganization === "function") {
    vehicles = await store.listVehiclesForOrganization(organizationId);
  } else if (organizationId && typeof store.getLiveLocations === "function") {
    const live = await store.getLiveLocations();
    vehicles = (live.vehicles || []).filter(
      (vehicle) => String(vehicle.organizationId || "") === String(organizationId)
    );
  }

  return {
    ...data,
    summary: {
      ...data.summary,
      activeUnits: countUsedUnitSlots(vehicles)
    }
  };
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
    accountChannel: authContext.accountChannel,
    accountChannelReason: authContext.accountChannelReason,
    canAccessMobile: authContext.canAccessMobile,
    canAccessPortal: authContext.canAccessPortal,
    canUseOperations: authContext.canUseOperations,
    mobileBlockReason: authContext.mobileBlockReason,
    operationalBlockReason: authContext.operationalBlockReason,
    tenant: authContext.tenant,
    subscription: authContext.subscription,
    onboarding: authContext.onboarding,
    postLoginDestination: authContext.productDestination || authContext.destination,
    postLoginRoute: authContext.productRoute || authContext.route,
    productDestination: authContext.productDestination || authContext.destination,
    productRoute: authContext.productRoute || authContext.route,
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
        data: await withRegisteredUnitSummary(
          req,
          await listAdminActivationKeys(req.app.locals.store, req.user)
        )
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
      const data = await withRegisteredUnitSummary(
        req,
        await generateActivationKeyForAdmin(req.app.locals.store, req.user, {
          expiresInDays: req.body?.expiresInDays
        })
      );

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
      const data = await withRegisteredUnitSummary(
        req,
        await deleteActivationKeyForAdmin(
          req.app.locals.store,
          req.user,
          req.params.id
        )
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
      const data = await withRegisteredUnitSummary(
        req,
        await revokeActivationKeyForAdmin(
          req.app.locals.store,
          req.user,
          req.params.id
        )
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
      const data = await withRegisteredUnitSummary(
        req,
        await shareActivationKeyForAdmin(
          req.app.locals.store,
          req.user,
          req.params.id
        )
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
