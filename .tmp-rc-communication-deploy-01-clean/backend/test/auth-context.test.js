const assert = require("node:assert/strict");

const { buildAuthContext } = require("../src/services/auth-context");
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

async function testOwnerWithoutPlanIsBlocked() {
  const user = createUser();
  const authContext = await assertAccess("owner sin plan", {
    expected: {
      canAccessMobile: false,
      mobileBlockReason: "no_plan"
    },
    orders: [],
    user
  });

  assert.equal(authContext.subscription.status, "inactive");
  assert.equal(authContext.canUseOperations, false);
  assert.equal(await canUseOperationalFeatures(createStore(), user), false);
  assert.deepEqual(getBlockLogPayload(user, authContext), {
    userId: user.id,
    tenantId: "tenant-a",
    role: "owner",
    reason: "no_plan",
    planStatus: "inactive",
    tenantStatus: "registered"
  });
  console.log("ok - owner sin plan queda bloqueado con no_plan");
}

async function testDriverWithoutPlanDoesNotRouteToMap() {
  const driver = createUser({
    id: "driver-no-plan-tenant-a",
    accountType: "operations",
    email: "driver-no-plan@manecomb.test",
    role: "driver"
  });
  const authContext = await assertAccess("conductor sin plan", {
    expected: {
      canAccessMobile: false,
      destination: "PlanRequired",
      mobileBlockReason: "no_plan",
      route: "/portal/plan"
    },
    orders: [],
    user: driver
  });

  assert.equal(authContext.canUseOperations, false);
  console.log("ok - conductor sin plan no recibe ruta operativa");
}

async function testOwnerWithActivePlanCanAccess() {
  const authContext = await assertAccess("owner con plan activo", {
    expected: {
      canAccessMobile: true,
      mobileBlockReason: null
    },
    orders: [createOrder()],
    user: createUser()
  });

  assert.equal(authContext.subscription.status, "active");
  assert.equal(authContext.subscription.unitsLimit, 6);
  assert.equal(authContext.tenant.status, "active");
  assert.equal(authContext.canUseOperations, true);
  console.log("ok - owner con plan activo entra a mobile y operaciones");
}

async function testSuspendedTenantIsBlocked() {
  const authContext = await assertAccess("tenant suspendido", {
    expected: {
      canAccessMobile: false,
      mobileBlockReason: "missing_tenant"
    },
    orders: [createOrder()],
    user: createUser({ organizationStatus: "suspended" })
  });

  assert.equal(authContext.subscription.status, "active");
  assert.equal(authContext.tenant.status, "suspended");
  assert.equal(authContext.canUseOperations, false);
  console.log("ok - tenant suspendido bloquea acceso operativo");
}

async function testPaymentPendingIsBlocked() {
  const authContext = await assertAccess("pago pendiente", {
    expected: {
      canAccessMobile: false,
      mobileBlockReason: "payment_pending"
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
  assert.equal(authContext.tenant.status, "registered");
  console.log("ok - pago pendiente bloquea con payment_pending");
}

async function testExpiredPlanIsBlocked() {
  const authContext = await assertAccess("plan vencido", {
    expected: {
      canAccessMobile: false,
      mobileBlockReason: "inactive_plan"
    },
    orders: [
      createOrder({
        currentPeriodEnd: pastDate,
        paidUntil: pastDate
      })
    ],
    user: createUser()
  });

  assert.equal(authContext.subscription.status, "active");
  assert.equal(authContext.subscription.isActive, false);
  assert.equal(authContext.canUseOperations, false);
  console.log("ok - plan vencido bloquea con inactive_plan");
}

async function testPendingInvitedUserDoesNotBlockActiveTenant() {
  const pendingDriver = createUser({
    id: "driver-pending-tenant-a",
    accountType: "operations",
    email: "driver-pending@manecomb.test",
    role: "driver",
    userStatus: "pending"
  });
  const authContext = await assertAccess("usuario invitado pendiente", {
    expected: {
      canAccessMobile: true,
      mobileBlockReason: null
    },
    orders: [createOrder()],
    user: pendingDriver,
    users: [pendingDriver]
  });

  assert.equal(authContext.tenant.status, "active");
  assert.equal(authContext.canUseOperations, true);
  console.log("ok - usuario invitado pendiente no bloquea si tenant y plan estan activos");
}

async function testActiveDriverCanAccess() {
  const driver = createUser({
    id: "driver-active-tenant-a",
    accountType: "operations",
    email: "driver-active@manecomb.test",
    role: "driver"
  });
  const authContext = await assertAccess("conductor activo", {
    expected: {
      canAccessMobile: true,
      mobileBlockReason: null
    },
    orders: [createOrder()],
    user: driver
  });

  assert.equal(authContext.destination, "HomeConductor");
  assert.equal(authContext.route, "/mapa");
  assert.equal(await canUseOperationalFeatures(createStore({ orders: [createOrder()] }), driver), true);
  console.log("ok - conductor con tenant activo entra a mobile");
}

async function run() {
  await testOwnerWithoutPlanIsBlocked();
  await testDriverWithoutPlanDoesNotRouteToMap();
  await testOwnerWithActivePlanCanAccess();
  await testSuspendedTenantIsBlocked();
  await testPaymentPendingIsBlocked();
  await testExpiredPlanIsBlocked();
  await testPendingInvitedUserDoesNotBlockActiveTenant();
  await testActiveDriverCanAccess();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
