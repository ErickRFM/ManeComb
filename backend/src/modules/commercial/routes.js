const crypto = require("node:crypto");
const { Router } = require("express");
const { getCommercialPlanById, listCommercialPlans } = require("../../config/commercial-plans");
const { MERCADO_PAGO_WEBHOOK_SECRET } = require("../../config/env");
const { authenticate } = require("../../middlewares/authenticate");
const { requireAdmin } = require("../../middlewares/require-admin");
const { requirePermission } = require("../../middlewares/access-control");
const { requirePortalAccess } = require("../../middlewares/portal-access");
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

function isCommercialOrderPaid(order) {
  return Boolean(
    ["paid"].includes(String(order?.paymentStatus || "").toLowerCase()) ||
      ["active", "paid"].includes(String(order?.status || "").toLowerCase()) ||
      String(order?.activationStatus || "").toLowerCase() === "active"
  );
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

function parseMercadoPagoSignature(value) {
  return String(value || "")
    .split(",")
    .map((part) => part.trim().split("="))
    .reduce((signature, [key, entryValue]) => {
      if (key && entryValue) {
        signature[key] = entryValue;
      }

      return signature;
    }, {});
}

function compareHexDigest(left, right) {
  const leftBuffer = Buffer.from(String(left || ""), "hex");
  const rightBuffer = Buffer.from(String(right || ""), "hex");

  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function isMercadoPagoWebhookSignatureValid(req, paymentId) {
  if (!MERCADO_PAGO_WEBHOOK_SECRET) {
    return true;
  }

  const signature = parseMercadoPagoSignature(req.headers["x-signature"]);
  const requestId = String(req.headers["x-request-id"] || "").trim();
  const ts = String(signature.ts || "").trim();
  const v1 = String(signature.v1 || "").trim();

  if (!paymentId || !requestId || !ts || !v1) {
    return false;
  }

  const manifest = `id:${paymentId};request-id:${requestId};ts:${ts};`;
  const expectedSignature = crypto
    .createHmac("sha256", MERCADO_PAGO_WEBHOOK_SECRET)
    .update(manifest)
    .digest("hex");

  return compareHexDigest(expectedSignature, v1);
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
    const confirmation = await confirmCommercialPayment({
      externalReference: requestedExternalReference,
      paymentId: String(req.body.paymentId || "").trim()
    });
    const externalReference = String(confirmation.paymentExternalReference || requestedExternalReference).trim();
    const order = externalReference
      ? await req.app.locals.store.findCommercialOrderByExternalReference(externalReference)
      : null;

    if (!order) {
      return res.status(404).json({
        ok: false,
        message: "Orden comercial no encontrada"
      });
    }

    const updatedOrder = await req.app.locals.store.updateCommercialOrder(
      order.id,
      buildPaymentConfirmationUpdate(order, confirmation)
    );
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

    const normalizedPaymentId = String(paymentId).trim();

    if (!isMercadoPagoWebhookSignatureValid(req, normalizedPaymentId)) {
      return res.status(401).json({
        ok: false,
        message: "Firma de Mercado Pago invalida"
      });
    }

    const webhookEvent = await registerWebhookEvent({
      provider: "mercado_pago",
      providerEventId: normalizedPaymentId,
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
      paymentId: normalizedPaymentId
    }).then(async (confirmation) => {
      const externalReference = String(confirmation.paymentExternalReference || "").trim();

      if (!externalReference) {
        return;
      }

      const order = await req.app.locals.store.findCommercialOrderByExternalReference(externalReference);

      if (!order) {
        return;
      }

      const updatedOrder = await req.app.locals.store.updateCommercialOrder(
        order.id,
        buildPaymentConfirmationUpdate(order, confirmation)
      );

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
