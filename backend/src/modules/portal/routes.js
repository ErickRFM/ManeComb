const { Router } = require("express");
const { authenticate } = require("../../middlewares/authenticate");
const { requirePermission } = require("../../middlewares/access-control");
const { requirePortalAccess } = require("../../middlewares/portal-access");
const {
  buildOnboarding,
  buildPortalOverview,
  enrichOrdersForUser,
  getOrganizationId,
  pickActiveOrder
} = require("../../services/portal-account");

const router = Router();

function emitPortalEvent(req, eventName, payload) {
  const organizationId = getOrganizationId(req.user);

  if (organizationId) {
    req.app.locals.io?.to(`org:${organizationId}`).emit(eventName, payload);
  }

  req.app.locals.io?.to(`user:${req.user.id}`).emit(eventName, payload);
}

async function getPortalContext(req) {
  const organizationId = getOrganizationId(req.user);
  const [rawOrders, users, activationKeys] = await Promise.all([
    req.app.locals.store.listCommercialOrdersForUser(req.user),
    req.app.locals.store.listUsers(req.user),
    organizationId && req.app.locals.store.listActivationKeysForCompany
      ? req.app.locals.store.listActivationKeysForCompany(organizationId)
      : Promise.resolve([])
  ]);
  const orders = enrichOrdersForUser(rawOrders, req.user);

  return {
    activationKeys,
    orders,
    users
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
  const { activationKeys, orders, users } = await getPortalContext(req);
  const activeOrder = pickActiveOrder(orders);

  return res.json({
    ok: true,
    data: buildOnboarding({
      user: req.user,
      order: activeOrder,
      activationKeys,
      users
    })
  });
});

router.patch("/onboarding/:stepId", authenticate, requirePortalAccess, requirePermission("canManageBilling"), async (req, res) => {
  const { activationKeys, orders, users } = await getPortalContext(req);
  const activeOrder = pickActiveOrder(orders);

  if (!activeOrder) {
    return res.status(404).json({
      ok: false,
      message: "No hay una orden activa para actualizar onboarding"
    });
  }

  const current = buildOnboarding({
    user: req.user,
    order: activeOrder,
    activationKeys,
    users
  });
  const nextStatus = req.body?.status === "pending" ? "pending" : "completed";
  const nextSteps = current.steps.map((step) =>
    step.id === req.params.stepId
      ? {
          ...step,
          status: nextStatus
        }
      : step
  );

  if (!nextSteps.some((step) => step.id === req.params.stepId)) {
    return res.status(404).json({
      ok: false,
      message: "Paso de onboarding no encontrado"
    });
  }

  const updatedOrder = await req.app.locals.store.updateCommercialOrder(activeOrder.id, {
    onboardingChecklist: nextSteps.map((step) => ({
      id: step.id,
      title: step.title,
      owner: "cliente",
      status: step.status,
      description: step.description
    })),
    onboardingStatus: nextSteps.every((step) => step.status === "completed") ? "completed" : "pending"
  });
  const payload = buildOnboarding({
    user: req.user,
    order: updatedOrder,
    activationKeys,
    users
  });

  await req.app.locals.store.recordAppEvent?.({
    type: "onboarding_updated",
    scope: "audit",
    level: "info",
    status: nextStatus,
    userId: req.user.id,
    entityId: activeOrder.id,
    message: `Onboarding ${req.params.stepId} actualizado`,
    metadata: {
      organizationId: getOrganizationId(req.user),
      stepId: req.params.stepId
    }
  });
  emitPortalEvent(req, "onboarding:updated", {
    onboarding: payload,
    organizationId: getOrganizationId(req.user),
    updatedAt: new Date().toISOString()
  });

  return res.json({
    ok: true,
    data: payload
  });
});

module.exports = router;
