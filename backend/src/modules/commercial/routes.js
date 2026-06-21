const { Router } = require("express");
const { getCommercialPlanById, listCommercialPlans } = require("../../config/commercial-plans");
const { IS_PRODUCTION_RUNTIME } = require("../../config/env");
const { authenticate } = require("../../middlewares/authenticate");
const { requireAdmin } = require("../../middlewares/require-admin");
const { getOrganizationId, requirePermission } = require("../../middlewares/access-control");
const { requirePortalAccess } = require("../../middlewares/portal-access");
const { verifyToken } = require("../../utils/jwt");
const {
  confirmCommercialPayment,
  createCommercialCheckout
} = require("../../services/commercial-payment");
const { buildCommercialActivationUpdate } = require("../../services/commercial-activation");
const { notifyCommercialOrder } = require("../../services/commercial-notifier");
const { enrichCommercialOrder } = require("../../services/commercial-profile");
const {
  buildCommercialDownloadResponse,
  isCommercialDownloadAuthorized,
  verifyCommercialDownloadToken
} = require("../../services/commercial-downloads");
const {
  markWebhookProcessed,
  registerWebhookEvent
} = require("../../services/webhook-idempotency");

const router = Router();

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function routeError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function getOptionalAuthenticatedUser(req) {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    return null;
  }

  try {
    const payload = verifyToken(header.replace("Bearer ", "").trim());
    return await req.app.locals.store.getUserById(payload.sub);
  } catch {
    return null;
  }
}

function canConfirmVisualPayment(user, order) {
  if (!user || !order) {
    return false;
  }

  const userOrganizationId = getOrganizationId(user);
  const orderOrganizationId = String(order.organizationId || order.organizationSlug || "").trim();
  const userEmail = String(user.email || "").trim().toLowerCase();
  const orderEmail = String(order.ownerAccountEmail || order.email || "").trim().toLowerCase();

  return Boolean(
    String(order.ownerUserId || "").trim() === String(user.id || "").trim() ||
      (userOrganizationId && userOrganizationId === orderOrganizationId) ||
      (userEmail && userEmail === orderEmail)
  );
}

function isVisualCheckoutSimulation(req) {
  const paymentId = String(req.body.paymentId || "").trim();
  return Boolean(req.body.visualSimulation || req.body.simulatePayment || paymentId.startsWith("visual-checkout-"));
}

async function buildVisualCheckoutConfirmation(req, order) {
  const user = await getOptionalAuthenticatedUser(req);

  if (!canConfirmVisualPayment(user, order)) {
    throw routeError("Sesion requerida para confirmar este pago visual", user ? 403 : 401);
  }

  const paymentMethod = String(req.body.paymentMethod || order.paymentMethod || "card").trim();
  const approvedAt = new Date().toISOString();

  return {
    paymentStatus: "paid",
    activationStatus: "ready_for_activation",
    approvedAt,
    paymentProvider: paymentMethod === "spei" ? "visual_spei" : "visual_card",
    paymentProviderReference: String(req.body.paymentId || `visual-checkout-${Date.now()}`).trim(),
    paymentExternalReference: String(order.paymentExternalReference || order.id || order.referenceCode).trim(),
    paymentInstructions: null,
    nextStep: "Pago visual confirmado. La cuenta quedo activada para el portal."
  };
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
    req.app.locals.io?.to(`org:${organizationId}`).emit(eventName, eventPayload);
  }

  if (ownerUserId) {
    req.app.locals.io?.to(`user:${ownerUserId}`).emit(eventName, eventPayload);
  }

  req.app.locals.io?.to("platform:admin").emit(eventName, eventPayload);
}

router.get("/plans", (req, res) => {
  return res.json({
    ok: true,
    data: listCommercialPlans()
  });
});

router.get("/me", authenticate, requirePortalAccess, async (req, res) => {
  return res.json({
    ok: true,
    data: (await req.app.locals.store.listCommercialOrdersForUser(req.user)).map((order) =>
      enrichCommercialOrder(order, {
        user: req.user
      })
    )
  });
});

router.get("/downloads/:token", async (req, res) => {
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
    return res.status(400).json({
      ok: false,
      message: error.message || "No fue posible procesar la descarga"
    });
  }
});

router.post("/checkout", authenticate, requirePortalAccess, requirePermission("canManageBilling"), async (req, res) => {
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
      paymentStatus: checkout.paymentStatus
    });

    if (checkout.paymentStatus === "trial_active") {
      orderWithCheckout = await req.app.locals.store.updateCommercialOrder(
        order.id,
        buildCommercialActivationUpdate(orderWithCheckout, "trial")
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
    const notificationStatus = await notifyCommercialOrder(presentedOrder, checkout.nextStep);
    const hydratedOrder = await req.app.locals.store.updateCommercialOrder(order.id, notificationStatus);
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
    return res.status(error.message === "Plan comercial no encontrado" ? 404 : 400).json({
      ok: false,
      message: error.message || "No fue posible registrar la compra"
    });
  }
});

router.post("/confirm", async (req, res) => {
  try {
    const requestedExternalReference = String(req.body.externalReference || req.body.referenceCode || "").trim();
    let order = requestedExternalReference
      ? await req.app.locals.store.findCommercialOrderByExternalReference(requestedExternalReference)
      : null;
    let confirmation;
    const visualCheckoutSimulation = isVisualCheckoutSimulation(req);

    if (visualCheckoutSimulation && IS_PRODUCTION_RUNTIME) {
      return res.status(403).json({
        ok: false,
        message: "La confirmacion visual de pagos no esta permitida en produccion"
      });
    }

    if (visualCheckoutSimulation) {
      if (!order) {
        return res.status(404).json({
          ok: false,
          message: "Orden comercial no encontrada"
        });
      }

      confirmation = await buildVisualCheckoutConfirmation(req, order);
    } else {
      confirmation = await confirmCommercialPayment({
        externalReference: requestedExternalReference,
        paymentId: String(req.body.paymentId || "").trim()
      });
      const externalReference = String(confirmation.paymentExternalReference || requestedExternalReference).trim();
      order = externalReference
        ? await req.app.locals.store.findCommercialOrderByExternalReference(externalReference)
        : null;
    }

    if (!order) {
      return res.status(404).json({
        ok: false,
        message: "Orden comercial no encontrada"
      });
    }

    const updatedOrder = await req.app.locals.store.updateCommercialOrder(order.id, {
      paymentProvider: confirmation.paymentProvider || order.paymentProvider,
      paymentStatus: confirmation.paymentStatus,
      paymentProviderReference: confirmation.paymentProviderReference || order.paymentProviderReference,
      paymentExternalReference: confirmation.paymentExternalReference || order.paymentExternalReference,
      paymentApprovedAt: confirmation.approvedAt,
      activationStatus: confirmation.activationStatus,
      activationStartedAt:
        confirmation.activationStatus === "ready_for_activation" ? new Date().toISOString() : null,
      status: confirmation.paymentStatus === "paid" ? "paid" : order.status
    });
    const activatedOrder =
      confirmation.paymentStatus === "paid"
        ? await req.app.locals.store.updateCommercialOrder(
            order.id,
            buildCommercialActivationUpdate(updatedOrder, "active")
          )
        : updatedOrder;
    const presentedOrder = enrichCommercialOrder(activatedOrder);
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
    const notificationStatus = await notifyCommercialOrder(presentedOrder, confirmation.nextStep);
    const hydratedOrder = await req.app.locals.store.updateCommercialOrder(order.id, notificationStatus);
    const responseOrder = enrichCommercialOrder(hydratedOrder);
    emitCommercialEvent(req, "payment:confirmed", responseOrder, {
      status: responseOrder.paymentStatus
    });

    if (responseOrder.activationStatus === "active") {
      emitCommercialEvent(req, "plan:active", responseOrder, {
        status: responseOrder.activationStatus
      });
    }

    return res.json({
      ok: true,
      data: {
        ...responseOrder,
        nextStep: confirmation.nextStep
      }
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      ok: false,
      message: error.message || "No fue posible confirmar el pago"
    });
  }
});

router.post("/webhooks/mercadopago", async (req, res) => {
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

    const webhookEvent = await registerWebhookEvent({
      provider: "mercado_pago",
      providerEventId: String(paymentId).trim(),
      payload: req.body,
      metadata: {
        query: req.query,
        traceId: req.traceId
      }
    });

    if (webhookEvent.duplicate) {
      return res.status(202).json({
        ok: true,
        duplicate: true
      });
    }

    await confirmCommercialPayment({
      paymentId: String(paymentId).trim()
    }).then(async (confirmation) => {
      const externalReference = String(confirmation.paymentExternalReference || "").trim();

      if (!externalReference) {
        return;
      }

      const order = await req.app.locals.store.findCommercialOrderByExternalReference(externalReference);

      if (!order) {
        return;
      }

      const updatedOrder = await req.app.locals.store.updateCommercialOrder(order.id, {
        paymentStatus: confirmation.paymentStatus,
        paymentProviderReference: confirmation.paymentProviderReference,
        paymentExternalReference: confirmation.paymentExternalReference,
        paymentApprovedAt: confirmation.approvedAt,
        activationStatus: confirmation.activationStatus,
        activationStartedAt:
          confirmation.activationStatus === "ready_for_activation" ? new Date().toISOString() : null,
        status: confirmation.paymentStatus === "paid" ? "paid" : order.status
      });

      const activatedOrder =
        confirmation.paymentStatus === "paid"
          ? await req.app.locals.store.updateCommercialOrder(
              order.id,
              buildCommercialActivationUpdate(updatedOrder, "active")
            )
          : updatedOrder;

      await notifyCommercialOrder(enrichCommercialOrder(activatedOrder), confirmation.nextStep).then((deliveryStatus) =>
        req.app.locals.store.updateCommercialOrder(activatedOrder.id, deliveryStatus)
      );
      emitCommercialEvent(req, "payment:confirmed", enrichCommercialOrder(activatedOrder), {
        status: activatedOrder.paymentStatus
      });

      if (activatedOrder.activationStatus === "active") {
        emitCommercialEvent(req, "plan:active", enrichCommercialOrder(activatedOrder), {
          status: activatedOrder.activationStatus
        });
      }
    });
    await markWebhookProcessed(webhookEvent.event?._id || webhookEvent.event?.id, "processed");

    return res.status(202).json({
      ok: true
    });
  } catch (error) {
    await req.app.locals.store.recordAppEvent?.({
      type: "webhook_processing_failed",
      scope: "commercial",
      level: "warning",
      status: "failed",
      message: error.message || "Webhook no procesado",
      metadata: {
        provider: "mercado_pago",
        traceId: req.traceId
      }
    });

    return res.status(202).json({
      ok: true
    });
  }
});

router.get("/orders", authenticate, requireAdmin, async (req, res) => {
  return res.json({
    ok: true,
    data: (await req.app.locals.store.listCommercialOrders()).map((order) =>
      enrichCommercialOrder(order, {
        user: req.user
      })
    )
  });
});

router.patch("/orders/:orderId", authenticate, requireAdmin, async (req, res) => {
  try {
    const existingOrder = (await req.app.locals.store.listCommercialOrders()).find(
      (entry) => entry.id === req.params.orderId
    );

    if (!existingOrder) {
      return res.status(404).json({
        ok: false,
        message: "Orden comercial no encontrada"
      });
    }

    const requestedStatus = req.body.activationStatus;
    const automationUpdate =
      requestedStatus === "active"
        ? buildCommercialActivationUpdate(existingOrder, existingOrder.requestTrial ? "trial" : "active")
        : requestedStatus === "ready_for_activation"
          ? buildCommercialActivationUpdate(existingOrder, "ready")
          : {};

    const order = await req.app.locals.store.updateCommercialOrder(req.params.orderId, {
      activationStatus: req.body.activationStatus,
      activationNotes: req.body.activationNotes,
      activatedAt:
        req.body.activationStatus === "active" ? new Date().toISOString() : undefined,
      status:
        req.body.activationStatus === "active"
          ? "active"
          : req.body.status,
      ...automationUpdate
    });

    if (!order) {
      return res.status(404).json({
        ok: false,
        message: "Orden comercial no encontrada"
      });
    }

    await req.app.locals.store.recordAppEvent?.({
      type: "checkout_activation_updated",
      scope: "commercial",
      level: req.body.activationStatus === "active" ? "info" : "warning",
      status: req.body.activationStatus || req.body.status || "updated",
      userId: req.user.id,
      entityId: order.id,
      message: `Orden ${order.referenceCode} actualizada desde administración`
    });
    const responseOrder = enrichCommercialOrder(order, {
      user: req.user
    });
    emitCommercialEvent(req, "subscription:updated", responseOrder, {
      status: responseOrder.activationStatus || responseOrder.status
    });

    return res.json({
      ok: true,
      data: responseOrder
    });
  } catch (error) {
    return res.status(400).json({
      ok: false,
      message: error.message || "No fue posible actualizar la orden comercial"
    });
  }
});

module.exports = router;
