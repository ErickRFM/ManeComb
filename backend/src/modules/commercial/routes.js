const { Router } = require("express");
const { randomUUID } = require("crypto");
const { getCommercialPlanById, listCommercialPlans } = require("../../config/commercial-plans");
const { authenticate } = require("../../middlewares/authenticate");
const { getRolesWithPermission } = require("../../middlewares/access-control");
const { requirePermission } = require("../../middlewares/access-control");
const { requirePortalAccess } = require("../../middlewares/portal-access");
const {
  confirmCommercialPayment,
  createCommercialCheckout,
  fetchMercadoPagoChargeback,
  fetchMercadoPagoPayment,
  isAutomaticPaymentEnabled,
  isMercadoPagoWebhookSignatureValid,
  toMinorUnits
} = require("../../services/commercial-payment");
const { deriveEntitlementAfterFinancialReversal, derivePaymentFinancialState, evaluateChargebackTransition, reconcileChargebackWithOrder } = require("../../services/financial-reversal");
const {
  addDaysToIso,
  buildCommercialActivationUpdate,
  evaluateTrialEligibility
} = require("../../services/commercial-activation");
const { notifyCommercialOrder } = require("../../services/commercial-notifier");
const { enrichCommercialOrder } = require("../../services/commercial-profile");
const { buildSubscription } = require("../../services/portal-account");
const {
  buildCommercialDownloadResponse,
  isCommercialDownloadAuthorized,
  verifyCommercialDownloadToken
} = require("../../services/commercial-downloads");
const {
  buildWebhookDeliveryKey,
  claimWebhookDelivery,
  completeWebhookDelivery,
  failWebhookDelivery
} = require("../../services/webhook-idempotency");
const logger = require("../../services/logger");
const {
  buildCheckoutKeyHash,
  buildCheckoutRequestFingerprint,
  buildCheckoutScope,
  validateCheckoutIdempotencyKey
} = require("../../services/checkout-idempotency");

const router = Router();

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function emitCommercialEvent(req, eventName, order, payload = {}) {
  const organizationId = String(order?.organizationId || order?.organizationSlug || "").trim();
  const ownerUserId = String(order?.ownerUserId || "").trim();
  const eventPayload = {
    order,
    organizationId,
    updatedAt: new Date().toISOString(),
    ...payload
  };

  if (organizationId) {
    getRolesWithPermission("canManageBilling").forEach((role) => {
      req.app.locals.io?.to(`org:${organizationId}:role:${role}`).emit(eventName, eventPayload);
    });
  }

  if (ownerUserId) {
    req.app.locals.io?.to(`user:${ownerUserId}`).emit(eventName, eventPayload);
  }

  req.app.locals.io?.to("platform:admin").emit(eventName, eventPayload);
}

function buildCheckoutSafeResponse(order, nextStep) {
  const fields = [
    "id", "referenceCode", "planId", "planName", "fleetSize", "basePlanPrice", "addOns",
    "addOnsTotal", "radioFeatureEnabled", "totalPrice", "pricePerVehicle", "currency",
    "paymentMethod", "paymentProvider", "checkoutUrl", "paymentExternalReference",
    "paymentProviderReference", "paymentStatus", "status", "activationStatus", "trialStatus",
    "onboardingStatus", "paymentInstructions", "downloads", "createdAt"
  ];
  const response = fields.reduce((result, field) => {
    if (typeof order?.[field] !== "undefined") result[field] = order[field];
    return result;
  }, {});
  return { ...response, nextStep };
}

function emitSubscriptionUpdate(req, order) {
  const organizationId = String(order?.organizationId || order?.organizationSlug || "").trim();

  if (!organizationId) {
    return;
  }

  req.app.locals.io?.to(`org:${organizationId}`).emit("subscription:updated", {
    organizationId,
    subscription: buildSubscription(order),
    updatedAt: new Date().toISOString()
  });
}

function isCommercialOrderPaid(order) {
  return Boolean(
    ["paid"].includes(String(order?.paymentStatus || "").toLowerCase()) ||
      ["active", "paid"].includes(String(order?.status || "").toLowerCase()) ||
      String(order?.activationStatus || "").toLowerCase() === "active"
  );
}

async function findOrderLinkedToPayment(store, paymentId, currentOrderId) {
  const orders = await store.listCommercialOrders();
  return orders.find(
    (candidate) =>
      String(candidate?.paymentProviderReference || "").trim() === String(paymentId || "").trim() &&
      String(candidate?.id || "").trim() !== String(currentOrderId || "").trim()
  ) || null;
}

function assertReconciliationSucceeded(reconciliation, { orderId, paymentId }) {
  if (reconciliation?.ok) return;

  logger.warn({
    action: "MercadoPagoReconciliation",
    metadata: {
      code: reconciliation?.code || "reconciliation_failed",
      orderId: String(orderId || ""),
      paymentId: String(paymentId || "").slice(-12)
    },
    module: "Payments",
    status: "rejected"
  });
  const error = new Error("Mercado Pago payment reconciliation failed.");
  error.code = reconciliation?.code || "reconciliation_failed";
  error.statusCode = 409;
  throw error;
}

function buildPaymentConfirmationUpdate(order, confirmation) {
  const paymentStatus = String(confirmation.paymentStatus || order.paymentStatus || "pending").trim();
  const paidConfirmation = paymentStatus === "paid";

  if (isCommercialOrderPaid(order) && !paidConfirmation) {
    return {
      paymentProvider: confirmation.paymentProvider || order.paymentProvider,
      paymentProviderReference: confirmation.paymentProviderReference || order.paymentProviderReference,
      paymentExternalReference: confirmation.paymentExternalReference || order.paymentExternalReference,
      paymentStatus: order.paymentStatus,
      paymentApprovedAt: order.paymentApprovedAt,
      activationStatus: order.activationStatus,
      activationStartedAt: order.activationStartedAt,
      status: order.status
    };
  }

  return {
    paymentProvider: confirmation.paymentProvider || order.paymentProvider,
    paymentStatus,
    paymentProviderReference: confirmation.paymentProviderReference || order.paymentProviderReference,
    paymentExternalReference: confirmation.paymentExternalReference || order.paymentExternalReference,
    paymentApprovedAt: confirmation.approvedAt || order.paymentApprovedAt || null,
    activationStatus: confirmation.activationStatus,
    activationStartedAt:
      confirmation.activationStatus === "ready_for_activation"
        ? new Date().toISOString()
        : order.activationStartedAt || null,
    status: paidConfirmation ? "paid" : order.status
  };
}

async function applyReconciledPayment(req, order, confirmation) {
  const incomingStatus = confirmation.reconciliation?.status || confirmation.paymentStatus;
  const transition = await req.app.locals.store.applyPaymentTransitionAtomically({
    orderId: order.id,
    provider: "mercado_pago",
    paymentId: confirmation.paymentProviderReference,
    incomingStatus,
    confirmation
  });
  if (transition.reason === "payment_linked_elsewhere") {
    const error = new Error("Mercado Pago payment is linked to another order.");
    error.code = "payment_already_linked_to_another_order";
    error.statusCode = 409;
    throw error;
  }

  let currentOrder = transition.order || await req.app.locals.store.getCommercialOrderById(order.id);
  const transitionKey = transition.transitionKey || currentOrder?.paymentEffectsTransition;
  const needsEffects = currentOrder?.paymentStatus === "paid" && currentOrder?.paymentEffectsStatus !== "completed";

  if (needsEffects && transitionKey) {
    const now = new Date();
    const effectClaim = await req.app.locals.store.claimPaymentEffects({
      orderId: order.id,
      transitionKey,
      workerId: req.traceId || `http-${process.pid}`,
      now,
      leaseUntil: new Date(now.getTime() + 60_000)
    });
    if (effectClaim.claimed) {
      const activationUpdate = buildCommercialActivationUpdate(effectClaim.order, "active");
      const activated = await req.app.locals.store.updateCommercialOrder(order.id, activationUpdate);
      const paymentDelivery = await notifyCommercialOrder(enrichCommercialOrder(activated), confirmation.nextStep);
      const activationDelivery = await notifyCommercialOrder(
        enrichCommercialOrder({ ...activated, ...paymentDelivery }),
        "Tu suscripción ya está activa.",
        "subscription_activated"
      );
      currentOrder = await req.app.locals.store.completePaymentEffects({
        orderId: order.id,
        transitionKey,
        updates: { ...paymentDelivery, ...activationDelivery }
      });
    }
  } else if (transition.applied && transition.shouldNotify) {
    const delivery = await notifyCommercialOrder(enrichCommercialOrder(currentOrder), confirmation.nextStep);
    currentOrder = await req.app.locals.store.updateCommercialOrder(order.id, delivery);
  }

  const presentedOrder = enrichCommercialOrder(currentOrder);
  if (transition.applied) {
    emitCommercialEvent(req, "payment:confirmed", presentedOrder, { status: presentedOrder.paymentStatus });
    if (transition.shouldActivate) emitCommercialEvent(req, "plan:active", presentedOrder, { status: presentedOrder.activationStatus });
    emitSubscriptionUpdate(req, presentedOrder);
  }
  return { order: presentedOrder, transition };
}

router.get("/plans", (req, res) => {
  return res.json({
    ok: true,
    data: listCommercialPlans()
  });
});

router.get("/downloads/:token", async (req, res, next) => {
  try {
    const payload = verifyCommercialDownloadToken(req.params.token);
    const order = await req.app.locals.store.findCommercialOrderByExternalReference(
      payload.referenceCode
    );

    if (!order || String(order.id || "").trim() !== String(payload.orderId || "").trim()) {
      return res.status(404).json({
        ok: false,
        message: "Orden comercial no encontrada"
      });
    }

    if (!isCommercialDownloadAuthorized(order, payload)) {
      return res.status(403).json({
        ok: false,
        message: "La descarga no corresponde a esta cuenta"
      });
    }

    const file = buildCommercialDownloadResponse(order, payload.assetCode);
    res.setHeader("Content-Type", file.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${file.fileName}"`);
    return res.status(200).send(file.body);
  } catch (error) {
    error.statusCode = 400;
    error.publicMessage = "No fue posible procesar la descarga";
    return next(error);
  }
});

router.post("/checkout", authenticate, requirePortalAccess, requirePermission("canManageBilling"), async (req, res, next) => {
  const keyValidation = validateCheckoutIdempotencyKey(req.get("Idempotency-Key"));
  if (!keyValidation.valid) {
    return res.status(400).json({
      ok: false,
      code: keyValidation.code,
      message: "Idempotency-Key es obligatorio y debe ser un identificador opaco valido"
    });
  }
  const companyName = String(req.body.companyName || "").trim();
  const contactName = String(req.body.contactName || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const phone = String(req.body.phone || "").trim();
  const planId = String(req.body.planId || "").trim();
  const paymentMethod = String(req.body.paymentMethod || "").trim();
  const requestTrial = Boolean(req.body.requestTrial);
  const selectedAddOns = Array.isArray(req.body.selectedAddOns)
    ? req.body.selectedAddOns
    : [];

  if (!companyName || !contactName || !email || !phone || !planId || !paymentMethod) {
    return res.status(400).json({
      ok: false,
      message: "Empresa, contacto, correo, teléfono, plan y método de pago son obligatorios"
    });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({
      ok: false,
      message: "El correo no tiene un formato válido"
    });
  }

  const plan = getCommercialPlanById(planId);

  if (!plan) {
    return res.status(404).json({
      ok: false,
      message: "Plan comercial no encontrado"
    });
  }

  const scope = buildCheckoutScope({ userId: req.user.id, organizationId: req.user.organizationId });
  const keyHash = buildCheckoutKeyHash(scope, keyValidation.key);
  const requestFingerprint = buildCheckoutRequestFingerprint({
    userId: req.user.id,
    organizationId: req.user.organizationId,
    planId: plan.id,
    paymentMethod,
    requestTrial,
    selectedAddOns
  });
  const workerId = `${req.traceId || randomUUID()}:checkout`;
  let claim;
  let trialPeriod = null;

  try {
    claim = await req.app.locals.store.claimCheckoutCreation({ scope, keyHash, requestFingerprint, workerId });
    logger.info({
      action: "CheckoutIdempotencyClaim",
      module: "Payments",
      status: claim.claimed ? "claimed" : claim.reason,
      metadata: {
        attemptCount: claim.reservation?.attemptCount || 0,
        claimReason: claim.reason,
        keyHashPrefix: keyHash.slice(0, 12),
        orderId: claim.reservation?.orderId || null
      }
    });
    if (!claim.claimed) {
      if (claim.reason === "ready") {
        return res.status(201).json({ ok: true, data: claim.reservation.safeResponse });
      }
      if (claim.reason === "key_reused") {
        return res.status(409).json({ ok: false, code: "idempotency_key_reused", message: "La clave ya identifica otra intencion de checkout" });
      }
      if (claim.reason === "currently_processing") {
        return res.status(409).json({ ok: false, code: "checkout_in_progress", message: "El checkout se esta preparando" });
      }
      if (claim.reason === "provider_result_unknown") {
        return res.status(503).json({ ok: false, code: "provider_result_unknown", message: "El resultado del proveedor requiere conciliacion; no se creara otra preferencia" });
      }
      return res.status(409).json({ ok: false, code: "checkout_permanent_failure", message: "La intencion de checkout no puede reintentarse" });
    }

    if (requestTrial) {
      const now = new Date();
      const existingOrders = await req.app.locals.store.listCommercialOrdersForUser(req.user);
      const eligibility = evaluateTrialEligibility({
        organizationId: req.user.organizationId,
        existingOrders,
        requestedPlan: plan,
        now
      });
      if (!eligibility.eligible) {
        const eligibilityError = new Error(eligibility.code);
        eligibilityError.code = eligibility.code;
        eligibilityError.statusCode = 409;
        eligibilityError.publicMessage = "La prueba gratuita no esta disponible para esta organizacion";
        throw eligibilityError;
      }
      const trialStartedAt = now.toISOString();
      const trialEndsAt = addDaysToIso(trialStartedAt, eligibility.durationDays);
      const entitlement = await req.app.locals.store.claimTrialEntitlement({
        organizationId: req.user.organizationId,
        orderId: claim.reservation.orderId,
        planId: plan.id,
        trialStartedAt,
        trialEndsAt
      });
      if (!entitlement.claimed) {
        const consumedError = new Error(entitlement.reason);
        consumedError.code = "trial_already_consumed";
        consumedError.statusCode = 409;
        consumedError.publicMessage = "La prueba gratuita ya fue utilizada por esta organizacion";
        throw consumedError;
      }
      trialPeriod = entitlement.entitlement;
    }

    let order = await req.app.locals.store.getCommercialOrderById(claim.reservation.orderId);
    if (!order) order = await req.app.locals.store.createCommercialOrder({
      id: claim.reservation.orderId,
      referenceCode: `MNCB-${claim.reservation.orderId.slice(0, 8).toUpperCase()}`,
      ownerUserId: req.user.id,
      ownerAccountEmail: req.user.email,
      accountStatus: "authenticated",
      organizationId: req.user.organizationId,
      organizationSlug: companyName,
      companyName,
      contactName,
      email,
      phone,
      billingEmail:
        req.body.billingEmail || req.user.companyProfile?.billingEmail || email,
      billingAddress:
        req.body.billingAddress || req.user.companyProfile?.billingAddress || "",
      legalName:
        req.body.legalName ||
        req.user.companyProfile?.legalName ||
        companyName,
      taxId: req.body.taxId || req.user.companyProfile?.taxId || "",
      planId: plan.id,
      paymentMethod,
      needsOnboarding:
        typeof req.body.needsOnboarding === "boolean"
          ? req.body.needsOnboarding
          : true,
      needsInvoice: typeof req.body.needsInvoice === "boolean" ? req.body.needsInvoice : true,
      requestTrial,
      trialDays: requestTrial ? Number(plan.trialDays) : 0,
      selectedAddOns,
      notes: String(req.body.notes || "").trim(),
      source: "landing-web"
    });
    const checkout = await createCommercialCheckout(order);
    let orderWithCheckout = await req.app.locals.store.updateCommercialOrder(order.id, {
      paymentProvider: checkout.paymentProvider,
      checkoutUrl: checkout.checkoutUrl,
      paymentProviderReference: checkout.paymentProviderReference,
      paymentExternalReference: checkout.paymentExternalReference,
      paymentStatus: checkout.paymentStatus,
      paymentApprovedAt: checkout.approvedAt
    });
    if (requestTrial && trialPeriod) {
      orderWithCheckout = await req.app.locals.store.updateCommercialOrder(order.id, {
        trialDays: plan.trialDays,
        trialStatus: "active",
        trialStartedAt: trialPeriod.trialStartedAt,
        trialEndsAt: trialPeriod.trialEndsAt
      });
    }

    if (checkout.paymentStatus === "trial_active" || checkout.paymentStatus === "paid_test") {
      orderWithCheckout = await req.app.locals.store.updateCommercialOrder(
        order.id,
        buildCommercialActivationUpdate(
          orderWithCheckout,
          checkout.paymentStatus === "trial_active" ? "trial" : "active"
        )
      );
    }

    const presentedOrder = enrichCommercialOrder(
      {
        ...orderWithCheckout,
        paymentInstructions: checkout.paymentInstructions || null
      },
      {
        user: req.user
      }
    );
    const safeResponse = buildCheckoutSafeResponse(presentedOrder, checkout.nextStep);
    const completedReservation = await req.app.locals.store.completeCheckoutCreation({
      reservationId: claim.reservation.id || claim.reservation._id,
      workerId,
      safeResponse
    });
    if (!completedReservation) {
      const leaseError = new Error("Checkout lease lost before completion");
      leaseError.code = "checkout_lease_lost";
      leaseError.statusCode = 409;
      throw leaseError;
    }
    await req.app.locals.store.recordAppEvent?.({
      type: "checkout_created",
      scope: "commercial",
      level: requestTrial ? "info" : "warning",
      status: presentedOrder.paymentStatus,
      userId: req.user.id,
      entityId: presentedOrder.id,
      message: `Checkout ${presentedOrder.referenceCode} creado`,
      metadata: {
        planId: presentedOrder.planId,
        requestTrial,
        totalPrice: presentedOrder.totalPrice
      }
    });
    const notificationStatus = await notifyCommercialOrder(presentedOrder, checkout.nextStep, "order_created");
    const hydratedOrder = await req.app.locals.store.updateCommercialOrder(order.id, notificationStatus);
    if (["active", "trial"].includes(String(presentedOrder.activationStatus || "").toLowerCase())) {
      const activationDelivery = await notifyCommercialOrder(
        presentedOrder,
        "Tu suscripción ya está activa.",
        "subscription_activated"
      );
      await req.app.locals.store.updateCommercialOrder(order.id, activationDelivery);
    }
    const responseOrder = enrichCommercialOrder(
      {
        ...hydratedOrder,
        paymentInstructions: checkout.paymentInstructions || null
      },
      {
        user: req.user
      }
    );
    emitCommercialEvent(req, "account:created", responseOrder, {
      status: responseOrder.status
    });

    return res.status(201).json({
      ok: true,
      data: completedReservation.safeResponse
    });
  } catch (error) {
    if (claim?.claimed) {
      const failureStatus = error.providerResultUnknown
        ? "provider_result_unknown"
        : error.providerResultKnown && Number(error.statusCode) >= 500
          ? "failed_retryable"
          : "failed_permanent";
      await Promise.resolve(req.app.locals.store.failCheckoutCreation({
        reservationId: claim.reservation.id || claim.reservation._id,
        workerId,
        status: failureStatus,
        errorCode: String(error.code || "checkout_creation_failed").slice(0, 120)
      })).catch(() => null);
    }
    error.statusCode = error.providerResultUnknown
      ? 503
      : (error.statusCode || (error.message === "Plan comercial no encontrado" ? 404 : 400));
    error.publicMessage = error.publicMessage || "No fue posible registrar la compra";
    return next(error);
  }
});

router.post("/confirm", async (req, res, next) => {
  try {
    const requestedExternalReference = String(req.body.externalReference || req.body.referenceCode || "").trim();
    const paymentId = String(req.body.paymentId || "").trim();
    const automaticPayment = isAutomaticPaymentEnabled();
    if (automaticPayment && !paymentId) {
      return res.status(400).json({ ok: false, message: "Identificador de pago obligatorio" });
    }
    const payment = automaticPayment ? await fetchMercadoPagoPayment(paymentId) : null;
    const providerExternalReference = String(payment?.external_reference || "").trim();
    const lookupReference = requestedExternalReference || providerExternalReference;
    const order = lookupReference
      ? await req.app.locals.store.findCommercialOrderByExternalReference(lookupReference)
      : null;

    if (!order) {
      return res.status(404).json({
        ok: false,
        message: "Orden comercial no encontrada"
      });
    }

    const linkedOrder = automaticPayment
      ? await findOrderLinkedToPayment(req.app.locals.store, payment.id, order.id)
      : null;
    const confirmation = confirmCommercialPayment(
      automaticPayment ? { payment, order, linkedOrderId: linkedOrder?.id } : {}
    );
    if (automaticPayment) {
      assertReconciliationSucceeded(confirmation.reconciliation, {
        orderId: order.id,
        paymentId: payment.id
      });
    }

    const processed = automaticPayment
      ? await applyReconciledPayment(req, order, confirmation)
      : {
          order: enrichCommercialOrder(
            await req.app.locals.store.updateCommercialOrder(
              order.id,
              buildPaymentConfirmationUpdate(order, confirmation)
            )
          )
        };
    const presentedOrder = processed.order;
    if (!automaticPayment || processed.transition?.applied) {
      await req.app.locals.store.recordAppEvent?.({
        type: "checkout_confirmed",
        scope: "commercial",
        level: confirmation.paymentStatus === "paid" ? "info" : "warning",
        status: confirmation.paymentStatus,
        entityId: presentedOrder.id,
        message: `Pago ${confirmation.paymentStatus} para ${presentedOrder.referenceCode}`,
        metadata: {
          paymentProviderReference: confirmation.paymentProviderReference
        }
      });
    }
    const responseOrder = automaticPayment
      ? presentedOrder
      : enrichCommercialOrder(
          await req.app.locals.store.updateCommercialOrder(
            order.id,
            await notifyCommercialOrder(presentedOrder, confirmation.nextStep)
          )
        );

    return res.json({
      ok: true,
      data: {
        ...responseOrder,
        nextStep: confirmation.nextStep
      }
    });
  } catch (error) {
    error.statusCode = error.statusCode || 400;
    error.publicMessage = "No fue posible confirmar el pago";
    return next(error);
  }
});

router.post("/webhooks/mercadopago/chargebacks", async (req, res) => {
  let claimedEvent = null;
  try {
    const type = String(req.body?.type || req.query.type || "").toLowerCase();
    if (!type.includes("chargeback")) return res.status(202).json({ ok: true, ignored: true });
    const chargebackId = String(req.body?.data?.id || req.query["data.id"] || req.body?.id || req.query.id || "").trim();
    const requestId = String(req.headers["x-request-id"] || "").trim();
    if (!chargebackId) return res.status(400).json({ ok: false, message: "Chargeback ID obligatorio" });
    if (!isMercadoPagoWebhookSignatureValid({ paymentId: chargebackId, requestId, signatureHeader: req.headers["x-signature"] })) {
      return res.status(401).json({ ok: false, message: "Firma de Mercado Pago invalida" });
    }
    const signatureTimestamp = String(req.headers["x-signature"] || "").match(/(?:^|,)ts=([^,]+)/)?.[1] || "";
    const deliveryKey = buildWebhookDeliveryKey({ provider: "mercado_pago_chargeback", requestId, paymentId: chargebackId, notificationType: type, signatureTimestamp });
    const claim = await claimWebhookDelivery({ provider: "mercado_pago_chargeback", deliveryKey, paymentId: chargebackId, requestId, signatureTimestamp, workerId: req.traceId || `chargeback-${process.pid}` });
    claimedEvent = claim.event;
    if (!claim.claimed) return res.status(claim.reason === "retry_scheduled" ? 503 : 202).json({ ok: true, duplicate: true, reason: claim.reason });
    const providerChargeback = await fetchMercadoPagoChargeback(chargebackId);
    const providerPaymentId = String(providerChargeback?.payments?.[0] || providerChargeback?.payment_id || "").trim();
    const order = await req.app.locals.store.findCommercialOrderByProviderPaymentId(providerPaymentId);
    if (!order) throw Object.assign(new Error("Commercial order not found for chargeback"), { code: "chargeback_order_not_found", permanent: true });
    const reconciliation = reconcileChargebackWithOrder(providerChargeback, order);
    if (!reconciliation.ok) throw Object.assign(new Error(reconciliation.code), { code: reconciliation.code, permanent: true });
    const existing = (await req.app.locals.store.listChargebacks(order.id)).find((entry) => entry.providerChargebackId === reconciliation.normalized.providerChargebackId);
    const transition = evaluateChargebackTransition(existing?.status, reconciliation.normalized.status);
    if (transition.apply) {
      const now = new Date().toISOString();
      await req.app.locals.store.upsertChargeback({ provider: "mercado_pago", orderId: order.id, organizationId: order.organizationId, ...reconciliation.normalized, updatedAt: now, resolvedAt: ["won", "lost", "covered", "closed_won", "closed_lost"].includes(reconciliation.normalized.status) ? now : null, resolution: ["won", "covered", "closed_won"].includes(reconciliation.normalized.status) ? "won" : ["lost", "closed_lost"].includes(reconciliation.normalized.status) ? "lost" : null });
      const financialState = derivePaymentFinancialState({ paidAmountMinor: toMinorUnits(order.totalPrice, order.currency || "MXN"), refundRecords: await req.app.locals.store.listRefundOperations(order.id), chargebackRecords: await req.app.locals.store.listChargebacks(order.id) });
      const entitlement = deriveEntitlementAfterFinancialReversal({ order, financialState });
      await req.app.locals.store.updateCommercialOrder(order.id, { financialStatus: financialState.status, chargebackStatus: financialState.chargebackStatus, ...(entitlement.action === "none" ? {} : { activationStatus: entitlement.activationStatus, serviceSuspendedReason: entitlement.serviceSuspendedReason }) });
    }
    await completeWebhookDelivery(claimedEvent?._id || claimedEvent?.id, { orderId: order.id, observedStatus: reconciliation.normalized.status });
    return res.status(202).json({ ok: true, applied: transition.apply });
  } catch (error) {
    if (claimedEvent) await failWebhookDelivery(claimedEvent._id || claimedEvent.id, { code: error.code || "chargeback_processing_failed", permanent: Boolean(error.permanent) }).catch(() => null);
    return res.status(error.permanent ? 202 : 503).json({ ok: true });
  }
});

router.post("/webhooks/mercadopago", async (req, res) => {
  let claimedEvent = null;
  try {
    const paymentId =
      req.body?.data?.id ||
      req.query["data.id"] ||
      req.body?.id ||
      req.query.id;

    if (!paymentId) {
      return res.status(202).json({
        ok: true
      });
    }

    const normalizedPaymentId = String(paymentId).trim();

    if (!isMercadoPagoWebhookSignatureValid({
      paymentId: normalizedPaymentId,
      requestId: String(req.headers["x-request-id"] || "").trim(),
      signatureHeader: req.headers["x-signature"]
    })) {
      return res.status(401).json({
        ok: false,
        message: "Firma de Mercado Pago invalida"
      });
    }

    const requestId = String(req.headers["x-request-id"] || "").trim();
    const signatureTimestamp = String(req.headers["x-signature"] || "").match(/(?:^|,)ts=([^,]+)/)?.[1] || "";
    const notificationType = String(req.body?.type || req.query.type || "payment").trim();
    const deliveryKey = buildWebhookDeliveryKey({
      provider: "mercado_pago",
      requestId,
      paymentId: normalizedPaymentId,
      notificationType,
      signatureTimestamp
    });
    const claim = await claimWebhookDelivery({
      provider: "mercado_pago",
      deliveryKey,
      paymentId: normalizedPaymentId,
      requestId,
      signatureTimestamp,
      workerId: req.traceId || `webhook-${process.pid}`
    });
    claimedEvent = claim.event;
    if (!claim.claimed) {
      return res.status(claim.reason === "retry_scheduled" ? 503 : 202).json({
        ok: true,
        duplicate: true,
        reason: claim.reason
      });
    }

    const payment = await fetchMercadoPagoPayment(normalizedPaymentId);
    const externalReference = String(payment.external_reference || "").trim();
    const order = externalReference
      ? await req.app.locals.store.findCommercialOrderByExternalReference(externalReference)
      : null;

    if (!order) {
      throw Object.assign(new Error("Commercial order not found for Mercado Pago payment."), {
        code: "commercial_order_not_found"
      });
    }

    const linkedOrder = await findOrderLinkedToPayment(req.app.locals.store, payment.id, order.id);
    const confirmation = confirmCommercialPayment({ payment, order, linkedOrderId: linkedOrder?.id });
    assertReconciliationSucceeded(confirmation.reconciliation, {
      orderId: order.id,
      paymentId: payment.id
    });

    const processed = await applyReconciledPayment(req, order, confirmation);
    await completeWebhookDelivery(claimedEvent?._id || claimedEvent?.id, {
      orderId: order.id,
      observedStatus: confirmation.reconciliation.status
    });

    return res.status(202).json({
      ok: true
    });
  } catch (error) {
    logger.error({
      action: "MercadoPagoWebhook",
      error,
      module: "commercial",
      requestId: req.traceId,
      userId: req.user?.id
    });
    await req.app.locals.store.recordAppEvent?.({
      type: "webhook_processing_failed",
      scope: "commercial",
      level: "warning",
      status: "failed",
      message: "Webhook no procesado",
      metadata: {
        provider: "mercado_pago",
        traceId: req.traceId
      }
    });

    const permanentCodes = new Set([
      "commercial_order_not_found",
      "external_reference_mismatch",
      "missing_external_reference",
      "invalid_payment_id",
      "invalid_payment_amount",
      "invalid_order_amount",
      "amount_mismatch",
      "invalid_currency",
      "currency_mismatch",
      "payment_environment_mismatch",
      "metadata_mismatch",
      "payment_already_linked_to_another_order"
    ]);
    const permanent = permanentCodes.has(error.code);
    if (claimedEvent) {
      await failWebhookDelivery(claimedEvent._id || claimedEvent.id, {
        code: error.code || "webhook_processing_failed",
        permanent
      }).catch(() => null);
    }
    return res.status(permanent ? 202 : 503).json({
      ok: true
    });
  }
});

module.exports = router;
