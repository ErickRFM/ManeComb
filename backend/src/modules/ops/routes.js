const { Router } = require("express");
const { authenticate } = require("../../middlewares/authenticate");
const { requireAdmin } = require("../../middlewares/require-admin");
const { getPaymentReadiness } = require("../../services/commercial-payment");

const router = Router();

router.get("/observability", authenticate, requireAdmin, async (req, res) => {
  return res.json({
    ok: true,
    data: await req.app.locals.store.getOperationalInsights({
      hours: req.query.hours,
      limit: req.query.limit
    })
  });
});

router.get("/readiness/payments", authenticate, requireAdmin, (req, res) => {
  try {
    const readiness = getPaymentReadiness();

    return res.json({
      ok: true,
      payments: {
        provider: readiness.provider,
        environment: readiness.environment,
        configured: readiness.configured,
        webhookConfigured: readiness.webhookConfigured,
        webhookUrlConfigured: readiness.webhookUrlConfigured,
        ready: readiness.ready,
        issues: readiness.issues
      }
    });
  } catch {
    return res.status(500).json({
      ok: false,
      code: "payments_readiness_unavailable"
    });
  }
});

module.exports = router;
