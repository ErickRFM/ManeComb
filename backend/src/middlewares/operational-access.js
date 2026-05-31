const {
  canAccessAllTenants,
  getOrganizationId
} = require("./access-control");

function getOrderOrganizationId(order) {
  return String(order?.organizationId || order?.organizationSlug || "").trim();
}

function isPastDate(value) {
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
}

function isActiveOperationalOrder(order) {
  if (!order) {
    return false;
  }

  const activationStatus = String(order.activationStatus || "").trim();
  const paymentStatus = String(order.paymentStatus || "").trim();
  const paidUntil = order.paidUntil || order.currentPeriodEnd || order.trialEndsAt;

  return (
    activationStatus === "active" &&
    ["paid", "trial_active"].includes(paymentStatus) &&
    !["cancelled", "expired"].includes(String(order.status || "").trim()) &&
    !isPastDate(paidUntil)
  );
}

async function canUseOperationalFeatures(store, user) {
  if (!user || String(user.userStatus || "active").trim() !== "active") {
    return false;
  }

  if (canAccessAllTenants(user)) {
    return true;
  }

  const organizationId = getOrganizationId(user);

  if (!organizationId || !store?.listCommercialOrdersForUser) {
    return false;
  }

  const orders = await store.listCommercialOrdersForUser(user);

  return orders.some(
    (order) =>
      getOrderOrganizationId(order) === organizationId &&
      isActiveOperationalOrder(order)
  );
}

async function requireOperationalAccess(req, res, next) {
  try {
    if (await canUseOperationalFeatures(req.app.locals.store, req.user)) {
      return next();
    }

    return res.status(403).json({
      ok: false,
      code: "PLAN_REQUIRED",
      message: "Necesitas un plan activo para acceder al panel operativo"
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  canUseOperationalFeatures,
  getOrderOrganizationId,
  isActiveOperationalOrder,
  requireOperationalAccess
};
