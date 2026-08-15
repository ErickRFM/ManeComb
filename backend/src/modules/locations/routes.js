const { Router } = require("express");
const { authenticate } = require("../../middlewares/authenticate");
const { enterpriseRateLimit } = require("../../middlewares/enterprise-rate-limit");
const { requireOperationalAccess } = require("../../middlewares/operational-access");
const {
  canAccessTenantResource,
  filterTenantList,
  getOrganizationId,
  requireOrganization
} = require("../../middlewares/access-control");
const { buildGpsFreshness } = require("../../services/tracking-time");
const { ingestVehicleLocation } = require("../../services/vehicle-location-ingestion");

const router = Router();
const gpsLimiter = enterpriseRateLimit({ scope: "gps", max: 120, windowMs: 60 * 1000 });

function getVehicleRouteIds(vehicle) {
  return [
    vehicle?.routeId,
    vehicle?.route?.id,
    vehicle?.assignedRoute?.routeId
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function filterLiveLocationsForTenant(user, live) {
  const vehicles = filterTenantList(user, live.vehicles || []);
  const vehicleIds = new Set(vehicles.map((vehicle) => vehicle.id));
  const organizationId = getOrganizationId(user);
  const role = String(user?.role || "").toLowerCase();
  const isDriver = ["driver", "conductor"].includes(role);
  const driverRouteIds = new Set(
    isDriver ? vehicles.flatMap((vehicle) => getVehicleRouteIds(vehicle)) : []
  );

  return {
    ...live,
    routes: (live.routes || []).filter((route) => {
      const belongsToTenant = Boolean(
        organizationId &&
        route.organizationId &&
        String(route.organizationId) === organizationId
      );

      if (!belongsToTenant) return false;
      if (!isDriver) return true;

      const routeId = String(route.id || route._id || "").trim();
      return Boolean(routeId && driverRouteIds.has(routeId));
    }),
    vehicles: vehicles.map((vehicle) => ({
      ...vehicle,
      gpsFreshness: buildGpsFreshness(vehicle, live.updatedAt)
    })),
    incidents: (live.incidents || []).filter((incident) => {
      if (isDriver) {
        return incident.reporterId === user.id || incident.vehicleId === user.vehicleId;
      }

      if (incident.vehicleId && vehicleIds.has(incident.vehicleId)) {
        return true;
      }

      return canAccessTenantResource(user, incident);
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
  try {
    const result = await ingestVehicleLocation({
      actor: req.user,
      io: req.app.locals.io,
      payload: req.body,
      requestId: req.requestId,
      store: req.app.locals.store,
      transport: "http"
    });
    return res.json({
      ok: true,
      accepted: result.accepted,
      decision: result.decision,
      data: result.publicUpdate,
      packetId: result.packetId,
      positionDecision: result.positionDecision,
      trackingDecision: result.temporal
    });
  } catch (error) {
    if (error?.statusCode) {
      return res.status(error.statusCode).json({ ok: false, code: error.code, message: error.message });
    }
    throw error;
  }
});

module.exports = router;
module.exports.filterLiveLocationsForTenant = filterLiveLocationsForTenant;
