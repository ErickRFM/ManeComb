const {
  APP_URL,
  MERCADO_PAGO_ACCESS_TOKEN,
  PAYMENT_PROVIDER,
  PUBLIC_WEBHOOK_BASE_URL
} = require("../config/env");
const {
  getManualPaymentInstructions,
  isManualTransferConfigured
} = require("./commercial-profile");

function isAutomaticPaymentEnabled() {
  return PAYMENT_PROVIDER === "mercado_pago" && Boolean(MERCADO_PAGO_ACCESS_TOKEN);
}

function getPaymentReadiness() {
  const automaticReady = isAutomaticPaymentEnabled();
  const manualReady = isManualTransferConfigured();
  const ready = automaticReady || manualReady;

  return {
    mode: automaticReady ? "mercado_pago" : manualReady ? "manual_transfer_ready" : "configuration_required",
    provider: PAYMENT_PROVIDER || "mercado_pago",
    ready,
    missing:
      automaticReady || PAYMENT_PROVIDER !== "mercado_pago"
        ? []
        : manualReady
          ? []
          : ["MERCADO_PAGO_ACCESS_TOKEN", "BANK_TRANSFER_ACCOUNT_NAME", "BANK_TRANSFER_CLABE"]
  };
}

function getPaymentProviderName(paymentMethod) {
  if (paymentMethod === "trial") {
    return "trial_access";
  }

  if (paymentMethod === "spei" || paymentMethod === "transfer") {
    return isManualTransferConfigured() ? "manual_bank_transfer" : "manual";
  }

  if (!isAutomaticPaymentEnabled()) {
    return isManualTransferConfigured() ? "manual_bank_transfer" : "manual";
  }

  return "mercado_pago";
}

function buildOrderDescription(order) {
  const radioLabel = order.radioFeatureEnabled ? " | Radio operativo" : "";
  return `${order.fleetSize} combis | ${order.strategy}${radioLabel}`;
}

async function createMercadoPagoPreference(order) {
  const notificationUrl = PUBLIC_WEBHOOK_BASE_URL
    ? `${PUBLIC_WEBHOOK_BASE_URL.replace(/\/$/, "")}/api/commercial/webhooks/mercadopago`
    : undefined;
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
        success: `${APP_URL.replace(/\/$/, "")}/ventas/?checkout=success`,
        failure: `${APP_URL.replace(/\/$/, "")}/ventas/?checkout=failure`,
        pending: `${APP_URL.replace(/\/$/, "")}/ventas/?checkout=pending`
      },
      auto_return: "approved",
      payment_methods: {
        installments: 12
      },
      ...(notificationUrl ? { notification_url: notificationUrl } : {})
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
  getPaymentReadiness,
  getPaymentProviderName,
  isAutomaticPaymentEnabled
};
