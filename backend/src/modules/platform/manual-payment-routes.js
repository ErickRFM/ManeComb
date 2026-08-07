const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { getRolesWithPermission } = require("../../middlewares/access-control");
const { platformAuth, requireMfa } = require("../../middlewares/platform-auth");
const { requirePlatformPermission } = require("../../middlewares/platform-access");
const { buildCommercialActivationUpdate } = require("../../services/commercial-activation");
const { notifyCommercialOrder } = require("../../services/commercial-notifier");
const { enrichCommercialOrder } = require("../../services/commercial-profile");
const { toMinorUnits } = require("../../services/commercial-payment");
const { buildSubscription } = require("../../services/portal-account");
const { recordPlatformAction } = require("../../services/platform-audit");
const {
  claimManualPaymentDecision,
  completeManualPaymentDecision,
  getManualPaymentEvidence,
  isManualTransferOrder,
  releaseManualPaymentDecision
} = require("../manual-payments/service");

const router = Router();
const readLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 80,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: "Demasiadas solicitudes. Intenta de nuevo más tarde." }
});
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: "Demasiadas revisiones de pago. Intenta de nuevo más tarde." }
});

function routeError(code, message, statusCode) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.publicMessage = message;
  return error;
}

function normalizeTrackingKey(value) {
  return String(value || "").replace(/\s+/g, "").trim().toUpperCase();
}

function serializeOrder(order) {
  if (!order) return null;
  return {
    id: order.id,
    referenceCode: order.referenceCode,
    organizationId: order.organizationId,
    ownerUserId: order.ownerUserId || null,
    companyName: order.companyName,
    totalPrice: Number(order.totalPrice || 0),
    currency: String(order.currency || "MXN"),
    paymentMethod: order.paymentMethod,
    paymentProvider: order.paymentProvider,
    paymentStatus: order.paymentStatus,
    paymentApprovedAt: order.paymentApprovedAt || null,
    activationStatus: order.activationStatus,
    status: order.status,
    activatedAt: order.activatedAt || null
  };
}

function emitManualPaymentUpdate(req, order, evidence) {
  const organizationId = String(order?.organizationId || "").trim();
  const ownerUserId = String(order?.ownerUserId || "").trim();
  const updatedAt = new Date().toISOString();
  const paymentPayload = {
    organizationId,
    orderId: order.id,
    evidence,
    order: serializeOrder(order),
    updatedAt
  };

  if (organizationId) {
    getRolesWithPermission("canManageBilling").forEach((role) => {
      req.app.locals.io?.to(`org:${organizationId}:role:${role}`).emit("manual-payment:updated", paymentPayload);
    });
    req.app.locals.io?.to(`org:${organizationId}`).emit("subscription:updated", {
      organizationId,
      subscription: buildSubscription(order),
      updatedAt
    });
  }
  if (ownerUserId) req.app.locals.io?.to(`user:${ownerUserId}`).emit("manual-payment:updated", paymentPayload);
  req.app.locals.io?.to("platform:admin").emit("manual-payment:updated", paymentPayload);
}

router.get(
  "/orders/:orderId",
  readLimiter,
  platformAuth,
  requirePlatformPermission("platform.commercial.read"),
  async (req, res, next) => {
    try {
      const order = await req.app.locals.store.getCommercialOrderById(req.params.orderId);
      if (!order) return res.status(404).json({ ok: false, message: "Orden comercial no encontrada" });
      const evidence = await getManualPaymentEvidence(order.id);
      return res.json({
        ok: true,
        data: {
          order: serializeOrder(order),
          evidence
        }
      });
    } catch (error) {
      return next(error);
    }
  }
);

router.post(
  "/orders/:orderId/decision",
  writeLimiter,
  platformAuth,
  requireMfa,
  requirePlatformPermission("platform.commercial.manage"),
  async (req, res, next) => {
    let claim = null;
    try {
      let order = await req.app.locals.store.getCommercialOrderById(req.params.orderId);
      if (!order) return res.status(404).json({ ok: false, message: "Orden comercial no encontrada" });
      if (!isManualTransferOrder(order)) {
        throw routeError("manual_payment_order_required", "La orden no corresponde a una transferencia manual.", 409);
      }

      const decision = String(req.body?.decision || "").trim().toLowerCase();
      const reviewNote = String(req.body?.note || "").trim();
      if (decision === "approve") {
        const currentEvidence = await getManualPaymentEvidence(order.id);
        if (!currentEvidence) {
          throw routeError("manual_payment_evidence_not_found", "No existe evidencia SPEI para esta orden.", 404);
        }
        const suppliedTrackingKey = normalizeTrackingKey(req.body?.trackingKeyConfirmation);
        if (!suppliedTrackingKey || suppliedTrackingKey !== normalizeTrackingKey(currentEvidence.trackingKey)) {
          throw routeError(
            "manual_payment_tracking_confirmation_mismatch",
            "Confirma exactamente la clave de rastreo SPEI antes de aprobar.",
            409
          );
        }
      }

      claim = await claimManualPaymentDecision({
        orderId: order.id,
        decision,
        reviewNote,
        reviewerId: req.platformUser.id,
        idempotencyKey: req.get("Idempotency-Key")
      });

      if (claim.replayed) {
        return res.json({
          ok: true,
          replayed: true,
          data: {
            order: serializeOrder(order),
            evidence: claim.evidence
          }
        });
      }

      let evidence = claim.evidence;
      if (decision === "approve") {
        const expectedAmountMinor = toMinorUnits(order.totalPrice, order.currency || "MXN");
        if (!Number.isInteger(expectedAmountMinor) || expectedAmountMinor <= 0) {
          throw routeError("invalid_order_amount", "El importe de la orden no es válido.", 409);
        }
        if (Number(evidence.amountMinor) !== expectedAmountMinor) {
          throw routeError(
            "manual_payment_amount_mismatch",
            "El importe reportado no coincide con el importe exacto de la orden.",
            409
          );
        }

        const alreadyPaid = ["paid", "approved"].includes(String(order.paymentStatus || "").toLowerCase()) &&
          String(order.activationStatus || "").toLowerCase() === "active";

        if (!alreadyPaid) {
          const now = new Date();
          const paymentApprovedAt = now.toISOString();
          const paidOrder = {
            ...order,
            paymentProvider: "manual_bank_transfer",
            paymentProviderReference: `manual:${evidence.id}`,
            paymentExternalReference: order.id,
            paymentStatus: "paid",
            paymentApprovedAt,
            financialStatus: "paid",
            status: "paid"
          };
          order = await req.app.locals.store.updateCommercialOrder(order.id, {
            paymentProvider: paidOrder.paymentProvider,
            paymentProviderReference: paidOrder.paymentProviderReference,
            paymentExternalReference: paidOrder.paymentExternalReference,
            paymentStatus: paidOrder.paymentStatus,
            paymentApprovedAt: paidOrder.paymentApprovedAt,
            financialStatus: paidOrder.financialStatus,
            ...buildCommercialActivationUpdate(paidOrder, "active", { now })
          });
          if (!order) throw routeError("manual_payment_activation_failed", "No fue posible activar la orden.", 409);
        }

        evidence = await completeManualPaymentDecision({
          orderId: order.id,
          decision,
          keyHash: claim.keyHash,
          reviewerId: req.platformUser.id,
          reviewNote
        });

        const paymentDelivery = await notifyCommercialOrder(
          enrichCommercialOrder(order),
          "Transferencia SPEI validada. El pago quedó confirmado.",
          "payment_status"
        );
        order = await req.app.locals.store.updateCommercialOrder(order.id, paymentDelivery) || order;
        const activationDelivery = await notifyCommercialOrder(
          enrichCommercialOrder(order),
          "Tu suscripción ya está activa.",
          "subscription_activated"
        );
        order = await req.app.locals.store.updateCommercialOrder(order.id, activationDelivery) || order;
      } else {
        evidence = await completeManualPaymentDecision({
          orderId: order.id,
          decision,
          keyHash: claim.keyHash,
          reviewerId: req.platformUser.id,
          reviewNote
        });
        const delivery = await notifyCommercialOrder(
          enrichCommercialOrder(order),
          `La evidencia SPEI necesita corrección. ${reviewNote}`,
          "payment_status"
        );
        order = await req.app.locals.store.updateCommercialOrder(order.id, delivery) || order;
      }

      await recordPlatformAction(req, {
        action: decision === "approve" ? "platform.manual_payment.approved" : "platform.manual_payment.rejected",
        targetType: "commercial_order",
        targetId: order.id,
        severity: "warning",
        metadata: {
          result: "success",
          affectedOrganizationId: order.organizationId,
          reasonCode: decision === "approve" ? "manual_spei_verified" : "manual_spei_rejected"
        }
      });

      await req.app.locals.store.recordAppEvent?.({
        type: decision === "approve" ? "manual_payment_approved" : "manual_payment_rejected",
        scope: "commercial",
        level: decision === "approve" ? "info" : "warning",
        status: evidence.status,
        entityId: order.id,
        message: decision === "approve"
          ? `Transferencia SPEI aprobada para ${order.referenceCode || order.id}`
          : `Transferencia SPEI rechazada para ${order.referenceCode || order.id}`,
        metadata: {
          organizationId: order.organizationId,
          platformReviewerId: req.platformUser.id,
          evidenceVersion: evidence.version
        }
      });

      emitManualPaymentUpdate(req, order, evidence);
      return res.json({
        ok: true,
        replayed: false,
        data: {
          order: serializeOrder(order),
          evidence
        }
      });
    } catch (error) {
      if (claim?.claimed && claim.keyHash) {
        await releaseManualPaymentDecision({
          orderId: req.params.orderId,
          keyHash: claim.keyHash
        }).catch(() => undefined);
      }
      error.publicMessage = error.publicMessage || "No fue posible revisar la transferencia";
      return next(error);
    }
  }
);

module.exports = router;
