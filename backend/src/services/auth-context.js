const { canAccessAllTenants, getOrganizationId } = require("../middlewares/access-control");
const {
  ACCOUNT_CHANNEL,
  applyAccountChannel,
  resolveAccountChannel
} = require("./account-channel");
const {
  ENTERPRISE_CAPABILITY,
  hasCapability
} = require("./enterprise-capabilities");
const {
  buildOnboarding,
  buildSubscription,
  pickActiveOrder
} = require("./portal-account");

const PAYMENT_PENDING_STATUSES = new Set([
  "pending",
  "pending_payment",
  "payment_pending",
  "unpaid",
  "requires_payment"
]);
const INACTIVE_SUBSCRIPTION_STATUSES = new Set([
  "cancelled",
  "canceled",
  "expired",
  "inactive",
  "past_due",
  "suspended"
]);
const INACTIVE_TENANT_STATUSES = new Set([
  "cancelled",
  "canceled",
  "disabled",
  "inactive",
  "suspended"
]);

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function getOrderOrganizationId(order) {
  return String(order?.organizationId || order?.organizationSlug || "").trim();
}

function isActiveSubscription(subscription) {
  return subscription?.isActive === true;
}

function getTenantStatus(user, order, subscription) {
  const explicitStatus = normalizeStatus(
    user?.tenantStatus ||
      user?.organizationStatus ||
      user?.companyStatus ||
      order?.tenantStatus ||
      order?.organizationStatus ||
      order?.companyStatus
  );

  if (INACTIVE_TENANT_STATUSES.has(explicitStatus)) {
    return explicitStatus;
  }

  if (normalizeStatus(user?.userStatus) === "suspended") {
    return "suspended";
  }

  return isActiveSubscription(subscription) ? "active" : explicitStatus || "registered";
}

function buildTenantContext(user, order, subscription) {
  const id = getOrganizationId(user) || getOrderOrganizationId(order);

  if (!id) {
    return null;
  }

  const active = isActiveSubscription(subscription);
  const status = getTenantStatus(user, order, subscription);

  return {
    id,
    organizationId: id,
    companyId: id,
    name: user?.companyProfile?.companyName || order?.companyName || user?.name || "Cuenta",
    status,
    isOperational: active && status === "active"
  };
}

function isActiveTenant(tenant) {
  return normalizeStatus(tenant?.status) === "active";
}

function getSubscriptionBlockReason(subscription, tenant) {
  const status = normalizeStatus(subscription?.status);
  const hasPlan = Boolean(subscription?.id || subscription?.planId);
  const activeSubscription = isActiveSubscription(subscription);

  if (!hasPlan && !activeSubscription) {
    return "no_plan";
  }

  if (PAYMENT_PENDING_STATUSES.has(status)) {
    return "payment_pending";
  }

  if (activeSubscription && !isActiveTenant(tenant)) {
    return "missing_tenant";
  }

  if (
    INACTIVE_SUBSCRIPTION_STATUSES.has(status) ||
    (hasPlan && !activeSubscription)
  ) {
    return "inactive_plan";
  }

  return "sync_error";
}

function getMobileBlockReason(subscription, tenant, accountChannel = null, options = {}) {
  const channel = accountChannel?.channel || accountChannel;
  const canUseMobileProduct =
    options.canUseMobileProduct ?? channel === ACCOUNT_CHANNEL.MOBILE_OPERATIONS;

  if (channel === ACCOUNT_CHANNEL.BLOCKED) {
    return "account_blocked";
  }

  if (channel === ACCOUNT_CHANNEL.PLATFORM_ADMIN || !canUseMobileProduct) {
    return "wrong_channel";
  }

  return getSubscriptionBlockReason(subscription, tenant);
}

function getOperationalBlockReason(subscription, tenant, accountChannel = null) {
  const channel = accountChannel?.channel || accountChannel;

  if (channel === ACCOUNT_CHANNEL.BLOCKED) {
    return "account_blocked";
  }

  if (channel === ACCOUNT_CHANNEL.PLATFORM_ADMIN) {
    return "wrong_channel";
  }

  return getSubscriptionBlockReason(subscription, tenant);
}

function resolveMobileAccess(subscription, tenant, accountChannel, options = {}) {
  const channel = accountChannel?.channel || accountChannel;
  const canUseMobileProduct =
    options.canUseMobileProduct ?? channel === ACCOUNT_CHANNEL.MOBILE_OPERATIONS;
  const operationalOverride = options.allowOperationalOverride === true;
  const canAccessMobile =
    canUseMobileProduct &&
    (operationalOverride || (isActiveSubscription(subscription) && isActiveTenant(tenant)));

  return {
    canAccessMobile,
    mobileBlockReason: canAccessMobile
      ? null
      : getMobileBlockReason(subscription, tenant, accountChannel, { canUseMobileProduct })
  };
}

function resolvePostLoginRoute(user, subscription, tenant, onboarding, options = {}) {
  if (!user) {
    return {
      destination: "Login",
      reason: "missing_user",
      route: "/login"
    };
  }

  const accountChannel = options.accountChannel || resolveAccountChannel(user);
  const channel = accountChannel.channel;
  const role = normalizeStatus(user.role);
  const status = normalizeStatus(subscription?.status);
  const hasPlan = Boolean(subscription?.id || subscription?.planId);
  const active = isActiveSubscription(subscription) || options.canUseOperations === true;
  const tenantReady = isActiveTenant(tenant);

  if (channel === ACCOUNT_CHANNEL.BLOCKED) {
    return {
      destination: "AccessBlocked",
      reason: accountChannel.reason,
      route: "/access-blocked"
    };
  }

  if (channel === ACCOUNT_CHANNEL.PLATFORM_ADMIN) {
    return {
      destination: "PlatformAdmin",
      reason: accountChannel.reason,
      route: "/platform"
    };
  }

  if (channel === ACCOUNT_CHANNEL.COMPANY_PORTAL) {
    if (!hasPlan && !active) {
      return {
        destination: "PlanRequired",
        reason: "missing_subscription",
        route: "/portal/plan"
      };
    }

    if (PAYMENT_PENDING_STATUSES.has(status)) {
      return {
        destination: "PaymentPending",
        reason: "payment_pending",
        route: "/portal/pagos"
      };
    }

    if (active && !tenantReady) {
      return {
        destination: "OperationalOnboarding",
        reason: "missing_operational_tenant",
        route: "/portal/onboarding"
      };
    }

    if (active) {
      return {
        destination: "CompanyPortal",
        reason: "company_portal",
        route: "/portal"
      };
    }

    return {
      destination: "PlanRequired",
      reason: "inactive_subscription",
      route: "/portal/plan"
    };
  }

  if (!hasPlan && !active) {
    return {
      destination: "PlanBlocked",
      reason: "missing_subscription",
      route: "/plan-blocked"
    };
  }

  if (PAYMENT_PENDING_STATUSES.has(status)) {
    return {
      destination: "PlanBlocked",
      reason: "payment_pending",
      route: "/plan-blocked"
    };
  }

  if (active && !tenantReady) {
    return {
      destination: "PlanBlocked",
      reason: "missing_operational_tenant",
      route: "/plan-blocked"
    };
  }

  if (active && (role === "driver" || role === "conductor")) {
    return {
      destination: "HomeConductor",
      reason: "driver_role",
      route: "/mapa"
    };
  }

  if (active) {
    return {
      destination: "HomeOperativo",
      reason: "active_plan_and_tenant",
      route: "/mapa"
    };
  }

  return {
    destination: "PlanBlocked",
    reason: "inactive_subscription",
    route: "/plan-blocked"
  };
}

async function buildAuthContext(store, user, options = {}) {
  if (!user) {
    const accountChannel = resolveAccountChannel(null);
    const resolution = resolvePostLoginRoute(null, null, null, null, { accountChannel });
    const subscription = buildSubscription(null);
    const mobileAccess = resolveMobileAccess(subscription, null, accountChannel, {
      canUseMobileProduct: false
    });

    return {
      ...resolution,
      ...mobileAccess,
      accountChannel: accountChannel.channel,
      accountChannelReason: accountChannel.reason,
      canAccessPortal: false,
      canUseOperations: false,
      onboarding: null,
      operationalBlockReason: "missing_user",
      productDestination: resolution.destination,
      productRoute: resolution.route,
      subscription,
      tenant: null
    };
  }

  applyAccountChannel(user);
  const accountChannel = resolveAccountChannel(user);
  const orders = store?.listCommercialOrdersForUser
    ? await store.listCommercialOrdersForUser(user)
    : [];
  const activeOrder = pickActiveOrder(orders);
  const subscription = buildSubscription(activeOrder);
  const tenant = buildTenantContext(user, activeOrder, subscription);
  const organizationId = tenant?.id || getOrganizationId(user);
  const users = store?.listUsers && organizationId
    ? await Promise.resolve(store.listUsers(user)).catch(() => [])
    : [];
  const activationKeys =
    store?.listActivationKeysForCompany && organizationId
      ? await Promise.resolve(store.listActivationKeysForCompany(organizationId)).catch(() => [])
      : [];
  const onboarding = activeOrder
    ? buildOnboarding({
        activationKeys,
        order: activeOrder,
        user,
        users
      })
    : null;
  const operationalOverride =
    canAccessAllTenants(user) || Boolean(options.allowPlatformAdmin === true);
  const canUseMobileProduct = hasCapability(user, ENTERPRISE_CAPABILITY.MOBILE_ACCESS);
  const mobileAccess = resolveMobileAccess(subscription, tenant, accountChannel, {
    allowOperationalOverride: operationalOverride,
    canUseMobileProduct
  });
  const activeTenantAccess =
    isActiveSubscription(subscription) &&
    isActiveTenant(tenant) &&
    (accountChannel.channel === ACCOUNT_CHANNEL.COMPANY_PORTAL ||
      accountChannel.channel === ACCOUNT_CHANNEL.MOBILE_OPERATIONS);
  const canUseOperations =
    options.canUseOperations === true ||
    activeTenantAccess ||
    operationalOverride;
  const resolution = resolvePostLoginRoute(user, subscription, tenant, onboarding, {
    accountChannel,
    canUseOperations
  });

  return {
    ...resolution,
    ...mobileAccess,
    accountChannel: accountChannel.channel,
    accountChannelReason: accountChannel.reason,
    canAccessPortal: accountChannel.canAccessPortal,
    canUseOperations,
    onboarding,
    operationalBlockReason: canUseOperations
      ? null
      : getOperationalBlockReason(subscription, tenant, accountChannel),
    productDestination: resolution.destination,
    productRoute: resolution.route,
    source: activeOrder?.source || null,
    subscription,
    tenant
  };
}

module.exports = {
  buildTenantContext,
  buildAuthContext,
  getMobileBlockReason,
  getOperationalBlockReason,
  getSubscriptionBlockReason,
  isActiveSubscription,
  isActiveTenant,
  resolveMobileAccess,
  resolvePostLoginRoute
};