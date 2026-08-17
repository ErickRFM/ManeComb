const { Router } = require("express");
const {
  getCommercialPlanById,
  getCommercialPlanPricing
} = require("../../config/commercial-plans");
const { authenticate } = require("../../middlewares/authenticate");
const { requirePermission } = require("../../middlewares/access-control");
const { requirePortalAccess } = require("../../middlewares/portal-access");
const { recordAuditLog } = require("../../services/audit");
const { notifyCommercialOrder } = require("../../services/commercial-notifier");
const { createMercadoPagoRefund, toMinorUnits } = require("../../services/commercial-payment");
const { buildRefundFingerprint, deriveEntitlementAfterFinancialReversal, derivePaymentFinancialState, hashRefundKey } = require("../../services/financial-reversal");
const { listSessionsForUser, revokeSession } = require("../../services/sessions");
const { sendRefundConfirmedEmail } = require("../../services/domain-email-events");
const {
  buildInvoices,
  buildSubscription,
  countUsedUnitSlots,
  enrichOrdersForUser,
  getOrganizationId,
  pickActiveOrder
} = require("../../services/portal-account");
const {
  SUBSCRIPTION_UPDATE_REASONS,
  emitSubscriptionUpdated
} = require("../../services/subscription-realtime");

const router = Router();

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

async function getRegisteredVehicles(req) {
  const store = req.app.locals.store;
  const organizationId = getOrganizationId(req.user);
  if (!organizationId) return [];

  if (typeof store.listVehiclesForOrganization === "function") {
    return await store.listVehiclesForOrganization(organizationId);
  }

  const live = await store.getLiveLocations();
  return (live.vehicles || []).filter(
    (vehicle) => String(vehicle.organizationId || "") === String(organizationId)
  );
}

async function buildAccountSubscription(req, order) {
  const vehicles = await getRegisteredVehicles(req);
  return buildSubscription(order, { usedUnitSlots: countUsedUnitSlots(vehicles) });
}

router.get("/subscription", authenticate, requirePortalAccess, async (req, res) => {
  const activeOrder = pickActiveOrder(await getOrders(req));

  return res.json({
    ok: true,
    data: await buildAccountSubscription(req, activeOrder)
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

  const currentSubscription = await buildAccountSubscription(req, activeOrder);
  if (Number(plan.units || 0) < Number(currentSubscription.activeUnits || 0)) {
    return res.status(409).json({
      ok: false,
      code: "active_usage_exceeds_target",
      message: `Tienes ${currentSubscription.activeUnits} unidades registradas y el plan ${plan.name} permite ${plan.units}. Retira unidades antes de reducir la capacidad.`,
      data: {
        activeUnits: currentSubscription.activeUnits,
        targetUnits: plan.units
      }
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
  const subscription = await buildAccountSubscription(req, updatedOrder);

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
  emitSubscriptionUpdated({
    io: req.app.locals.io,
    organizationId: getOrganizationId(req.user),
    reason: SUBSCRIPTION_UPDATE_REASONS.PLAN_CHANGED
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


  const cancelledAt = new Date().toISOString();
  // Comprobar y escribir en un solo paso. Antes se leia, se comprobaba y se
  // escribia por separado: dos peticiones concurrentes pasaban ambas la guarda y
  // ambas ejecutaban los efectos, enviando DOS correos de cancelacion y dejando
  // DOS entradas de auditoria. `applied:false` significa que otra peticion gano
  // la carrera y esta no debe repetir los efectos.
  const cancellation = await req.app.locals.store.cancelCommercialSubscriptionAtomically(activeOrder.id, {
    cancelledAt,
    reason: String(req.body?.reason || "").trim()
  });

  if (!cancellation.applied) {
    return res.status(cancellation.reason === "order_not_found" ? 404 : 409).json({
      ok: false,
      message: cancellation.reason === "order_not_found"
        ? "No hay suscripcion para cancelar"
        : "La suscripcion ya esta cancelada"
    });
  }

  const updatedOrder = cancellation.order;
  const subscription = await buildAccountSubscription(req, updatedOrder);
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
  emitSubscriptionUpdated({
    io: req.app.locals.io,
    organizationId: getOrganizationId(req.user),
    reason: SUBSCRIPTION_UPDATE_REASONS.SUBSCRIPTION_CANCELLED
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

router.post("/orders/:orderId/refunds", authenticate, requirePortalAccess, requirePermission("canManageBilling"), async (req, res, next) => {
  const rawKey = String(req.get("Idempotency-Key") || "").trim();
  if (rawKey.length < 16 || rawKey.length > 200) return res.status(400).json({ ok: false, code: "missing_refund_idempotency_key", message: "Idempotency-Key es obligatorio" });
  const order = (await getOrders(req)).find((entry) => entry.id === req.params.orderId);
  if (!order) return res.status(404).json({ ok: false, message: "Orden no encontrada" });
  if (order.paymentProvider !== "mercado_pago" || order.paymentStatus !== "paid" || !order.providerPaymentId) {
    return res.status(409).json({ ok: false, code: "payment_not_refundable", message: "La orden no admite reembolso automatico" });
  }
  const paidAmountMinor = toMinorUnits(order.totalPrice, order.currency || "MXN");
  const requestedAmount = req.body?.amount;
  const amountMinor = requestedAmount == null ? paidAmountMinor - Number(order.refundReservedMinor || 0) : toMinorUnits(requestedAmount, order.currency || "MXN");
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) return res.status(400).json({ ok: false, code: "invalid_refund_amount", message: "Importe de reembolso invalido" });
  const completesRefund = Number(order.refundReservedMinor || 0) + amountMinor === paidAmountMinor;
  const organizationId = getOrganizationId(req.user);
  const keyHash = hashRefundKey(rawKey);
  const requestFingerprint = buildRefundFingerprint({ organizationId, orderId: order.id, amountMinor });
  const workerId = req.traceId || `refund-${process.pid}`;
  let claim;
  try {
    claim = await req.app.locals.store.claimRefundOperation({ organizationId, orderId: order.id, providerPaymentId: order.providerPaymentId, amountMinor, currency: order.currency || "MXN", type: completesRefund ? "full_refund" : "partial_refund", idempotencyKeyHash: keyHash, requestFingerprint, requestedBy: req.user.id, workerId });
    if (!claim.claimed) {
      if (claim.reason === "ready") return res.status(200).json({ ok: true, data: claim.operation.safeResponse, replay: true });
      if (claim.reason === "key_reused") return res.status(409).json({ ok: false, code: "refund_idempotency_key_reused", message: "La clave ya fue usada con otra solicitud" });
      return res.status(claim.reason === "provider_result_unknown" ? 503 : 409).json({ ok: false, code: claim.reason, message: "El reembolso no puede repetirse en este momento" });
    }
    if (claim.reason === "new") {
      const reserved = await req.app.locals.store.reserveRefundAmount({ orderId: order.id, organizationId, amountMinor, paidAmountMinor });
      if (!reserved) {
        await req.app.locals.store.failRefundOperation({ operationId: claim.operation.id, workerId, status: "failed_permanent", errorCode: "refund_amount_exceeds_balance" });
        return res.status(409).json({ ok: false, code: "refund_amount_exceeds_balance", message: "El importe supera el saldo reembolsable" });
      }
    }
    const providerRefund = await createMercadoPagoRefund({ paymentId: order.providerPaymentId, amount: completesRefund && Number(order.refundReservedMinor || 0) === 0 ? null : amountMinor / 100, idempotencyKey: rawKey });
    const providerPaymentId = String(providerRefund.payment_id || providerRefund.paymentId || "");
    const providerAmountMinor = toMinorUnits(providerRefund.amount, order.currency || "MXN");
    if (!providerRefund.id || providerPaymentId !== order.providerPaymentId || providerAmountMinor !== amountMinor || !["approved", "refunded"].includes(String(providerRefund.status || "").toLowerCase())) {
      throw Object.assign(new Error("Refund provider response mismatch"), { code: "refund_reconciliation_failed", statusCode: 409, providerResultKnown: true });
    }
    const safeResponse = { id: String(providerRefund.id), orderId: order.id, amount: amountMinor / 100, currency: order.currency || "MXN", status: "confirmed", type: completesRefund ? "full_refund" : "partial_refund" };
    const completedRefund = await req.app.locals.store.completeRefundOperation({ operationId: claim.operation.id, workerId, providerRefundId: safeResponse.id, safeResponse });
    const refundRecords = await req.app.locals.store.listRefundOperations(order.id);
    const chargebackRecords = await req.app.locals.store.listChargebacks(order.id);
    const financialState = derivePaymentFinancialState({ paidAmountMinor, refundRecords, chargebackRecords });
    const entitlement = deriveEntitlementAfterFinancialReversal({ order, financialState });
    await req.app.locals.store.updateCommercialOrder(order.id, { financialStatus: financialState.status, refundedAmountMinor: financialState.refundedAmountMinor, refundableAmountMinor: financialState.refundableAmountMinor, ...(entitlement.action === "none" ? {} : { activationStatus: entitlement.activationStatus, serviceSuspendedReason: entitlement.serviceSuspendedReason }) });
    await recordAudit(req, { type: "payment_refunded", level: "warning", status: financialState.status, entityId: order.id, message: "Reembolso conciliado", metadata: { amountMinor, currency: order.currency || "MXN", refundId: safeResponse.id.slice(-8) } });
    if (completedRefund) {
      await sendRefundConfirmedEmail(order, completedRefund);
    }
    return res.status(201).json({ ok: true, data: safeResponse });
  } catch (error) {
    if (claim?.operation) await req.app.locals.store.failRefundOperation({ operationId: claim.operation.id, workerId, status: error.providerResultUnknown ? "provider_result_unknown" : "failed_retryable", errorCode: error.code || "refund_failed" }).catch(() => null);
    error.statusCode = error.statusCode || (error.providerResultUnknown ? 503 : 409);
    error.publicMessage = "No fue posible confirmar el reembolso";
    return next(error);
  }
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