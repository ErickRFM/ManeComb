const assert = require("node:assert/strict");

const { sanitizeUser } = require("../src/data/serializers");
const {
  ACCOUNT_CHANNEL,
  resolveAccountChannel
} = require("../src/services/account-channel");
const { buildAuthContext } = require("../src/services/auth-context");

const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

function buildUser(overrides = {}) {
  return {
    _id: "user-channel-test",
    id: "user-channel-test",
    name: "Channel Test",
    email: "channel@manecomb.test",
    passwordHash: "must-not-leak",
    role: "owner",
    accountType: "company_owner",
    organizationId: "tenant-channel",
    userStatus: "active",
    ...overrides
  };
}

function buildActiveOrder(overrides = {}) {
  return {
    id: "order-channel-test",
    planId: "growth-6",
    planName: "Growth 6",
    fleetSize: 6,
    ownerUserId: "user-channel-test",
    ownerAccountEmail: "channel@manecomb.test",
    paymentStatus: "paid",
    activationStatus: "active",
    status: "active",
    currentPeriodEnd: futureDate,
    createdAt: new Date().toISOString(),
    ...overrides
  };
}

function buildStore(order) {
  return {
    listActivationKeysForCompany: async () => [],
    listCommercialOrdersForUser: async () => order ? [order] : [],
    listUsers: async () => []
  };
}

function assertChannel(overrides, expectedChannel, expectedReason) {
  const resolution = resolveAccountChannel(buildUser(overrides));
  assert.equal(resolution.channel, expectedChannel);
  assert.equal(resolution.reason, expectedReason);
  return resolution;
}

function testCompanyPortalRoleMatrix() {
  ["owner", "admin", "billing_manager", "support", "viewer"].forEach((role) => {
    const resolution = assertChannel(
      { accountType: "company_owner", role },
      ACCOUNT_CHANNEL.COMPANY_PORTAL,
      "company_identity"
    );
    assert.equal(resolution.canAccessPortal, true);
    // Este flag pertenece únicamente al clasificador de canal. La autorización
    // Mobile real se resuelve por mobile.access en enterprise-capabilities.
    assert.equal(resolution.canUseMobileProduct, false);
  });

  console.log("ok - owner, admin, billing_manager, support y viewer usan company_portal");
}

function testMobileOperationsRoleMatrix() {
  ["owner", "admin", "dispatcher", "supervisor", "driver", "conductor"].forEach((role) => {
    const resolution = assertChannel(
      { accountType: "operations", role },
      ACCOUNT_CHANNEL.MOBILE_OPERATIONS,
      "operational_identity"
    );
    assert.equal(resolution.canAccessPortal, false);
    assert.equal(resolution.canUseMobileProduct, true);
  });

  console.log("ok - owner, admin, dispatcher, supervisor y driver operativos usan mobile_operations");
}

function testSerializerDecoratesEverySessionRead() {
  const company = sanitizeUser(buildUser());
  const mobile = sanitizeUser(buildUser({
    accountType: "operations",
    role: "driver"
  }));

  assert.equal(company.accountChannel, "company_portal");
  assert.equal(company.accountChannelReason, "company_identity");
  assert.equal(company.passwordHash, undefined);
  assert.equal(mobile.accountChannel, "mobile_operations");
  assert.equal(mobile.accountChannelReason, "operational_identity");
  assert.equal(mobile.passwordHash, undefined);
  console.log("ok - serializer emite canal canónico sin datos sensibles");
}

function testInvalidCombinationsFailClosed() {
  const invalidCases = [
    {
      accountType: "company_owner",
      role: "driver",
      reason: "incompatible_company_role"
    },
    {
      accountType: "company_owner",
      role: "supervisor",
      reason: "incompatible_company_role"
    },
    {
      accountType: "operations",
      role: "billing_manager",
      reason: "incompatible_operations_role"
    },
    {
      accountType: "operations",
      role: "viewer",
      reason: "incompatible_operations_role"
    },
    {
      accountType: "unknown",
      role: "driver",
      reason: "unknown_account_type"
    }
  ];

  invalidCases.forEach(({ accountType, role, reason }) => {
    const resolution = assertChannel(
      { accountType, role },
      ACCOUNT_CHANNEL.BLOCKED,
      reason
    );
    assert.equal(resolution.canAccessPortal, false);
    assert.equal(resolution.canUseMobileProduct, false);
    assert.equal(resolution.isBlocked, true);
  });

  console.log("ok - combinaciones incompatibles y tipos desconocidos fallan cerrados");
}

function testSuspensionOverridesProductIdentity() {
  [
    { accountType: "company_owner", role: "owner" },
    { accountType: "operations", role: "driver" }
  ].forEach((identity) => {
    const resolution = resolveAccountChannel(buildUser({
      ...identity,
      userStatus: "suspended"
    }));

    assert.equal(resolution.channel, ACCOUNT_CHANNEL.BLOCKED);
    assert.equal(resolution.reason, "account_suspended");
  });

  console.log("ok - suspensión domina cualquier canal de producto");
}

function testPlatformIdentityHasDedicatedChannel() {
  ["platform_owner", "platform_admin", "platform_support", "platform_auditor"].forEach((role) => {
    const resolution = assertChannel(
      { accountType: "operations", role },
      ACCOUNT_CHANNEL.PLATFORM_ADMIN,
      "platform_identity"
    );
    assert.equal(resolution.canAccessPortal, false);
    assert.equal(resolution.canUseMobileProduct, false);
  });

  console.log("ok - roles Platform usan exclusivamente platform_admin");
}

function testMissingUserFailsClosed() {
  const resolution = resolveAccountChannel(null);
  assert.equal(resolution.channel, ACCOUNT_CHANNEL.BLOCKED);
  assert.equal(resolution.reason, "missing_user");
  console.log("ok - usuario ausente falla cerrado");
}

async function testActivePlanWithoutTenantKeepsChannelAndBlocksOperations() {
  const orderWithoutTenant = buildActiveOrder({
    organizationId: "",
    organizationSlug: ""
  });
  const company = buildUser({ organizationId: "" });
  const driver = buildUser({
    accountType: "operations",
    organizationId: "",
    role: "driver"
  });

  const companyContext = await buildAuthContext(buildStore(orderWithoutTenant), company);
  const driverContext = await buildAuthContext(buildStore(orderWithoutTenant), driver);

  assert.equal(companyContext.accountChannel, "company_portal");
  assert.equal(companyContext.destination, "OperationalOnboarding");
  assert.equal(companyContext.route, "/portal/onboarding");
  assert.equal(companyContext.canAccessMobile, false);
  assert.equal(companyContext.canUseOperations, false);
  assert.equal(companyContext.mobileBlockReason, "missing_tenant");
  assert.equal(companyContext.operationalBlockReason, "missing_tenant");
  assert.equal(companyContext.tenant, null);

  assert.equal(driverContext.accountChannel, "mobile_operations");
  assert.equal(driverContext.destination, "PlanBlocked");
  assert.equal(driverContext.route, "/plan-blocked");
  assert.equal(driverContext.canAccessMobile, false);
  assert.equal(driverContext.canUseOperations, false);
  assert.equal(driverContext.mobileBlockReason, "missing_tenant");
  assert.equal(driverContext.operationalBlockReason, "missing_tenant");
  assert.equal(driverContext.tenant, null);

  console.log("ok - plan activo sin tenant conserva el canal y bloquea operación con missing_tenant");
}

async function run() {
  testCompanyPortalRoleMatrix();
  testMobileOperationsRoleMatrix();
  testSerializerDecoratesEverySessionRead();
  testInvalidCombinationsFailClosed();
  testSuspensionOverridesProductIdentity();
  testPlatformIdentityHasDedicatedChannel();
  testMissingUserFailsClosed();
  await testActivePlanWithoutTenantKeepsChannelAndBlocksOperations();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});