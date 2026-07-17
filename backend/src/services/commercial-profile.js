const {
  BANK_TRANSFER_ACCOUNT_NAME,
  BANK_TRANSFER_BANK_NAME,
  BANK_TRANSFER_CLABE,
  COMMERCIAL_BRAND_NAME,
  COMMERCIAL_LEGAL_NAME,
  COMMERCIAL_SUPPORT_EMAIL,
  COMMERCIAL_SUPPORT_PHONE
} = require("../config/env");
const {
  buildCommercialDownloadables,
  buildCommercialInvoiceSummary
} = require("./commercial-downloads");

function normalizePhone(phone) {
  const digits = String(phone || "").replace(/[^\d+]/g, "");

  if (!digits) {
    return "";
  }

  return digits.startsWith("+") ? digits : `+${digits}`;
}

function isManualTransferConfigured() {
  return Boolean(BANK_TRANSFER_ACCOUNT_NAME && BANK_TRANSFER_CLABE);
}

function getCommercialProfile() {
  return {
    brandName: COMMERCIAL_BRAND_NAME || "ManeComb",
    legalName: COMMERCIAL_LEGAL_NAME || COMMERCIAL_BRAND_NAME || "ManeComb",
    supportEmail: COMMERCIAL_SUPPORT_EMAIL || null,
    supportPhone: normalizePhone(COMMERCIAL_SUPPORT_PHONE) || null,
    bankTransferEnabled: isManualTransferConfigured(),
    bankName: BANK_TRANSFER_BANK_NAME || null
  };
}

function getManualPaymentInstructions(order) {
  if (!isManualTransferConfigured() || !order) {
    return null;
  }

  const profile = getCommercialProfile();
  const concept = `${profile.brandName} ${order.referenceCode}`.trim();

  return {
    type: "spei_transfer",
    brandName: profile.brandName,
    legalName: profile.legalName,
    accountHolder: BANK_TRANSFER_ACCOUNT_NAME,
    clabe: BANK_TRANSFER_CLABE,
    bankName: BANK_TRANSFER_BANK_NAME || null,
    amount: Number(order.totalPrice || 0),
    currency: "MXN",
    reference: order.referenceCode,
    concept,
    supportEmail: profile.supportEmail,
    supportPhone: profile.supportPhone,
    summary:
      `Realiza una transferencia SPEI por ${Number(order.totalPrice || 0).toFixed(2)} MXN ` +
      `usando la referencia ${order.referenceCode}.`
  };
}

function enrichCommercialOrder(order, options = {}) {
  if (!order) {
    return order;
  }

  const publicOrder = { ...order };
  delete publicOrder.lastEmailError;

  return {
    ...publicOrder,
    merchantProfile: getCommercialProfile(),
    paymentInstructions: getManualPaymentInstructions(order),
    invoiceSummary: buildCommercialInvoiceSummary(order),
    downloads: buildCommercialDownloadables(order, options.user || null)
  };
}

module.exports = {
  enrichCommercialOrder,
  getCommercialProfile,
  getManualPaymentInstructions,
  isManualTransferConfigured
};
