const { randomBytes, randomUUID } = require("crypto");
const { validatePasswordStrength } = require("../utils/password-policy");
const { pickActiveOrder } = require("./portal-account");

const DEFAULT_KEY_TTL_DAYS = 14;

const ACTIVATION_ERRORS = {
  keyNotFound: "La key de activación no existe.",
  keyUsed: "Esta key ya fue usada.",
  keyRevoked: "Esta key fue revocada.",
  keyExpired: "Esta key está vencida.",
  planInactive: "El plan de la empresa no está activo.",
  limitReached: "Ya se alcanzó el límite de conductores del plan.",
  activationFailed: "No se pudo activar la cuenta. Intenta nuevamente."
};

class ActivationKeyError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "ActivationKeyError";
    this.statusCode = statusCode;
  }
}

function toIso(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeActivationKey(value) {
  return String(value || "").trim().replace(/\s+/g, "").toUpperCase();
}

function isPastDate(value) {
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
}

function getEffectiveKeyStatus(activationKey) {
  const status = String(activationKey?.status || "available").trim() || "available";

  if (status === "available" && isPastDate(activationKey?.expiresAt)) {
    return "expired";
  }

  return status;
}

function presentDriver(driver) {
  if (!driver) {
    return null;
  }

  return {
    id: driver.id,
    name: driver.name,
    email: driver.email,
    phone: driver.phone,
    vehicleId: driver.vehicleId || null,
    status: driver.userStatus || driver.status || "active"
  };
}

function presentActivationKey(activationKey, users = []) {
  if (!activationKey) {
    return null;
  }

  const usedByDriverId = activationKey.usedByDriverId || null;
  const driver = usedByDriverId
    ? users.find((entry) => entry.id === usedByDriverId) || null
    : null;

  return {
    id: activationKey.id,
    key: activationKey.key,
    companyId: activationKey.companyId,
    adminId: activationKey.adminId,
    planId: activationKey.planId,
    orderId: activationKey.orderId || null,
    status: getEffectiveKeyStatus(activationKey),
    usedByDriverId,
    driver: presentDriver(driver),
    expiresAt: toIso(activationKey.expiresAt),
    usedAt: toIso(activationKey.usedAt),
    createdAt: toIso(activationKey.createdAt)
  };
}

function getActiveDrivers(users = []) {
  return users.filter(
    (entry) =>
      String(entry.role || "") === "driver" &&
      String(entry.userStatus || "active") !== "suspended"
  );
}

function getPlanLimit(order) {
  return Math.max(0, Number(order?.fleetSize || order?.maxDrivers || order?.maxUnits || 0));
}

function getPlanPaidUntil(order) {
  return toIso(order?.paidUntil || order?.currentPeriodEnd || order?.trialEndsAt || null);
}

function isOrderPaid(order) {
  return ["paid", "trial_active"].includes(String(order?.paymentStatus || "").trim());
}

function isPlanExpired(order) {
  const paidUntil = getPlanPaidUntil(order);

  if (paidUntil && isPastDate(paidUntil)) {
    return true;
  }

  return String(order?.status || "").trim() === "cancelled" || String(order?.activationStatus || "").trim() === "cancelled";
}

function assertPlanCanActivate(order) {
  if (!order || String(order.activationStatus || "").trim() !== "active" || !isOrderPaid(order) || isPlanExpired(order)) {
    throw new ActivationKeyError(ACTIVATION_ERRORS.planInactive, 403);
  }
}

function assertActivationKeyMatchesOrder(activationKey, order) {
  const keyCompanyId = String(activationKey?.companyId || "").trim();
  const orderCompanyId = String(order?.organizationId || order?.organizationSlug || "").trim();
  const keyPlanId = String(activationKey?.planId || "").trim();
  const orderPlanId = String(order?.planId || "").trim();

  if (!keyCompanyId || !orderCompanyId || keyCompanyId !== orderCompanyId || !keyPlanId || keyPlanId !== orderPlanId) {
    throw new ActivationKeyError(ACTIVATION_ERRORS.planInactive, 403);
  }
}

function buildActivationSummary({ order, users = [], activationKeys = [] }) {
  const activeDrivers = getActiveDrivers(users);
  const presentedKeys = activationKeys.map((entry) => presentActivationKey(entry, users));
  const maxDrivers = getPlanLimit(order);
  const availableKeys = presentedKeys.filter((entry) => entry.status === "available").length;
  const usedKeys = presentedKeys.filter((entry) => entry.status === "used").length;
  const expiredKeys = presentedKeys.filter((entry) => entry.status === "expired").length;
  const revokedKeys = presentedKeys.filter((entry) => entry.status === "revoked").length;
  const planActive = Boolean(order) && String(order.activationStatus || "").trim() === "active";

  return {
    planId: order?.planId || null,
    planName: order?.planName || "Sin plan activo",
    planStatus: planActive ? "active" : String(order?.activationStatus || order?.paymentStatus || "inactive"),
    paidUntil: getPlanPaidUntil(order),
    maxUnits: maxDrivers,
    maxDrivers,
    activeUnits: activeDrivers.filter((entry) => entry.vehicleId).length,
    activeDrivers: activeDrivers.length,
    keysGenerated: presentedKeys.length,
    keysAvailable: availableKeys,
    keysUsed: usedKeys,
    keysExpired: expiredKeys,
    keysRevoked: revokedKeys,
    availableSlots: Math.max(0, maxDrivers - activeDrivers.length - availableKeys),
    remainingDriverSlots: Math.max(0, maxDrivers - activeDrivers.length)
  };
}

async function getAdminActivationContext(store, user) {
  const orders = await store.listCommercialOrdersForUser(user);
  const order = pickActiveOrder(orders);
  const companyId = String(user?.organizationId || order?.organizationId || order?.organizationSlug || "").trim();
  const scopedUser = {
    ...user,
    organizationId: companyId
  };
  const [users, activationKeys] = await Promise.all([
    store.listUsers(scopedUser),
    store.listActivationKeysForCompany(companyId)
  ]);

  return {
    companyId,
    order,
    users,
    activationKeys
  };
}

async function getKeyActivationContext(store, activationKey) {
  const order = activationKey?.orderId
    ? await store.getCommercialOrderById?.(activationKey.orderId)
    : null;
  const scopedUser = {
    role: "owner",
    accountType: "company_owner",
    organizationId: activationKey?.companyId
  };
  const [users, activationKeys] = await Promise.all([
    store.listUsers(scopedUser),
    store.listActivationKeysForCompany(activationKey?.companyId)
  ]);

  return {
    companyId: activationKey?.companyId,
    order,
    users,
    activationKeys
  };
}

async function listAdminActivationKeys(store, user) {
  const context = await getAdminActivationContext(store, user);
  const summary = buildActivationSummary(context);

  return {
    summary,
    keys: context.activationKeys.map((entry) => presentActivationKey(entry, context.users))
  };
}

function generateSecureKeyValue() {
  const chunks = [randomBytes(3), randomBytes(3), randomBytes(3)].map((buffer) =>
    buffer.toString("hex").toUpperCase()
  );

  return `MNCB-${chunks.join("-")}`;
}

function getExpiration(days = DEFAULT_KEY_TTL_DAYS) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + Math.max(1, Number(days) || DEFAULT_KEY_TTL_DAYS));
  return expiresAt.toISOString();
}

async function generateActivationKeyForAdmin(store, user, options = {}) {
  const context = await getAdminActivationContext(store, user);
  const summary = buildActivationSummary(context);

  assertPlanCanActivate(context.order);

  if (summary.availableSlots <= 0) {
    throw new ActivationKeyError(ACTIVATION_ERRORS.limitReached, 409);
  }

  let activationKey = null;

  for (let attempt = 0; attempt < 8 && !activationKey; attempt += 1) {
    try {
      activationKey = await store.createActivationKey({
        key: generateSecureKeyValue(),
        companyId: context.companyId,
        adminId: user.id,
        planId: context.order.planId,
        orderId: context.order.id,
        status: "available",
        expiresAt: getExpiration(options.expiresInDays),
        createdAt: new Date().toISOString()
      });
    } catch (error) {
      if (!/existe|duplicate|E11000/i.test(error.message || "")) {
        throw error;
      }
    }
  }

  if (!activationKey) {
    throw new ActivationKeyError("No fue posible generar una key unica.", 500);
  }

  const refreshed = await listAdminActivationKeys(store, user);

  return {
    activationKey: presentActivationKey(activationKey, context.users),
    ...refreshed
  };
}

async function revokeActivationKeyForAdmin(store, user, activationKeyId) {
  const context = await getAdminActivationContext(store, user);
  const activationKey = context.activationKeys.find((entry) => entry.id === activationKeyId);

  if (!activationKey) {
    throw new ActivationKeyError(ACTIVATION_ERRORS.keyNotFound, 404);
  }

  const status = getEffectiveKeyStatus(activationKey);

  if (status === "used") {
    throw new ActivationKeyError(ACTIVATION_ERRORS.keyUsed, 409);
  }

  if (status === "revoked") {
    return listAdminActivationKeys(store, user);
  }

  await store.updateActivationKey(activationKey.id, { status: "revoked" }, {
    companyId: context.companyId
  });

  return listAdminActivationKeys(store, user);
}

function assertActivationKeyCanBeUsed(activationKey) {
  if (!activationKey) {
    throw new ActivationKeyError(ACTIVATION_ERRORS.keyNotFound, 404);
  }

  const status = getEffectiveKeyStatus(activationKey);

  if (status === "used") {
    throw new ActivationKeyError(ACTIVATION_ERRORS.keyUsed, 409);
  }

  if (status === "revoked") {
    throw new ActivationKeyError(ACTIVATION_ERRORS.keyRevoked, 409);
  }

  if (status === "expired") {
    throw new ActivationKeyError(ACTIVATION_ERRORS.keyExpired, 409);
  }

  if (status !== "available") {
    throw new ActivationKeyError(ACTIVATION_ERRORS.activationFailed, 400);
  }
}

async function validateDriverActivationKey(store, keyValue) {
  const normalizedKey = normalizeActivationKey(keyValue);
  const activationKey = await store.findActivationKeyByKey(normalizedKey);

  assertActivationKeyCanBeUsed(activationKey);

  const context = await getKeyActivationContext(store, activationKey);
  const summary = buildActivationSummary(context);

  assertActivationKeyMatchesOrder(activationKey, context.order);
  assertPlanCanActivate(context.order);

  if (summary.remainingDriverSlots <= 0) {
    throw new ActivationKeyError(ACTIVATION_ERRORS.limitReached, 409);
  }

  return {
    valid: true,
    keyId: activationKey.id,
    companyId: activationKey.companyId,
    companyName: context.order?.companyName || "Empresa ManeComb",
    planId: context.order?.planId || activationKey.planId,
    planName: context.order?.planName || "Plan activo",
    expiresAt: toIso(activationKey.expiresAt),
    availableDrivers: summary.remainingDriverSlots
  };
}

function normalizeDriverIdentity(payload) {
  const name = String(payload?.name || "").trim();
  const rawEmail = String(payload?.email || "").trim().toLowerCase();
  const rawPhone = String(payload?.phone || "").trim();
  const phoneDigits = rawPhone.replace(/[^\d]/g, "");
  const email = rawEmail || (phoneDigits ? `${phoneDigits}@drivers.manecomb.local` : "");
  const password = String(payload?.password || "").trim();

  if (!name || !email || !password) {
    throw new ActivationKeyError("Nombre, correo o teléfono, contraseña y key son obligatorios", 400);
  }

  const passwordError = validatePasswordStrength(password);

  if (passwordError) {
    throw new ActivationKeyError(passwordError, 400);
  }

  return {
    name,
    email,
    phone: rawPhone || phoneDigits || "Pendiente",
    password
  };
}

function buildVehiclePayload({ payload, companyId, driverId, activationKey }) {
  const unit = payload?.unit && typeof payload.unit === "object" ? payload.unit : {};
  const suffix = String(activationKey.key || activationKey.id || randomUUID())
    .replace(/[^A-Z0-9]/gi, "")
    .slice(-5)
    .toUpperCase();

  return {
    organizationId: companyId,
    code: String(unit.code || unit.vehicleCode || `CB-${suffix}`).trim(),
    plate: String(unit.plate || `PEND-${suffix}`).trim().toUpperCase(),
    routeId: String(unit.routeId || "").trim() || null,
    capacity: Math.max(1, Number(unit.capacity) || 18),
    status: "available",
    driverId
  };
}

async function updateStarterFleet(store, order, user, vehicle) {
  if (!order?.id || !store.updateCommercialOrder) {
    return;
  }

  const starterFleet = Array.isArray(order.starterFleet) ? [...order.starterFleet] : [];
  const targetIndex = starterFleet.findIndex((entry) => entry.status !== "active");
  const nextEntry = {
    vehicleCode: vehicle?.code || `CB-${String(user.id).slice(0, 4).toUpperCase()}`,
    label: vehicle?.plate ? `Unidad ${vehicle.plate}` : `Unidad ${starterFleet.length + 1}`,
    status: "active",
    suggestedDriver: user.name,
    suggestedShift: user.shift || "Pendiente asignacion"
  };

  if (targetIndex >= 0) {
    starterFleet[targetIndex] = {
      ...starterFleet[targetIndex],
      ...nextEntry
    };
  } else if (starterFleet.length < getPlanLimit(order)) {
    starterFleet.push(nextEntry);
  }

  await store.updateCommercialOrder(order.id, {
    starterFleet,
    fleetSetupStatus: "seeded"
  });
}

async function registerDriverWithActivationKey(store, payload = {}) {
  const normalizedKey = normalizeActivationKey(payload.key);
  const activationKey = await store.findActivationKeyByKey(normalizedKey);

  assertActivationKeyCanBeUsed(activationKey);

  const context = await getKeyActivationContext(store, activationKey);
  const summary = buildActivationSummary(context);

  assertActivationKeyMatchesOrder(activationKey, context.order);
  assertPlanCanActivate(context.order);

  if (summary.remainingDriverSlots <= 0) {
    throw new ActivationKeyError(ACTIVATION_ERRORS.limitReached, 409);
  }

  const identity = normalizeDriverIdentity(payload);
  const existingUser = await store.findUserByEmail(identity.email);

  if (existingUser?.organizationId && existingUser.organizationId !== context.companyId) {
    throw new ActivationKeyError(ACTIVATION_ERRORS.activationFailed, 409);
  }

  if (existingUser && String(existingUser.role || "") !== "driver") {
    throw new ActivationKeyError(ACTIVATION_ERRORS.activationFailed, 409);
  }

  const existingVehicle = existingUser?.vehicleId
    ? await store.getVehicleById(existingUser.vehicleId)
    : null;

  if (
    existingUser?.vehicleId &&
    (!existingVehicle || String(existingVehicle.organizationId || "").trim() !== context.companyId)
  ) {
    throw new ActivationKeyError(ACTIVATION_ERRORS.activationFailed, 409);
  }

  const driverId = existingUser?.id || randomUUID();
  const claimedKey = await store.markActivationKeyUsed(activationKey.id, {
    companyId: context.companyId,
    driverId
  });

  if (!claimedKey) {
    const latestKey = await store.findActivationKeyByKey(normalizedKey);
    assertActivationKeyCanBeUsed(latestKey);
    throw new ActivationKeyError(ACTIVATION_ERRORS.activationFailed, 409);
  }

  const nowIso = new Date().toISOString();
  const vehiclePayload = buildVehiclePayload({
    payload,
    companyId: context.companyId,
    driverId,
    activationKey
  });
  const vehicle = existingVehicle || await store.createVehicle(vehiclePayload);
  const userPayload = {
    id: driverId,
    name: identity.name,
    email: identity.email,
    phone: identity.phone,
    password: identity.password,
    role: "driver",
    accountType: "operations",
    organizationId: context.companyId,
    userStatus: "active",
    status: "offline",
    vehicleId: vehicle?.id || existingUser?.vehicleId || null,
    activationKeyId: activationKey.id,
    activatedAt: nowIso
  };
  const user = existingUser
    ? await store.updateUser(existingUser.id, userPayload)
    : await store.createUser(userPayload, "driver");

  await updateStarterFleet(store, context.order, user, vehicle);

  return {
    user,
    vehicle,
    activationKey: presentActivationKey(
      {
        ...claimedKey,
        usedByDriverId: user.id,
        usedAt: claimedKey.usedAt || nowIso
      },
      [user]
    ),
    company: {
      id: context.companyId,
      name: context.order?.companyName || "Empresa ManeComb"
    },
    plan: {
      id: context.order?.planId || activationKey.planId,
      name: context.order?.planName || "Plan activo",
      maxDrivers: getPlanLimit(context.order)
    }
  };
}

module.exports = {
  ACTIVATION_ERRORS,
  ActivationKeyError,
  buildActivationSummary,
  getEffectiveKeyStatus,
  generateActivationKeyForAdmin,
  listAdminActivationKeys,
  normalizeActivationKey,
  presentActivationKey,
  registerDriverWithActivationKey,
  revokeActivationKeyForAdmin,
  validateDriverActivationKey
};
