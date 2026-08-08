const assert = require("node:assert/strict");

const { buildAuthContext } = require("../src/services/auth-context");
const {
  ACCOUNT_CHANNEL,
  resolveAccountChannel
} = require("../src/services/account-channel");
const {
  canUseOperationalFeatures,
  getBlockLogPayload
} = require("../src/middlewares/operational-access");

const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

function createUser(overrides = {}) {
  return {
    id: "user-owner-tenant-a",
    name: "Owner Tenant A",
    email: "owner-a@manecomb.test",
    role: "owner",
    accountType: "company_owner",
    organizationId: "tenant-a",
    userStatus: "active",
    companyProfile: {
      companyName: "Tenant A"
    },
    ...overrides
  };
}

function createDriver(overrides = {}) {
  return createUser({
    id: "driver-tenant-a",
    accountType: "operations",
    email: "driver@manecomb.test",
    role: "driver",
    ...overrides
  });
}

function createOrder(overrides = {}) {
  return {
    id: "order-tenant-a",
    planId: "growth-6",
    planName: "Growth 6",
    fleetSize: 6,
    organizationId: "tenant-a",
    organizationSlug: "tenant-a",
    companyName: "Tenant A",
    ownerUserId: "user-owner-tenant-a",
    ownerAccountEmail: "owner-a@manecomb.test",
    paymentStatus: "paid",
    activationStatus: "active",
    status: "active",
    currentPeriodEnd: futureDate,
    createdAt: new Date().toISOString(),
    starterFleet: [
      { status: "active" },
      { status: "active" }
    ],
    ...overrides
  };
}

function createStore({ orders = [], users = [], activationKeys = [] } = {}) {
  return {
    listActivationKeysForCompany: async () => activationKeys,
    listCommercialOrdersForUser: async () => orders,
    listUsers: async () => users
  };
}

async function assertAccess(label, { expected, orders, user, users }) {
  const authContext = await buildAuthContext(createStore({ orders, users }), user);

  Object.entries(expected).forEach(([key, value]) => {
    assert.deepEqual(authContext[key], value, `${label}: ${key}`);
  });

  return authContext;
}

async function testCompanyOwnerWithoutPlanUsesPortalChannel() {
  const user = createUser();
  const authContext = await assertAccess("empresa sin plan", {
    expected: {
      accountChannel: "company_portal",
      canAccessMobile: false,
      canAccessPortal: true,
      canUseOperations: false,
      destination: "PlanRequired",
      mobileBlockReason: "no_plan",
      operationalBlockReason: "no_plan",
      productRoute: "/portal/plan",
      route: "/portal/plan"
    },
    orders: [],
    user
  });

  assert.equal(user.accountChannel, "company_portal");
  assert.equal(authContext.subscription.status, "inactive");
  assert.equal(await canUseOperationalFeatures(createStore(), user), false);
  assert.deepEqual(getBlockLogPayload(user, authContext), {
    userId: user.id,
    tenantId: "tenant-a",
    role: "owner",
    accountChannel: "company_portal",
    reason: "no_plan",
    planStatus: "inactive",
    tenantStatus: "registered"
  });
  console.log("ok - empresa sin plan permanece en Portal y Mobile reporta no_plan");
}

async function testDriverWithoutPlanUsesMobileGate() {
  const driver = createDriver({ id: "driver-no-plan-tenant-a" });
  const authContext = await assertAccess("conductor sin plan", {
    expected: {
      accountChannel: "mobile_operations",
      canAccessMobile: false,
      canAccessPortal: false,
      canUseOperations: false,
      destination: "PlanBlocked",
      mobileBlockReason: "no_plan",
      operationalBlockReason: "no_plan",
      route: "/plan-blocked"
    },
    orders: [],
    user: driver
  });

  console.log("ok - conductor sin plan queda en el gate de Mobile");
}

async function testCompanyOwnerWithActivePlanUsesPortalAndMobile() {
  const user = createUser();
  const authContext = await assertAccess("empresa con plan activo", {
    expected: {
      accountChannel: "company_portal",
      canAccessMobile: true,
      canAccessPortal: true,
      canUseOperations: true,
      destination: "CompanyPortal",
      mobileBlockReason: null,
      operationalBlockReason: null,
      productDestination: "CompanyPortal",
      productRoute: "/portal",
      route: "/portal"
    },
    orders: [createOrder()],
    user
  });

  assert.equal(authContext.subscription.status, "active");
  assert.equal(authContext.subscription.unitsLimit, 6);
  assert.equal(authContext.tenant.status, "active");
  assert.equal(await canUseOperationalFeatures(createStore({ orders: [createOrder()] }), user), true);
  console.log("ok - owner de empresa conserva Portal y también accede a Mobile");
}

async function testCompanyAdminWithActivePlanUsesPortalAndMobile() {
  const admin = createUser({
    id: "company-admin-tenant-a",
    email: "admin-a@manecomb.test",
    role: "admin"
  });
  const authContext = await assertAccess("admin de empresa con plan activo", {
    expected: {
      accountChannel: "company_portal",
      canAccessMobile: true,
      canAccessPortal: true,
      canUseOperations: true,
      destination: "CompanyPortal",
      mobileBlockReason: null,
      operationalBlockReason: null,
      route: "/portal"
    },
    orders: [createOrder()],
    user: admin
  });

  assert.equal(authContext.subscription.isActive, true);
  console.log("ok - admin de empresa usa Portal y panel administrativo de Mobile");
}

async function testActiveDriverCanAccessMobile() {
  const driver = createDriver({ id: "driver-active-tenant-a" });
  const authContext = await assertAccess("conductor activo", {
    expected: {
      accountChannel: "mobile_operations",
      canAccessMobile: true,
      canAccessPortal: false,
      canUseOperations: true,
      destination: "HomeConductor",
      mobileBlockReason: null,
      operationalBlockReason: null,
      route: "/mapa"
    },
    orders: [createOrder()],
    user: driver
  });

  assert.equal(await canUseOperationalFeatures(createStore({ orders: [createOrder()] }), driver), true);
  console.log("ok - conductor activo entra al canal Mobile");
}

async function testSuspendedTenantBlocksDriver() {
  const authContext = await assertAccess("tenant suspendido", {
    expected: {
      accountChannel: "mobile_operations",
      canAccessMobile: false,
      canUseOperations: false,
      mobileBlockReason: "missing_tenant",
      operationalBlockReason: "missing_tenant"
    },
    orders: [createOrder()],
    user: createDriver({ organizationStatus: "suspended" })
  });

  assert.equal(authContext.subscription.status, "active");
  assert.equal(authContext.tenant.status, "suspended");
  console.log("ok - tenant suspendido bloquea Mobile y operaciones con la misma causa real");
}

async function testPaymentPendingRoutesCompanyToPortalPayments() {
  const authContext = await assertAccess("empresa con pago pendiente", {
    expected: {
      accountChannel: "company_portal",
      canAccessMobile: false,
      canUseOperations: false,
      destination: "PaymentPending",
      mobileBlockReason: "payment_pending",
      operationalBlockReason: "payment_pending",
      route: "/portal/pagos"
    },
    orders: [
      createOrder({
        activationStatus: "pending_payment",
        paymentStatus: "pending",
        status: "new"
      })
    ],
    user: createUser()
  });

  assert.equal(authContext.subscription.status, "pending");
  console.log("ok - pago pendiente mantiene Portal y bloquea Mobile por payment_pending");
}

async function testPaymentPendingBlocksDriverInMobile() {
  const authContext = await assertAccess("conductor con pago pendiente", {
    expected: {
      accountChannel: "mobile_operations",
      canAccessMobile: false,
      canUseOperations: false,
      destination: "PlanBlocked",
      mobileBlockReason: "payment_pending",
      operationalBlockReason: "payment_pending",
      route: "/plan-blocked"
    },
    orders: [
      createOrder({
        activationStatus: "pending_payment",
        paymentStatus: "pending",
        status: "new"
      })
    ],
    user: createDriver()
  });

  assert.equal(authContext.subscription.status, "pending");
  console.log("ok - pago pendiente bloquea Mobile sin enviarlo al Portal interno");
}

async function testExpiredPlanBlocksDriver() {
  const authContext = await assertAccess("plan vencido", {
    expected: {
      accountChannel: "mobile_operations",
      canAccessMobile: false,
      canUseOperations: false,
      mobileBlockReason: "inactive_plan",
      operationalBlockReason: "inactive_plan"
    },
    orders: [
      createOrder({
        currentPeriodEnd: pastDate,
        paidUntil: pastDate
      })
    ],
    user: createDriver()
  });

  assert.equal(authContext.subscription.status, "expired");
  assert.equal(authContext.subscription.isActive, false);
  console.log("ok - plan vencido bloquea el canal operativo");
}

async function testPendingInvitedDriverDoesNotChangeChannel() {
  const pendingDriver = createDriver({
    id: "driver-pending-tenant-a",
    email: "driver-pending@manecomb.test",
    userStatus: "pending"
  });
  const authContext = await assertAccess("conductor invitado pendiente", {
    expected: {
      accountChannel: "mobile_operations",
      canAccessMobile: true,
      mobileBlockReason: null,
      operationalBlockReason: null
    },
    orders: [createOrder()],
    user: pendingDriver,
    users: [pendingDriver]
  });

  assert.equal(authContext.tenant.status, "active");
  console.log("ok - invitación pendiente no altera el canal operativo válido");
}

async function testActiveTrialKeepsCompanyInPortalAndMobile() {
  const authContext = await assertAccess("trial vigente", {
    expected: {
      accountChannel: "company_portal",
      canAccessMobile: true,
      canUseOperations: true,
      destination: "CompanyPortal",
      mobileBlockReason: null,
      operationalBlockReason: null,
      route: "/portal"
    },
    orders: [
      createOrder({
        activationStatus: "trial",
        paymentStatus: "trial_active",
        status: "trial",
        trialEndsAt: futureDate,
        currentPeriodEnd: null
      })
    ],
    user: createUser()
  });

  assert.equal(authContext.subscription.status, "trial");
  assert.equal(authContext.subscription.isActive, true);
  console.log("ok - trial vigente habilita Portal y Mobile para la administración de empresa");
}

async function testPaidOrderUsesCanonicalPortalStatus() {
  const authContext = await assertAccess("pago aprobado", {
    expected: {
      accountChannel: "company_portal",
      canAccessMobile: true,
      canUseOperations: true,
      destination: "CompanyPortal",
      mobileBlockReason: null,
      operationalBlockReason: null,
      route: "/portal"
    },
    orders: [
      createOrder({
        activationStatus: "pending",
        paymentStatus: "paid",
        status: "paid"
      })
    ],
    user: createUser()
  });

  assert.equal(authContext.subscription.status, "active");
  assert.equal(authContext.subscription.isActive, true);
  assert.equal(
    authContext.onboarding.steps.find((step) => step.id === "plan-active").status,
    "completed"
  );
  assert.equal(
    authContext.onboarding.steps.find((step) => step.id === "payment").status,
    "completed"
  );
  console.log("ok - pago aprobado mantiene Portal y habilita Mobile");
}

async function testLegacyActivationFlagCannotBypassPayment() {
  const authContext = await assertAccess("flag activo sin pago", {
    expected: {
      canAccessMobile: false,
      canUseOperations: false,
      destination: "PaymentPending",
      mobileBlockReason: "payment_pending",
      operationalBlockReason: "payment_pending",
      route: "/portal/pagos"
    },
    orders: [
      createOrder({
        activationStatus: "active",
        paymentStatus: "pending",
        status: "active"
      })
    ],
    user: createUser({
      paymentProfile: {
        preferredMethod: "card",
        cardLast4: "4242"
      }
    })
  });

  assert.equal(authContext.subscription.status, "pending");
  assert.equal(authContext.subscription.isActive, false);
  console.log("ok - flags heredados no sustituyen el pago ni habilitan Mobile");
}

async function testInvalidRoleAndAccountCombinationsAreBlocked() {
  const companyDriver = createUser({ role: "driver" });
  const operationsBilling = createUser({
    accountType: "operations",
    role: "billing_manager"
  });

  const companyContext = await buildAuthContext(createStore({ orders: [createOrder()] }), companyDriver);
  const operationsContext = await buildAuthContext(createStore({ orders: [createOrder()] }), operationsBilling);

  assert.equal(companyContext.accountChannel, "blocked");
  assert.equal(companyContext.accountChannelReason, "incompatible_company_role");
  assert.equal(companyContext.destination, "AccessBlocked");
  assert.equal(companyContext.route, "/access-blocked");
  assert.equal(companyContext.canAccessMobile, false);
  assert.equal(companyContext.canUseOperations, false);
  assert.equal(companyContext.mobileBlockReason, "account_blocked");
  assert.equal(companyContext.operationalBlockReason, "account_blocked");

  assert.equal(operationsContext.accountChannel, "blocked");
  assert.equal(operationsContext.accountChannelReason, "incompatible_operations_role");
  assert.equal(operationsContext.canAccessMobile, false);
  assert.equal(operationsContext.canAccessPortal, false);
  assert.equal(operationsContext.operationalBlockReason, "account_blocked");
  console.log("ok - combinaciones incompatibles fallan cerradas");
}

async function testSuspendedAccountIsBlockedBeforeProductAccess() {
  const suspended = createDriver({ userStatus: "suspended" });
  const authContext = await buildAuthContext(createStore({ orders: [createOrder()] }), suspended);

  assert.equal(authContext.accountChannel, "blocked");
  assert.equal(authContext.accountChannelReason, "account_suspended");
  assert.equal(authContext.destination, "AccessBlocked");
  assert.equal(authContext.mobileBlockReason, "account_blocked");
  assert.equal(authContext.operationalBlockReason, "account_blocked");
  assert.equal(authContext.canUseOperations, false);
  console.log("ok - cuenta suspendida queda bloqueada antes de evaluar producto o plan");
}

function testPlatformIdentityHasDedicatedChannel() {
  const resolution = resolveAccountChannel({
    role: "platform_owner",
    accountType: "operations",
    userStatus: "active"
  });

  assert.equal(resolution.channel, ACCOUNT_CHANNEL.PLATFORM_ADMIN);
  assert.equal(resolution.canAccessPortal, false);
  assert.equal(resolution.canUseMobileProduct, false);
  console.log("ok - identidad Platform usa un canal dedicado");
}

async function run() {
  await testCompanyOwnerWithoutPlanUsesPortalChannel();
  await testDriverWithoutPlanUsesMobileGate();
  await testCompanyOwnerWithActivePlanUsesPortalAndMobile();
  await testCompanyAdminWithActivePlanUsesPortalAndMobile();
  await testActiveDriverCanAccessMobile();
  await testSuspendedTenantBlocksDriver();
  await testPaymentPendingRoutesCompanyToPortalPayments();
  await testPaymentPendingBlocksDriverInMobile();
  await testExpiredPlanBlocksDriver();
  await testPendingInvitedDriverDoesNotChangeChannel();
  await testActiveTrialKeepsCompanyInPortalAndMobile();
  await testPaidOrderUsesCanonicalPortalStatus();
  await testLegacyActivationFlagCannotBypassPayment();
  await testInvalidRoleAndAccountCombinationsAreBlocked();
  await testSuspendedAccountIsBlockedBeforeProductAccess();
  testPlatformIdentityHasDedicatedChannel();
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});