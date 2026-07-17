const { Router } = require("express");
const {
  getCommercialPlanById,
  getCommercialPlanPricing
} = require("../../config/commercial-plans");
const { authenticate } = require("../../middlewares/authenticate");
const { getRolesWithPermission, requirePermission } = require("../../middlewares/access-control");
const { requirePortalAccess } = require("../../middlewares/portal-access");
const { recordAuditLog } = require("../../services/audit");
const { notifyCommercialOrder } = require("../../services/commercial-notifier");
const { listSessionsForUser, revokeSession } = require("../../services/sessions");
const {
  buildInvoices,
  buildSubscription,
  enrichOrdersForUser,
  getOrganizationId,
  pickActiveOrder
} = require("../../services/portal-account");

const router = Router();

function emitAccountEvent(req, eventName, payload) {
  const organizationId = getOrganizationId(req.user);

  if (organizationId) {
    getRolesWithPermission("canManageBilling").forEach((role) => {
      req.app.locals.io?.to(`org:${organizationId}:role:${role}`).emit(eventName, payload);
    });
  }

  req.app.locals.io?.to(`user:${req.user.id}`).emit(eventName, payload);
}

async function recordAudit(req, payload) {
  await req.app.locals.store.recordAppEvent?.({
    ...payload,
    scope: "audit",
    userId: req.user?.id,
    metadata: {
      organizationId: getOrganizationId(req.user),
      ...payload.metadata
    }
  });
}

async function getOrders(req) {
  return enrichOrdersForUser(await req.app.locals.store.listCommercialOrdersForUser(req.user), req.user);
}

router.get("/subscription", authenticate, requirePortalAccess, async (req, res) => {
  const activeOrder = pickActiveOrder(await getOrders(req));

  return res.json({
    ok: true,
    data: buildSubscription(activeOrder)
  });
});

router.patch("/subscription/plan", authenticate, requirePortalAccess, requirePermission("canManageBilling"), async (req, res) => {
  const planId = String(req.body?.planId || "").trim();
  const plan = getCommercialPlanById(planId);

  if (!plan) {
    return res.status(404).json({
      ok: false,
      message: "Plan comercial no encontrado"
    });
  }

  const activeOrder = pickActiveOrder(await getOrders(req));

  if (!activeOrder) {
    return res.status(404).json({
      ok: false,
      message: "No hay suscripcion para cambiar"
    });
  }

  if (
    String(activeOrder.status || "").toLowerCase() === "cancelled" ||
    String(activeOrder.activationStatus || "").toLowerCase() === "cancelled"
  ) {
    return res.status(409).json({
      ok: false,
      message: "La suscripcion cancelada no puede cambiar de plan"
    });
  }

  const pricing = getCommercialPlanPricing(plan, req.body?.selectedAddOns || []);
  const updatedOrder = await req.app.locals.store.updateCommercialOrder(activeOrder.id, {
    planId: plan.id,
    planName: plan.name,
    fleetSize: plan.units,
    basePlanPrice: pricing.basePlanPrice,
    addOns: pricing.addOns,
    addOnsTotal: pricing.addOnsTotal,
    radioFeatureEnabled: pricing.radioFeatureEnabled,
    totalPrice: pricing.totalPrice,
    pricePerVehicle: plan.pricePerVehicle,
    strategy: plan.strategy,
    status: activeOrder.status === "cancelled" ? "active" : activeOrder.status
  });
  const subscription = buildSubscription(updatedOrder);

  await recordAudit(req, {
    type: "subscription_plan_changed",
    level: "info",
    status: "updated",
    entityId: activeOrder.id,
    message: `Plan cambiado a ${plan.name}`,
    metadata: {
      planId: plan.id
    }
  });
  emitAccountEvent(req, "subscription:updated", {
    subscription,
    organizationId: getOrganizationId(req.user),
    updatedAt: new Date().toISOString()
  });

  return res.json({
    ok: true,
    data: subscription
  });
});

router.post("/subscription/cancel", authenticate, requirePortalAccess, requirePermission("canManageBilling"), async (req, res) => {
  const activeOrder = pickActiveOrder(await getOrders(req));

  if (!activeOrder) {
    return res.status(404).json({
      ok: false,
      message: "No hay suscripcion para cancelar"
    });
  }


  if (
    String(activeOrder.status || "").toLowerCase() === "cancelled" ||
    String(activeOrder.activationStatus || "").toLowerCase() === "cancelled"
  ) {
    return res.status(409).json({
      ok: false,
      message: "La suscripcion ya esta cancelada"
    });
  }

  const updatedOrder = await req.app.locals.store.updateCommercialOrder(activeOrder.id, {
    activationStatus: "cancelled",
    status: "cancelled",
    cancelAt: new Date().toISOString(),
    activationNotes: String(req.body?.reason || "").trim()
  });
  const subscription = buildSubscription(updatedOrder);
  const deliveryStatus = await notifyCommercialOrder(
    { ...activeOrder, ...updatedOrder },
    "La cancelación de tu suscripción fue registrada.",
    "subscription_cancelled"
  );
  await req.app.locals.store.updateCommercialOrder(activeOrder.id, deliveryStatus);

  await recordAudit(req, {
    type: "subscription_cancelled",
    level: "warning",
    status: "cancelled",
    entityId: activeOrder.id,
    message: `Suscripcion ${activeOrder.referenceCode} cancelada`
  });
  emitAccountEvent(req, "subscription:updated", {
    subscription,
    organizationId: getOrganizationId(req.user),
    updatedAt: new Date().toISOString()
  });

  return res.json({
    ok: true,
    data: subscription
  });
});

router.get("/invoices", authenticate, requirePortalAccess, requirePermission("canManageBilling"), async (req, res) => {
  return res.json({
    ok: true,
    data: buildInvoices(await getOrders(req))
  });
});

router.get("/invoices/:invoiceId/download", authenticate, requirePortalAccess, requirePermission("canManageBilling"), async (req, res) => {
  const invoice = buildInvoices(await getOrders(req)).find(
    (entry) => entry.id === req.params.invoiceId || entry.orderId === req.params.invoiceId
  );

  if (!invoice?.downloadUrl) {
    return res.status(404).json({
      ok: false,
      message: "Factura no disponible"
    });
  }

  return res.redirect(invoice.downloadUrl);
});

router.get("/sessions", authenticate, async (req, res) => {
  return res.json({
    ok: true,
    data: await listSessionsForUser(req.user.id, req.auth?.sid || null)
  });
});

router.delete("/sessions/:sessionId", authenticate, async (req, res) => {
  const revoked = await revokeSession(req.user.id, req.params.sessionId, "user_revoked");

  if (!revoked) {
    return res.status(404).json({
      ok: false,
      message: "Sesion no encontrada"
    });
  }

  await recordAudit(req, {
    type: "session_revoked",
    level: "warning",
    status: "revoked",
    entityId: req.params.sessionId,
    message: "Sesion marcada para cierre"
  });
  await recordAuditLog(req, {
    action: "auth.revoke_session",
    targetType: "session",
    targetId: req.params.sessionId,
    severity: "warning",
    metadata: {
      revoked: Boolean(revoked)
    }
  });

  return res.json({
    ok: true
  });
});

module.exports = router;
