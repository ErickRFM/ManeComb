const { Router } = require("express");
const { authenticate } = require("../../middlewares/authenticate");
const {
  canAccessAllTenants,
  canAccessTenantResource,
  getOrganizationId,
  getRolesWithPermission,
  requireOrganization,
  requirePermission
} = require("../../middlewares/access-control");

const router = Router();
const ACCOUNT_ADMIN_ROLES = new Set(["owner", "admin", "billing_manager", "support", "viewer"]);
const PROFILE_FIELDS = new Set([
  "name",
  "email",
  "password",
  "phone",
  "avatarUrl",
  "companyName",
  "legalName",
  "taxId",
  "billingEmail",
  "billingAddress",
  "preferredMethod",
  "cardholderName",
  "cardBrand",
  "cardLast4",
  "cardExpMonth",
  "cardExpYear",
  "customerReference",
  "companyProfile",
  "paymentProfile",
  "operationalSchedule",
  "e2eePublicKey",
  "e2eeKeyRotatedAt"
]);
const MANAGED_USER_FIELDS = new Set([
  ...PROFILE_FIELDS,
  "role",
  "accountType",
  "userStatus",
  "status",
  "shift",
  "vehicleId"
]);

function pickFields(payload, allowedFields) {
  return Object.fromEntries(
    Object.entries(payload || {}).filter(([key]) => allowedFields.has(key))
  );
}

function emitOrganizationEvent(req, eventName, payload) {
  const organizationId = getOrganizationId(req.user);

  if (organizationId) {
    getRolesWithPermission("canViewAnalytics").forEach((role) => {
      req.app.locals.io?.to(`org:${organizationId}:role:${role}`).emit(eventName, payload);
    });
  }

  if (payload?.user?.id) {
    req.app.locals.io?.to(`user:${payload.user.id}`).emit(eventName, payload);
  }
}

async function recordAudit(req, payload) {
  await req.app.locals.store.recordAppEvent?.({
    ...payload,
    scope: "audit",
    level: payload.level || "info",
    status: payload.status || "ok",
    userId: req.user?.id,
    metadata: {
      organizationId: getOrganizationId(req.user),
      ...payload.metadata
    }
  });
}

router.get("/me", authenticate, async (req, res) => {
  return res.json({
    ok: true,
    data: await req.app.locals.store.getUserProfile(req.user.id)
  });
});

router.patch("/me", authenticate, async (req, res) => {
  try {
    const user = await req.app.locals.store.updateUser(
      req.user.id,
      pickFields(req.body, PROFILE_FIELDS)
    );

    return res.json({
      ok: true,
      data: user
    });
  } catch (error) {
    return res.status(error.message === "El correo ya existe" ? 409 : 400).json({
      ok: false,
      message: error.message || "No fue posible actualizar el perfil"
    });
  }
});

// Directory access is read-only for operational supervisors. Mutations remain
// protected by canManageUsers below.
router.get("/", authenticate, requireOrganization, requirePermission("canViewAnalytics"), async (req, res) => {
  return res.json({
    ok: true,
    data: await req.app.locals.store.listUsers(req.user)
  });
});

router.post("/", authenticate, requireOrganization, requirePermission("canManageUsers"), async (req, res) => {
  try {
    const organizationId = getOrganizationId(req.user);
    if (!organizationId) {
      return res.status(400).json({ ok: false, message: "La organizacion es obligatoria" });
    }
    const requestedRole = String(req.body?.role || "").trim();

    if (requestedRole === "driver") {
      return res.status(409).json({
        ok: false,
        message: "Los conductores deben registrarse con una key de activacion"
      });
    }

    const requestedAccountType = String(req.body?.accountType || "").trim();
    const accountType =
      requestedAccountType === "company_owner" && ACCOUNT_ADMIN_ROLES.has(requestedRole)
        ? "company_owner"
        : "operations";
    const payload = {
      ...pickFields(req.body, MANAGED_USER_FIELDS),
      accountType,
      organizationId,
      userStatus: req.body?.userStatus || "pending",
      status: req.body?.status || "offline"
    };
    const user = await req.app.locals.store.createUser(payload);

    await recordAudit(req, {
      type: "user_created",
      entityId: user.id,
      message: `Usuario ${user.email} creado`,
      metadata: {
        targetRole: user.role,
        targetUserStatus: user.userStatus
      }
    });
    emitOrganizationEvent(req, "users:invited", {
      user,
      organizationId: getOrganizationId(user),
      createdAt: new Date().toISOString()
    });

    return res.status(201).json({
      ok: true,
      data: user
    });
  } catch (error) {
    return res.status(error.message === "El correo ya existe" ? 409 : 400).json({
      ok: false,
      message: error.message || "No fue posible crear el usuario"
    });
  }
});

router.patch("/:userId", authenticate, requireOrganization, requirePermission("canManageUsers"), async (req, res) => {
  try {
    const scopedUsers = await req.app.locals.store.listUsers(req.user);

    if (!scopedUsers.some((entry) => entry.id === req.params.userId)) {
      return res.status(404).json({
        ok: false,
        message: "Usuario no encontrado"
      });
    }

    const targetUser = scopedUsers.find((entry) => entry.id === req.params.userId);
    const payload = pickFields(req.body, MANAGED_USER_FIELDS);

    if (Object.prototype.hasOwnProperty.call(payload, "vehicleId") && payload.vehicleId !== targetUser.vehicleId) {
      const affectedVehicleIds = [...new Set([targetUser.vehicleId, payload.vehicleId].filter(Boolean))];
      for (const vehicleId of affectedVehicleIds) {
        if (await req.app.locals.store.getActiveRouteSession(vehicleId)) {
          return res.status(409).json({
            ok: false,
            message: "Finaliza la jornada activa antes de cambiar el chofer"
          });
        }
      }
    }

    if (payload.role === "driver" && targetUser.role !== "driver") {
      return res.status(409).json({
        ok: false,
        message: "Los conductores deben registrarse con una key de activacion"
      });
    }

    if (!canAccessAllTenants(req.user)) {
      delete payload.accountType;
    }

    if (payload.vehicleId) {
      const vehicle = await req.app.locals.store.getVehicleById(payload.vehicleId);

      if (!vehicle || !canAccessTenantResource(req.user, vehicle)) {
        return res.status(404).json({
          ok: false,
          message: "Unidad no encontrada"
        });
      }

      if (vehicle.status === "maintenance") {
        return res.status(409).json({
          ok: false,
          message: "La unidad esta en mantenimiento"
        });
      }

      if (vehicle.driverId && vehicle.driverId !== targetUser.id) {
        return res.status(409).json({
          ok: false,
          message: "La unidad ya esta asignada"
        });
      }
    }

    const user = await req.app.locals.store.updateUser(req.params.userId, payload);

    if (!user) {
      return res.status(404).json({
        ok: false,
        message: "Usuario no encontrado"
      });
    }

    await recordAudit(req, {
      type: "user_updated",
      entityId: user.id,
      message: `Usuario ${user.email} actualizado`,
      metadata: {
        targetRole: user.role,
        targetUserStatus: user.userStatus
      }
    });
    emitOrganizationEvent(req, "user:updated", {
      user,
      organizationId: getOrganizationId(user),
      updatedAt: new Date().toISOString()
    });

    return res.json({
      ok: true,
      data: user
    });
  } catch (error) {
    return res.status(error.message === "El correo ya existe" ? 409 : 400).json({
      ok: false,
      message: error.message || "No fue posible actualizar el usuario"
    });
  }
});

router.delete("/:userId", authenticate, requireOrganization, requirePermission("canManageUsers"), async (req, res) => {
  if (req.user.id === req.params.userId) {
    return res.status(400).json({
      ok: false,
      message: "No puedes eliminar tu propia cuenta"
    });
  }

  const scopedUsers = await req.app.locals.store.listUsers(req.user);
  const targetUser = scopedUsers.find((entry) => entry.id === req.params.userId);

  if (!targetUser) {
    return res.status(404).json({
      ok: false,
      message: "Usuario no encontrado"
    });
  }

  const deleted = await req.app.locals.store.deleteUser(req.params.userId);

  if (!deleted) {
    return res.status(404).json({
      ok: false,
      message: "Usuario no encontrado"
    });
  }

  await recordAudit(req, {
    type: "user_deleted",
    entityId: req.params.userId,
    message: `Usuario ${targetUser.email} eliminado`,
    metadata: {
      targetRole: targetUser.role,
      targetUserStatus: targetUser.userStatus
    }
  });
  emitOrganizationEvent(req, "user:deleted", {
    userId: req.params.userId,
    organizationId: getOrganizationId(req.user),
    deletedAt: new Date().toISOString()
  });

  return res.json({
    ok: true
  });
});

module.exports = router;
