const { Router } = require("express");
const { enterpriseRateLimit } = require("../../middlewares/enterprise-rate-limit");
const { recordAppEventSafely } = require("../../services/telemetry");

const router = Router();

const ALLOWED_EVENTS = new Set([
  "landing_view",
  "plan_selected",
  "trial_selected",
  "registration_started",
  "registration_completed",
  "registration_failed",
  "login_started",
  "login_completed",
  "login_failed",
  "checkout_viewed",
  "payment_method_selected",
  "checkout_started",
  "checkout_failed",
  "checkout_redirected",
  "checkout_completed",
  "payment_pending",
  "portal_first_open",
  "activation_key_created",
  "first_driver_activated"
]);

const salesEventLimiter = enterpriseRateLimit({
  scope: "sales-events",
  max: 120,
  windowMs: 60 * 1000,
  message: "Demasiados eventos comerciales. Intenta nuevamente en un minuto."
});

function text(value, maxLength = 80) {
  return String(value || "").trim().slice(0, maxLength);
}

function safeBoolean(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function sanitizeMetadata(input = {}) {
  const paymentMethod = text(input.paymentMethod, 30);
  const providerMode = text(input.providerMode, 30);
  const outcome = text(input.outcome, 40);
  const planId = text(input.planId, 80);
  const route = text(input.route, 100);
  const source = text(input.source, 50);

  return {
    ...(planId ? { planId } : {}),
    ...(route ? { route } : {}),
    ...(paymentMethod ? { paymentMethod } : {}),
    ...(providerMode ? { providerMode } : {}),
    ...(outcome ? { outcome } : {}),
    ...(source ? { source } : {}),
    requestTrial: safeBoolean(input.requestTrial)
  };
}

router.post("/", salesEventLimiter, (req, res) => {
  const eventName = text(req.body?.eventName, 60);
  const sessionId = text(req.body?.sessionId, 100);

  if (!ALLOWED_EVENTS.has(eventName)) {
    return res.status(400).json({
      ok: false,
      code: "sales_event_invalid",
      message: "Evento comercial no permitido"
    });
  }

  if (!sessionId || sessionId.length < 8) {
    return res.status(400).json({
      ok: false,
      code: "sales_session_invalid",
      message: "La sesion comercial es obligatoria"
    });
  }

  const metadata = sanitizeMetadata(req.body?.metadata);
  recordAppEventSafely(req.app.locals.store, {
    type: "sales_funnel",
    scope: "sales",
    level: "info",
    status: "ok",
    userId: req.user?.id,
    message: eventName,
    metadata: {
      eventName,
      sessionId,
      traceId: req.traceId,
      ...metadata
    }
  });

  return res.status(202).json({ ok: true });
});

module.exports = router;
