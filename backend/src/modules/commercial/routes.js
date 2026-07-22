const { Router } = require("express");
const { getCommercialPlanById, listCommercialPlans } = require("../../config/commercial-plans");
const { authenticate } = require("../../middlewares/authenticate");
const { getRolesWithPermission } = require("../../middlewares/access-control");
const { requirePermission } = require("../../middlewares/access-control");
const { requirePortalAccess } = require("../../middlewares/portal-access");
const {
  confirmCommercialPayment,
  createCommercialCheckout,
  fetchMercadoPagoPayment,
  isAutomaticPaymentEnabled,
  isMercadoPagoWebhookSignatureValid
} = require("../../services/commercial-payment");
const { buildCommercialActivationUpdate } = require("../../services/commercial-activation");
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
      const activated = {
        ...effectClaim.order,
        ...buildCommercialActivationUpdate(effectClaim.order, "active")
      };
      const paymentDelivery = await notifyCommercialOrder(enrichCommercialOrder(activated), confirmation.nextStep);
      const activationDelivery = await notifyCommercialOrder(
        enrichCommercialOrder({ ...activated, ...paymentDelivery }),
        "Tu suscripción ya está activa.",
        "subscription_activated"
      );
      currentOrder = await req.app.locals.store.completePaymentEffects({
        orderId: order.id,
        transitionKey,
        updates: { ...buildCommercialActivationUpdate(activated, "active"), ...paymentDelivery, ...activationDelivery }
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

  try {
    const order = await req.app.locals.store.createCommercialOrder({
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
      trialDays: requestTrial ? 7 : 0,
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
      data: {
        ...responseOrder,
        nextStep: checkout.nextStep
      }
    });
  } catch (error) {
    error.statusCode = error.message === "Plan comercial no encontrado" ? 404 : 400;
    error.publicMessage = "No fue posible registrar la compra";
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
