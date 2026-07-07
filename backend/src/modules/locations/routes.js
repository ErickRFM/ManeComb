const { Router } = require("express");
const { authenticate } = require("../../middlewares/authenticate");
const { enterpriseRateLimit } = require("../../middlewares/enterprise-rate-limit");
const { requireOperationalAccess } = require("../../middlewares/operational-access");
const {
  canAccessAllTenants,
  canAccessTenantResource,
  filterTenantList,
  getOrganizationId,
  requireOrganization
} = require("../../middlewares/access-control");
const { getOperationalScheduleState } = require("../../utils/operational-schedule");

const router = Router();
const gpsLimiter = enterpriseRateLimit({ scope: "gps", max: 120, windowMs: 60 * 1000 });

function normalizePoint(point) {
  if (!point) {
    return null;
  }

  const latitude = Number(point.latitude);
  const longitude = Number(point.longitude);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return {
    latitude,
    longitude
  };
}

function filterLiveLocationsForTenant(user, live) {
  const vehicles = filterTenantList(user, live.vehicles || []);
  const vehicleIds = new Set(vehicles.map((vehicle) => vehicle.id));

  return {
    ...live,
    vehicles,
    incidents: (live.incidents || []).filter((incident) => {
      if (user.role === "driver") {
        return incident.reporterId === user.id || incident.vehicleId === user.vehicleId;
      }

      if (incident.vehicleId && vehicleIds.has(incident.vehicleId)) {
        return true;
      }

      return canAccessAllTenants(user) || canAccessTenantResource(user, incident);
    })
  };
}

router.get("/live", authenticate, requireOrganization, requireOperationalAccess, async (req, res) => {
  return res.json({
    ok: true,
    data: filterLiveLocationsForTenant(req.user, await req.app.locals.store.getLiveLocations())
  });
});

router.post("/update", authenticate, requireOrganization, requireOperationalAccess, gpsLimiter, async (req, res) => {
  const vehicleId = String(req.body.vehicleId || "").trim();
  const coordinates = normalizePoint(req.body.coordinates);
  const { heading, speed, timestamp } = req.body;

  if (!vehicleId || !coordinates) {
    return res.status(400).json({
      ok: false,
      message: "vehicleId y coordinates son obligatorios"
    });
  }

  const vehicle = await req.app.locals.store.getVehicleById(vehicleId);

  if (!vehicle) {
    return res.status(404).json({
      ok: false,
      message: "Unidad no encontrada"
    });
  }

  if (!canAccessTenantResource(req.user, vehicle)) {
    return res.status(403).json({
      ok: false,
      message: "No puedes actualizar unidades de otra organizacion"
    });
  }

  if (req.user.role !== "admin" && req.user.vehicleId !== vehicleId) {
    return res.status(403).json({
      ok: false,
      message: "No puedes actualizar la ubicacion de otra unidad"
    });
  }

  const scheduleState = getOperationalScheduleState(req.user.operationalSchedule);
  if (scheduleState.isConfigured && !scheduleState.isWithinSchedule) {
    return res.status(409).json({
      ok: false,
      code: "outside_operational_schedule",
      message: "GPS pausado fuera del horario operativo"
    });
  }

  const update = await req.app.locals.store.updateVehicleLocation({
    vehicleId,
    coordinates,
    heading,
    timestamp,
    speed
  });

  const organizationId = String(vehicle.organizationId || getOrganizationId(req.user)).trim();
  if (organizationId) {
    req.app.locals.io?.to(`org:${organizationId}`).emit("location:updated", update);
  } else {
    req.app.locals.io?.to("platform:admin").emit("location:updated", update);
  }

  return res.json({
    ok: true,
    data: update
  });
});

module.exports = router;
