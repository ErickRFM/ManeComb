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
  const [rawOrders, users, activationKeys, live] = await Promise.all([
    req.app.locals.store.listCommercialOrdersForUser(req.user),
    req.app.locals.store.listUsers(req.user),
    organizationId && req.app.locals.store.listActivationKeysForCompany
      ? req.app.locals.store.listActivationKeysForCompany(organizationId)
      : Promise.resolve([]),
    req.app.locals.store.getLiveLocations()
  ]);
  const orders = enrichOrdersForUser(rawOrders, req.user);

  return {
    activationKeys,
    orders,
    users,
    vehicles: (live.vehicles || []).filter(
      (vehicle) => String(vehicle.organizationId || "") === String(organizationId || "")
    )
  };
}

router.get("/overview", authenticate, requirePortalAccess, async (req, res) => {
  const { activationKeys, orders, users } = await getPortalContext(req);

  return res.json({
    ok: true,
    data: buildPortalOverview({
      user: req.user,
      orders,
      activationKeys,
      users
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
