const crypto = require("node:crypto");
const {
  IS_PRODUCTION_RUNTIME,
  MERCADO_PAGO_ACCESS_TOKEN,
  MERCADO_PAGO_ACCESS_TOKEN_ENV_NAMES,
  MERCADO_PAGO_ACCESS_TOKEN_SOURCE,
  MERCADO_PAGO_ENV,
  MERCADO_PAGO_ENV_NAMES,
  MERCADO_PAGO_ENV_SOURCE,
  MERCADO_PAGO_FAILURE_URL,
  MERCADO_PAGO_FAILURE_URL_SOURCE,
  MERCADO_PAGO_PENDING_URL,
  MERCADO_PAGO_PENDING_URL_SOURCE,
  MERCADO_PAGO_PUBLIC_KEY,
  MERCADO_PAGO_PUBLIC_KEY_SOURCE,
  MERCADO_PAGO_SUCCESS_URL,
  MERCADO_PAGO_SUCCESS_URL_SOURCE,
  MERCADO_PAGO_WEBHOOK_SECRET,
  MERCADO_PAGO_WEBHOOK_SECRET_SOURCE,
  MERCADO_PAGO_WEBHOOK_URL,
  MERCADO_PAGO_WEBHOOK_URL_SOURCE,
  PAYMENT_PROVIDER,
} = require("../config/env");
const {
  getManualPaymentInstructions,
  isManualTransferConfigured
} = require("./commercial-profile");
const logger = require("./logger");

function isAutomaticPaymentEnabled() {
  return PAYMENT_PROVIDER === "mercado_pago" && getPaymentReadiness().ready;
}

function isTestPaymentEnabled() {
  return PAYMENT_PROVIDER === "test" && !IS_PRODUCTION_RUNTIME;
}

function getMercadoPagoCredentialPrefix(value) {
  const credential = String(value || "").trim();

  if (!credential) {
    return "none";
  }

  if (credential.startsWith("TEST-")) {
    return "TEST";
  }

  if (credential.startsWith("APP_USR-")) {
    return "APP_USR";
  }

  return "unknown";
}

function getMercadoPagoTokenPrefix() {
  return getMercadoPagoCredentialPrefix(MERCADO_PAGO_ACCESS_TOKEN);
}

function isCredentialPrefixAllowedForEnvironment(prefix, environment) {
  if (environment === "sandbox") {
    return prefix === "TEST" || prefix === "APP_USR";
  }

  if (environment === "production") {
    return prefix === "APP_USR";
  }

  return false;
}

function normalizeExplicitMercadoPagoEnvironment(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (!normalized) {
    return "";
  }

  if (normalized === "sandbox") {
    return "sandbox";
  }

  if (normalized === "production") {
    return "production";
  }

  return "invalid";
}

function detectMercadoPagoEnvironment(accessToken = MERCADO_PAGO_ACCESS_TOKEN, explicitEnv = MERCADO_PAGO_ENV) {
  const explicit = normalizeExplicitMercadoPagoEnvironment(explicitEnv);

  if (explicit) {
    return explicit;
  }
  return accessToken ? "missing_environment" : "not_configured";
}

function validateMercadoPagoCredentials(
  accessToken = MERCADO_PAGO_ACCESS_TOKEN,
  publicKey = MERCADO_PAGO_PUBLIC_KEY,
  environment = detectMercadoPagoEnvironment(accessToken, MERCADO_PAGO_ENV),
  options = {}
) {
  const explicitEnv = Object.prototype.hasOwnProperty.call(options, "explicitEnv")
    ? options.explicitEnv
    : MERCADO_PAGO_ENV;
  const explicitEnvironment = normalizeExplicitMercadoPagoEnvironment(explicitEnv);
  const requireExplicitEnvironment = Boolean(options.requireExplicitEnvironment);
  const tokenPrefix = getMercadoPagoCredentialPrefix(accessToken);
  const publicKeyPrefix = getMercadoPagoCredentialPrefix(publicKey);

  if (requireExplicitEnvironment && !String(explicitEnv || "").trim()) {
    throw new Error(
      `MERCADO_PAGO_ENV es obligatorio para Mercado Pago. Variables leidas: ${MERCADO_PAGO_ENV_NAMES.join(", ")}.`
    );
  }

  if (environment === "invalid" || explicitEnvironment === "invalid") {
    throw new Error("MERCADO_PAGO_ENV debe ser sandbox o production.");
  }

  if (environment === "not_configured") {
    throw new Error(
      `Mercado Pago requiere access token. Variables leidas: ${MERCADO_PAGO_ACCESS_TOKEN_ENV_NAMES.join(", ")}.`
    );
  }

  if (environment === "unknown" || environment === "missing_environment") {
    throw new Error(
      "MERCADO_PAGO_ENV debe configurarse explicitamente como sandbox o production."
    );
  }

  if (!isCredentialPrefixAllowedForEnvironment(tokenPrefix, environment)) {
    throw new Error(
      `Credenciales Mercado Pago inconsistentes con el ambiente ${environment}.`
    );
  }

  if (
    publicKey &&
    !isCredentialPrefixAllowedForEnvironment(publicKeyPrefix, environment)
  ) {
    throw new Error(
      `Credenciales Mercado Pago inconsistentes con el ambiente ${environment}.`
    );
  }

  return {
    environment,
    publicKeyPrefix,
    tokenPrefix
  };
}

function isPrivateHostname(hostname) {
  const safeHost = String(hostname || "").replace(/^\[|\]$/g, "").toLowerCase();
  if (!safeHost || safeHost === "localhost" || safeHost.endsWith(".localhost") || safeHost === "::1") return true;
  if (/^(fc|fd|fe8|fe9|fea|feb)/.test(safeHost)) return true;

  const parts = safeHost.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    parts[0] === 0 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  );
}

function isValidPublicWebhookUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      !isPrivateHostname(url.hostname) &&
      url.pathname === "/api/commercial/webhooks/mercadopago"
    );
  } catch {
    return false;
  }
}

function isValidPublicReturnUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    return url.protocol === "https:" && !url.username && !url.password && !isPrivateHostname(url.hostname);
  } catch {
    return false;
  }
}

function getMercadoPagoConfigurationIssues() {
  const issues = [];
  const environment = normalizeExplicitMercadoPagoEnvironment(MERCADO_PAGO_ENV);

  if (!MERCADO_PAGO_ENV) issues.push("missing_environment");
  else if (environment === "invalid") issues.push("invalid_environment");
  if (!MERCADO_PAGO_ACCESS_TOKEN) issues.push("missing_access_token");
  if (!MERCADO_PAGO_WEBHOOK_SECRET) issues.push("missing_webhook_secret");
  if (!MERCADO_PAGO_WEBHOOK_URL) issues.push("missing_webhook_url");
  else if (!isValidPublicWebhookUrl(MERCADO_PAGO_WEBHOOK_URL)) issues.push("invalid_webhook_url");

  if (environment === "sandbox" || environment === "production") {
    try {
      validateMercadoPagoCredentials(
        MERCADO_PAGO_ACCESS_TOKEN,
        MERCADO_PAGO_PUBLIC_KEY,
        environment,
        { explicitEnv: MERCADO_PAGO_ENV, requireExplicitEnvironment: true }
      );
    } catch (error) {
      if (
        MERCADO_PAGO_ACCESS_TOKEN &&
        !issues.includes("missing_environment") &&
        !issues.includes("invalid_environment")
      ) {
        issues.push("credential_environment_mismatch");
      }
    }
  }

  if (
    environment === "production" &&
    ![MERCADO_PAGO_SUCCESS_URL, MERCADO_PAGO_FAILURE_URL, MERCADO_PAGO_PENDING_URL].every(
      isValidPublicReturnUrl
    )
  ) {
    issues.push("invalid_return_url");
  }

  return [...new Set(issues)];
}

function assertPaymentConfigurationReady() {
  const readiness = getPaymentReadiness();
  if (readiness.ready) return readiness;

  const error = new Error(`Configuracion de pagos no preparada: ${readiness.issues.join(", ") || "not_ready"}.`);
  error.code = "PAYMENT_CONFIGURATION_NOT_READY";
  throw error;
}

function parseMercadoPagoSignature(value) {
  return String(value || "")
    .split(",")
    .map((part) => part.trim().split("="))
    .reduce((signature, [key, entryValue]) => {
      if (key && entryValue) signature[key] = entryValue;
      return signature;
    }, {});
}

function isMercadoPagoWebhookSignatureValid({
  paymentId,
  requestId,
  secret = MERCADO_PAGO_WEBHOOK_SECRET,
  signatureHeader
}) {
  try {
    if (!secret || !paymentId || !requestId || !signatureHeader) return false;
    const signature = parseMercadoPagoSignature(signatureHeader);
    const ts = String(signature.ts || "").trim();
    const v1 = String(signature.v1 || "").trim();
    if (!/^\d+$/.test(ts) || Number(ts) <= 0 || !/^[a-fA-F0-9]{64}$/.test(v1)) return false;

    const manifest = `id:${paymentId};request-id:${requestId};ts:${ts};`;
    const expected = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
    const expectedBuffer = Buffer.from(expected, "hex");
    const receivedBuffer = Buffer.from(v1, "hex");
    return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
  } catch {
    return false;
  }
}

function selectMercadoPagoCheckoutUrl(preference, environment) {
  if (environment === "sandbox") {
    if (!preference?.sandbox_init_point) {
      throw new Error("Mercado Pago sandbox no devolvio sandbox_init_point; no se usara init_point en sandbox.");
    }

    return {
      checkoutUrl: preference.sandbox_init_point,
      checkoutUrlType: "sandbox_init_point"
    };
  }

  if (environment === "production") {
    if (!preference?.init_point) {
      throw new Error("Mercado Pago produccion no devolvio init_point; no se usara sandbox_init_point en produccion.");
    }

    return {
      checkoutUrl: preference.init_point,
      checkoutUrlType: "init_point"
    };
  }

  throw new Error("Ambiente Mercado Pago no valido para seleccionar checkout.");
}

function buildPreferenceMetadata(order) {
  return {
    order_id: String(order.id || "").trim(),
    plan_id: String(order.planId || "").trim(),
    reference_code: String(order.referenceCode || "").trim()
  };
}

function getMercadoPagoRuntimeDiagnostics() {
  const environment = detectMercadoPagoEnvironment();
  const provider = String(PAYMENT_PROVIDER || "mercado_pago").trim().toLowerCase();
  const issues =
    provider === "mercado_pago"
      ? getMercadoPagoConfigurationIssues()
      : provider === "test" && IS_PRODUCTION_RUNTIME
        ? ["test_provider_forbidden_in_production"]
        : [];

  return {
    accessTokenDetected: Boolean(MERCADO_PAGO_ACCESS_TOKEN),
    accessTokenSource: MERCADO_PAGO_ACCESS_TOKEN_SOURCE || null,
    attemptedAccessTokenEnvNames: MERCADO_PAGO_ACCESS_TOKEN_ENV_NAMES,
    environment,
    configured: provider === "mercado_pago" ? Boolean(MERCADO_PAGO_ACCESS_TOKEN && MERCADO_PAGO_ENV) : issues.length === 0,
    explicitEnvironmentDetected: Boolean(MERCADO_PAGO_ENV),
    explicitEnvironmentSource: MERCADO_PAGO_ENV_SOURCE || null,
    failureUrlDetected: Boolean(MERCADO_PAGO_FAILURE_URL),
    failureUrlSource: MERCADO_PAGO_FAILURE_URL_SOURCE || null,
    pendingUrlDetected: Boolean(MERCADO_PAGO_PENDING_URL),
    pendingUrlSource: MERCADO_PAGO_PENDING_URL_SOURCE || null,
    publicKeyDetected: Boolean(MERCADO_PAGO_PUBLIC_KEY),
    publicKeySource: MERCADO_PAGO_PUBLIC_KEY_SOURCE || null,
    provider,
    ready: issues.length === 0,
    successUrlDetected: Boolean(MERCADO_PAGO_SUCCESS_URL),
    successUrlSource: MERCADO_PAGO_SUCCESS_URL_SOURCE || null,
    tokenPrefix: getMercadoPagoTokenPrefix(),
    webhookSecretDetected: Boolean(MERCADO_PAGO_WEBHOOK_SECRET),
    webhookSecretSource: MERCADO_PAGO_WEBHOOK_SECRET_SOURCE || null,
    webhookConfigured: Boolean(MERCADO_PAGO_WEBHOOK_SECRET && isValidPublicWebhookUrl(MERCADO_PAGO_WEBHOOK_URL)),
    webhookUrlDetected: Boolean(MERCADO_PAGO_WEBHOOK_URL),
    webhookUrlConfigured: Boolean(MERCADO_PAGO_WEBHOOK_URL),
    webhookUrlSource: MERCADO_PAGO_WEBHOOK_URL_SOURCE || null,
    issues
  };
}

function logMercadoPagoRuntimeDiagnostics() {
  const diagnostics = getMercadoPagoRuntimeDiagnostics();

  logger.info({
    action: "RuntimeDiagnostics",
    metadata: diagnostics,
    module: "Payments",
    status: diagnostics.ready ? "ready" : "configuration_required"
  });

  if (!diagnostics.accessTokenDetected && PAYMENT_PROVIDER === "mercado_pago") {
    logger.warn({
      action: "RuntimeDiagnostics",
      message: "Mercado Pago access token missing",
      metadata: {
        attemptedAccessTokenEnvNames: diagnostics.attemptedAccessTokenEnvNames
      },
      module: "Payments",
      status: "missing_credentials"
    });
  }
}

function getPaymentReadiness() {
  const provider = String(PAYMENT_PROVIDER || "mercado_pago").trim().toLowerCase();
  const environment = normalizeExplicitMercadoPagoEnvironment(MERCADO_PAGO_ENV) || null;
  const issues =
    provider === "mercado_pago"
      ? getMercadoPagoConfigurationIssues()
      : provider === "test" && IS_PRODUCTION_RUNTIME
        ? ["test_provider_forbidden_in_production"]
        : [];
  const automaticReady = provider === "mercado_pago" && issues.length === 0;
  const testReady = provider === "test" && !IS_PRODUCTION_RUNTIME;
  const manualReady = isManualTransferConfigured();
  const ready =
    provider === "mercado_pago"
      ? automaticReady
      : provider === "test"
        ? testReady
        : manualReady;
  const diagnostics = getMercadoPagoRuntimeDiagnostics();

  return {
    configured: provider === "mercado_pago" ? Boolean(MERCADO_PAGO_ACCESS_TOKEN && environment) : ready,
    diagnostics,
    environment,
    issues,
    mode: automaticReady
      ? "mercado_pago"
      : testReady
        ? "test_payment"
        : manualReady
          ? "manual_transfer_ready"
          : "configuration_required",
    provider,
    ready,
    webhookConfigured: Boolean(MERCADO_PAGO_WEBHOOK_SECRET && isValidPublicWebhookUrl(MERCADO_PAGO_WEBHOOK_URL)),
    webhookUrlConfigured: Boolean(MERCADO_PAGO_WEBHOOK_URL),
    missing:
      automaticReady || testReady || PAYMENT_PROVIDER !== "mercado_pago"
        ? []
        : manualReady
          ? []
          : [
              `Mercado Pago access token (tried: ${MERCADO_PAGO_ACCESS_TOKEN_ENV_NAMES.join(", ")})`,
              "BANK_TRANSFER_ACCOUNT_NAME",
              "BANK_TRANSFER_CLABE"
            ]
  };
}

function getPaymentProviderName(paymentMethod) {
  if (paymentMethod === "trial") {
    return "trial_access";
  }

  if (isTestPaymentEnabled()) {
    return "test";
  }

  if (PAYMENT_PROVIDER === "mercado_pago") {
    return "mercado_pago";
  }

  if (paymentMethod === "spei" || paymentMethod === "transfer") {
    return isManualTransferConfigured() ? "manual_bank_transfer" : "manual";
  }

  return isManualTransferConfigured() ? "manual_bank_transfer" : "manual";
}

function buildOrderDescription(order) {
  const radioLabel = order.radioFeatureEnabled ? " | Radio operativo" : "";
  return `${order.fleetSize} combis | ${order.strategy}${radioLabel}`;
}

async function createMercadoPagoPreference(order) {
  assertPaymentConfigurationReady();
  const environment = detectMercadoPagoEnvironment();
  const credentialDiagnostics = validateMercadoPagoCredentials(
    MERCADO_PAGO_ACCESS_TOKEN,
    MERCADO_PAGO_PUBLIC_KEY,
    environment,
    {
      explicitEnv: MERCADO_PAGO_ENV,
      requireExplicitEnvironment: true
    }
  );
  const metadata = buildPreferenceMetadata(order);
  const preference = {
    external_reference: order.id,
    metadata,
    statement_descriptor: "MANECOMB",
    items: [
      {
        id: order.planId,
        title: `ManeComb ${order.planName}`,
        description: buildOrderDescription(order),
        quantity: 1,
        currency_id: "MXN",
        unit_price: Number(order.totalPrice)
      }
    ],
    ...(environment === "production"
      ? {
          payer: {
            email: order.email,
            name: order.contactName
          }
        }
      : {}),
    back_urls: {
      success: MERCADO_PAGO_SUCCESS_URL,
      failure: MERCADO_PAGO_FAILURE_URL,
      pending: MERCADO_PAGO_PENDING_URL
    },
    auto_return: "approved",
    payment_methods: {
      installments: 12
    },
    ...(MERCADO_PAGO_WEBHOOK_URL ? { notification_url: MERCADO_PAGO_WEBHOOK_URL } : {})
  };

  let response;
  try {
    response = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(preference)
    });
  } catch (error) {
    error.providerResultUnknown = true;
    error.code = "mercado_pago_preference_result_unknown";
    throw error;
  }
  const responseBodyText = await response.text();
  let preferenceResponse = {};

  try {
    preferenceResponse = responseBodyText ? JSON.parse(responseBodyText) : {};
  } catch (error) {
    preferenceResponse = {
      rawBody: responseBodyText
    };
  }

  if (!response.ok) {
    const error = new Error(`Mercado Pago no pudo crear el checkout. ${responseBodyText}`);
    error.providerResultKnown = true;
    error.code = `mercado_pago_preference_http_${response.status}`;
    error.statusCode = response.status >= 500 ? 503 : 400;
    throw error;
  }

  const checkout = selectMercadoPagoCheckoutUrl(preferenceResponse, environment);

  logger.info({
    action: "CreatePreference",
    metadata: {
      checkoutUrlType: checkout.checkoutUrlType,
      environment,
      externalReference: order.id,
      metadata,
      preferenceId: String(preferenceResponse.id || ""),
      tokenPrefix: credentialDiagnostics.tokenPrefix
    },
    module: "Payments",
    status: "success"
  });

  return {
    checkoutUrl: checkout.checkoutUrl,
    checkoutUrlType: checkout.checkoutUrlType,
    paymentProviderReference: String(preferenceResponse.id || ""),
    paymentExternalReference: order.id
  };
}

async function parseMercadoPagoResponse(response, operation) {
  const bodyText = await response.text();
  let payload = {};
  try {
    payload = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    payload = {};
  }
  if (!response.ok) {
    const error = new Error(`Mercado Pago ${operation} failed.`);
    error.code = `mercado_pago_${operation}_http_${response.status}`;
    error.statusCode = response.status >= 500 ? 503 : 409;
    error.providerResultKnown = true;
    throw error;
  }
  return payload;
}

async function createMercadoPagoRefund({ paymentId, amount, idempotencyKey }) {
  assertPaymentConfigurationReady();
  let response;
  try {
    response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}/refunds`, {
      method: "POST",
      headers: { Authorization: `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}`, "Content-Type": "application/json", "X-Idempotency-Key": idempotencyKey },
      ...(amount == null ? {} : { body: JSON.stringify({ amount }) }),
      signal: AbortSignal.timeout(15_000)
    });
  } catch (error) {
    error.providerResultUnknown = true;
    error.code = "mercado_pago_refund_result_unknown";
    throw error;
  }
  return parseMercadoPagoResponse(response, "refund");
}

async function fetchMercadoPagoRefunds(paymentId) {
  assertPaymentConfigurationReady();
  const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}/refunds`, {
    headers: { Authorization: `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}` },
    signal: AbortSignal.timeout(15_000)
  });
  return parseMercadoPagoResponse(response, "refund_lookup");
}

async function fetchMercadoPagoChargeback(chargebackId) {
  assertPaymentConfigurationReady();
  const response = await fetch(`https://api.mercadopago.com/v1/chargebacks/${encodeURIComponent(chargebackId)}`, {
    headers: { Authorization: `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}` },
    signal: AbortSignal.timeout(15_000)
  });
  return parseMercadoPagoResponse(response, "chargeback_lookup");
}

async function createCommercialCheckout(order) {
  if (PAYMENT_PROVIDER === "mercado_pago" || (PAYMENT_PROVIDER === "test" && IS_PRODUCTION_RUNTIME)) {
    assertPaymentConfigurationReady();
  }

  if (order.requestTrial) {
    const trialDays = Math.max(1, Number(order.trialDays) || 7);

    return {
      paymentProvider: "trial_access",
      checkoutUrl: null,
      paymentProviderReference: "",
      paymentExternalReference: order.id,
      paymentStatus: "trial_active",
      paymentInstructions: null,
      nextStep: `La prueba de ${trialDays} días quedó activada. La cuenta queda lista para continuar el cobro del plan al finalizar la prueba.`
    };
  }

  const paymentProvider = getPaymentProviderName(order.paymentMethod);
  const manualInstructions = getManualPaymentInstructions(order);

  if (paymentProvider === "test") {
    return {
      paymentProvider,
      checkoutUrl: null,
      paymentProviderReference: `test-${order.id}`,
      paymentExternalReference: order.id,
      paymentStatus: "paid_test",
      approvedAt: new Date().toISOString(),
      paymentInstructions: {
        provider: "test",
        summary: "Pago simulado aprobado en modo de pruebas.",
        details: [
          "No se proceso ningun cargo real.",
          "No se almacenaron datos sensibles de tarjeta."
        ]
      },
      nextStep: "Pago simulado aprobado. La cuenta queda lista para continuar el onboarding."
    };
  }

  if (paymentProvider !== "mercado_pago") {
    return {
      paymentProvider,
      checkoutUrl: null,
      paymentProviderReference: "",
      paymentExternalReference: order.id,
      paymentStatus: manualInstructions ? "pending_manual_confirmation" : "pending_configuration",
      paymentInstructions: manualInstructions,
      nextStep:
        manualInstructions
          ? `${manualInstructions.summary} Comparte tu comprobante para activar la cuenta.`
          : "Tu orden quedo lista. Agrega las credenciales de Mercado Pago o configura una cuenta SPEI para abrir el cobro."
    };
  }

  const checkout = await createMercadoPagoPreference(order);

  return {
    paymentProvider,
    checkoutUrl: checkout.checkoutUrl,
    paymentProviderReference: checkout.paymentProviderReference,
    paymentExternalReference: checkout.paymentExternalReference,
    paymentStatus: "pending",
    paymentInstructions: null,
    nextStep: checkout.checkoutUrl
      ? "Abrimos el checkout seguro para cerrar el cobro y activar tu cuenta."
      : "La orden quedo registrada, pero el checkout no devolvio una URL valida."
  };
}

async function fetchMercadoPagoPayment(paymentId) {
  assertPaymentConfigurationReady();
  const environment = detectMercadoPagoEnvironment();
  validateMercadoPagoCredentials(MERCADO_PAGO_ACCESS_TOKEN, MERCADO_PAGO_PUBLIC_KEY, environment, {
    explicitEnv: MERCADO_PAGO_ENV,
    requireExplicitEnvironment: true
  });
  const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: {
      Authorization: `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}`
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`No se pudo validar el pago en Mercado Pago. ${body}`);
  }

  const payment = await response.json();

  logger.info({
    action: "FetchPayment",
    metadata: {
      environment,
      externalReference: String(payment.external_reference || ""),
      paymentId: String(payment.id || paymentId || "")
    },
    module: "Payments",
    status: String(payment.status || "")
  });

  return payment;
}

function toMinorUnits(amount, currency = "MXN") {
  const normalizedCurrency = String(currency || "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalizedCurrency)) return null;
  if (typeof amount !== "number" && typeof amount !== "string") return null;
  const normalizedAmount = String(amount).trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(normalizedAmount)) return null;
  const [whole, fraction = ""] = normalizedAmount.split(".");
  const minorUnits = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(minorUnits) && minorUnits >= 0 ? minorUnits : null;
}

function reconciliationFailure(code, safeMessage, checks, normalized) {
  return { ok: false, code, safeMessage, checks, normalized };
}

function normalizePaymentTransitionStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  return status === "approved" ? "paid" : status;
}

function evaluatePaymentTransition(currentState, incomingState) {
  const current = normalizePaymentTransitionStatus(currentState || "pending");
  const incoming = normalizePaymentTransitionStatus(incomingState);
  const known = new Set(["pending", "paid", "rejected", "cancelled"]);
  if (!known.has(incoming)) return { decision: "unknown", shouldActivate: false };
  if (current === "paid") {
    return incoming === "paid"
      ? { decision: "duplicate", shouldActivate: false }
      : { decision: "stale", shouldActivate: false };
  }
  if (current === incoming) return { decision: "duplicate", shouldActivate: false };
  if (["pending", "rejected", "cancelled"].includes(current) && incoming === "paid") {
    return { decision: "apply", shouldActivate: true };
  }
  if (known.has(current)) return { decision: "apply", shouldActivate: false };
  return incoming === "paid"
    ? { decision: "invalid", shouldActivate: false }
    : { decision: "unknown", shouldActivate: false };
}

function reconcileMercadoPagoPaymentWithOrder(payment, order, configuration = {}) {
  const environment = normalizeExplicitMercadoPagoEnvironment(configuration.environment || MERCADO_PAGO_ENV);
  const paymentId = String(payment?.id || "").trim();
  const externalReference = String(payment?.external_reference || "").trim();
  const currency = String(payment?.currency_id || "").trim().toUpperCase();
  const expectedCurrency = String(order?.currency || "MXN").trim().toUpperCase();
  const paymentAmountMinor = toMinorUnits(payment?.transaction_amount, currency);
  const orderAmountMinor = toMinorUnits(order?.totalPrice, expectedCurrency);
  const metadataOrderId = String(payment?.metadata?.order_id || "").trim();
  const linkedOrderId = String(configuration.linkedOrderId || "").trim();
  const normalized = {
    paymentId,
    externalReference,
    amountMinor: paymentAmountMinor,
    currency,
    liveMode: typeof payment?.live_mode === "boolean" ? payment.live_mode : null,
    collectorId: payment?.collector_id == null ? null : String(payment.collector_id),
    metadataOrderId: metadataOrderId || null
  };
  const checks = {
    paymentId: Boolean(paymentId),
    externalReference: Boolean(order?.id) && externalReference === String(order.id),
    amount: paymentAmountMinor !== null && orderAmountMinor !== null && paymentAmountMinor === orderAmountMinor,
    currency: Boolean(currency && expectedCurrency) && currency === expectedCurrency,
    environment:
      typeof payment?.live_mode === "boolean" &&
      ((environment === "sandbox" && payment.live_mode === false) ||
        (environment === "production" && payment.live_mode === true)),
    metadata: !metadataOrderId || metadataOrderId === String(order?.id || ""),
    uniquePayment: !linkedOrderId || linkedOrderId === String(order?.id || ""),
    collector: null,
    preference: null
  };

  if (!checks.paymentId) return reconciliationFailure("invalid_payment_id", "Payment ID is invalid.", checks, normalized);
  if (!externalReference) return reconciliationFailure("missing_external_reference", "Payment reference is missing.", checks, normalized);
  if (!checks.externalReference) return reconciliationFailure("external_reference_mismatch", "Payment reference does not match the commercial order.", checks, normalized);
  if (!currency) return reconciliationFailure("invalid_currency", "Payment currency is invalid.", checks, normalized);
  if (!checks.currency) return reconciliationFailure("currency_mismatch", "Payment currency does not match the commercial order.", checks, normalized);
  if (paymentAmountMinor === null) return reconciliationFailure("invalid_payment_amount", "Payment amount is invalid.", checks, normalized);
  if (orderAmountMinor === null) return reconciliationFailure("invalid_order_amount", "Commercial order amount is invalid.", checks, normalized);
  if (!checks.amount) return reconciliationFailure("amount_mismatch", "Payment amount does not match the commercial order.", checks, normalized);
  if (!checks.environment) return reconciliationFailure("payment_environment_mismatch", "Payment environment does not match the configured environment.", checks, normalized);
  if (!checks.metadata) return reconciliationFailure("metadata_mismatch", "Payment metadata does not match the commercial order.", checks, normalized);
  if (!checks.uniquePayment) return reconciliationFailure("payment_already_linked_to_another_order", "Payment is already linked to another commercial order.", checks, normalized);

  return { ok: true, status: String(payment?.status || "unknown").trim().toLowerCase() || "unknown", checks, normalized };
}

function confirmCommercialPayment({ payment, order, linkedOrderId = "" }) {
  if (!isAutomaticPaymentEnabled() && !payment) {
    return {
      paymentStatus: isManualTransferConfigured() ? "pending_manual_confirmation" : "pending_configuration",
      activationStatus: "pending_payment",
      approvedAt: null,
      paymentInstructions: null,
      nextStep: isManualTransferConfigured()
        ? "La orden sigue pendiente de validar contra tu comprobante SPEI."
        : "Configura Mercado Pago para confirmar cobros automáticamente."
    };
  }

  const reconciliation = reconcileMercadoPagoPaymentWithOrder(payment, order, {
    environment: MERCADO_PAGO_ENV,
    linkedOrderId
  });
  if (!reconciliation.ok) return { reconciliation };
  const approved = reconciliation.status === "approved";

  return {
    reconciliation,
    paymentStatus: approved ? "paid" : reconciliation.status,
    activationStatus: approved ? "ready_for_activation" : "pending_payment",
    approvedAt: approved ? new Date().toISOString() : null,
    paymentProviderReference: reconciliation.normalized.paymentId,
    paymentExternalReference: reconciliation.normalized.externalReference,
    paymentInstructions: null,
    nextStep: approved
      ? "El pago fue aprobado y la cuenta ya puede pasar a activación."
      : "El pago sigue pendiente o en revisión."
  };
}

module.exports = {
  assertPaymentConfigurationReady,
  confirmCommercialPayment,
  createMercadoPagoRefund,
  createCommercialCheckout,
  detectMercadoPagoEnvironment,
  evaluatePaymentTransition,
  getMercadoPagoRuntimeDiagnostics,
  getMercadoPagoConfigurationIssues,
  getMercadoPagoTokenPrefix,
  getPaymentReadiness,
  getPaymentProviderName,
  fetchMercadoPagoPayment,
  fetchMercadoPagoRefunds,
  fetchMercadoPagoChargeback,
  isAutomaticPaymentEnabled,
  isMercadoPagoWebhookSignatureValid,
  isTestPaymentEnabled,
  isValidPublicWebhookUrl,
  logMercadoPagoRuntimeDiagnostics,
  reconcileMercadoPagoPaymentWithOrder,
  selectMercadoPagoCheckoutUrl,
  toMinorUnits,
  validateMercadoPagoCredentials
};
