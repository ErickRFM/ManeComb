const { ACCOUNT_CHANNEL, resolveAccountChannel } = require("./account-channel");

const ENTERPRISE_CAPABILITY = Object.freeze({
  PORTAL_ACCESS: "portal.access",
  MOBILE_ACCESS: "mobile.access",
  OPERATIONS_USE: "operations.use",
  TENANT_ACCESS: "tenant.access",
  USERS_MANAGE: "users.manage",
  BILLING_MANAGE: "billing.manage",
  VEHICLES_MANAGE: "vehicles.manage",
  ANALYTICS_VIEW: "analytics.view",
  RTC_ACCESS: "communication.rtc.access",
  ROUTES_MANAGE: "routes.manage",
  DOCUMENTS_MANAGE: "documents.manage",
  INCIDENTS_MANAGE: "incidents.manage"
});

const LEGACY_PERMISSION_ALIASES = Object.freeze({
  canManageUsers: ENTERPRISE_CAPABILITY.USERS_MANAGE,
  canManageBilling: ENTERPRISE_CAPABILITY.BILLING_MANAGE,
  canManageVehicles: ENTERPRISE_CAPABILITY.VEHICLES_MANAGE,
  canViewAnalytics: ENTERPRISE_CAPABILITY.ANALYTICS_VIEW,
  canAccessRTC: ENTERPRISE_CAPABILITY.RTC_ACCESS,
  canManageRoutes: ENTERPRISE_CAPABILITY.ROUTES_MANAGE,
  canManageDocuments: ENTERPRISE_CAPABILITY.DOCUMENTS_MANAGE,
  canManageIncidents: ENTERPRISE_CAPABILITY.INCIDENTS_MANAGE
});

const ALL_DOMAIN_CAPABILITIES = Object.freeze([
  ENTERPRISE_CAPABILITY.USERS_MANAGE,
  ENTERPRISE_CAPABILITY.BILLING_MANAGE,
  ENTERPRISE_CAPABILITY.VEHICLES_MANAGE,
  ENTERPRISE_CAPABILITY.ANALYTICS_VIEW,
  ENTERPRISE_CAPABILITY.RTC_ACCESS,
  ENTERPRISE_CAPABILITY.ROUTES_MANAGE,
  ENTERPRISE_CAPABILITY.DOCUMENTS_MANAGE,
  ENTERPRISE_CAPABILITY.INCIDENTS_MANAGE
]);

function withProduct(productCapability, domainCapabilities) {
  return Object.freeze([
    productCapability,
    ENTERPRISE_CAPABILITY.OPERATIONS_USE,
    ENTERPRISE_CAPABILITY.TENANT_ACCESS,
    ...domainCapabilities
  ]);
}

const CHANNEL_ROLE_CAPABILITIES = Object.freeze({
  [ACCOUNT_CHANNEL.COMPANY_PORTAL]: Object.freeze({
    owner: withProduct(ENTERPRISE_CAPABILITY.PORTAL_ACCESS, ALL_DOMAIN_CAPABILITIES),
    admin: withProduct(ENTERPRISE_CAPABILITY.PORTAL_ACCESS, ALL_DOMAIN_CAPABILITIES),
    billing_manager: withProduct(ENTERPRISE_CAPABILITY.PORTAL_ACCESS, [
      ENTERPRISE_CAPABILITY.BILLING_MANAGE,
      ENTERPRISE_CAPABILITY.ANALYTICS_VIEW
    ]),
    support: withProduct(ENTERPRISE_CAPABILITY.PORTAL_ACCESS, [
      ENTERPRISE_CAPABILITY.ANALYTICS_VIEW,
      ENTERPRISE_CAPABILITY.INCIDENTS_MANAGE
    ]),
    viewer: withProduct(ENTERPRISE_CAPABILITY.PORTAL_ACCESS, [
      ENTERPRISE_CAPABILITY.ANALYTICS_VIEW
    ])
  }),
  [ACCOUNT_CHANNEL.MOBILE_OPERATIONS]: Object.freeze({
    owner: withProduct(ENTERPRISE_CAPABILITY.MOBILE_ACCESS, ALL_DOMAIN_CAPABILITIES),
    admin: withProduct(ENTERPRISE_CAPABILITY.MOBILE_ACCESS, ALL_DOMAIN_CAPABILITIES),
    dispatcher: withProduct(ENTERPRISE_CAPABILITY.MOBILE_ACCESS, [
      ENTERPRISE_CAPABILITY.VEHICLES_MANAGE,
      ENTERPRISE_CAPABILITY.ANALYTICS_VIEW,
      ENTERPRISE_CAPABILITY.RTC_ACCESS,
      ENTERPRISE_CAPABILITY.ROUTES_MANAGE,
      ENTERPRISE_CAPABILITY.INCIDENTS_MANAGE
    ]),
    supervisor: withProduct(ENTERPRISE_CAPABILITY.MOBILE_ACCESS, [
      ENTERPRISE_CAPABILITY.VEHICLES_MANAGE,
      ENTERPRISE_CAPABILITY.ANALYTICS_VIEW,
      ENTERPRISE_CAPABILITY.RTC_ACCESS,
      ENTERPRISE_CAPABILITY.ROUTES_MANAGE,
      ENTERPRISE_CAPABILITY.DOCUMENTS_MANAGE,
      ENTERPRISE_CAPABILITY.INCIDENTS_MANAGE
    ]),
    driver: withProduct(ENTERPRISE_CAPABILITY.MOBILE_ACCESS, [
      ENTERPRISE_CAPABILITY.RTC_ACCESS
    ]),
    conductor: withProduct(ENTERPRISE_CAPABILITY.MOBILE_ACCESS, [
      ENTERPRISE_CAPABILITY.RTC_ACCESS
    ])
  })
});

const CAPABILITY_VALUES = new Set(Object.values(ENTERPRISE_CAPABILITY));

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function resolveCapabilityName(permission) {
  const raw = String(permission || "").trim();
  if (!raw) return null;
  if (LEGACY_PERMISSION_ALIASES[raw]) return LEGACY_PERMISSION_ALIASES[raw];
  return CAPABILITY_VALUES.has(raw) ? raw : null;
}

function getCapabilitiesForUser(user) {
  const accountChannel = resolveAccountChannel(user);
  const role = normalize(user?.role);
  const roleCapabilities = CHANNEL_ROLE_CAPABILITIES[accountChannel.channel]?.[role];
  return roleCapabilities ? [...roleCapabilities] : [];
}

function hasCapability(user, permission) {
  const capability = resolveCapabilityName(permission);
  if (!capability) return false;
  return getCapabilitiesForUser(user).includes(capability);
}

function getRolesWithCapability(permission) {
  const capability = resolveCapabilityName(permission);
  if (!capability) return [];

  const roles = new Set();
  Object.values(CHANNEL_ROLE_CAPABILITIES).forEach((roleMap) => {
    Object.entries(roleMap).forEach(([role, capabilities]) => {
      if (capabilities.includes(capability)) roles.add(role);
    });
  });
  return [...roles];
}

function applyEnterpriseCapabilities(user) {
  if (!user || typeof user !== "object") return user;
  user.capabilities = getCapabilitiesForUser(user);
  return user;
}

module.exports = {
  ALL_DOMAIN_CAPABILITIES,
  CHANNEL_ROLE_CAPABILITIES,
  ENTERPRISE_CAPABILITY,
  LEGACY_PERMISSION_ALIASES,
  applyEnterpriseCapabilities,
  getCapabilitiesForUser,
  getRolesWithCapability,
  hasCapability,
  resolveCapabilityName
};