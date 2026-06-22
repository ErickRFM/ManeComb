const {
  MERCADO_PAGO_ACCESS_TOKEN,
  MERCADO_PAGO_ACCESS_TOKEN_ENV_NAMES,
  MERCADO_PAGO_ACCESS_TOKEN_SOURCE,
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

function isAutomaticPaymentEnabled() {
  return PAYMENT_PROVIDER === "mercado_pago" && Boolean(MERCADO_PAGO_ACCESS_TOKEN);
}

function getMercadoPagoTokenPrefix() {
  if (!MERCADO_PAGO_ACCESS_TOKEN) {
    return "none";
  }

  if (MERCADO_PAGO_ACCESS_TOKEN.startsWith("TEST-")) {
    return "TEST";
  }

  if (MERCADO_PAGO_ACCESS_TOKEN.startsWith("APP_USR-")) {
    return "APP_USR";
  }

  return "unknown";
}

function getMercadoPagoEnvironment() {
  const prefix = getMercadoPagoTokenPrefix();

  if (prefix === "TEST") {
    return "sandbox";
  }

  if (prefix === "APP_USR") {
    return "production";
  }

  return MERCADO_PAGO_ACCESS_TOKEN ? "unknown" : "not_configured";
}

function getMercadoPagoRuntimeDiagnostics() {
  return {
    accessTokenDetected: Boolean(MERCADO_PAGO_ACCESS_TOKEN),
    accessTokenSource: MERCADO_PAGO_ACCESS_TOKEN_SOURCE || null,
    attemptedAccessTokenEnvNames: MERCADO_PAGO_ACCESS_TOKEN_ENV_NAMES,
    environment: getMercadoPagoEnvironment(),
    failureUrlDetected: Boolean(MERCADO_PAGO_FAILURE_URL),
    failureUrlSource: MERCADO_PAGO_FAILURE_URL_SOURCE || null,
    pendingUrlDetected: Boolean(MERCADO_PAGO_PENDING_URL),
    pendingUrlSource: MERCADO_PAGO_PENDING_URL_SOURCE || null,
    publicKeyDetected: Boolean(MERCADO_PAGO_PUBLIC_KEY),
    publicKeySource: MERCADO_PAGO_PUBLIC_KEY_SOURCE || null,
    successUrlDetected: Boolean(MERCADO_PAGO_SUCCESS_URL),
    successUrlSource: MERCADO_PAGO_SUCCESS_URL_SOURCE || null,
    tokenPrefix: getMercadoPagoTokenPrefix(),
    webhookSecretDetected: Boolean(MERCADO_PAGO_WEBHOOK_SECRET),
    webhookSecretSource: MERCADO_PAGO_WEBHOOK_SECRET_SOURCE || null,
    webhookUrlDetected: Boolean(MERCADO_PAGO_WEBHOOK_URL),
    webhookUrlSource: MERCADO_PAGO_WEBHOOK_URL_SOURCE || null
  };
}

function logMercadoPagoRuntimeDiagnostics() {
  const diagnostics = getMercadoPagoRuntimeDiagnostics();

  console.log(`[payments] Mercado Pago access token detected: ${diagnostics.accessTokenDetected ? "yes" : "no"}`);
  console.log(`[payments] Token prefix: ${diagnostics.tokenPrefix}`);
  console.log(`[payments] Mercado Pago public key detected: ${diagnostics.publicKeyDetected ? "yes" : "no"}`);
  console.log(`[payments] Success URL detected: ${diagnostics.successUrlDetected ? "yes" : "no"}`);
  console.log(`[payments] Failure URL detected: ${diagnostics.failureUrlDetected ? "yes" : "no"}`);
  console.log(`[payments] Pending URL detected: ${diagnostics.pendingUrlDetected ? "yes" : "no"}`);
  console.log(`[payments] Webhook secret detected: ${diagnostics.webhookSecretDetected ? "yes" : "no"}`);

  if (!diagnostics.accessTokenDetected && PAYMENT_PROVIDER === "mercado_pago") {
    console.warn(
      `[payments] Mercado Pago access token missing. Tried env names: ${diagnostics.attemptedAccessTokenEnvNames.join(", ")}`
    );
  }
}

function getPaymentReadiness() {
  const automaticReady = isAutomaticPaymentEnabled();
  const manualReady = isManualTransferConfigured();
  const ready = automaticReady || manualReady;
  const diagnostics = getMercadoPagoRuntimeDiagnostics();

  return {
    diagnostics,
    mode: automaticReady ? "mercado_pago" : manualReady ? "manual_transfer_ready" : "configuration_required",
    provider: PAYMENT_PROVIDER || "mercado_pago",
    ready,
    missing:
      automaticReady || PAYMENT_PROVIDER !== "mercado_pago"
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

  if (isAutomaticPaymentEnabled()) {
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
  const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      external_reference: order.id,
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
      payer: {
        email: order.email,
        name: order.contactName
      },
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
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Mercado Pago no pudo crear el checkout. ${body}`);
  }

  const preference = await response.json();

  return {
    checkoutUrl: preference.init_point || preference.sandbox_init_point || null,
    paymentProviderReference: String(preference.id || ""),
    paymentExternalReference: order.id
  };
}

async function createCommercialCheckout(order) {
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
  const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: {
      Authorization: `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}`
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`No se pudo validar el pago en Mercado Pago. ${body}`);
  }

  return await response.json();
}

async function confirmCommercialPayment({ externalReference, paymentId }) {
  if (!isAutomaticPaymentEnabled()) {
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

  if (!paymentId) {
    return {
      paymentStatus: "pending",
      activationStatus: "pending_payment",
      approvedAt: null,
      paymentInstructions: null,
      nextStep: "Aún no recibimos un identificador de pago válido."
    };
  }

  const payment = await fetchMercadoPagoPayment(paymentId);
  const paymentStatus = payment.status === "approved" ? "paid" : String(payment.status || "pending");
  const activationStatus = payment.status === "approved" ? "ready_for_activation" : "pending_payment";

  return {
    paymentStatus,
    activationStatus,
    approvedAt: payment.status === "approved" ? new Date().toISOString() : null,
    paymentProviderReference: String(payment.id || paymentId),
    paymentExternalReference: String(
      payment.external_reference || externalReference || ""
    ).trim(),
    paymentInstructions: null,
    nextStep:
      payment.status === "approved"
        ? "El pago fue aprobado y la cuenta ya puede pasar a activación."
        : "El pago sigue pendiente o en revisión."
  };
}

module.exports = {
  confirmCommercialPayment,
  createCommercialCheckout,
  getMercadoPagoRuntimeDiagnostics,
  getMercadoPagoTokenPrefix,
  getPaymentReadiness,
  getPaymentProviderName,
  isAutomaticPaymentEnabled,
  logMercadoPagoRuntimeDiagnostics
};
