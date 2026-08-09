process.env.NODE_ENV = "test";

const assert = require("node:assert/strict");
const { hasPlatformPermission } = require("../src/config/platform-roles");
const {
  sanitizeCompanyForViewer,
  sanitizeCompanyQuery
} = require("../src/modules/platform/company-visibility");

function buildCompany() {
  return {
    organizationId: "org-alpha",
    companyName: "Transportes Alpha",
    plan: {
      id: "value-4",
      name: "4 combis",
      units: 4,
      price: 209,
      currency: "MXN",
      radioIncluded: true
    },
    owner: { id: "owner-alpha", name: "Alpha Owner", email: "owner@alpha.test" },
    users: { total: 2, byStatus: { active: 2, pending: 0, suspended: 0 } },
    vehicles: { total: 4, active: 4, byStatus: { on_route: 2, maintenance: 0, idle: 2, retired: 0 } },
    operationalStatus: "operational",
    commercial: {
      orderId: "order-secret",
      accountStatus: "active",
      status: "paid",
      paymentStatus: "paid",
      activationStatus: "active",
      onboardingStatus: "self_service_ready",
      trialStatus: "converted",
      currentPeriodEnd: "2026-09-01T00:00:00.000Z",
      paidUntil: "2026-09-01T00:00:00.000Z",
      nextBillingAt: "2026-09-01T00:00:00.000Z",
      cancelAtPeriodEnd: false
    },
    billing: {
      paymentMethod: "card",
      provider: "mercado_pago",
      totalPrice: 209,
      currency: "MXN",
      financialStatus: "paid",
      refundableAmountMinor: 20900,
      chargebackStatus: "none"
    },
    commercialHistory: {
      totalOrders: 3,
      firstOrderAt: "2026-06-01T00:00:00.000Z",
      latestOrderAt: "2026-08-01T00:00:00.000Z"
    }
  };
}

function main() {
  assert.equal(hasPlatformPermission("platform_support", "platform.commercial.read"), false);
  assert.equal(hasPlatformPermission("platform_viewer", "platform.commercial.read"), false);
  assert.equal(hasPlatformPermission("platform_finance", "platform.commercial.read"), true);
  assert.equal(hasPlatformPermission("platform_admin", "platform.commercial.read"), true);
  assert.equal(hasPlatformPermission("platform_owner", "platform.commercial.read"), true);

  const restrictedQuery = sanitizeCompanyQuery({
    search: "alpha",
    planId: "value-4",
    paymentStatus: "paid",
    onboardingStatus: "self_service_ready",
    page: "2"
  }, false);
  assert.equal(restrictedQuery.search, "alpha");
  assert.equal(restrictedQuery.planId, "value-4");
  assert.equal(restrictedQuery.page, "2");
  assert.equal(Object.hasOwn(restrictedQuery, "paymentStatus"), false);
  assert.equal(Object.hasOwn(restrictedQuery, "onboardingStatus"), false);

  const fullQuery = sanitizeCompanyQuery({ paymentStatus: "paid", onboardingStatus: "pending" }, true);
  assert.equal(fullQuery.paymentStatus, "paid");
  assert.equal(fullQuery.onboardingStatus, "pending");

  const restricted = sanitizeCompanyForViewer(buildCompany(), false);
  assert.equal(restricted.commercialAccess, false);
  assert.equal(restricted.organizationId, "org-alpha");
  assert.equal(restricted.plan.id, "value-4");
  assert.equal(restricted.plan.units, 4);
  assert.equal(restricted.commercial.orderId, null);
  assert.equal(restricted.commercial.paymentStatus, null);
  assert.equal(restricted.commercial.activationStatus, null);
  assert.equal(restricted.billing.paymentMethod, null);
  assert.equal(restricted.billing.provider, null);
  assert.equal(restricted.billing.totalPrice, 0);
  assert.equal(restricted.billing.refundableAmountMinor, 0);
  assert.equal(Object.hasOwn(restricted, "commercialHistory"), false);

  const restrictedJson = JSON.stringify(restricted);
  for (const secret of [
    "order-secret",
    "mercado_pago",
    "self_service_ready",
    "converted",
    "20900",
    "2026-09-01T00:00:00.000Z"
  ]) {
    assert.equal(restrictedJson.includes(secret), false, `restricted DTO leaked ${secret}`);
  }

  const full = sanitizeCompanyForViewer(buildCompany(), true);
  assert.equal(full.commercialAccess, true);
  assert.equal(full.commercial.orderId, "order-secret");
  assert.equal(full.commercial.paymentStatus, "paid");
  assert.equal(full.billing.paymentMethod, "card");
  assert.equal(full.billing.totalPrice, 209);
  assert.equal(full.commercialHistory.totalOrders, 3);

  console.log("ok - platform company commercial visibility follows platform.commercial.read");
}

main();
