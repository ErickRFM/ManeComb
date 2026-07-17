const path = require("path");

require("dotenv").config({
  path: path.resolve(__dirname, "../.env")
});

const mongoose = require("mongoose");
const { connectDB, getDbState } = require("../src/config/db");
const {
  ActivationKeyModel,
  CommercialLeadModel,
  SessionModel,
  UserModel,
  VehicleModel
} = require("../src/data/models");
const { buildAuthContext } = require("../src/services/auth-context");
const { buildSubscription, pickActiveOrder } = require("../src/services/portal-account");

const ALLOWED_ROLES = new Set([
  "owner",
  "admin",
  "dispatcher",
  "supervisor",
  "billing_manager",
  "support",
  "viewer",
  "driver"
]);

function getArgValue(name) {
  const direct = process.argv.find((entry) => entry.startsWith(`${name}=`));

  if (direct) {
    return direct.slice(name.length + 1);
  }

  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

function toPlain(doc) {
  if (!doc) {
    return null;
  }

  const plain = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  const id = String(plain.id || plain._id || "").trim();

  return {
    ...plain,
    id
  };
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function getOrganizationId(user) {
  return String(user?.organizationId || "").trim();
}

function buildUserSummary(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    accountType: user.accountType,
    source: user.source || null,
    organizationId: getOrganizationId(user),
    onboardingStatus: user.onboardingStatus || null,
    userStatus: user.userStatus || "active",
    lastAccessAt: user.lastAccessAt || null,
    invitedAt: user.invitedAt || null,
    activatedAt: user.activatedAt || null,
    companyProfile: {
      companyName: user.companyProfile?.companyName || "",
      legalName: user.companyProfile?.legalName || "",
      taxId: user.companyProfile?.taxId || ""
    },
    pushSubscriptionCount: Array.isArray(user.pushSubscriptions) ? user.pushSubscriptions.length : 0,
    e2eeBackupCount: Array.isArray(user.e2eeBackups) ? user.e2eeBackups.length : 0
  };
}

function buildOrderSummary(order) {
  const subscription = buildSubscription(order);

  return {
    id: order.id,
    referenceCode: order.referenceCode,
    ownerUserId: order.ownerUserId || null,
    ownerAccountEmail: order.ownerAccountEmail || "",
    email: order.email || "",
    organizationId: order.organizationId || "",
    organizationSlug: order.organizationSlug || "",
    companyName: order.companyName || "",
    planId: order.planId,
    planName: order.planName,
    paymentStatus: order.paymentStatus,
    activationStatus: order.activationStatus,
    onboardingStatus: order.onboardingStatus,
    fleetSetupStatus: order.fleetSetupStatus,
    createdAt: order.createdAt || null,
    activatedAt: order.activatedAt || null,
    trialEndsAt: order.trialEndsAt || null,
    subscription
  };
}

function buildSessionSummary(session) {
  return {
    id: String(session.id || session._id || "").trim(),
    organizationId: session.organizationId || "",
    isActive: Boolean(session.isActive),
    platform: session.platform || "unknown",
    deviceName: session.deviceName || "Sesion",
    createdAt: session.createdAt || null,
    lastSeenAt: session.lastSeenAt || null,
    expiresAt: session.expiresAt || null,
    revokedAt: session.revokedAt || null,
    revokedReason: session.revokedReason || ""
  };
}

function detectInconsistencies({ authContext, ownerCount, orders, tenant, user, vehicleCount }) {
  const issues = [];
  const role = normalize(user?.role);
  const activeSubscription = Boolean(authContext?.subscription?.isActive);
  const canAccessMobile = authContext?.canAccessMobile === true;

  if (!role) {
    issues.push({
      code: "USER_WITHOUT_ROLE",
      severity: "error",
      message: "El usuario no tiene role definido."
    });
  } else if (!ALLOWED_ROLES.has(role)) {
    issues.push({
      code: "UNRECOGNIZED_ROLE",
      severity: "error",
      message: `Role no reconocido: ${user.role}`
    });
  }

  if (user?.accountType === "company_owner" && !orders.length) {
    issues.push({
      code: "SALES_ACCOUNT_WITHOUT_COMMERCIAL_ORDER",
      severity: "warning",
      message: "Cuenta company_owner sin orden comercial asociada."
    });
  }

  if (activeSubscription && !tenant?.id) {
    issues.push({
      code: "ACTIVE_PLAN_WITHOUT_TENANT",
      severity: "error",
      message: "Plan activo sin organizationId/tenant operativo."
    });
  }

  if (tenant?.id && ownerCount === 0) {
    issues.push({
      code: "TENANT_WITHOUT_OWNER",
      severity: "error",
      message: "Hay organizationId pero no existe owner activo en ese tenant."
    });
  }

  if (
    user?.accountType === "company_owner" &&
    activeSubscription &&
    tenant?.id &&
    !canAccessMobile
  ) {
    issues.push({
      code: "ACTIVE_SALES_ACCOUNT_WRONG_ROUTE",
      severity: "error",
      message: `Cuenta company_owner con plan activo no obtuvo acceso movil (${authContext?.mobileBlockReason || "sin razon"}).`
    });
  }

  return issues;
}

async function findCommercialOrdersForUser(user) {
  if (!user?.id && !user?.email) {
    return [];
  }

  const organizationId = getOrganizationId(user);
  const email = normalize(user.email);
  const query = {
    $or: [
      { ownerUserId: user.id || null },
      ...(organizationId ? [{ organizationId }, { organizationSlug: organizationId }] : []),
      ...(email ? [{ ownerAccountEmail: email }, { email }] : [])
    ]
  };
  const orders = await CommercialLeadModel.find(query).sort({ createdAt: -1 }).lean();
  return orders.map(toPlain);
}

async function main() {
  const email = normalize(getArgValue("--email") || process.env.AUTH_DIAG_EMAIL);

  if (!email) {
    console.error("Uso: npm run diagnose:auth -- --email usuario@dominio.com");
    process.exitCode = 1;
    return;
  }

  await connectDB();

  if (!getDbState().connected) {
    throw new Error("MongoDB no esta conectado. Revisa MONGO_URI/MONGO_DB_NAME.");
  }

  const userDoc = await UserModel.findOne({ email }).lean();
  const user = toPlain(userDoc);

  if (!user) {
    console.log(JSON.stringify({
      ok: false,
      email,
      message: "Usuario no encontrado"
    }, null, 2));
    return;
  }

  const orders = await findCommercialOrdersForUser(user);
  const activeOrder = pickActiveOrder(orders);
  const organizationId = getOrganizationId(user) || activeOrder?.organizationId || activeOrder?.organizationSlug || "";
  const [users, activationKeys, sessions, vehicleCount, ownerCount] = await Promise.all([
    organizationId ? UserModel.find({ organizationId }).lean().then((rows) => rows.map(toPlain)) : [],
    organizationId ? ActivationKeyModel.find({ companyId: organizationId }).lean().then((rows) => rows.map(toPlain)) : [],
    SessionModel.find({ userId: user.id }).sort({ lastSeenAt: -1 }).limit(10).lean(),
    organizationId ? VehicleModel.countDocuments({ organizationId }) : 0,
    organizationId ? UserModel.countDocuments({
      organizationId,
      role: "owner",
      userStatus: { $ne: "suspended" }
    }) : 0
  ]);

  const store = {
    listActivationKeysForCompany: async () => activationKeys,
    listCommercialOrdersForUser: async () => orders,
    listUsers: async () => users
  };
  const authContext = await buildAuthContext(store, user);
  const tenant = authContext.tenant;
  const inconsistencies = detectInconsistencies({
    authContext,
    ownerCount,
    orders,
    tenant,
    user,
    vehicleCount
  });

  const report = {
    ok: true,
    inspectedAt: new Date().toISOString(),
    readOnly: true,
    email,
    user: buildUserSummary(user),
    tenant: tenant
      ? {
          ...tenant,
          ownerCount,
          userCount: users.length,
          vehicleCount,
          activationKeyCount: activationKeys.length
        }
      : null,
    activeOrderId: activeOrder?.id || null,
    orders: orders.map(buildOrderSummary),
    authDecision: {
      canAccessMobile: authContext.canAccessMobile,
      destination: authContext.destination,
      mobileBlockReason: authContext.mobileBlockReason,
      route: authContext.route,
      reason: authContext.reason,
      canUseOperations: authContext.canUseOperations
    },
    subscription: authContext.subscription,
    onboarding: authContext.onboarding,
    sessions: sessions.map((session) => buildSessionSummary(toPlain(session))),
    inconsistencies
  };

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      message: error.message
    }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });
