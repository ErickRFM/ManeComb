const { Router } = require("express");
const {
  getCommercialPlanById,
  getCommercialPlanPricing
} = require("../../config/commercial-plans");
const { IS_PRODUCTION_RUNTIME } = require("../../config/env");
const { authenticate } = require("../../middlewares/authenticate");
const { requirePermission } = require("../../middlewares/access-control");
const { requirePortalAccess } = require("../../middlewares/portal-access");
const { recordAuditLog } = require("../../services/audit");
const { listSessionsForUser, revokeSession } = require("../../services/sessions");
const {
  buildInvoices,
  buildPaymentMethods,
  buildSubscription,
  enrichOrdersForUser,
  getOrganizationId,
  pickActiveOrder
} = require("../../services/portal-account");

const router = Router();

function emitAccountEvent(req, eventName, payload) {
  const organizationId = getOrganizationId(req.user);

  if (organizationId) {
    req.app.locals.io?.to(`org:${organizationId}`).emit(eventName, payload);
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

function isForbiddenPaymentReference(value) {
  const normalized = String(value || "").trim().toLowerCase();

  return Boolean(
    IS_PRODUCTION_RUNTIME &&
      ["portal-token", "visual-checkout-token"].includes(normalized)
  );
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

router.patch("/subscription/plan", authenticate, requirePermission("canManageBilling"), async (req, res) => {
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

router.post("/subscription/cancel", authenticate, requirePermission("canManageBilling"), async (req, res) => {
  const activeOrder = pickActiveOrder(await getOrders(req));

  if (!activeOrder) {
    return res.status(404).json({
      ok: false,
      message: "No hay suscripcion para cancelar"
    });
  }

  const updatedOrder = await req.app.locals.store.updateCommercialOrder(activeOrder.id, {
    activationStatus: "cancelled",
    status: "cancelled",
    cancelAt: new Date().toISOString(),
    activationNotes: String(req.body?.reason || "").trim()
  });
  const subscription = buildSubscription(updatedOrder);

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

router.get("/invoices", authenticate, requirePermission("canManageBilling"), async (req, res) => {
  return res.json({
    ok: true,
    data: buildInvoices(await getOrders(req))
  });
});

router.get("/invoices/:invoiceId/download", authenticate, requirePermission("canManageBilling"), async (req, res) => {
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

router.get("/payment-methods", authenticate, requirePermission("canManageBilling"), async (req, res) => {
  return res.json({
    ok: true,
    data: buildPaymentMethods(req.user)
  });
});

router.post("/payment-methods", authenticate, requirePermission("canManageBilling"), async (req, res) => {
  const cardLast4 = String(req.body?.last4 || req.body?.cardLast4 || "")
    .replace(/[^\d]/g, "")
    .slice(-4);

  if (!cardLast4) {
    return res.status(400).json({
      ok: false,
      message: "Marca y ultimos 4 digitos son obligatorios"
    });
  }

  const customerReference = String(req.body?.providerToken || req.body?.customerReference || "").trim();

  if (isForbiddenPaymentReference(customerReference)) {
    return res.status(400).json({
      ok: false,
      message: "Referencia de pago simulada no permitida"
    });
  }

  const user = await req.app.locals.store.updateUser(req.user.id, {
    preferredMethod: "card",
    cardBrand: String(req.body?.brand || req.body?.cardBrand || "Tarjeta").trim(),
    cardLast4,
    cardExpMonth: String(req.body?.expMonth || req.body?.cardExpMonth || "").replace(/[^\d]/g, "").slice(0, 2),
    cardExpYear: String(req.body?.expYear || req.body?.cardExpYear || "").replace(/[^\d]/g, "").slice(-2),
    customerReference
  });
  const methods = buildPaymentMethods(user);

  await recordAudit(req, {
    type: "payment_method_created",
    level: "info",
    status: "created",
    entityId: "card-default",
    message: "Metodo de pago agregado"
  });

  return res.status(201).json({
    ok: true,
    data: methods
  });
});

router.patch("/payment-methods/:id", authenticate, requirePermission("canManageBilling"), async (req, res) => {
  if (req.params.id !== "card-default") {
    return res.status(404).json({
      ok: false,
      message: "Metodo de pago no encontrado"
    });
  }

  const payload = {};

  if (typeof req.body?.brand !== "undefined" || typeof req.body?.cardBrand !== "undefined") {
    payload.cardBrand = String(req.body?.brand || req.body?.cardBrand || "").trim();
  }

  if (typeof req.body?.last4 !== "undefined" || typeof req.body?.cardLast4 !== "undefined") {
    payload.cardLast4 = String(req.body?.last4 || req.body?.cardLast4 || "").replace(/[^\d]/g, "").slice(-4);
  }

  if (typeof req.body?.expMonth !== "undefined" || typeof req.body?.cardExpMonth !== "undefined") {
    payload.cardExpMonth = String(req.body?.expMonth || req.body?.cardExpMonth || "").replace(/[^\d]/g, "").slice(0, 2);
  }

  if (typeof req.body?.expYear !== "undefined" || typeof req.body?.cardExpYear !== "undefined") {
    payload.cardExpYear = String(req.body?.expYear || req.body?.cardExpYear || "").replace(/[^\d]/g, "").slice(-2);
  }

  if (
    typeof req.body?.providerToken !== "undefined" ||
    typeof req.body?.customerReference !== "undefined"
  ) {
    const customerReference = String(req.body?.providerToken || req.body?.customerReference || "").trim();

    if (isForbiddenPaymentReference(customerReference)) {
      return res.status(400).json({
        ok: false,
        message: "Referencia de pago simulada no permitida"
      });
    }

    payload.customerReference = customerReference;
  }

  const user = await req.app.locals.store.updateUser(req.user.id, payload);

  await recordAudit(req, {
    type: "payment_method_updated",
    level: "info",
    status: "updated",
    entityId: req.params.id,
    message: "Metodo de pago actualizado"
  });

  return res.json({
    ok: true,
    data: buildPaymentMethods(user)
  });
});

router.delete("/payment-methods/:id", authenticate, requirePermission("canManageBilling"), async (req, res) => {
  if (req.params.id !== "card-default") {
    return res.status(404).json({
      ok: false,
      message: "Metodo de pago no encontrado"
    });
  }

  const user = await req.app.locals.store.updateUser(req.user.id, {
    preferredMethod: "spei",
    cardBrand: "",
    cardLast4: "",
    cardExpMonth: "",
    cardExpYear: "",
    customerReference: ""
  });

  await recordAudit(req, {
    type: "payment_method_deleted",
    level: "warning",
    status: "deleted",
    entityId: req.params.id,
    message: "Metodo de pago eliminado"
  });

  return res.json({
    ok: true,
    data: buildPaymentMethods(user)
  });
});

router.post("/payment-methods/:id/default", authenticate, requirePermission("canManageBilling"), async (req, res) => {
  if (!["card-default", "spei-default"].includes(req.params.id)) {
    return res.status(404).json({
      ok: false,
      message: "Metodo de pago no encontrado"
    });
  }

  if (req.params.id === "card-default" && !req.user.paymentProfile?.cardLast4) {
    return res.status(404).json({
      ok: false,
      message: "Metodo de pago no encontrado"
    });
  }

  const preferredMethod = req.params.id === "card-default" ? "card" : "spei";
  const user = await req.app.locals.store.updateUser(req.user.id, {
    preferredMethod
  });

  await recordAudit(req, {
    type: "payment_method_default_changed",
    level: "info",
    status: "updated",
    entityId: req.params.id,
    message: "Metodo de pago principal actualizado"
  });

  return res.json({
    ok: true,
    data: buildPaymentMethods(user)
  });
});

router.get("/sessions", authenticate, async (req, res) => {
  return res.json({
    ok: true,
    data: await listSessionsForUser(req.user.id, req.auth?.sid || null)
  });
});

router.delete("/sessions/:sessionId", authenticate, async (req, res) => {
  const revoked = await revokeSession(req.user.id, req.params.sessionId, "user_revoked");

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
