const { Router } = require("express");
const { authenticate } = require("../../middlewares/authenticate");
const { canAccessTenantResource, filterTenantList, getOrganizationId, requireOrganization, requirePermission } = require("../../middlewares/access-control");
const { requireOperationalAccess } = require("../../middlewares/operational-access");

const router = Router();

router.get("/", authenticate, requireOrganization, requireOperationalAccess, async (req, res) => {
  const live = await req.app.locals.store.getLiveLocations();

  return res.json({
    ok: true,
    data: filterTenantList(req.user, live.vehicles)
  });
});

router.post("/", authenticate, requireOrganization, requirePermission("canManageVehicles"), async (req, res) => {
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

    const vehicle = await req.app.locals.store.createVehicle({
      code,
      plate,
      status,
      organizationId,
      currentKilometers: req.body?.currentKilometers
    });

    req.app.locals.io?.to(`org:${getOrganizationId(req.user)}`).emit("vehicle:created", {
      vehicle,
      organizationId: getOrganizationId(req.user),
      createdAt: new Date().toISOString()
    });

    return res.status(201).json({
      ok: true,
      data: vehicle
    });
  } catch (error) {
    return res.status(400).json({
      ok: false,
      message: error.message || "No fue posible crear la unidad"
    });
  }
});

router.patch("/:vehicleId", authenticate, requireOrganization, requirePermission("canManageVehicles"), async (req, res) => {
  try {
    const vehicleId = String(req.params.vehicleId || "").trim();
    const currentVehicle = await req.app.locals.store.getVehicleById(vehicleId);

    if (!currentVehicle || !canAccessTenantResource(req.user, currentVehicle)) {
      return res.status(404).json({
        ok: false,
        message: "Unidad no encontrada"
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

    const vehicle = await req.app.locals.store.updateVehicle(vehicleId, payload);

    req.app.locals.io?.to(`org:${getOrganizationId(req.user)}`).emit("vehicle:updated", {
      vehicle,
      organizationId: getOrganizationId(req.user),
      updatedAt: new Date().toISOString()
    });

    return res.json({
      ok: true,
      data: vehicle
    });
  } catch (error) {
    return res.status(400).json({
      ok: false,
      message: error.message || "No fue posible actualizar la unidad"
    });
  }
});

module.exports = router;
