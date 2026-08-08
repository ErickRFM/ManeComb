const { Router } = require("express");
const { authenticate } = require("../../middlewares/authenticate");
const { enterpriseRateLimit } = require("../../middlewares/enterprise-rate-limit");
const { getRolesWithPermission, requirePermission } = require("../../middlewares/access-control");
const { requirePortalAccess } = require("../../middlewares/portal-access");
const {
  getManualPaymentEligibility,
  getManualPaymentEvidence,
  submitManualPaymentEvidence
} = require("./service");

const router = Router();
const readLimiter = enterpriseRateLimit({ scope: "manual-payment-read", max: 60, windowMs: 60 * 1000 });
const submitLimiter = enterpriseRateLimit({ scope: "manual-payment-submit", max: 10, windowMs: 15 * 60 * 1000 });

async function findOrderForUser(req) {
  const orders = await req.app.locals.store.listCommercialOrdersForUser(req.user);
  return (orders || []).find((order) => String(order.id || "") === String(req.params.orderId || "")) || null;
}

function buildPortalPayload(order, evidence) {
  const eligibility = getManualPaymentEligibility(order);
  return {
    eligible: Boolean(eligibility.eligible),
    reason: eligibility.reason,
    order: {
      id: order.id,
      referenceCode: order.referenceCode,
      paymentStatus: order.paymentStatus,
      activationStatus: order.activationStatus,
      expectedAmount: Number(order.totalPrice || 0),
      currency: String(order.currency || "MXN")
    },
    evidence
  };
}

function emitEvidenceUpdate(req, order, evidence) {
  const organizationId = String(order.organizationId || "").trim();
  const ownerUserId = String(order.ownerUserId || "").trim();
  const event = {
    organizationId,
    orderId: order.id,
    evidence,
    updatedAt: new Date().toISOString()
  };

  if (organizationId) {
    getRolesWithPermission("canManageBilling").forEach((role) => {
      req.app.locals.io?.to(`org:${organizationId}:role:${role}`).emit("manual-payment:updated", event);
    });
  }
  if (ownerUserId) req.app.locals.io?.to(`user:${ownerUserId}`).emit("manual-payment:updated", event);
  req.app.locals.io?.to("platform:admin").emit("manual-payment:updated", event);
}

router.get(
  "/orders/:orderId/evidence",
  readLimiter,
  authenticate,
  requirePortalAccess,
  requirePermission("canManageBilling"),
  async (req, res, next) => {
    try {
      const order = await findOrderForUser(req);
      if (!order) return res.status(404).json({ ok: false, message: "Orden comercial no encontrada" });
      const evidence = await getManualPaymentEvidence(order.id);
      return res.json({ ok: true, data: buildPortalPayload(order, evidence) });
    } catch (error) {
      return next(error);
    }
  }
);

router.post(
  "/orders/:orderId/evidence",
  submitLimiter,
  authenticate,
  requirePortalAccess,
  requirePermission("canManageBilling"),
  async (req, res, next) => {
    try {
      const order = await findOrderForUser(req);
      if (!order) return res.status(404).json({ ok: false, message: "Orden comercial no encontrada" });

      const result = await submitManualPaymentEvidence({
        order,
        userId: req.user.id,
        payload: req.body || {},
        idempotencyKey: req.get("Idempotency-Key")
      });

      await req.app.locals.store.recordAppEvent?.({
        type: "manual_payment_evidence_submitted",
        scope: "commercial",
        level: "info",
        status: result.evidence.status,
        userId: req.user.id,
        entityId: order.id,
        message: `Evidencia SPEI recibida para ${order.referenceCode || order.id}`,
        metadata: {
          organizationId: order.organizationId,
          replayed: Boolean(result.replayed),
          evidenceVersion: result.evidence.version
        }
      });

      const payload = buildPortalPayload(order, result.evidence);
      emitEvidenceUpdate(req, order, result.evidence);

      return res.status(result.replayed ? 200 : 201).json({
        ok: true,
        replayed: Boolean(result.replayed),
        data: payload
      });
    } catch (error) {
      error.publicMessage = error.publicMessage || "No fue posible registrar la evidencia de transferencia";
      return next(error);
    }
  }
);

module.exports = router;
