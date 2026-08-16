const { Router } = require("express");
const { authenticate } = require("../../middlewares/authenticate");
const { requirePortalAccess } = require("../../middlewares/portal-access");
const {
  buildOnboarding,
  buildPortalOverview,
  enrichOrdersForUser,
  getOrganizationId,
  pickActiveOrder
} = require("../../services/portal-account");

const router = Router();

async function getPortalContext(req) {
  const organizationId = getOrganizationId(req.user);
  const store = req.app.locals.store;
  const vehiclesPromise = organizationId && typeof store.listVehiclesForOrganization === "function"
    ? store.listVehiclesForOrganization(organizationId)
    : store.getLiveLocations().then((live) => (live.vehicles || []).filter(
      (vehicle) => String(vehicle.organizationId || "") === String(organizationId || "")
    ));
  const [rawOrders, users, activationKeys, vehicles] = await Promise.all([
    store.listCommercialOrdersForUser(req.user),
    store.listUsers(req.user),
    organizationId && store.listActivationKeysForCompany
      ? store.listActivationKeysForCompany(organizationId)
      : Promise.resolve([]),
    vehiclesPromise
  ]);
  const orders = enrichOrdersForUser(rawOrders, req.user);

  return {
    activationKeys,
    orders,
    users,
    vehicles
  };
}

router.get("/overview", authenticate, requirePortalAccess, async (req, res) => {
  const { activationKeys, orders, users, vehicles } = await getPortalContext(req);

  return res.json({
    ok: true,
    data: buildPortalOverview({
      user: req.user,
      orders,
      activationKeys,
      users,
      vehicles
    })
  });
});

router.get("/onboarding", authenticate, requirePortalAccess, async (req, res) => {
  const { activationKeys, orders, users, vehicles } = await getPortalContext(req);
  const activeOrder = pickActiveOrder(orders);

  return res.json({
    ok: true,
    data: buildOnboarding({
      user: req.user,
      order: activeOrder,
      activationKeys,
      users,
      vehicles
    })
  });
});

module.exports = router;
