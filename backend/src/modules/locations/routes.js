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
const { buildGpsFreshness } = require("../../services/tracking-time");
const { ingestVehicleLocation } = require("../../services/vehicle-location-ingestion");

const router = Router();
const gpsLimiter = enterpriseRateLimit({ scope: "gps", max: 120, windowMs: 60 * 1000 });

function filterLiveLocationsForTenant(user, live) {
  const vehicles = filterTenantList(user, live.vehicles || []);
  const vehicleIds = new Set(vehicles.map((vehicle) => vehicle.id));
  const organizationId = getOrganizationId(user);

  return {
    ...live,
    routes: (live.routes || []).filter((route) => {
      return canAccessAllTenants(user) || Boolean(
        route.organizationId && String(route.organizationId) === String(organizationId || "")
      );
    }),
    vehicles: vehicles.map((vehicle) => ({
      ...vehicle,
      gpsFreshness: buildGpsFreshness(vehicle.locationTimestamp, live.updatedAt)
    })),
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
