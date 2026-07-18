const { enrichCommercialOrder } = require("./commercial-profile");

function toIso(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function getOrganizationId(user) {
  return String(user?.organizationId || "").trim();
}

function isPastDate(value) {
  if (!value) {
    return false;
  }

  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
}

function getActivationKeyStatus(activationKey) {
  const status = String(activationKey?.status || "available").trim() || "available";

  if (status === "available" && isPastDate(activationKey?.expiresAt)) {
    return "expired";
  }

  return status;
}

function getSubscriptionStatus(order) {
  if (!order) {
    return "inactive";
  }

  const activationStatus = String(order.activationStatus || "").trim().toLowerCase();
  const paymentStatus = String(order.paymentStatus || "").trim().toLowerCase();
  const orderStatus = String(order.status || "").trim().toLowerCase();
  const declaredStatuses = new Set([activationStatus, paymentStatus, orderStatus].filter(Boolean));

  if (declaredStatuses.has("cancelled") || declaredStatuses.has("canceled")) {
    return "cancelled";
  }

  if (declaredStatuses.has("suspended")) return "suspended";
  if (declaredStatuses.has("expired")) return "expired";
  if (declaredStatuses.has("past_due")) return "past_due";

  if (activationStatus === "active" || paymentStatus === "paid" || paymentStatus === "paid_test") {
    return "active";
  }

  if (paymentStatus === "trial_active") {
    return "trial";
  }

  return paymentStatus || activationStatus || "pending";
}

function pickActiveOrder(orders = []) {
  const sorted = [...orders].sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));

  return (
    sorted.find((order) => order.activationStatus === "active") ||
    sorted.find((order) => ["paid", "paid_test", "trial_active"].includes(order.paymentStatus)) ||
    sorted.find((order) => order.status === "active" || order.status === "paid") ||
    sorted[0] ||
    null
  );
}

function buildSubscription(order) {
  if (!order) {
    return {
      id: null,
      planId: null,
      planName: "Sin plan",
      status: "inactive",
      isActive: false,
      activeUnits: 0,
      availableUnits: 0,
      totalUnits: 0,
      unitsLimit: 0,
      monthlyPrice: 0,
      currency: "MXN",
      currentPeriodStart: null,
      currentPeriodEnd: null,
      expiresAt: null,
      cancelAt: null
    };
  }

  const totalUnits = Number(order.fleetSize || 0);
  const activeUnits = Array.isArray(order.starterFleet)
    ? order.starterFleet.filter((entry) => entry.status === "active").length
    : 0;
  const sourceStatus = getSubscriptionStatus(order);
  const expiresAt = sourceStatus === "trial"
    ? toIso(order.trialEndsAt || order.currentPeriodEnd || order.paidUntil)
    : toIso(order.currentPeriodEnd || order.paidUntil);
  const status = ["active", "trial", "trial_active"].includes(sourceStatus) && isPastDate(expiresAt)
    ? "expired"
    : sourceStatus;
  const isActive =
    ["active", "trial", "trial_active"].includes(status) && !isPastDate(expiresAt);

  return {
    id: order.id,
    planId: order.planId,
    planName: order.planName,
    status,
    isActive,
    activeUnits,
    availableUnits: Math.max(0, totalUnits - activeUnits),
    totalUnits,
    unitsLimit: totalUnits,
    monthlyPrice: Number(order.totalPrice || order.basePlanPrice || 0),
    currency: "MXN",
    currentPeriodStart: status === "trial"
      ? toIso(order.trialStartedAt || order.createdAt)
      : toIso(order.currentPeriodStart || order.paymentApprovedAt || order.createdAt),
    currentPeriodEnd: expiresAt,
    expiresAt,
    cancelAt: toIso(order.cancelAt)
  };
}

function buildActivationTimeline(user, order, users = []) {
  const invitedUsers = users.filter((entry) => entry.id !== user?.id);
  const firstOperationalLogin = invitedUsers
    .filter((entry) => entry.lastAccessAt)
    .sort((left, right) => new Date(left.lastAccessAt) - new Date(right.lastAccessAt))[0];

  return [
    {
      id: "account-created",
      title: "Cuenta creada",
      status: user ? "completed" : "pending",
      at: toIso(user?.invitedAt || user?.createdAt || order?.createdAt),
      description: "La cuenta ya puede acceder al portal."
    },
    {
      id: "payment-confirmed",
      title: "Pago confirmado",
      status: ["paid", "paid_test", "trial_active"].includes(String(order?.paymentStatus || ""))
        ? "completed"
        : "pending",
      at: toIso(order?.paymentApprovedAt || order?.trialStartedAt),
      description: "Confirmacion comercial y fiscal."
    },
    {
      id: "plan-active",
      title: "Plan activo",
      status: order?.activationStatus === "active" ? "completed" : "pending",
      at: toIso(order?.activatedAt),
      description: "La suscripcion esta lista para operar."
    },
    {
      id: "users-invited",
      title: "Usuarios invitados",
      status: invitedUsers.length ? "completed" : "pending",
      at: toIso(invitedUsers[0]?.invitedAt),
      description: `${invitedUsers.length} usuarios operativos registrados.`
    },
    {
      id: "first-operational-login",
      title: "Primer login operativo",
      status: firstOperationalLogin ? "completed" : "pending",
      at: toIso(firstOperationalLogin?.lastAccessAt),
      description: firstOperationalLogin
        ? `${firstOperationalLogin.name} ingreso por primera vez.`
        : "Esperando primer acceso de chofer o supervisor."
    }
  ];
}

function getDefaultOnboardingSteps({ user, order, users, vehicles = [], activationKeys = [] }) {
  const subscription = buildSubscription(order);
  const teamUsers = users.filter((entry) => entry.id !== user?.id);
  const drivers = teamUsers.filter((entry) => String(entry.role || "") === "driver");
  const activeDrivers = drivers.filter((entry) => String(entry.userStatus || "active") !== "suspended");
  const assignedUnits = activeDrivers.filter((entry) => entry.vehicleId).length;
  const registeredUnits = vehicles.length;
  const generatedKeys = activationKeys.length;
  const availableKeys = activationKeys.filter((entry) => getActivationKeyStatus(entry) === "available").length;
  const usedKeys = activationKeys.filter((entry) => getActivationKeyStatus(entry) === "used").length;
  const hasPaymentProfile = Boolean(
    user?.paymentProfile?.preferredMethod ||
      user?.paymentProfile?.cardLast4 ||
      ["paid", "paid_test", "trial_active"].includes(String(order?.paymentStatus || ""))
  );

  return [
    {
      id: "company-profile",
      title: "Empresa",
      status: user?.accountType === "company_owner" || user?.companyProfile?.companyName ? "completed" : "pending",
      description: "Perfil empresarial, contacto fiscal y responsable de cuenta."
    },
    {
      id: "plan-active",
      title: "Plan activo",
      status: order?.activationStatus === "active" ? "completed" : "pending",
      description: `${subscription.planName || "Sin plan"} · ${subscription.totalUnits} combis.`
    },
    {
      id: "payment",
      title: "Pago",
      status: hasPaymentProfile ? "completed" : "pending",
      description: ["paid", "paid_test", "trial_active"].includes(String(order?.paymentStatus || ""))
        ? "Pago confirmado o prueba activa."
        : "Pago pendiente de confirmación."
    },
    {
      id: "activation-keys",
      title: "Keys de activación",
      status: generatedKeys > 0 ? "completed" : "pending",
      description: `${generatedKeys} generadas, ${availableKeys} disponibles y ${usedKeys} usadas.`
    },
    {
      id: "activated-drivers",
      title: "Conductores activados",
      status: activeDrivers.length > 0 ? "completed" : "pending",
      description: `${activeDrivers.length}/${subscription.totalUnits} conductores vinculados.`
    },
    {
      id: "register-units",
      title: "Unidades/combis",
      status: registeredUnits > 0 ? "completed" : "pending",
      description: `${registeredUnits}/${subscription.totalUnits} unidades registradas.`
    },
    {
      id: "gps-radio",
      title: "GPS / Radio",
      status: assignedUnits > 0 && order?.activationStatus === "active" ? "completed" : "pending",
      description: order?.radioFeatureEnabled
        ? "GPS y radio operativo listos para conductores."
        : "GPS listo; radio disponible como modulo adicional."
    }
  ];
}

function buildOnboarding({ user, order, users = [], vehicles = [], activationKeys = [] }) {
  const steps = getDefaultOnboardingSteps({ user, order, users, vehicles, activationKeys });

  return {
    status: steps.every((step) => step.status === "completed") ? "completed" : "pending",
    steps
  };
}

function buildInvoices(orders = []) {
  return orders
    .filter((order) => order.invoiceSummary)
    .map((order) => {
      const invoice = order.invoiceSummary;
      const download = (order.downloads || []).find((asset) => asset.code === "invoice-summary");

      return {
        id: invoice.invoiceNumber || `FAC-${order.referenceCode}`,
        orderId: order.id,
        referenceCode: order.referenceCode,
        label: invoice.label,
        status: invoice.status,
        total: invoice.total,
        currency: invoice.currency || "MXN",
        issuedAt: toIso(invoice.issuedAt || order.createdAt),
        downloadUrl: download?.urlPath || null
      };
    });
}

function buildPortalOverview({ user, orders = [], users = [], activationKeys = [] }) {
  const activeOrder = pickActiveOrder(orders);
  const subscription = buildSubscription(activeOrder);

  return {
    organization: {
      id: getOrganizationId(user),
      name: user?.companyProfile?.companyName || activeOrder?.companyName || user?.name || "Cuenta",
      taxId: user?.companyProfile?.taxId || activeOrder?.billingProfile?.taxId || "",
      fleetSize: subscription.totalUnits,
      status: user?.userStatus || "active"
    },
    account: {
      id: user?.id,
      name: user?.name,
      email: user?.email,
      role: user?.role,
      accountType: user?.accountType,
      userStatus: user?.userStatus || "active",
      lastAccessAt: toIso(user?.lastAccessAt)
    },
    subscription,
    metrics: {
      activeUsers: users.filter((entry) => entry.userStatus !== "suspended").length,
      pendingUsers: users.filter((entry) => entry.userStatus === "pending").length,
      suspendedUsers: users.filter((entry) => entry.userStatus === "suspended").length,
      activeUnits: subscription.activeUnits,
      availableUnits: subscription.availableUnits
    },
    activationTimeline: buildActivationTimeline(user, activeOrder, users),
    onboarding: buildOnboarding({ user, order: activeOrder, users, activationKeys }),
    latestOrder: activeOrder || null
  };
}

function enrichOrdersForUser(orders, user) {
  return orders.map((order) => enrichCommercialOrder(order, { user }));
}

module.exports = {
  buildInvoices,
  buildOnboarding,
  buildPortalOverview,
  buildSubscription,
  enrichOrdersForUser,
  getOrganizationId,
  pickActiveOrder
};
