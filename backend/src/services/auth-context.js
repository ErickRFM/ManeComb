const { canAccessAllTenants, getOrganizationId } = require("../middlewares/access-control");
const {
  buildOnboarding,
  buildSubscription,
  pickActiveOrder
} = require("./portal-account");

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trial", "trial_active"]);
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

function isPastDate(value) {
  if (!value) {
    return false;
  }

  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
}

function getOrderOrganizationId(order) {
  return String(order?.organizationId || order?.organizationSlug || "").trim();
}

function isActiveSubscription(subscription) {
  const expiresAt = subscription?.expiresAt || subscription?.currentPeriodEnd;

  if (subscription?.isActive === true) {
    return !isPastDate(expiresAt);
  }

  if (subscription?.isActive === false && isPastDate(expiresAt)) {
    return false;
  }

  return ACTIVE_SUBSCRIPTION_STATUSES.has(normalizeStatus(subscription?.status)) &&
    !isPastDate(expiresAt);
}

function hasOperationalTenant(user, order) {
  return Boolean(getOrganizationId(user) || getOrderOrganizationId(order));
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

function hasActiveMobileSubscription(subscription) {
  return isActiveSubscription(subscription);
}

function getMobileBlockReason(subscription, tenant) {
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

function resolveMobileAccess(subscription, tenant) {
  const canAccessMobile = hasActiveMobileSubscription(subscription) && isActiveTenant(tenant);

  return {
    canAccessMobile,
    mobileBlockReason: canAccessMobile ? null : getMobileBlockReason(subscription, tenant)
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

  const role = normalizeStatus(user.role);

  const status = normalizeStatus(subscription?.status);
  const hasPlan = Boolean(subscription?.id || subscription?.planId);
  const active = isActiveSubscription(subscription) || options.canUseOperations === true;
  const tenantReady = isActiveTenant(tenant);

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
    destination: "PlanRequired",
    reason: "inactive_subscription",
    route: "/portal/plan"
  };
}

async function buildAuthContext(store, user, options = {}) {
  if (!user) {
    const resolution = resolvePostLoginRoute(null, null, null, null);
    const subscription = buildSubscription(null);
    const mobileAccess = resolveMobileAccess(subscription, null);

    return {
      ...resolution,
      ...mobileAccess,
      canUseOperations: false,
      onboarding: null,
      subscription,
      tenant: null
    };
  }

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
  const mobileAccess = resolveMobileAccess(subscription, tenant);
  const canUseOperations =
    options.canUseOperations === true ||
    mobileAccess.canAccessMobile ||
    canAccessAllTenants(user) ||
    Boolean(options.allowPlatformAdmin === true);
  const resolution = resolvePostLoginRoute(user, subscription, tenant, onboarding, {
    canUseOperations
  });

  return {
    ...resolution,
    ...mobileAccess,
    canUseOperations,
    onboarding,
    source: activeOrder?.source || null,
    subscription,
    tenant
  };
}

module.exports = {
  buildTenantContext,
  buildAuthContext,
  getMobileBlockReason,
  hasOperationalTenant,
  isActiveSubscription,
  isActiveTenant,
  resolveMobileAccess,
  resolvePostLoginRoute
};
