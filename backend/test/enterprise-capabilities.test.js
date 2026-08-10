const assert = require("node:assert/strict");

const {
  ENTERPRISE_CAPABILITY,
  canAccessAllTenants,
  canAccessTenantResource,
  filterTenantList,
  getCapabilitiesForUser,
  getEffectiveRole,
  getRolesWithPermission,
  hasPermission,
  requireOrganization,
  requirePermission
} = require("../src/middlewares/access-control");
const { sanitizeUser } = require("../src/data/serializers");

function createResponse() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
  };
}

function runMiddleware(middleware, req) {
  const res = createResponse();
  let nextCalled = false;
  middleware(req, res, () => { nextCalled = true; });
  return { nextCalled, res };
}

function user(role, accountType = "operations", overrides = {}) {
  return {
    id: `${role}-a`, role, accountType, organizationId: "tenant-a", userStatus: "active", ...overrides
  };
}

function includesOnlyManagement(capabilities, expected) {
  const management = capabilities.filter((entry) => entry.endsWith(".manage"));
  assert.deepEqual([...management].sort(), [...expected].sort());
}

function main() {
  const operationsAdmin = user("admin");
  const companyOwner = user("owner", "company_owner", { id: "company-owner" });
  const companyAdmin = user("admin", "company_owner", { id: "company-admin" });
  const dispatcher = user("dispatcher");
  const supervisor = user("supervisor");
  const billingManager = user("billing_manager", "company_owner");
  const support = user("support", "company_owner");
  const viewer = user("viewer", "company_owner");
  const driver = user("driver", "operations", { vehicleId: "vehicle-a" });

  assert.equal(canAccessAllTenants(operationsAdmin), false);
  assert.equal(canAccessAllTenants(companyOwner), false);
  assert.equal(canAccessTenantResource(operationsAdmin, { id: "foreign", organizationId: "tenant-b" }), false);
  assert.equal(canAccessTenantResource(operationsAdmin, { id: "own", organizationId: "tenant-a" }), true);

  assert.equal(hasPermission(operationsAdmin, "users.manage"), true);
  assert.equal(hasPermission(operationsAdmin, "canManageUsers"), true);
  assert.equal(hasPermission(billingManager, "billing.manage"), true);
  assert.equal(hasPermission(billingManager, "canManageVehicles"), false);
  assert.equal(hasPermission(driver, "communication.rtc.access"), true);
  assert.equal(hasPermission(driver, "analytics.view"), false);
  assert.equal(hasPermission(driver, "permission.unknown"), false);

  const ownerCapabilities = getCapabilitiesForUser(companyOwner);
  [ENTERPRISE_CAPABILITY.PORTAL_ACCESS, ENTERPRISE_CAPABILITY.MOBILE_ACCESS, ENTERPRISE_CAPABILITY.OPERATIONS_USE, ENTERPRISE_CAPABILITY.TENANT_ACCESS]
    .forEach((capability) => assert.equal(ownerCapabilities.includes(capability), true));

  const companyAdminCapabilities = getCapabilitiesForUser(companyAdmin);
  assert.equal(companyAdminCapabilities.includes(ENTERPRISE_CAPABILITY.PORTAL_ACCESS), true);
  assert.equal(companyAdminCapabilities.includes(ENTERPRISE_CAPABILITY.MOBILE_ACCESS), true);
  assert.equal(companyAdminCapabilities.includes(ENTERPRISE_CAPABILITY.OPERATIONS_USE), true);
  assert.equal(companyAdminCapabilities.includes(ENTERPRISE_CAPABILITY.USERS_MANAGE), true);

  const dispatcherCapabilities = getCapabilitiesForUser(dispatcher);
  assert.equal(dispatcherCapabilities.includes(ENTERPRISE_CAPABILITY.MOBILE_ACCESS), true);
  assert.equal(dispatcherCapabilities.includes(ENTERPRISE_CAPABILITY.OPERATIONS_USE), true);
  assert.equal(dispatcherCapabilities.includes(ENTERPRISE_CAPABILITY.ANALYTICS_VIEW), true);
  assert.equal(dispatcherCapabilities.includes(ENTERPRISE_CAPABILITY.ROUTES_MANAGE), true);
  assert.equal(dispatcherCapabilities.includes(ENTERPRISE_CAPABILITY.INCIDENTS_MANAGE), true);
  assert.equal(dispatcherCapabilities.includes(ENTERPRISE_CAPABILITY.DOCUMENTS_MANAGE), false);
  assert.equal(dispatcherCapabilities.includes(ENTERPRISE_CAPABILITY.USERS_MANAGE), false);

  const supervisorCapabilities = getCapabilitiesForUser(supervisor);
  assert.equal(supervisorCapabilities.includes(ENTERPRISE_CAPABILITY.MOBILE_ACCESS), true);
  assert.equal(supervisorCapabilities.includes(ENTERPRISE_CAPABILITY.OPERATIONS_USE), true);
  assert.equal(supervisorCapabilities.includes(ENTERPRISE_CAPABILITY.ANALYTICS_VIEW), true);
  assert.equal(supervisorCapabilities.includes(ENTERPRISE_CAPABILITY.VEHICLES_MANAGE), true);
  assert.equal(supervisorCapabilities.includes(ENTERPRISE_CAPABILITY.ROUTES_MANAGE), true);
  assert.equal(supervisorCapabilities.includes(ENTERPRISE_CAPABILITY.DOCUMENTS_MANAGE), true);
  assert.equal(supervisorCapabilities.includes(ENTERPRISE_CAPABILITY.INCIDENTS_MANAGE), true);
  assert.equal(supervisorCapabilities.includes(ENTERPRISE_CAPABILITY.USERS_MANAGE), false);
  assert.equal(supervisorCapabilities.includes(ENTERPRISE_CAPABILITY.BILLING_MANAGE), false);

  const billingCapabilities = getCapabilitiesForUser(billingManager);
  assert.equal(billingCapabilities.includes(ENTERPRISE_CAPABILITY.PORTAL_ACCESS), true);
  assert.equal(billingCapabilities.includes(ENTERPRISE_CAPABILITY.MOBILE_ACCESS), false);
  assert.equal(billingCapabilities.includes(ENTERPRISE_CAPABILITY.BILLING_MANAGE), true);
  assert.equal(billingCapabilities.includes(ENTERPRISE_CAPABILITY.ANALYTICS_VIEW), true);

  const supportCapabilities = getCapabilitiesForUser(support);
  assert.equal(supportCapabilities.includes(ENTERPRISE_CAPABILITY.PORTAL_ACCESS), true);
  assert.equal(supportCapabilities.includes(ENTERPRISE_CAPABILITY.MOBILE_ACCESS), false);
  assert.equal(supportCapabilities.includes(ENTERPRISE_CAPABILITY.ANALYTICS_VIEW), true);
  assert.equal(supportCapabilities.includes(ENTERPRISE_CAPABILITY.INCIDENTS_MANAGE), true);
  assert.equal(supportCapabilities.includes(ENTERPRISE_CAPABILITY.BILLING_MANAGE), false);
  assert.equal(supportCapabilities.includes(ENTERPRISE_CAPABILITY.USERS_MANAGE), false);
  assert.equal(supportCapabilities.includes(ENTERPRISE_CAPABILITY.DOCUMENTS_MANAGE), false);

  const viewerCapabilities = getCapabilitiesForUser(viewer);
  assert.equal(viewerCapabilities.includes(ENTERPRISE_CAPABILITY.PORTAL_ACCESS), true);
  assert.equal(viewerCapabilities.includes(ENTERPRISE_CAPABILITY.ANALYTICS_VIEW), true);
  assert.equal(viewerCapabilities.includes(ENTERPRISE_CAPABILITY.MOBILE_ACCESS), false);
  includesOnlyManagement(viewerCapabilities, []);

  const driverCapabilities = getCapabilitiesForUser(driver);
  assert.equal(driverCapabilities.includes(ENTERPRISE_CAPABILITY.MOBILE_ACCESS), true);
  assert.equal(driverCapabilities.includes(ENTERPRISE_CAPABILITY.OPERATIONS_USE), true);
  assert.equal(driverCapabilities.includes(ENTERPRISE_CAPABILITY.RTC_ACCESS), true);
  assert.equal(driverCapabilities.includes(ENTERPRISE_CAPABILITY.PORTAL_ACCESS), false);
  assert.equal(driverCapabilities.includes(ENTERPRISE_CAPABILITY.ANALYTICS_VIEW), false);
  includesOnlyManagement(driverCapabilities, []);

  const invalidCompanyRole = { role: "driver", accountType: "company_owner", organizationId: "tenant-a", userStatus: "active" };
  assert.deepEqual(getCapabilitiesForUser(invalidCompanyRole), []);
  assert.equal(getEffectiveRole(invalidCompanyRole), null);
  assert.equal(hasPermission(invalidCompanyRole, "users.manage"), false);

  const platformIdentity = { role: "platform_owner", accountType: "platform_admin", organizationId: "tenant-a", userStatus: "active" };
  assert.deepEqual(getCapabilitiesForUser(platformIdentity), []);
  assert.equal(hasPermission(platformIdentity, "users.manage"), false);

  const tenantItems = [
    { id: "vehicle-a", organizationId: "tenant-a" },
    { id: "vehicle-b", organizationId: "tenant-a" },
    { id: "vehicle-c", organizationId: "tenant-b" }
  ];
  assert.deepEqual(filterTenantList(companyOwner, tenantItems).map((item) => item.id), ["vehicle-a", "vehicle-b"]);
  assert.deepEqual(filterTenantList(driver, tenantItems).map((item) => item.id), ["vehicle-a"]);
  assert.deepEqual(filterTenantList({ ...driver, vehicleId: null }, tenantItems), []);
  assert.deepEqual(filterTenantList({ ...companyOwner, organizationId: null }, tenantItems), []);

  const missingTenant = runMiddleware(requireOrganization, { user: { role: "owner", accountType: "company_owner" } });
  assert.equal(missingTenant.nextCalled, false);
  assert.equal(missingTenant.res.statusCode, 403);
  assert.equal(missingTenant.res.payload.code, "TENANT_REQUIRED");

  const validTenantRequest = { user: companyOwner };
  const validTenant = runMiddleware(requireOrganization, validTenantRequest);
  assert.equal(validTenant.nextCalled, true);
  assert.equal(validTenantRequest.tenant.organizationId, "tenant-a");

  const deniedCapability = runMiddleware(requirePermission("vehicles.manage"), { user: billingManager });
  assert.equal(deniedCapability.nextCalled, false);
  assert.equal(deniedCapability.res.statusCode, 403);
  assert.equal(deniedCapability.res.payload.code, "CAPABILITY_REQUIRED");
  assert.equal(deniedCapability.res.payload.requiredCapability, "vehicles.manage");

  const allowedLegacyCapability = runMiddleware(requirePermission("canManageBilling"), { user: billingManager });
  assert.equal(allowedLegacyCapability.nextCalled, true);

  assert.deepEqual(getRolesWithPermission("canManageUsers").sort(), ["admin", "owner"]);
  assert.equal(getRolesWithPermission("analytics.view").includes("driver"), false);

  const sanitized = sanitizeUser({
    id: "safe-owner", role: "owner", accountType: "company_owner", organizationId: "tenant-a", userStatus: "active", passwordHash: "secret"
  });
  assert.equal(Object.hasOwn(sanitized, "passwordHash"), false);
  assert.equal(sanitized.accountChannel, "company_portal");
  assert.equal(sanitized.capabilities.includes(ENTERPRISE_CAPABILITY.PORTAL_ACCESS), true);
  assert.equal(sanitized.capabilities.includes(ENTERPRISE_CAPABILITY.MOBILE_ACCESS), true);
  assert.equal(sanitized.capabilities.includes(ENTERPRISE_CAPABILITY.OPERATIONS_USE), true);
  assert.equal(sanitized.capabilities.includes(ENTERPRISE_CAPABILITY.USERS_MANAGE), true);

  const sanitizedDispatcher = sanitizeUser(dispatcher);
  assert.equal(sanitizedDispatcher.accountChannel, "mobile_operations");
  assert.equal(sanitizedDispatcher.capabilities.includes(ENTERPRISE_CAPABILITY.MOBILE_ACCESS), true);
  assert.equal(sanitizedDispatcher.capabilities.includes(ENTERPRISE_CAPABILITY.OPERATIONS_USE), true);
  assert.equal(sanitizedDispatcher.capabilities.includes(ENTERPRISE_CAPABILITY.ANALYTICS_VIEW), true);
  assert.equal(sanitizedDispatcher.capabilities.includes(ENTERPRISE_CAPABILITY.ROUTES_MANAGE), true);
  assert.equal(sanitizedDispatcher.capabilities.includes(ENTERPRISE_CAPABILITY.INCIDENTS_MANAGE), true);
  assert.equal(sanitizedDispatcher.capabilities.includes(ENTERPRISE_CAPABILITY.DOCUMENTS_MANAGE), false);

  console.log("ok - matriz completa de perfiles, tenant y capacidades canónicas falla cerrada");
}

main();
