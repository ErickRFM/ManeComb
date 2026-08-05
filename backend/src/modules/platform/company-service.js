const { getCommercialPlanById } = require("../../config/commercial-plans");
const { sanitizeEnum, sanitizeText } = require("../../utils/platform-filters");
const { parsePagination, buildPaginationMeta } = require("../../utils/platform-pagination");
const { PlatformNotFoundError } = require("../../utils/platform-errors");

const COMPANY_SORTS = ["createdAt", "companyName", "lastAccessAt"];
const PAYMENT_STATUSES = [
  "pending",
  "approved",
  "paid",
  "active",
  "completed",
  "cancelled",
  "refunded",
  "failed",
  "expired"
];
const ONBOARDING_STATUSES = ["pending", "in_progress", "ready", "completed", "blocked"];

function asTimestamp(value) {
  const timestamp = value ? new Date(value).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function asIso(value) {
  const timestamp = asTimestamp(value);
  return timestamp ? new Date(timestamp).toISOString() : null;
}

function normalizeOrganizationId(value) {
  const organizationId = sanitizeText(value, 128);
  if (!organizationId || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(organizationId)) {
    return null;
  }
  return organizationId;
}

function getLatestOrder(orders) {
  return [...orders].sort((left, right) => asTimestamp(right.createdAt) - asTimestamp(left.createdAt))[0] || null;
}

function getOwner(users, latestOrder) {
  if (latestOrder?.ownerUserId) {
    const ownerById = users.find((user) => user.id === latestOrder.ownerUserId);
    if (ownerById) return ownerById;
  }

  return users.find((user) => user.accountType === "company_owner")
    || users.find((user) => user.role === "owner")
    || users.find((user) => user.role === "admin")
    || null;
}

function serializeOwner(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name || "",
    email: user.email || "",
    status: user.userStatus || "active",
    lastAccessAt: asIso(user.lastAccessAt),
    createdAt: asIso(user.createdAt)
  };
}

function serializePlan(order) {
  const configuredPlan = order?.planId ? getCommercialPlanById(order.planId) : null;
  if (!configuredPlan && !order?.planId && !order?.planName) return null;

  return {
    id: configuredPlan?.id || order?.planId || null,
    name: configuredPlan?.name || order?.planName || "Plan no identificado",
    units: Number(configuredPlan?.units || order?.fleetSize || 0),
    price: Number(configuredPlan?.price || order?.basePlanPrice || 0),
    currency: "MXN",
    radioIncluded: Boolean(configuredPlan?.includesRadioModule || order?.radioFeatureEnabled)
  };
}

function summarizeUserStatuses(users) {
  const byStatus = { active: 0, pending: 0, suspended: 0 };
  for (const user of users) {
    const status = ["active", "pending", "suspended"].includes(user.userStatus)
      ? user.userStatus
      : "active";
    byStatus[status] += 1;
  }
  return byStatus;
}

function summarizeVehicleStatuses(vehicles) {
  const byStatus = { on_route: 0, maintenance: 0, idle: 0, retired: 0 };
  for (const vehicle of vehicles) {
    if (vehicle.retiredAt) {
      byStatus.retired += 1;
      continue;
    }

    const status = String(vehicle.status || "idle").trim().toLowerCase();
    if (status === "on-route" || status === "on_route") byStatus.on_route += 1;
    else if (status === "maintenance") byStatus.maintenance += 1;
    else byStatus.idle += 1;
  }
  return byStatus;
}

function buildOrganizationSources(users, orders) {
  const sourceMap = new Map();

  function ensure(organizationId) {
    const normalized = String(organizationId || "").trim();
    if (!normalized) return null;
    if (!sourceMap.has(normalized)) {
      sourceMap.set(normalized, { organizationId: normalized, users: [], orders: [] });
    }
    return sourceMap.get(normalized);
  }

  for (const user of users) {
    const source = ensure(user.organizationId);
    if (source) source.users.push(user);
  }

  for (const order of orders) {
    const source = ensure(order.organizationId);
    if (source) source.orders.push(order);
  }

  return Array.from(sourceMap.values());
}

function buildCompanyBase(source) {
  const latestOrder = getLatestOrder(source.orders);
  const owner = getOwner(source.users, latestOrder);
  const lastAccessAt = source.users.reduce((latest, user) => {
    return asTimestamp(user.lastAccessAt) > asTimestamp(latest) ? user.lastAccessAt : latest;
  }, null);
  const companyName = String(
    latestOrder?.companyName
      || owner?.companyProfile?.companyName
      || owner?.name
      || source.organizationId
  ).trim();

  return {
    organizationId: source.organizationId,
    companyName,
    organizationSlug: latestOrder?.organizationSlug || source.organizationId,
    createdAt: asIso(latestOrder?.createdAt || owner?.createdAt),
    lastAccessAt: asIso(lastAccessAt),
    owner: serializeOwner(owner),
    plan: serializePlan(latestOrder),
    userCount: source.users.length,
    userStatuses: summarizeUserStatuses(source.users),
    commercial: {
      orderId: latestOrder?.id || null,
      accountStatus: latestOrder?.accountStatus || null,
      status: latestOrder?.status || null,
      paymentStatus: latestOrder?.paymentStatus || null,
      activationStatus: latestOrder?.activationStatus || null,
      onboardingStatus: latestOrder?.onboardingStatus || null,
      trialStatus: latestOrder?.trialStatus || null,
      currentPeriodEnd: asIso(latestOrder?.currentPeriodEnd),
      paidUntil: asIso(latestOrder?.paidUntil),
      nextBillingAt: asIso(latestOrder?.nextBillingAt),
      cancelAtPeriodEnd: Boolean(latestOrder?.cancelAtPeriodEnd)
    },
    billing: {
      paymentMethod: latestOrder?.paymentMethod || null,
      provider: latestOrder?.paymentProvider || null,
      totalPrice: Number(latestOrder?.totalPrice || 0),
      currency: "MXN",
      financialStatus: latestOrder?.financialStatus || null,
      refundableAmountMinor: Number(latestOrder?.refundableAmountMinor || 0),
      chargebackStatus: latestOrder?.chargebackStatus || null
    },
    source
  };
}

async function hydrateCompany(store, base, { includeDetails = false } = {}) {
  const vehicles = await Promise.resolve(
    store.listVehiclesForOrganization(base.organizationId, { includeRetired: true })
  );
  const vehicleStatuses = summarizeVehicleStatuses(vehicles);
  const activeVehicleCount = vehicles.length - vehicleStatuses.retired;

  const common = {
    organizationId: base.organizationId,
    companyName: base.companyName,
    organizationSlug: base.organizationSlug,
    createdAt: base.createdAt,
    lastAccessAt: base.lastAccessAt,
    owner: base.owner,
    plan: base.plan,
    commercial: base.commercial,
    billing: base.billing,
    users: {
      total: base.userCount,
      byStatus: base.userStatuses
    },
    vehicles: {
      total: vehicles.length,
      active: activeVehicleCount,
      byStatus: vehicleStatuses
    },
    operationalStatus: vehicleStatuses.maintenance > 0
      ? "attention"
      : activeVehicleCount > 0
        ? "operational"
        : "inactive"
  };

  if (!includeDetails) return common;

  const users = [...base.source.users]
    .sort((left, right) => asTimestamp(right.lastAccessAt) - asTimestamp(left.lastAccessAt))
    .map((user) => ({
      id: user.id,
      name: user.name || "",
      email: user.email || "",
      role: user.role || "",
      accountType: user.accountType || "operations",
      status: user.userStatus || "active",
      lastAccessAt: asIso(user.lastAccessAt),
      createdAt: asIso(user.createdAt)
    }));

  const vehicleItems = [...vehicles]
    .sort((left, right) => asTimestamp(right.updatedAt) - asTimestamp(left.updatedAt))
    .map((vehicle) => ({
      id: vehicle.id,
      code: vehicle.code || "",
      plate: vehicle.plate || "",
      status: vehicle.status || "idle",
      driverId: vehicle.driverId || null,
      routeId: vehicle.routeId || null,
      retiredAt: asIso(vehicle.retiredAt),
      updatedAt: asIso(vehicle.updatedAt)
    }));

  return {
    ...common,
    users: {
      ...common.users,
      items: users.slice(0, 50),
      truncated: users.length > 50
    },
    vehicles: {
      ...common.vehicles,
      items: vehicleItems.slice(0, 50),
      truncated: vehicleItems.length > 50
    },
    commercialHistory: {
      totalOrders: base.source.orders.length,
      firstOrderAt: asIso(
        [...base.source.orders].sort((left, right) => asTimestamp(left.createdAt) - asTimestamp(right.createdAt))[0]?.createdAt
      ),
      latestOrderAt: asIso(getLatestOrder(base.source.orders)?.createdAt)
    }
  };
}

function filterCompanies(companies, query) {
  const search = sanitizeText(query.search || query.q, 100).toLowerCase();
  const planId = sanitizeText(query.planId, 80);
  const paymentStatus = sanitizeEnum(query.paymentStatus, PAYMENT_STATUSES);
  const onboardingStatus = sanitizeEnum(query.onboardingStatus, ONBOARDING_STATUSES);

  return companies.filter((company) => {
    if (search) {
      const haystack = [
        company.organizationId,
        company.companyName,
        company.owner?.name,
        company.owner?.email
      ].filter(Boolean).join(" ").toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    if (planId && company.plan?.id !== planId) return false;
    if (paymentStatus && company.commercial.paymentStatus !== paymentStatus) return false;
    if (onboardingStatus && company.commercial.onboardingStatus !== onboardingStatus) return false;
    return true;
  });
}

function sortCompanies(companies, { sort, order }) {
  const direction = order === "asc" ? 1 : -1;
  return [...companies].sort((left, right) => {
    if (sort === "companyName") {
      return left.companyName.localeCompare(right.companyName, "es", { sensitivity: "base" }) * direction;
    }
    if (sort === "lastAccessAt") {
      return (asTimestamp(left.lastAccessAt) - asTimestamp(right.lastAccessAt)) * direction;
    }
    return (asTimestamp(left.createdAt) - asTimestamp(right.createdAt)) * direction;
  });
}

async function loadCompanySources(store) {
  const [users, orders] = await Promise.all([
    Promise.resolve(store.listUsers(null)),
    Promise.resolve(store.listCommercialOrders())
  ]);
  return buildOrganizationSources(users || [], orders || []);
}

async function listPlatformCompanies(store, query = {}) {
  const pagination = parsePagination(query, COMPANY_SORTS);
  const sources = await loadCompanySources(store);
  const bases = sources.map(buildCompanyBase);
  const filtered = filterCompanies(bases, query);
  const sorted = sortCompanies(filtered, pagination);
  const pageItems = sorted.slice(pagination.skip, pagination.skip + pagination.limit);
  const items = await Promise.all(pageItems.map((company) => hydrateCompany(store, company)));

  return {
    items,
    pagination: buildPaginationMeta(filtered.length, pagination.page, pagination.limit),
    filters: {
      search: sanitizeText(query.search || query.q, 100),
      planId: sanitizeText(query.planId, 80) || null,
      paymentStatus: sanitizeEnum(query.paymentStatus, PAYMENT_STATUSES),
      onboardingStatus: sanitizeEnum(query.onboardingStatus, ONBOARDING_STATUSES),
      sort: pagination.sort,
      order: pagination.order
    }
  };
}

async function getPlatformCompany(store, rawOrganizationId) {
  const organizationId = normalizeOrganizationId(rawOrganizationId);
  if (!organizationId) {
    throw new PlatformNotFoundError("Empresa no encontrada");
  }

  const sources = await loadCompanySources(store);
  const source = sources.find((entry) => entry.organizationId === organizationId);
  if (!source) {
    throw new PlatformNotFoundError("Empresa no encontrada");
  }

  return hydrateCompany(store, buildCompanyBase(source), { includeDetails: true });
}

module.exports = {
  COMPANY_SORTS,
  PAYMENT_STATUSES,
  ONBOARDING_STATUSES,
  normalizeOrganizationId,
  buildOrganizationSources,
  buildCompanyBase,
  listPlatformCompanies,
  getPlatformCompany
};
