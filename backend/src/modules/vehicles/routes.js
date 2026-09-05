const { Router } = require("express");
const { authenticate } = require("../../middlewares/authenticate");
const { canAccessTenantResource, getOrganizationId, getRolesWithPermission, hasPermission, requireOrganization, requirePermission } = require("../../middlewares/access-control");
const { requireOperationalAccess } = require("../../middlewares/operational-access");
const {
  DriverLifecycleError,
  deleteVehicleSafely,
  previewVehicleDeletionImpact,
  retireVehicle
} = require("../../services/driver-lifecycle");
const { findVehicleIdentityConflict } = require("./identity-conflict");

const router = Router();

router.get("/", authenticate, requireOrganization, requireOperationalAccess, async (req, res) => {
  const includeRetired = req.query.includeRetired === "true" && hasPermission(req.user, "canManageVehicles");
  const vehicles = await req.app.locals.store.listVehiclesForOrganization(
    getOrganizationId(req.user),
    { includeRetired }
  );

  return res.json({
    ok: true,
    data: vehicles
  });
});

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

async function recordVehicleAudit(req, action, vehicleId, metadata = {}) {
  await req.app.locals.store.recordAppEvent?.({
    type: action,
    scope: "audit",
    level: "info",
    status: "ok",
    userId: req.user.id,
    entityId: vehicleId,
    message: action,
    metadata: { organizationId: getOrganizationId(req.user), ...metadata }
  });
}

router.get("/:vehicleId/deletion-impact", authenticate, requireOrganization, requirePermission("canManageVehicles"), async (req, res, next) => {
  try {
    const data = await previewVehicleDeletionImpact(req.app.locals.store, {
      organizationId: getOrganizationId(req.user),
      vehicleId: req.params.vehicleId
    });
    return res.json({ ok: true, data });
  } catch (error) {
    return handleLifecycleError(res, next, error);
  }
});

router.post("/:vehicleId/retire", authenticate, requireOrganization, requirePermission("canManageVehicles"), async (req, res, next) => {
  try {
    const data = await retireVehicle(req.app.locals.store, {
      actorId: req.user.id,
      organizationId: getOrganizationId(req.user),
      reason: req.body?.reason,
      vehicleId: req.params.vehicleId
    });
    await recordVehicleAudit(req, "vehicle_retired", req.params.vehicleId, {
      reason: String(req.body?.reason || "").trim()
    });
    getRolesWithPermission("canManageVehicles").forEach((role) => {
      req.app.locals.io?.to(`org:${getOrganizationId(req.user)}:role:${role}`).emit("vehicle:retired", {
        vehicle: data.vehicle,
        organizationId: getOrganizationId(req.user),
        updatedAt: new Date().toISOString()
      });
    });
    return res.json({ ok: true, data });
  } catch (error) {
    return handleLifecycleError(res, next, error);
  }
});

router.post("/", authenticate, requireOrganization, requirePermission("canManageVehicles"), async (req, res, next) => {
  try {
    const organizationId = getOrganizationId(req.user);
    if (!organizationId) return res.status(400).json({ ok: false, message: "La organizacion es obligatoria" });
    const code = String(req.body?.code || "").trim();
    const plate = String(req.body?.plate || "").trim().toUpperCase();
    const status = String(req.body?.status || "available").trim() || "available";
    const allowedStatuses = new Set(["available", "maintenance"]);

    if (!code || !plate) {
      return res.status(400).json({
        ok: false,
        message: "Nombre y placas de unidad son obligatorios"
      });
    }

    if (!allowedStatuses.has(status)) {
      return res.status(400).json({
        ok: false,
        message: "Estado de unidad invalido"
      });
    }

    const identityConflict = await findVehicleIdentityConflict(req.app.locals.store, {
      organizationId,
      code,
      plate
    });
    if (identityConflict) {
      return res.status(409).json({ ok: false, ...identityConflict });
    }

    const vehicle = await req.app.locals.store.createVehicle({
      code,
      plate,
      status,
      organizationId,
      currentKilometers: req.body?.currentKilometers
    });

    getRolesWithPermission("canManageVehicles").forEach((role) => {
      req.app.locals.io?.to(`org:${getOrganizationId(req.user)}:role:${role}`).emit("vehicle:created", {
        vehicle,
        organizationId: getOrganizationId(req.user),
        createdAt: new Date().toISOString()
      });
    });

    return res.status(201).json({
      ok: true,
      data: vehicle
    });
  } catch (error) {
    const conflictMessages = [
      "El numero economico ya esta registrado",
      "Ya existe una unidad con esas placas",
      "Ya existe una unidad con ese nombre o placas"
    ];
    const isConflict = conflictMessages.some((msg) => error.message?.includes?.(msg));
    if (isConflict) {
      return res.status(409).json({
        ok: false,
        code: "vehicle_identity_conflict",
        message: "Ya existe una unidad activa con ese nombre/codigo o placas."
      });
    }
    error.statusCode = 400;
    error.publicMessage = "No fue posible crear la unidad";
    return next(error);
  }
});

router.patch("/:vehicleId", authenticate, requireOrganization, requirePermission("canManageVehicles"), async (req, res, next) => {
  try {
    const vehicleId = String(req.params.vehicleId || "").trim();
    const currentVehicle = await req.app.locals.store.getVehicleById(vehicleId);

    if (!currentVehicle || !canAccessTenantResource(req.user, currentVehicle)) {
      return res.status(404).json({
        ok: false,
        message: "Unidad no encontrada"
      });
    }

    if (currentVehicle.retiredAt) {
      return res.status(409).json({
        ok: false,
        message: "Una unidad retirada no puede editarse ni volver a operación."
      });
    }

    const payload = {};

    if (typeof req.body?.code !== "undefined") {
      payload.code = String(req.body.code || "").trim();
    }

    if (typeof req.body?.plate !== "undefined") {
      payload.plate = String(req.body.plate || "").trim().toUpperCase();
    }

    if (typeof req.body?.status !== "undefined") {
      const status = String(req.body.status || "").trim();
      const allowedStatuses = new Set(["available", "maintenance"]);

      if (!allowedStatuses.has(status)) {
        return res.status(400).json({
          ok: false,
          message: "Estado de unidad invalido"
        });
      }

      payload.status = status;
      if (status === "maintenance" && await req.app.locals.store.getActiveRouteSession(vehicleId)) {
        return res.status(409).json({ ok: false, message: "Finaliza la jornada activa antes de desactivar la unidad" });
      }
      if (status === "maintenance" && currentVehicle.driverId) {
        return res.status(409).json({
          ok: false,
          message: "Libera al conductor antes de poner la unidad en mantenimiento."
        });
      }
    }

    if (typeof req.body?.currentKilometers !== "undefined") {
      payload.currentKilometers = req.body.currentKilometers;
    }

    if (payload.code === "" || payload.plate === "") {
      return res.status(400).json({
        ok: false,
        message: "Nombre y placas de unidad son obligatorios"
      });
    }

    const identityConflict = await findVehicleIdentityConflict(req.app.locals.store, {
      organizationId: getOrganizationId(req.user),
      code: typeof payload.code !== "undefined" ? payload.code : currentVehicle.code,
      plate: typeof payload.plate !== "undefined" ? payload.plate : currentVehicle.plate,
      excludeVehicleId: vehicleId
    });
    if (identityConflict) {
      return res.status(409).json({ ok: false, ...identityConflict });
    }

    const vehicle = await req.app.locals.store.updateVehicle(vehicleId, payload);

    getRolesWithPermission("canManageVehicles").forEach((role) => {
      req.app.locals.io?.to(`org:${getOrganizationId(req.user)}:role:${role}`).emit("vehicle:updated", {
        vehicle,
        organizationId: getOrganizationId(req.user),
        updatedAt: new Date().toISOString()
      });
    });
    if (vehicle?.driverId) {
      req.app.locals.io?.to(`user:${vehicle.driverId}`).emit("vehicle:updated", {
        vehicle,
        organizationId: getOrganizationId(req.user),
        updatedAt: new Date().toISOString()
      });
    }

    return res.json({
      ok: true,
      data: vehicle
    });
  } catch (error) {
    const conflictMessages = [
      "El numero economico ya esta registrado",
      "Ya existe una unidad con esas placas",
      "Ya existe una unidad con ese nombre o placas"
    ];
    const isConflict = conflictMessages.some((msg) => error.message?.includes?.(msg));
    error.statusCode = isConflict ? 409 : 400;
    error.publicMessage = isConflict
      ? "Ya existe una unidad activa con ese nombre/codigo o placas."
      : "No fue posible actualizar la unidad";
    return next(error);
  }
});

router.delete("/:vehicleId", authenticate, requireOrganization, requirePermission("canManageVehicles"), async (req, res, next) => {
  try {
    const vehicleId = String(req.params.vehicleId || "").trim();
    const deleted = await deleteVehicleSafely(req.app.locals.store, {
      organizationId: getOrganizationId(req.user),
      vehicleId
    });
    const auditAction = deleted.archiveDeleted ? "vehicle_archive_deleted" : "vehicle_deleted";
    await recordVehicleAudit(req, auditAction, vehicleId, {
      archiveDeleted: Boolean(deleted.archiveDeleted),
      preservedHistory: deleted.preservedHistory || null,
      preservedDocuments: deleted.preservedDocuments || null
    });

    getRolesWithPermission("canManageVehicles").forEach((role) => {
      req.app.locals.io?.to(`org:${getOrganizationId(req.user)}:role:${role}`).emit("vehicle:deleted", {
        vehicleId,
        archiveDeleted: Boolean(deleted.archiveDeleted),
        organizationId: getOrganizationId(req.user),
        deletedAt: new Date().toISOString()
      });
    });

    return res.json({
      ok: true,
      data: deleted
    });
  } catch (error) {
    if (error instanceof DriverLifecycleError) {
      return handleLifecycleError(res, next, error);
    }
    error.statusCode = 400;
    error.publicMessage = "No fue posible eliminar la unidad";
    return next(error);
  }
});

module.exports = router;