const crypto = require("node:crypto");
const path = require("node:path");

const VALIDATION_IDENTITY = Object.freeze({
  tenantScope: "system:email-validation",
  eventType: "WELCOME",
  idempotencyKey: "operational-validation:mp-email-02b:v1"
});

const VALIDATION_TEMPLATE = "welcome";
const VALIDATION_SUBJECT = "Validación operativa de correo - ManeComb";
const VALIDATION_PREVIEW = "Validación controlada del sistema de correo de ManeComb";

function parseBoolean(value) {
  return /^(1|true|yes|on)$/i.test(String(value || "").trim());
}

function isProductionRuntime(env) {
  return env.NODE_ENV === "production" ||
    parseBoolean(env.RENDER) ||
    Boolean(env.RENDER_SERVICE_ID || env.RENDER_EXTERNAL_URL);
}

function validateExecutionGuards(env, args) {
  const errors = [];
  const expectsNew = args.includes("--expect=new");
  const expectsDuplicate = args.includes("--expect=duplicate");

  if (!args.includes("--execute")) errors.push("EXECUTE_CONFIRMATION_REQUIRED");
  if (!args.includes("--confirm-one-real-delivery")) errors.push("REAL_DELIVERY_CONFIRMATION_REQUIRED");
  if (expectsNew === expectsDuplicate) errors.push("EXPECTATION_REQUIRED");
  if (!parseBoolean(env.EMAIL_REAL_VALIDATION)) errors.push("REAL_VALIDATION_DISABLED");
  if (!parseBoolean(env.EMAIL_ENABLED)) errors.push("EMAIL_DISABLED");
  if (parseBoolean(env.EMAIL_DRY_RUN)) errors.push("DRY_RUN_MUST_BE_DISABLED");
  if (!parseBoolean(env.ENABLE_QUEUES)) errors.push("DURABLE_QUEUE_REQUIRED");
  if (!isProductionRuntime(env)) errors.push("PRODUCTION_RUNTIME_REQUIRED");
  if (!String(env.EMAIL_REAL_VALIDATION_RECIPIENT || "").trim()) {
    errors.push("CONTROLLED_RECIPIENT_REQUIRED");
  }

  return {
    errors,
    expectation: expectsNew ? "new" : expectsDuplicate ? "duplicate" : null,
    valid: errors.length === 0
  };
}

function buildValidationInput({ recipient, portalUrl, supportEmail }) {
  return {
    recipient: {
      email: recipient,
      name: "Equipo de validación ManeComb"
    },
    template: VALIDATION_TEMPLATE,
    ...VALIDATION_IDENTITY,
    data: {
      name: "Equipo de validación ManeComb",
      dashboardUrl: portalUrl,
      supportEmail,
      previewText: VALIDATION_PREVIEW,
      subject: VALIDATION_SUBJECT
    }
  };
}

function getCounterTotal(snapshot, name) {
  return (snapshot.counters || [])
    .filter((counter) => counter.name === name)
    .reduce((total, counter) => total + counter.value, 0);
}

function fingerprintProviderMessageId(value) {
  if (!value) return null;
  return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 12);
}

function getMatchingDeliveries(entries) {
  return entries.filter((entry) =>
    entry.tenantScope === VALIDATION_IDENTITY.tenantScope &&
    entry.eventType === VALIDATION_IDENTITY.eventType &&
    entry.idempotencyKey === VALIDATION_IDENTITY.idempotencyKey
  );
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForFinalDelivery(history, deliveryId, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const delivery = await history.getByDeliveryId(deliveryId);
    if (delivery && ["sent", "failed"].includes(delivery.status)) return delivery;
    await delay(1000);
  }

  const error = new Error("La entrega no alcanzó un estado final dentro del tiempo permitido.");
  error.code = "DELIVERY_TIMEOUT";
  throw error;
}

function validateRenderedEmail(communication, input) {
  const template = communication.getTemplateBuilder(input.template);
  const rendered = communication.renderEmail(template, {
    ...input.data,
    _template: input.template
  });

  return {
    ctaHttps: /^https:\/\//i.test(input.data.dashboardUrl),
    htmlPresent: typeof rendered.html === "string" && rendered.html.length > 100,
    previewTextPresent: rendered.html.includes(VALIDATION_PREVIEW),
    subjectCorrect: rendered.subject === VALIDATION_SUBJECT,
    textPresent: typeof rendered.text === "string" && rendered.text.length > 40
  };
}

function assertPreflight({ communication, dbState, readiness, rendered, recipient, from, replyTo }) {
  const serializedReadiness = JSON.stringify(readiness);
  const checks = {
    databaseConnected: Boolean(dbState.connected),
    communicationFunctional: readiness.functional === true,
    providerConfigured: readiness.providerConfigured === true,
    historyMongo: readiness.history?.mode === "mongo",
    idempotencyIndex: readiness.history?.idempotencyIndex === true,
    queueEnabled: readiness.queue?.enabled === true,
    queueBullmq: readiness.queue?.mode === "bullmq",
    queueConnected: readiness.queue?.connected === true,
    queueFunctional: readiness.queue?.functional === true,
    workerStarted: readiness.queue?.workerStarted === true,
    maxmemoryNoeviction: readiness.queue?.maxmemoryPolicy === "noeviction",
    persistenceDisabled: readiness.queue?.persistence === false,
    productionDurabilityDisabled: readiness.productionDurability === false,
    recipientValid: communication.validators.isValidEmail(recipient),
    fromManecomb: /@manecomb\.com(?:>|$)/i.test(String(from || "")),
    replyToConfigured: communication.validators.isValidEmail(replyTo),
    renderedValid: Object.values(rendered).every(Boolean),
    readinessSanitized:
      !serializedReadiness.includes(process.env.MONGO_URI || "__not_configured__") &&
      !serializedReadiness.includes(process.env.REDIS_URL || "__not_configured__") &&
      !serializedReadiness.includes(process.env.RESEND_API_KEY || "__not_configured__")
  };

  if (!Object.values(checks).every(Boolean)) {
    const error = new Error("El preflight del correo real no es válido.");
    error.code = "REAL_VALIDATION_PREFLIGHT_FAILED";
    error.checks = checks;
    throw error;
  }

  return checks;
}

async function run() {
  require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

  const guard = validateExecutionGuards(process.env, process.argv.slice(2));
  if (!guard.valid) {
    const error = new Error("Las guardas de validación real no se cumplieron.");
    error.code = "REAL_VALIDATION_GUARD_FAILED";
    error.guardErrors = guard.errors;
    throw error;
  }

  const mongoose = require("mongoose");
  const { connectDB, getDbState } = require("../src/config/db");
  const {
    EMAIL_FROM,
    EMAIL_FROM_NAME,
    PORTAL_PUBLIC_URL,
    REDIS_MAXMEMORY_POLICY,
    REDIS_PERSISTENCE_ENABLED,
    RESEND_API_KEY,
    RESEND_REPLY_TO
  } = require("../src/config/env");
  const communication = require("../modules/communication");

  try {
    await connectDB();

    communication.configure({
      provider: "resend",
      providerConfig: {
        apiKey: RESEND_API_KEY,
        fromEmail: EMAIL_FROM,
        replyTo: RESEND_REPLY_TO
      },
      queue: {
        enabled: parseBoolean(process.env.ENABLE_QUEUES) && Boolean(process.env.REDIS_URL),
        redisUrl: process.env.REDIS_URL || "",
        persistence: REDIS_PERSISTENCE_ENABLED,
        maxmemoryPolicy: REDIS_MAXMEMORY_POLICY
      },
      defaultFrom: EMAIL_FROM ? `${EMAIL_FROM_NAME} <${EMAIL_FROM}>` : "",
      supportEmail: process.env.COMMERCIAL_SUPPORT_EMAIL || RESEND_REPLY_TO,
      docsUrl: PORTAL_PUBLIC_URL,
      brandName: EMAIL_FROM_NAME,
      legalName: process.env.COMMERCIAL_LEGAL_NAME || "ManeComb",
      email: {
        enabled: true,
        dryRun: false,
        requireDurableQueue: true,
        requireDurableHistory: true
      },
      persistence: { mongoose }
    });

    await communication.initializePersistence();

    const recipient = String(process.env.EMAIL_REAL_VALIDATION_RECIPIENT).trim();
    const input = buildValidationInput({
      recipient,
      portalUrl: PORTAL_PUBLIC_URL,
      supportEmail: process.env.COMMERCIAL_SUPPORT_EMAIL || RESEND_REPLY_TO
    });
    const rendered = validateRenderedEmail(communication, input);
    const readiness = communication.getReadiness();
    const preflight = assertPreflight({
      communication,
      dbState: getDbState(),
      readiness,
      rendered,
      recipient,
      from: EMAIL_FROM,
      replyTo: RESEND_REPLY_TO
    });

    const beforeEntries = getMatchingDeliveries(await communication.history.query({
      tenantScope: VALIDATION_IDENTITY.tenantScope,
      eventType: VALIDATION_IDENTITY.eventType,
      limit: 200
    }));
    const metricsBefore = communication.metrics.getSnapshot();
    const sendResult = await communication.sendEmail(input);
    const finalDelivery = await waitForFinalDelivery(
      communication.history,
      sendResult.deliveryId
    );
    const metricsAfter = communication.metrics.getSnapshot();
    const afterEntries = getMatchingDeliveries(await communication.history.query({
      tenantScope: VALIDATION_IDENTITY.tenantScope,
      eventType: VALIDATION_IDENTITY.eventType,
      limit: 200
    }));
    const finalResult = communication.deliveryResults.createDeliveryResult({
      status: finalDelivery.status,
      deliveryId: finalDelivery.deliveryId,
      duplicate: sendResult.duplicate === true
    });
    const serializedDelivery = JSON.stringify(finalDelivery);
    const evidence = {
      ok: false,
      expectation: guard.expectation,
      identity: VALIDATION_IDENTITY,
      preflight,
      initialResult: {
        accepted: sendResult.accepted,
        duplicate: sendResult.duplicate === true,
        jobCreated: Boolean(sendResult.jobId),
        status: sendResult.status
      },
      finalResult: {
        accepted: finalResult.accepted,
        delivered: finalResult.delivered,
        duplicate: finalResult.duplicate,
        failed: finalResult.failed,
        status: finalResult.status
      },
      delivery: {
        attempts: finalDelivery.attempts,
        countAfter: afterEntries.length,
        countBefore: beforeEntries.length,
        createdAtPresent: Boolean(finalDelivery.createdAt),
        processingAtPresent: Boolean(finalDelivery.processingAt),
        providerMessageIdFingerprint: fingerprintProviderMessageId(
          finalDelivery.providerMessageId
        ),
        providerMessageIdPresent: Boolean(finalDelivery.providerMessageId),
        queuedAtPresent: Boolean(finalDelivery.queuedAt),
        sentAtPresent: Boolean(finalDelivery.sentAt)
      },
      metrics: {
        deliveriesFailedDelta:
          getCounterTotal(metricsAfter, "deliveries_failed") -
          getCounterTotal(metricsBefore, "deliveries_failed"),
        deliveriesSentObserved:
          afterEntries.filter((entry) => entry.status === "sent").length -
          beforeEntries.filter((entry) => entry.status === "sent").length,
        deliveriesSentDelta:
          getCounterTotal(metricsAfter, "deliveries_sent") -
          getCounterTotal(metricsBefore, "deliveries_sent"),
        duplicatesPreventedDelta:
          getCounterTotal(metricsAfter, "duplicates_prevented") -
          getCounterTotal(metricsBefore, "duplicates_prevented"),
        providerAttemptsRecorded: finalDelivery.attempts,
        providerAttemptsDelta:
          getCounterTotal(metricsAfter, "provider_attempts") -
          getCounterTotal(metricsBefore, "provider_attempts")
      },
      rendered,
      sensitiveFieldsAbsent:
        !serializedDelivery.includes(recipient) &&
        !serializedDelivery.includes("RESEND_API_KEY") &&
        !serializedDelivery.includes("resetUrl") &&
        !serializedDelivery.includes("\"html\"") &&
        !serializedDelivery.includes("\"token\"")
    };

    const commonValid =
      evidence.delivery.countAfter === 1 &&
      evidence.delivery.attempts === 1 &&
      evidence.delivery.providerMessageIdPresent &&
      evidence.finalResult.status === "sent" &&
      evidence.finalResult.accepted === true &&
      evidence.finalResult.delivered === true &&
      evidence.finalResult.failed === false &&
      evidence.sensitiveFieldsAbsent === true &&
      Object.values(evidence.rendered).every(Boolean);

    const expectationValid = guard.expectation === "new"
      ? evidence.delivery.countBefore === 0 &&
        evidence.initialResult.status === "queued" &&
        evidence.initialResult.duplicate === false &&
        evidence.initialResult.jobCreated === true &&
        evidence.delivery.queuedAtPresent &&
        evidence.delivery.processingAtPresent &&
        evidence.delivery.sentAtPresent &&
        evidence.metrics.deliveriesSentObserved === 1 &&
        evidence.metrics.providerAttemptsRecorded === 1 &&
        evidence.metrics.deliveriesFailedDelta === 0
      : evidence.delivery.countBefore === 1 &&
        evidence.initialResult.status === "sent" &&
        evidence.initialResult.duplicate === true &&
        evidence.initialResult.jobCreated === false &&
        evidence.metrics.deliveriesSentObserved === 0 &&
        evidence.metrics.providerAttemptsRecorded === 1 &&
        evidence.metrics.providerAttemptsDelta === 0 &&
        evidence.metrics.deliveriesSentDelta === 0 &&
        evidence.metrics.deliveriesFailedDelta === 0 &&
        evidence.metrics.duplicatesPreventedDelta >= 1;

    evidence.ok = commonValid && expectationValid;
    console.log(JSON.stringify(evidence, null, 2));

    if (!evidence.ok) {
      const error = new Error("La evidencia real no cumplió el contrato esperado.");
      error.code = "REAL_VALIDATION_EVIDENCE_FAILED";
      throw error;
    }
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}

module.exports = {
  VALIDATION_IDENTITY,
  VALIDATION_PREVIEW,
  VALIDATION_SUBJECT,
  buildValidationInput,
  fingerprintProviderMessageId,
  isProductionRuntime,
  parseBoolean,
  validateExecutionGuards
};

if (require.main === module) {
  run()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(JSON.stringify({
        errorCode: error.code || "REAL_VALIDATION_FAILED",
        guardErrors: error.guardErrors || undefined,
        ok: false,
        preflightChecks: error.checks || undefined
      }));
      process.exit(1);
    });
}
