const assert = require("node:assert/strict");

const comm = require("../src");
const TEMPLATE = comm.types.TEMPLATE;
const PRIORITY = comm.types.PRIORITY;
const PROVIDER = comm.types.PROVIDER;
const CHANNEL = comm.types.CHANNEL;
const STATUS = comm.types.STATUS;

function testTypesConstants() {
  assert.equal(typeof TEMPLATE, "object");
  assert.equal(TEMPLATE.PASSWORD_RESET, "password-reset");
  assert.equal(TEMPLATE.WELCOME, "welcome");
  assert.equal(Object.keys(TEMPLATE).length, 26, "Deben existir 26 plantillas");

  assert.equal(PRIORITY.CRITICAL, 10);
  assert.equal(PRIORITY.HIGH, 5);
  assert.equal(PRIORITY.NORMAL, 1);
  assert.equal(PRIORITY.LOW, 0);
  assert.equal(Object.keys(PRIORITY).length, 4, "Deben existir 4 prioridades");

  assert.equal(PROVIDER.RESEND, "resend");
  assert.equal(PROVIDER.SMTP, "smtp");
  assert.equal(PROVIDER.SES, "ses");
  assert.equal(PROVIDER.MAILGUN, "mailgun");
  assert.equal(PROVIDER.POSTMARK, "postmark");
  assert.equal(PROVIDER.SENDGRID, "sendgrid");
  assert.equal(Object.keys(PROVIDER).length, 6, "Deben existir 6 proveedores");

  assert.equal(CHANNEL.EMAIL, "email");
  assert.equal(CHANNEL.WHATSAPP, "whatsapp");

  assert.equal(STATUS.QUEUED, "queued");
  assert.equal(STATUS.SENT, "sent");
  assert.equal(STATUS.FAILED, "failed");
  console.log("ok - tipos/constantes definidas correctamente");
}

function testTemplateRegistry() {
  const names = comm.getTemplateNames();
  assert.equal(names.length, 26, "Deben registrarse 26 plantillas");
  assert.ok(names.includes("welcome"));
  assert.ok(names.includes("password-reset"));
  assert.ok(names.includes("payment-approved"));
  assert.ok(names.includes("suspicious-login"));
  assert.ok(names.includes("identity-verification"));

  assert.ok(comm.hasTemplate("welcome"));
  assert.ok(comm.hasTemplate("password-reset"));
  assert.ok(!comm.hasTemplate("nonexistent"));

  const builder = comm.getTemplateBuilder("welcome");
  assert.equal(typeof builder, "function");
  console.log("ok - registro de plantillas completo");
}

function testTemplateBuilderOutput() {
  const builder = comm.getTemplateBuilder("welcome");
  const html = builder({
    name: "Juan Pérez",
    dashboardUrl: "https://manecomb.com/dashboard",
    supportEmail: "soporte@manecomb.com",
    docsUrl: "https://manecomb.com/docs"
  });

  assert.equal(typeof html, "string");
  assert.ok(html.length > 100, "El HTML debe tener contenido");
  assert.ok(html.includes("Juan Pérez"), "Debe incluir el nombre del usuario");
  assert.ok(html.includes("Bienvenido"), "Debe incluir el título de bienvenida");
  assert.ok(html.includes("soporte@manecomb.com"), "Debe incluir el correo de soporte");
  console.log("ok - plantilla welcome genera HTML válido");
}

function testPasswordResetTemplate() {
  const builder = comm.getTemplateBuilder("password-reset");
  const html = builder({
    name: "María García",
    resetUrl: "https://manecomb.com/reset?token=abc123",
    supportEmail: "soporte@manecomb.com"
  });

  assert.ok(html.includes("María García"));
  assert.ok(html.includes("reset?token=abc123"));
  assert.ok(html.includes("Recuperación"));
  assert.ok(html.includes("1 hora"));
  console.log("ok - plantilla password-reset genera HTML con enlace de recuperación");
}

function testPaymentApprovedTemplate() {
  const builder = comm.getTemplateBuilder("payment-approved");
  const html = builder({
    name: "Carlos López",
    referenceCode: "ORD-001",
    planName: "Plan Premium",
    amount: "$999 MXN",
    paymentMethod: "Tarjeta de crédito",
    date: "15/07/2026",
    dashboardUrl: "https://manecomb.com",
    supportEmail: "soporte@manecomb.com"
  });

  assert.ok(html.includes("Carlos López"));
  assert.ok(html.includes("ORD-001"));
  assert.ok(html.includes("Plan Premium"));
  assert.ok(html.includes("$999 MXN"));
  assert.ok(html.includes("aprobado"));
  console.log("ok - plantilla payment-approved genera HTML con datos de pago");
}

function testIdentityVerificationTemplate() {
  const builder = comm.getTemplateBuilder("identity-verification");
  const html = builder({
    name: "Ana Martínez",
    code: "847291",
    expiresIn: "10 minutos",
    supportEmail: "soporte@manecomb.com"
  });

  assert.ok(html.includes("847291"), "Debe incluir el código de verificación");
  assert.ok(html.includes("10 minutos"), "Debe incluir tiempo de expiración");
  assert.ok(html.includes("Verificación"), "Debe incluir título de verificación");
  console.log("ok - plantilla identity-verification incluye código numérico");
}

function testSuspiciousLoginTemplate() {
  const builder = comm.getTemplateBuilder("suspicious-login");
  const html = builder({
    name: "Pedro Sánchez",
    location: "Ciudad de México",
    ip: "192.168.1.1",
    device: "Chrome en Windows",
    timestamp: "15/07/2026 14:30",
    securityUrl: "https://manecomb.com/security",
    supportEmail: "soporte@manecomb.com"
  });

  assert.ok(html.includes("sospechoso"));
  assert.ok(html.includes("192.168.1.1"));
  assert.ok(html.includes("Ciudad de México"));
  assert.ok(html.includes("Asegurar cuenta"));
  console.log("ok - plantilla suspicious-login incluye datos del intento");
}

function testCriticalIncidentTemplate() {
  const builder = comm.getTemplateBuilder("critical-incident");
  const html = builder({
    name: "Admin Flotilla",
    incidentType: "Colisión",
    vehicleName: "Combi-07",
    driverName: "Luis Ramírez",
    location: "Av. Reforma 222, CDMX",
    timestamp: "15/07/2026 14:30",
    summary: "Se detectó un impacto en la unidad.",
    incidentUrl: "https://manecomb.com/incident/123",
    supportEmail: "soporte@manecomb.com"
  });

  assert.ok(html.includes("Crítica"));
  assert.ok(html.includes("Combi-07"));
  assert.ok(html.includes("Colisión"));
  assert.ok(html.includes("Luis Ramírez"));
  console.log("ok - plantilla critical-incident incluye detalles del incidente");
}

function testBaseLayoutRendering() {
  const { renderTemplate, extractSubject } = comm;

  const data = {
    _template: "welcome",
    name: "Test User",
    dashboardUrl: "https://manecomb.com",
    supportEmail: "test@manecomb.com"
  };

  const fullHtml = renderTemplate(comm.getTemplateBuilder("welcome"), data);
  assert.ok(fullHtml.includes("<!DOCTYPE html>"), "Debe incluir DOCTYPE");
  assert.ok(fullHtml.includes("<html lang=\"es\""), "Debe ser HTML en español");
  assert.ok(fullHtml.includes("color-scheme"), "Debe incluir soporte para modo oscuro");
  assert.ok(fullHtml.includes("max-width: 600px"), "Debe ser responsivo");
  assert.ok(fullHtml.includes("Test User"), "Debe incluir los datos del template");
  assert.ok(fullHtml.includes("ManeComb"), "Debe incluir la marca");

  const subject = extractSubject(data);
  assert.equal(subject, "Bienvenido a ManeComb", "Debe extraer el asunto correcto");
  console.log("ok - renderizado completo con layout base y modo oscuro");
}

function testAllTemplatesRender() {
  const names = comm.getTemplateNames();
  const mockData = {
    name: "Usuario",
    resetUrl: "https://manecomb.com/reset",
    activationUrl: "https://manecomb.com/activate",
    dashboardUrl: "https://manecomb.com",
    invitationUrl: "https://manecomb.com/invite",
    securityUrl: "https://manecomb.com/security",
    supportEmail: "soporte@manecomb.com",
    companyName: "Mi Empresa",
    invitedBy: "Admin",
    referenceCode: "REF-001",
    planName: "Plan Básico",
    amount: "$499 MXN",
    paymentMethod: "Tarjeta",
    date: "Hoy",
    period: "Julio 2026",
    expirationDate: "31/07/2026",
    renewalAmount: "$499 MXN",
    reason: "Pago pendiente",
    suspensionDate: "Hoy",
    code: "123456",
    expiresIn: "10 min",
    newEmail: "nuevo@correo.com",
    email: "test@test.com",
    invoiceUrl: "https://manecomb.com/invoice",
    billingEmail: "facturas@manecomb.com",
    items: [{ description: "Plan Premium", quantity: "1", amount: "$999" }],
    manageUrl: "https://manecomb.com/manage",
    plansUrl: "https://manecomb.com/plans",
    renewalUrl: "https://manecomb.com/renew",
    retryUrl: "https://manecomb.com/retry",
    reportUrl: "https://manecomb.com/report",
    totalTrips: 42,
    totalDistance: "1,250 km",
    activeDrivers: 8,
    activeVehicles: 10,
    totalVehicles: 12,
    totalHours: "168 h",
    incidents: 3,
    complianceRate: "94%",
    highlights: ["Reducción de 20% en tiempos de espera"],
    incidentType: "Alerta",
    vehicleName: "Combi-05",
    driverName: "Conductor",
    location: "Ubicación",
    timestamp: "Ahora",
    incidentUrl: "https://manecomb.com/incident",
    description: "Descripción de la incidencia",
    deviceName: "iPhone 15",
    os: "iOS 18",
    browser: "Safari",
    ip: "192.168.1.1",
    summary: "Resumen del incidente",
    brandName: "ManeComb",
    _template: "welcome"
  };

  let allOk = true;
  for (const name of names) {
    try {
      const builder = comm.getTemplateBuilder(name);
      const html = builder(mockData);
      if (!html || html.length < 50) {
        console.error(`  ERROR: Template "${name}" generated very short HTML`);
        allOk = false;
      }
    } catch (err) {
      console.error(`  ERROR: Template "${name}" failed: ${err.message}`);
      allOk = false;
    }
  }
  assert.ok(allOk, "All templates must render without errors");
  console.log(`ok - ${names.length} templates render correctly`);
}

function testValidators() {
  const validators = comm.validators;

  assert.ok(validators.isValidEmail("test@manecomb.com"));
  assert.ok(!validators.isValidEmail("invalid-email"));
  assert.ok(!validators.isValidEmail(""));

  assert.ok(validators.isValidTemplate("welcome"));
  assert.ok(validators.isValidTemplate("password-reset"));
  assert.ok(!validators.isValidTemplate("invalid-template"));

  const valid = validators.validateSendEmailInput({
    recipient: { email: "user@manecomb.com" },
    template: "welcome",
    eventType: "WELCOME",
    idempotencyKey: "welcome:user-1",
    tenantScope: "user:user-1",
    data: { name: "Test" }
  });
  assert.ok(valid.valid);

  const invalid = validators.validateSendEmailInput({
    to: "bad-email",
    template: "nonexistent",
    eventType: "",
    idempotencyKey: "",
    tenantScope: ""
  });
  assert.ok(!invalid.valid);
  assert.ok(invalid.errors.length >= 2);

  const empty = validators.validateSendEmailInput({});
  assert.ok(!empty.valid);
  assert.ok(empty.errors.length >= 2);

  assert.equal(validators.normalizePriority("critical"), PRIORITY.CRITICAL);
  assert.equal(validators.normalizePriority("high"), PRIORITY.HIGH);
  assert.equal(validators.normalizePriority("low"), PRIORITY.LOW);
  assert.equal(validators.normalizePriority("invalid"), PRIORITY.NORMAL);

  const providerValid = validators.validateProviderConfig(PROVIDER.RESEND, {
    apiKey: "key",
    fromEmail: "test@test.com"
  });
  assert.ok(providerValid.valid);

  const providerInvalid = validators.validateProviderConfig(PROVIDER.RESEND, {});
  assert.ok(!providerInvalid.valid);
  console.log("ok - validators working correctly");
}

function testProviderFactory() {
  const resendProvider = comm.createProvider(PROVIDER.RESEND, {
    apiKey: "test_key",
    fromEmail: "test@manecomb.com"
  });
  assert.equal(resendProvider.name, "resend");
  assert.equal(typeof resendProvider.send, "function");
  assert.equal(typeof resendProvider.verifyConnection, "function");

  const smtpProvider = comm.createProvider(PROVIDER.SMTP, {
    host: "smtp.test.com",
    port: 587,
    auth: { user: "test", pass: "test" },
    fromEmail: "test@test.com"
  });
  assert.equal(smtpProvider.name, "smtp");
  assert.equal(typeof smtpProvider.send, "function");

  assert.throws(() => comm.createProvider("unknown", {}), /Proveedor desconocido/);
  console.log("ok - provider factory creates correct instances");
}

function testRetryLogic() {
  const retry = comm.retry;

  assert.equal(retry.getMaxRetries(PRIORITY.CRITICAL), 5);
  assert.equal(retry.getMaxRetries(PRIORITY.HIGH), 3);
  assert.equal(retry.getMaxRetries(PRIORITY.NORMAL), 2);
  assert.equal(retry.getMaxRetries(PRIORITY.LOW), 1);

  const delays = retry.getDelays(PRIORITY.CRITICAL);
  assert.equal(delays.length, 5);
  assert.equal(delays[0], 1000);
  assert.equal(delays[4], 300000);

  const jobOptions = retry.getJobOptions(PRIORITY.HIGH);
  assert.equal(jobOptions.attempts, 4);
  assert.equal(jobOptions.backoff.type, "exponential", "Backoff must be exponential");
  assert.equal(jobOptions.backoff.delay, 1000);

  assert.ok(retry.shouldRetry(0, PRIORITY.HIGH, null));
  assert.ok(!retry.shouldRetry(3, PRIORITY.HIGH, null));
  console.log("ok - retry logic by priority correct");
}

function testMetrics() {
  const metrics = comm.metrics;

  metrics.reset();
  metrics.increment("test_counter", 1, { template: "welcome" });
  metrics.increment("test_counter", 1, { template: "welcome" });
  metrics.increment("test_counter", 1, { template: "password-reset" });

  let snapshot = metrics.getSnapshot();
  let counterSnapshot = snapshot.counters.filter((c) => c.name === "test_counter");
  assert.equal(counterSnapshot.length, 2);

  const welcomeCounter = counterSnapshot.find((c) => c.tags.template === "welcome");
  assert.equal(welcomeCounter.value, 2);

  metrics.observeDuration("test_timer", 150, { template: "welcome" });
  metrics.observeDuration("test_timer", 250, { template: "welcome" });

  snapshot = metrics.getSnapshot();
  const timerSnapshot = snapshot.timers.filter((t) => t.name === "test_timer");
  assert.equal(timerSnapshot.length, 1);
  assert.equal(timerSnapshot[0].count, 2);

  metrics.reset();
  const emptySnapshot = metrics.getSnapshot();
  assert.equal(emptySnapshot.counters.length, 0);
  assert.equal(emptySnapshot.timers.length, 0);
  console.log("ok - metrics increment and reset correctly");
}

function testErrorClassification() {
  const { classifyError, BounceError, RateLimitError, TimeoutError, AuthError, InvalidAddressError, ProviderError } = require("../src/errors");

  const bounce = classifyError(new Error("550 5.1.1 user unknown"), "resend");
  assert.ok(bounce instanceof BounceError);
  assert.equal(bounce.category, "bounce");
  assert.equal(bounce.retryable, false);

  const rateLimit = classifyError(new Error("rate limit exceeded: 429"), "smtp");
  assert.ok(rateLimit instanceof RateLimitError);
  assert.equal(rateLimit.category, "rate_limit");
  assert.equal(rateLimit.retryable, true);

  const timeout = classifyError(new Error("connection timed out"), "ses");
  assert.ok(timeout instanceof TimeoutError);
  assert.equal(timeout.category, "timeout");
  assert.equal(timeout.retryable, true);

  const auth = classifyError(new Error("535 Authentication failed"), "smtp");
  assert.ok(auth instanceof AuthError);
  assert.equal(auth.category, "auth");
  assert.equal(auth.retryable, false);

  const invalid = classifyError(new Error("invalid email address"), "resend");
  assert.ok(invalid instanceof InvalidAddressError);
  assert.equal(invalid.category, "invalid_address");

  const generic = classifyError(new Error("server error"), "resend");
  assert.ok(generic instanceof ProviderError);
  assert.equal(generic.category, "provider");
  assert.equal(generic.retryable, true);

  console.log("ok - error classification works correctly");
}

function testTimeoutManager() {
  const { withTimeout, getTimeoutMs } = require("../src/timeout");

  assert.equal(getTimeoutMs(10), 60000);
  assert.equal(getTimeoutMs(5), 45000);
  assert.equal(getTimeoutMs(1), 30000);
  assert.equal(getTimeoutMs(0), 30000);

  console.log("ok - timeout manager works correctly");
}

function testRateLimiter() {
  const rateLimiter = require("../src/rate-limit");

  rateLimiter.configure("test", { maxTokens: 2, refillRate: 1, refillIntervalMs: 100 });

  assert.ok(rateLimiter.waitForToken("test"), "Should allow first token");
  assert.ok(rateLimiter.waitForToken("test"), "Should allow second token");

  rateLimiter.reset("test");
  assert.ok(rateLimiter.waitForToken("test"), "Should allow after reset");

  const state = rateLimiter.getState();
  assert.ok(state.test);
  assert.equal(state.test.maxTokens, 2);

  console.log("ok - rate limiter works correctly");
}

function testConnectionManager() {
  const connectionManager = require("../src/connection");

  connectionManager.configure({ maxConnections: 3, idleTimeoutMs: 5000 });

  const health = connectionManager.getHealth();
  assert.ok(health.pools);
  assert.equal(Object.keys(health.pools).length, 0);

  console.log("ok - connection manager initializes correctly");
}

function testDeliveryEngineExports() {
  assert.ok(comm.deliveryEngine, "deliveryEngine must be exported");
  assert.equal(typeof comm.deliveryEngine.sendDirect, "function");
  assert.equal(typeof comm.deliveryEngine.sendViaQueue, "function");
  assert.equal(typeof comm.deliveryEngine.queueOrDirect, "function");
  console.log("ok - delivery engine exported correctly");
}

function testDeliveryResultContract() {
  const {
    createDeliveryResult,
    isDeliveryAccepted,
    isDeliveryFailed,
    isDeliveryFinal
  } = comm.deliveryResults;
  const expected = {
    sent: { accepted: true, delivered: true, failed: false, final: true },
    queued: { accepted: true, delivered: false, failed: false, final: false },
    dry_run: { accepted: true, delivered: false, failed: false, final: true },
    skipped: { accepted: true, delivered: false, failed: false, final: true },
    failed: { accepted: false, delivered: false, failed: true, final: true }
  };

  for (const [status, contract] of Object.entries(expected)) {
    const result = createDeliveryResult({ status });
    assert.equal(result.success, contract.accepted, `${status} debe conservar success compatible`);
    assert.equal(result.accepted, contract.accepted, `${status} accepted`);
    assert.equal(result.delivered, contract.delivered, `${status} delivered`);
    assert.equal(result.failed, contract.failed, `${status} failed`);
    assert.equal(result.final, contract.final, `${status} final`);
    assert.equal(isDeliveryAccepted(result), contract.accepted);
    assert.equal(isDeliveryFailed(result), contract.failed);
    assert.equal(isDeliveryFinal(result), contract.final);
  }

  const simulated = createDeliveryResult({ status: "dry_run" });
  assert.equal(simulated.simulated, true);
  assert.equal(simulated.queued, false);

  const skipped = createDeliveryResult({ status: "skipped" });
  assert.equal(skipped.skipped, true);

  for (const status of ["sent", "queued", "dry_run"]) {
    const duplicate = createDeliveryResult({ status, duplicate: true });
    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.accepted, true);
    assert.equal(duplicate.delivered, status === "sent");
  }

  assert.equal(isDeliveryAccepted({ queued: true }), true);
  assert.equal(isDeliveryFailed({ status: "dry_run", success: false }), false);
  assert.equal(isDeliveryFailed({ success: false }), true);
  console.log("ok - contrato de resultados distingue aceptación, entrega y fallo");
}

async function testHistoryMemoryStore() {
  const history = comm.history;

  history.resetMemoryStore();

  const entry = await history.log({
    to: ["test@manecomb.com"],
    template: "welcome",
    provider: "resend",
    status: "sent",
    priority: 1,
    subject: "Bienvenido",
    messageId: "msg-123",
    durationMs: 350,
    metadata: { userId: "user-1", organizationId: "org-1" }
  });

  assert.ok(entry._id);
  assert.equal(entry.status, "sent");
  assert.equal(entry.template, "welcome");

  const entries = await history.query({ template: "welcome" });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].recipientMasked, "t***@m***.com");

  const emptyQuery = await history.query({ template: "nonexistent" });
  assert.equal(emptyQuery.length, 0);

  const stats = await history.getStats({ template: "welcome" });
  assert.equal(stats.total, 1);
  assert.equal(stats.sent, 1);
  assert.equal(stats.failed, 0);

  history.resetMemoryStore();
  const afterReset = await history.query({});
  assert.equal(afterReset.length, 0);
  console.log("ok - history memory store works correctly");
}

async function testHistoryUpdateStatus() {
  const history = comm.history;

  history.resetMemoryStore();
  const entry = await history.log({
    to: ["test@test.com"],
    template: "password-reset",
    provider: "resend",
    status: "queued",
    priority: 10
  });

  await history.updateStatus(entry._id, { status: "sent", messageId: "msg-456" });
  const entries = await history.query({ template: "password-reset" });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].status, "sent");
  assert.equal(entries[0].messageId || entries[0].providerMessageId, "msg-456");

  history.resetMemoryStore();
  console.log("ok - history updates status correctly");
}

async function testDeliveryPipelineStages() {
  const { DeliveryPipeline, ValidateStage, ResolveTemplateStage, SendStage, HistoryStage, MetricsStage, ErrorClassificationStage, EventsStage } = require("../src/delivery/pipeline");

  const pipeline = new DeliveryPipeline();
  pipeline
    .use(new ValidateStage())
    .use(new ResolveTemplateStage())
    .use(new SendStage())
    .use(new ErrorClassificationStage())
    .use(new HistoryStage())
    .use(new MetricsStage())
    .use(new EventsStage());

  const ctx = {
    to: "test@manecomb.com",
    template: "welcome",
    eventType: "WELCOME",
    idempotencyKey: "pipeline:test",
    tenantScope: "user:test",
    data: { name: "Test", _template: "welcome", brandName: "ManeComb", supportEmail: "test@manecomb.com", docsUrl: "" },
    priority: 1,
    provider: "resend",
    from: "test@manecomb.com",
    subject: "Welcome Test",
    sendFn: async (c) => ({ success: true, id: "msg-pipeline-test", durationMs: 10 }),
    status: "initial",
    attempts: 1,
    maxAttempts: 3
  };

  const result = await pipeline.execute(ctx);
  assert.equal(result.status, "sent");
  assert.ok(result.historyId, "historyId must be set");

  const failed = await pipeline.execute({
    ...ctx,
    sendFn: async () => ({ success: false, error: "Resend error 429: rate limit" }),
    status: "initial"
  });
  assert.equal(failed.status, "failed");
  assert.equal(failed.classifiedError.category, "rate_limit");
  assert.ok(failed.historyId, "failed deliveries must be auditable");
  const failedEntries = await comm.history.query({ status: "failed", template: "welcome" });
  assert.ok(failedEntries.some((entry) => entry.errorMessage));
  console.log("ok - delivery pipeline stages work correctly");
}

async function testStructuralEmailClosure() {
  const history = comm.history;
  const engine = comm.deliveryEngine;
  comm.metrics.reset();
  const input = {
    recipient: { email: "recipient@example.com", name: "Recipient" },
    template: "password-reset",
    eventType: "PASSWORD_RESET",
    tenantScope: "user:user-structural",
    idempotencyKey: "password-reset:request-1",
    data: {
      _template: "password-reset",
      name: "Recipient",
      resetUrl: "https://example.test/reset?token=secret-token",
      userId: "user-structural"
    },
    priority: PRIORITY.CRITICAL,
    provider: "resend"
  };

  let providerCalls = 0;
  comm.configure({
    provider: "resend",
    providerConfig: { apiKey: "test", fromEmail: "test@example.com" },
    defaultFrom: "ManeComb <test@example.com>",
    email: { enabled: true, dryRun: false, requireDurableHistory: false },
    queue: { enabled: false }
  });
  engine.setSendFunction(async ({ html, text }) => {
    providerCalls += 1;
    assert.ok(html.includes("ManeComb"));
    assert.ok(text.includes("https://example.test/reset?token=secret-token"));
    return { success: true, id: "provider-message-1", provider: "resend" };
  });

  history.resetMemoryStore();
  const concurrent = await Promise.all([engine.sendDirect(input), engine.sendDirect(input)]);
  assert.equal(providerCalls, 1, "concurrent duplicate must call provider once");
  assert.equal(concurrent.filter((result) => result.duplicate).length, 1);
  assert.ok(concurrent.every((result) => result.accepted));
  assert.ok(concurrent.every((result) => !result.failed));
  const deliveries = await history.query({ eventType: "PASSWORD_RESET" });
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].status, "sent");
  assert.equal(deliveries[0].recipientMasked, "r***@e***.com");
  assert.ok(!JSON.stringify(deliveries[0]).includes("secret-token"));

  const stableA = engine.buildJobId(input);
  const stableB = engine.buildJobId(input);
  assert.equal(stableA, stableB);
  assert.ok(!stableA.includes("request-1"));

  let temporaryAttempts = 0;
  engine.setSendFunction(async () => {
    temporaryAttempts += 1;
    if (temporaryAttempts < 3) return { success: false, error: "provider timeout" };
    return { success: true, id: "provider-retry-success" };
  });
  const retried = await engine.sendDirect({ ...input, idempotencyKey: "password-reset:request-retry" });
  assert.equal(retried.status, "sent");
  assert.equal(temporaryAttempts, 3);
  assert.equal(
    comm.metrics.getSnapshot().counters
      .filter((counter) => counter.name === "deliveries_failed")
      .reduce((sum, counter) => sum + counter.value, 0),
    0
  );

  let permanentAttempts = 0;
  engine.setSendFunction(async () => {
    permanentAttempts += 1;
    return { success: false, error: "invalid email address" };
  });
  const permanent = await engine.sendDirect({ ...input, idempotencyKey: "password-reset:request-permanent" });
  assert.equal(permanent.status, "failed");
  assert.equal(permanent.accepted, false);
  assert.equal(permanent.failed, true);
  assert.equal(permanentAttempts, 1);
  assert.equal(
    comm.metrics.getSnapshot().counters
      .filter((counter) => counter.name === "deliveries_failed")
      .reduce((sum, counter) => sum + counter.value, 0),
    1
  );

  let queuedProviderCalls = 0;
  engine.setSendFunction(async () => {
    queuedProviderCalls += 1;
    return { success: true, id: "queued-message" };
  });
  const queuedInput = {
    ...input,
    priority: PRIORITY.NORMAL,
    idempotencyKey: "password-reset:request-queued"
  };
  const queued = await Promise.all([engine.sendViaQueue(queuedInput), engine.sendViaQueue(queuedInput)]);
  await new Promise((resolve) => setTimeout(resolve, 25));
  const queuedEntries = await history.query({ eventType: "PASSWORD_RESET" });
  assert.equal(queuedProviderCalls, 1);
  assert.equal(queued.filter((result) => result.duplicate).length, 1);
  assert.ok(queued.every((result) => result.accepted));
  assert.ok(queued.every((result) => !result.failed));
  assert.equal(queuedEntries.filter((entry) => entry.idempotencyKey === queuedInput.idempotencyKey).length, 1);
  assert.equal(queuedEntries.find((entry) => entry.idempotencyKey === queuedInput.idempotencyKey).status, "sent");

  let queuedFailureCalls = 0;
  engine.setSendFunction(async () => {
    queuedFailureCalls += 1;
    return { success: false, error: "invalid email address" };
  });
  const failedQueuedInput = {
    ...input,
    priority: PRIORITY.NORMAL,
    idempotencyKey: "password-reset:request-queued-failed"
  };
  await engine.sendViaQueue(failedQueuedInput);
  await new Promise((resolve) => setTimeout(resolve, 25));
  const failedQueuedEntries = await history.query({ eventType: "PASSWORD_RESET" });
  const failedQueuedDelivery = failedQueuedEntries.find((entry) => entry.idempotencyKey === failedQueuedInput.idempotencyKey);
  assert.equal(queuedFailureCalls, 1);
  assert.equal(failedQueuedDelivery.status, "failed");
  assert.ok(!JSON.stringify(failedQueuedDelivery).includes("recipient@example.com"));
  assert.equal(history.getReadiness().durable, false);
  assert.equal(
    comm.metrics.getSnapshot().counters
      .filter((counter) => counter.name === "deliveries_failed")
      .reduce((sum, counter) => sum + counter.value, 0),
    2
  );

  let tenantCalls = 0;
  engine.setSendFunction(async () => {
    tenantCalls += 1;
    return { success: true, id: `tenant-message-${tenantCalls}` };
  });
  await engine.sendDirect({ ...input, tenantScope: "organization:a", idempotencyKey: "payment-approved:same" });
  await engine.sendDirect({ ...input, tenantScope: "organization:b", idempotencyKey: "payment-approved:same" });
  assert.equal(tenantCalls, 2, "tenant scopes must not share idempotency claims");

  comm.configure({
    provider: "resend",
    providerConfig: { apiKey: "test", fromEmail: "test@example.com" },
    email: { enabled: true, dryRun: false, requireDurableHistory: true },
    queue: { enabled: false }
  });
  const beforeDurabilityFailure = tenantCalls;
  await assert.rejects(
    () => engine.sendDirect({ ...input, idempotencyKey: "password-reset:requires-durable-history" }),
    /Durable email history is unavailable/
  );
  assert.equal(tenantCalls, beforeDurabilityFailure);

  comm.configure({
    provider: "resend",
    providerConfig: { apiKey: "test", fromEmail: "test@example.com" },
    email: { enabled: true, dryRun: true, requireDurableHistory: false },
    queue: { enabled: false }
  });
  const dryInput = { ...input, idempotencyKey: "password-reset:request-dry" };
  const beforeDryRun = providerCalls;
  const dryRun = await engine.sendDirect(dryInput);
  assert.equal(dryRun.status, "dry_run");
  assert.equal(dryRun.accepted, true);
  assert.equal(dryRun.delivered, false);
  assert.equal(dryRun.simulated, true);
  assert.equal(dryRun.failed, false);
  const duplicateDryRun = await engine.sendDirect(dryInput);
  assert.equal(duplicateDryRun.duplicate, true);
  assert.equal(duplicateDryRun.status, "dry_run");
  assert.equal(duplicateDryRun.accepted, true);
  assert.equal(providerCalls, beforeDryRun);
  assert.equal(comm.getReadiness().status, "dry_run");

  comm.configure({
    provider: "resend",
    providerConfig: { apiKey: "test", fromEmail: "test@example.com" },
    email: { enabled: false, dryRun: false, requireDurableHistory: false },
    queue: { enabled: false }
  });
  const disabled = await engine.sendDirect({ ...input, idempotencyKey: "password-reset:request-disabled" });
  assert.equal(disabled.status, "skipped");
  assert.equal(disabled.accepted, true);
  assert.equal(disabled.skipped, true);
  assert.equal(disabled.failed, false);
  assert.equal(providerCalls, beforeDryRun);
  assert.equal(comm.getReadiness().status, "disabled");
  assert.equal(comm.getReadiness().queue.degraded, true);

  comm.configure({
    provider: "resend",
    providerConfig: { apiKey: "test", fromEmail: "test@example.com" },
    email: { enabled: true, dryRun: false, requireDurableHistory: false },
    queue: { enabled: false }
  });
  assert.equal(comm.getReadiness().status, "degraded");
  const originalHistoryReadiness = history.getReadiness;
  const queueModule = require("../src/queue");
  const originalQueueReadiness = queueModule.getReadiness;
  history.getReadiness = () => ({
    durable: true,
    mode: "mongo",
    index: "ready",
    idempotencyIndex: true
  });
  queueModule.getReadiness = () => ({
    enabled: true,
    mode: "bullmq",
    ready: true,
    connected: true,
    functional: true,
    workerStarted: true,
    maxmemoryPolicy: "noeviction",
    persistence: false,
    durableAcrossRestart: false,
    durable: false,
    degraded: true
  });
  assert.equal(comm.getReadiness().status, "degraded");
  assert.equal(comm.getReadiness().functional, true);
  assert.equal(comm.getReadiness().productionDurability, false);
  queueModule.getReadiness = () => ({
    enabled: true,
    mode: "bullmq",
    ready: true,
    connected: true,
    functional: true,
    workerStarted: true,
    maxmemoryPolicy: "noeviction",
    persistence: true,
    durableAcrossRestart: true,
    durable: true,
    degraded: false
  });
  assert.equal(comm.getReadiness().status, "ready");
  assert.equal(comm.getReadiness().productionDurability, true);
  const diagnostics = comm.getRuntimeDiagnostics();
  assert.equal(diagnostics.queueConnected, true);
  assert.equal(diagnostics.queueFunctional, true);
  assert.equal(diagnostics.queueDurableAcrossRestart, true);
  assert.equal(diagnostics.idempotencyIndexVerified, true);
  assert.equal(diagnostics.historyMode, "mongo");
  assert.equal("redisUrl" in diagnostics, false);
  assert.equal("apiKey" in diagnostics, false);
  history.getReadiness = originalHistoryReadiness;
  queueModule.getReadiness = originalQueueReadiness;

  comm.configure({
    provider: "resend",
    providerConfig: { apiKey: "", fromEmail: "" },
    email: { enabled: true, dryRun: false, requireDurableHistory: true },
    queue: { enabled: false }
  });
  assert.equal(comm.getReadiness().status, "error");

  const rendered = comm.renderEmail(comm.getTemplateBuilder("critical-incident"), {
    _template: "critical-incident",
    title: "Incidente",
    description: "<script>alert(1)</script><b>texto</b>",
    name: "Operador"
  });
  assert.ok(rendered.html.includes("&lt;script&gt;"));
  assert.ok(!rendered.html.includes("<script>alert"));
  assert.ok(rendered.text.length > 0);

  assert.equal(comm.security.maskEmail("ricardo@example.com"), "r***@e***.com");
  assert.equal(comm.security.classifyEmailError(new Error("provider timeout"), "resend").category, "timeout");
  assert.ok(!comm.security.sanitizeProviderError("failed ricardo@example.com Bearer abcdefghijklmnop").includes("ricardo@example.com"));
  const capturedLogs = [];
  comm.logger.setLogger({
    info: (entry) => capturedLogs.push(entry),
    error: (entry) => capturedLogs.push(entry),
    warn: (entry) => capturedLogs.push(entry)
  });
  comm.logger.logError("SafeLog", new Error("failed ricardo@example.com Bearer abcdefghijklmnop"), {
    to: "ricardo@example.com",
    error: "https://example.test/reset?token=secret-token"
  });
  comm.logger.setLogger(null);
  const serializedLogs = JSON.stringify(capturedLogs);
  assert.ok(!serializedLogs.includes("ricardo@example.com"));
  assert.ok(!serializedLogs.includes("secret-token"));

  const originalFetch = global.fetch;
  let healthFetchCalls = 0;
  global.fetch = async () => {
    healthFetchCalls += 1;
    throw new Error("health must not call fetch");
  };
  const resend = comm.createProvider("resend", { apiKey: "test", fromEmail: "test@example.com" });
  assert.equal(await resend.verifyConnection(), true);
  assert.equal(healthFetchCalls, 0);
  global.fetch = originalFetch;
  console.log("ok - structural closure: contract, concurrency, lifecycle, dry-run, disabled, masking and text");
}

(async function run() {
  testTypesConstants();
  testTemplateRegistry();
  testTemplateBuilderOutput();
  testPasswordResetTemplate();
  testPaymentApprovedTemplate();
  testIdentityVerificationTemplate();
  testSuspiciousLoginTemplate();
  testCriticalIncidentTemplate();
  testBaseLayoutRendering();
  testAllTemplatesRender();
  testValidators();
  testProviderFactory();
  testRetryLogic();
  testErrorClassification();
  testTimeoutManager();
  testRateLimiter();
  testConnectionManager();
  testDeliveryEngineExports();
  testDeliveryResultContract();
  testMetrics();
  await testHistoryMemoryStore();
  await testHistoryUpdateStatus();
  await testDeliveryPipelineStages();
  await testStructuralEmailClosure();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
