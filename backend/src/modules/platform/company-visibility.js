function sanitizeCompanyQuery(query = {}, canReadCommercial = false) {
  const safeQuery = { ...(query || {}) };

  if (!canReadCommercial) {
    delete safeQuery.paymentStatus;
    delete safeQuery.onboardingStatus;
  }

  return safeQuery;
}

function redactCommercialSnapshot(company) {
  if (!company) return company;

  const {
    commercialHistory: _commercialHistory,
    commercial: _commercial,
    billing: _billing,
    ...safeCompany
  } = company;

  return {
    ...safeCompany,
    commercialAccess: false,
    commercial: {
      orderId: null,
      accountStatus: null,
      status: null,
      paymentStatus: null,
      activationStatus: null,
      onboardingStatus: null,
      trialStatus: null,
      currentPeriodEnd: null,
      paidUntil: null,
      nextBillingAt: null,
      cancelAtPeriodEnd: false
    },
    billing: {
      paymentMethod: null,
      provider: null,
      totalPrice: 0,
      currency: "MXN",
      financialStatus: null,
      refundableAmountMinor: 0,
      chargebackStatus: null
    }
  };
}

function sanitizeCompanyForViewer(company, canReadCommercial = false) {
  if (canReadCommercial) {
    return {
      ...company,
      commercialAccess: true
    };
  }

  return redactCommercialSnapshot(company);
}

module.exports = {
  redactCommercialSnapshot,
  sanitizeCompanyForViewer,
  sanitizeCompanyQuery
};
