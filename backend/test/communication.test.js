const assert = require("node:assert/strict");
const path = require("node:path");

process.env.RESEND_API_KEY = "test_re_key";
process.env.RESEND_FROM_EMAIL = "test@manecomb.com";

const comm = require("../modules/communication");
const TEMPLATE = comm.types.TEMPLATE;
const PRIORITY = comm.types.PRIORITY;
const PROVIDER = comm.types.PROVIDER;
const CHANNEL = comm.types.CHANNEL;
const STATUS = comm.types.STATUS;
const {
  getEmailDeliveryState,
  getCommercialEventContext,
  notifyCommercialOrder,
  selectCommercialEmailTemplate
} = require("../src/services/commercial-notifier");

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
  console.log("ok - types/constantes definidas correctamente");
}

function testCommercialEmailRouting() {
  assert.equal(selectCommercialEmailTemplate({ paymentStatus: "pending" }, "order_created"), "order-created");
  assert.equal(selectCommercialEmailTemplate({ paymentStatus: "pending" }), "payment-pending");
  assert.equal(selectCommercialEmailTemplate({ paymentStatus: "paid" }), "payment-approved");
  assert.equal(selectCommercialEmailTemplate({ paymentStatus: "rejected" }), "payment-rejected");
  assert.equal(selectCommercialEmailTemplate({}, "subscription_activated"), "subscription-activated");
  assert.equal(selectCommercialEmailTemplate({}, "subscription_cancelled"), "subscription-cancelled");

  assert.deepEqual(getEmailDeliveryState({ queued: true }), { error: null, status: "pending" });
  assert.deepEqual(getEmailDeliveryState({ success: true }), { error: null, status: "sent" });
  assert.equal(getEmailDeliveryState({ success: false, error: "timeout" }).status, "failed");
  assert.equal(getEmailDeliveryState({ success: false, error: "429", errorCategory: "rate_limit" }).status, "retry");
  const order = {
    id: "order-1",
    organizationId: "org-1",
    paymentProvider: "mercado_pago",
    providerPaymentId: "payment-1",
    paymentStatus: "paid",
    currentPeriodStart: "2026-07-01T00:00:00.000Z"
  };
  const manual = getCommercialEventContext(order, "payment_status", "payment-approved");
  const webhook = getCommercialEventContext({ ...order }, "payment_status", "payment-approved");
  assert.equal(manual.idempotencyKey, webhook.idempotencyKey);
  assert.equal(manual.tenantScope, "organization:org-1");
  console.log("ok - estados comerciales usan template y resultado reales");
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
        console.error(`  ERROR: Plantilla "${name}" generó HTML muy corto`);
        allOk = false;
      }
    } catch (err) {
      console.error(`  ERROR: Plantilla "${name}" falló: ${err.message}`);
      allOk = false;
    }
  }
  assert.ok(allOk, "Todas las plantillas deben renderizar sin errores");
  console.log(`ok - ${names.length} plantillas renderizan correctamente`);
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
    template: "nonexistent"
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
  console.log("ok - validadores funcionan correctamente");
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
  console.log("ok - fábrica de proveedores crea instancias correctas");
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
  assert.ok(jobOptions.backoff);

  assert.ok(retry.shouldRetry(0, PRIORITY.HIGH, null));
  assert.ok(!retry.shouldRetry(3, PRIORITY.HIGH, null));
  console.log("ok - lógica de reintentos por prioridad correcta");
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
  console.log("ok - métricas incrementan y resetean correctamente");
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
  console.log("ok - historial en memoria almacena y consulta correctamente");
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
  console.log("ok - historial actualiza estado correctamente");
}

async function testCommercialNotificationIdempotency() {
  comm.history.resetMemoryStore();
  comm.configure({
    provider: "resend",
    providerConfig: { apiKey: "mock-key", fromEmail: "mock@manecomb.test" },
    defaultFrom: "ManeComb <mock@manecomb.test>",
    email: { enabled: true, dryRun: false, requireDurableHistory: false },
    queue: { enabled: false }
  });
  let providerCalls = 0;
  comm.deliveryEngine.setSendFunction(async () => {
    providerCalls += 1;
    return { success: true, id: `message-${providerCalls}` };
  });
  const order = {
    id: "order-email-integration",
    organizationId: "org-email-integration",
    userId: "user-email-integration",
    email: "buyer@example.com",
    contactName: "Comprador",
    referenceCode: "ORDER-EMAIL-1",
    planName: "Plan Flota",
    totalPrice: 999,
    paymentMethod: "card",
    paymentProvider: "mercado_pago",
    providerPaymentId: "payment-email-1",
    paymentStatus: "paid",
    currentPeriodStart: "2026-07-01T00:00:00.000Z",
    cancelledAt: "2026-07-15T00:00:00.000Z"
  };
  await Promise.all([
    notifyCommercialOrder(order, "Pago confirmado"),
    notifyCommercialOrder({ ...order }, "Pago confirmado")
  ]);
  await Promise.all([
    notifyCommercialOrder(order, "Suscripcion activa", "subscription_activated"),
    notifyCommercialOrder({ ...order }, "Suscripcion activa", "subscription_activated")
  ]);
  await Promise.all([
    notifyCommercialOrder(order, "Suscripcion cancelada", "subscription_cancelled"),
    notifyCommercialOrder({ ...order }, "Suscripcion cancelada", "subscription_cancelled")
  ]);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(providerCalls, 3, "repeticiones comerciales deben producir un envio por evento");

  comm.configure({
    provider: "resend",
    providerConfig: { apiKey: "mock-key", fromEmail: "mock@manecomb.test" },
    email: { enabled: true, dryRun: true, requireDurableHistory: false },
    queue: { enabled: false }
  });
  const beforeDryRun = providerCalls;
  const dryResult = await notifyCommercialOrder(
    { ...order, id: "order-email-dry", referenceCode: "ORDER-EMAIL-DRY" },
    "Orden creada",
    "order_created"
  );
  assert.equal(dryResult.lastNotificationStatus, "dry_run");
  assert.equal(providerCalls, beforeDryRun);
  assert.equal(comm.getReadiness().status, "dry_run");
  console.log("ok - idempotencia comercial, convergencia y dry-run usan el servicio central");
}

(async function run() {
  testTypesConstants();
  testCommercialEmailRouting();
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
  testMetrics();
  await testHistoryMemoryStore();
  await testHistoryUpdateStatus();
  await testCommercialNotificationIdempotency();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
