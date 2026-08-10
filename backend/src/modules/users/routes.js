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
const { revokeAllSessions } = require("../../services/sessions");
const {
  DriverLifecycleError,
  changeDriverVehicle,
  deleteDriverSafely,
  offboardDriver,
  previewDriverLifecycleImpact,
  reactivateDriver,
  releaseDriverVehicle
} = require("../../services/driver-lifecycle");
const {
  sendAccountLifecycleEmail,
  sendSecurityChangeEmail,
  sendWelcomeEmail
} = require("../../services/domain-email-events");
const { pickSelfProfileFields } = require("../../services/profile-authority");
const { sanitizeProfileForViewer } = require("../../services/profile-visibility");

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

function handleLifecycleError(res, next, error) {
  if (error instanceof DriverLifecycleError) {
    return res.status(error.statusCode).json({
      ok: false,
      code: error.code,
      message: error.message,
      ...(error.details ? { data: error.details } : {})
    });
  }
  return next(error);
}

function emitDriverLifecycle(req, eventName, result) {
  const organizationId = getOrganizationId(req.user);
  const payload = {
    user: result.user,
    vehicle: result.vehicle || result.releasedVehicle || null,
    previousVehicle: result.previousVehicle || null,
    capacity: result.capacity?.summary || null,
    organizationId,
    updatedAt: new Date().toISOString()
  };
  emitOrganizationEvent(req, eventName, payload);
  if (payload.vehicle) emitOrganizationEvent(req, "vehicle:updated", payload);
  if (payload.previousVehicle && payload.previousVehicle.id !== payload.vehicle?.id) {
    emitOrganizationEvent(req, "vehicle:updated", { ...payload, vehicle: payload.previousVehicle });
  }
  if (result.capacity) emitOrganizationEvent(req, "activation:summary-updated", payload);
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
  const profile = sanitizeProfileForViewer(
    req.user,
    await req.app.locals.store.getUserProfile(req.user.id)
  );
  return res.json({
    ok: true,
    data: profile
  });
});

router.patch("/me", authenticate, async (req, res, next) => {
  try {
    const previousProfile = await req.app.locals.store.getUserProfile(req.user.id);
    const previousUser = previousProfile?.user || previousProfile;
    const payload = pickSelfProfileFields(req.user, req.body);
    const user = await req.app.locals.store.updateUser(
      req.user.id,
      payload
    );
    const emailChanged = Boolean(
      payload.email &&
      String(previousUser?.email || "").trim().toLowerCase() !== String(user?.email || "").trim().toLowerCase()
    );
    const passwordChanged = Boolean(payload.password && String(payload.password).trim());
    if (passwordChanged) {
      await revokeAllSessions(user.id, null, "password_changed");
      await sendSecurityChangeEmail(user, "PASSWORD_CHANGED");
    }
    if (emailChanged) {
      await sendSecurityChangeEmail(user, "EMAIL_CHANGED");
    }

    await recordAudit(req, {
      type: "profile_updated",
      entityId: user.id,
      message: `Perfil ${user.email} actualizado`,
      metadata: {
        targetRole: user.role,
        updatedFields: Object.keys(payload).filter((field) => field !== "password")
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
    if (error instanceof DriverLifecycleError) {
      return handleLifecycleError(res, next, error);
    }
    const conflictMessages = ["El correo ya existe", "El RFC ya esta registrado"];
    const isConflict = conflictMessages.some((msg) => error.message === msg);
    error.statusCode = isConflict ? 409 : 400;
    error.publicMessage = "No fue posible actualizar el perfil";
    return next(error);
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

router.post("/", authenticate, requireOrganization, requirePermission("canManageUsers"), async (req, res, next) => {
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
    await sendWelcomeEmail(user);

    return res.status(201).json({
      ok: true,
      data: user
    });
  } catch (error) {
    if (error instanceof DriverLifecycleError) {
      return handleLifecycleError(res, next, error);
    }
    const conflictMessages = ["El correo ya existe", "El RFC ya esta registrado"];
    const isConflict = conflictMessages.some((msg) => error.message === msg);
    error.statusCode = isConflict ? 409 : 400;
    error.publicMessage = "No fue posible crear el usuario";
    return next(error);
  }
});

router.get("/:userId/lifecycle-impact", authenticate, requireOrganization, requirePermission("canManageUsers"), async (req, res, next) => {
  try {
    const data = await previewDriverLifecycleImpact(req.app.locals.store, {
      organizationId: getOrganizationId(req.user),
      userId: req.params.userId
    });
    return res.json({ ok: true, data });
  } catch (error) {
    return handleLifecycleError(res, next, error);
  }
});

router.post("/:userId/offboard", authenticate, requireOrganization, requirePermission("canManageUsers"), async (req, res, next) => {
  try {
    const data = await offboardDriver(req.app.locals.store, {
      actor: req.user,
      actorId: req.user.id,
      organizationId: getOrganizationId(req.user),
      reason: req.body?.reason,
      releaseVehicle: req.body?.releaseVehicle === true,
      userId: req.params.userId
    });

    await recordAudit(req, {
      type: "driver_offboarded",
      entityId: data.user.id,
      message: "Conductor dado de baja",
      metadata: {
        targetUserId: data.user.id,
        vehicleId: data.releasedVehicle?.id || null,
        reason: String(req.body?.reason || "").trim()
      }
    });
    emitDriverLifecycle(req, "driver:offboarded", data);
    if (data.changed) await sendAccountLifecycleEmail(data.user, "ACCOUNT_SUSPENDED");

    return res.json({ ok: true, data });
  } catch (error) {
    return handleLifecycleError(res, next, error);
  }
});

router.post("/:userId/reactivate", authenticate, requireOrganization, requirePermission("canManageUsers"), async (req, res, next) => {
  try {
    const data = await reactivateDriver(req.app.locals.store, {
      actor: req.user,
      organizationId: getOrganizationId(req.user),
      userId: req.params.userId
    });

    await recordAudit(req, {
      type: "driver_reactivated",
      entityId: data.user.id,
      message: "Conductor reactivado",
      metadata: { targetUserId: data.user.id }
    });
    emitDriverLifecycle(req, "driver:reactivated", data);
    if (data.changed) await sendAccountLifecycleEmail(data.user, "ACCOUNT_REACTIVATED");

    return res.json({ ok: true, data });
  } catch (error) {
    return handleLifecycleError(res, next, error);
  }
});

router.patch("/:userId", authenticate, requireOrganization, requirePermission("canManageUsers"), async (req, res, next) => {
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
    const hasVehicleTransition = Object.prototype.hasOwnProperty.call(payload, "vehicleId");
    const requestedVehicleId = hasVehicleTransition ? payload.vehicleId || null : targetUser.vehicleId;
    delete payload.vehicleId;

    if (
      targetUser.role === "driver" &&
      typeof payload.userStatus === "string" &&
      payload.userStatus !== targetUser.userStatus
    ) {
      return res.status(409).json({
        ok: false,
        code: "EXPLICIT_LIFECYCLE_ACTION_REQUIRED",
        message: payload.userStatus === "suspended"
          ? "Usa la acción Dar de baja para suspender al conductor de forma segura."
          : "Usa la acción Reactivar para validar el cupo del plan."
      });
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

    let user = Object.keys(payload).length
      ? await req.app.locals.store.updateUser(req.params.userId, payload)
      : targetUser;

    let vehicleTransition = null;
    if (hasVehicleTransition && requestedVehicleId !== targetUser.vehicleId) {
      vehicleTransition = requestedVehicleId
        ? await changeDriverVehicle(req.app.locals.store, {
            organizationId: getOrganizationId(req.user),
            userId: targetUser.id,
            vehicleId: requestedVehicleId
          })
        : await releaseDriverVehicle(req.app.locals.store, {
            organizationId: getOrganizationId(req.user),
            userId: targetUser.id
          });
      user = vehicleTransition.user;
    }

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

    const previousStatus = String(targetUser.userStatus || "active").trim();
    const currentStatus = String(user.userStatus || "active").trim();
    if (previousStatus === "active" && currentStatus === "suspended") {
      await sendAccountLifecycleEmail(user, "ACCOUNT_SUSPENDED");
    } else if (previousStatus === "suspended" && currentStatus === "active") {
      await sendAccountLifecycleEmail(user, "ACCOUNT_REACTIVATED");
    }

    const emailChanged = Boolean(
      payload.email &&
      String(targetUser.email || "").trim().toLowerCase() !== String(user.email || "").trim().toLowerCase()
    );
    const passwordChanged = Boolean(payload.password && String(payload.password).trim());
    if (passwordChanged) {
      await revokeAllSessions(user.id, null, "password_changed_by_admin");
      await sendSecurityChangeEmail(user, "PASSWORD_CHANGED");
    }
    if (emailChanged) {
      await sendSecurityChangeEmail(user, "EMAIL_CHANGED");
    }

    if (vehicleTransition) {
      await recordAudit(req, {
        type: requestedVehicleId ? "driver_vehicle_changed" : "driver_vehicle_released",
        entityId: user.id,
        message: requestedVehicleId ? "Unidad del conductor actualizada" : "Unidad del conductor liberada",
        metadata: {
          previousVehicleId: vehicleTransition.previousVehicle?.id || targetUser.vehicleId || null,
          vehicleId: vehicleTransition.vehicle?.id || null
        }
      });
      emitDriverLifecycle(req, requestedVehicleId ? "user:updated" : "vehicle:released", vehicleTransition);
    }

    return res.json({
      ok: true,
      data: user
    });
  } catch (error) {
    if (error instanceof DriverLifecycleError) {
      return handleLifecycleError(res, next, error);
    }
    const conflictMessages = ["El correo ya existe", "El RFC ya esta registrado"];
    const isConflict = conflictMessages.some((msg) => error.message === msg);
    error.statusCode = isConflict ? 409 : 400;
    error.publicMessage = "No fue posible actualizar el usuario";
    return next(error);
  }
});

router.delete("/:userId", authenticate, requireOrganization, requirePermission("canManageUsers"), async (req, res, next) => {
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

  if (targetUser.role === "owner") {
    return res.status(409).json({
      ok: false,
      message: "No se puede eliminar al propietario de la organización."
    });
  }

  if (targetUser.role === "driver") {
    try {
      const data = await deleteDriverSafely(req.app.locals.store, {
        actorId: req.user.id,
        confirmation: req.body?.confirmation,
        organizationId: getOrganizationId(req.user),
        reason: req.body?.reason,
        userId: targetUser.id
      });
      await recordAudit(req, {
        type: "driver_deleted",
        entityId: targetUser.id,
        message: "Conductor eliminado lógicamente",
        metadata: {
          reason: String(req.body?.reason || "").trim(),
          preservedActivationKeyId: targetUser.activationKeyId || null
        }
      });
      emitOrganizationEvent(req, "user:deleted", {
        userId: targetUser.id,
        organizationId: getOrganizationId(req.user),
        deletedAt: data.user.deletedAt
      });
      return res.json({ ok: true, data });
    } catch (error) {
      return handleLifecycleError(res, next, error);
    }
  }

  const admins = scopedUsers.filter((entry) => entry.role === "admin");

  if (targetUser.role === "admin" && admins.length <= 1) {
    return res.status(409).json({
      ok: false,
      message: "No se puede eliminar al único administrador de la organización."
    });
  }

  const dependencies = [];

  if (targetUser.role === "driver") {
    const vehicleWithDriver = scopedUsers.some(
      (entry) => entry.vehicleId && targetUser.vehicleId && entry.id !== targetUser.id
    );

    if (targetUser.vehicleId) {
      const vehicle = await req.app.locals.store.getVehicleById(targetUser.vehicleId);

      if (vehicle) {
        dependencies.push("está asignado a una unidad");

        const activeSession = await req.app.locals.store.getActiveRouteSession(targetUser.vehicleId);

        if (activeSession) {
          dependencies.push("tiene una jornada activa");
        }
      }
    }
  }

  if (dependencies.length > 0) {
    const detail = dependencies.join(", ");
    return res.status(409).json({
      ok: false,
      message: `No es posible eliminar este usuario porque ${detail}. Resuélvalos antes de continuar.`
    });
  }

  let affectedVehicleIds = [];
  if (targetUser.role === "driver" || targetUser.role === "supervisor") {
    const live = await req.app.locals.store.getLiveLocations();
    affectedVehicleIds = (live.vehicles || [])
      .filter((v) => v.driverId === targetUser.id || v.supervisorId === targetUser.id)
      .map((v) => v.id);
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

  for (const vehicleId of affectedVehicleIds) {
    const affectedVehicle = await req.app.locals.store.getVehicleById(vehicleId);
    if (affectedVehicle) {
      const orgId = String(affectedVehicle.organizationId || getOrganizationId(req.user)).trim();
      if (orgId) {
        getRolesWithPermission("canViewAnalytics").forEach((role) => {
          req.app.locals.io?.to(`org:${orgId}:role:${role}`).emit("location:updated", affectedVehicle);
        });
        if (affectedVehicle.driverId) {
          req.app.locals.io?.to(`user:${affectedVehicle.driverId}`).emit("location:updated", affectedVehicle);
        }
        req.app.locals.io?.to("platform:admin").emit("location:updated", affectedVehicle);
      }
    }
  }

  return res.json({
    ok: true
  });
});

module.exports = router;
