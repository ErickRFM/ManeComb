const { randomBytes, randomUUID } = require("crypto");
const { validatePasswordStrength } = require("../utils/password-policy");
const logger = require("./logger");
const { buildSubscription, pickActiveOrder } = require("./portal-account");

const DEFAULT_KEY_TTL_DAYS = 14;
// Mongo conserva `expiresAt` como Date requerido y los contadores atomicos usan
// comparaciones por fecha. Esta fecha es una representacion interna de "sin
// vencimiento"; el contrato publico siempre la proyecta como `expiresAt: null`.
const NON_EXPIRING_KEY_EXPIRES_AT = "9999-12-31T23:59:59.999Z";

const ACTIVATION_ERROR_CODES = Object.freeze({
  accountExists: "activation_account_exists",
  accountRoleConflict: "activation_account_role_conflict",
  accountSuspended: "activation_account_suspended",
  accountTenantConflict: "activation_account_tenant_conflict",
  accountVehicleConflict: "activation_account_vehicle_conflict",
  activationConflict: "activation_conflict",
  activationFailed: "activation_failed",
  identityInvalid: "activation_identity_invalid",
  keyExpired: "activation_key_expired",
  keyInvalidState: "activation_key_invalid_state",
  keyNotFound: "activation_key_not_found",
  keyRevoked: "activation_key_revoked",
  keyUsed: "activation_key_used",
  passwordInvalid: "activation_password_invalid",
  planInactive: "activation_plan_inactive",
  planLimitReached: "activation_plan_limit_reached",
  unitNotFound: "activation_unit_not_found",
  unitRequired: "activation_unit_required",
  unitTaken: "activation_unit_taken"
});

const ACTIVATION_ERRORS = {
  keyNotFound: "La key de activación no existe.",
  keyUsed: "Esta key ya fue usada.",
  keyRevoked: "Esta key fue revocada.",
  keyExpired: "Esta key está vencida.",
  planInactive: "El plan de la empresa no está activo.",
  limitReached: "Ya se alcanzó el límite de conductores del plan.",
  activationFailed: "No se pudo activar la cuenta. Intenta nuevamente.",
  accountExists: "Este correo ya tiene una cuenta de conductor. Inicia sesión o recupera tu contraseña.",
  accountRoleConflict: "Este correo ya está registrado como cuenta administrativa. Para el conductor usa otro correo o número.",
  accountSuspended: "Esta cuenta de conductor está suspendida. Pide al administrador que la reactive.",
  accountTenantConflict: "Este correo ya pertenece a otra cuenta ManeComb. Usa otro correo o inicia sesión.",
  accountVehicleConflict: "La cuenta existente tiene una asignación incompatible. Pide al administrador revisar al conductor.",
  infrastructureUnavailable: "No fue posible completar la activación. Intenta nuevamente.",
  unitNotFound: "La unidad seleccionada no está disponible.",
  unitTaken: "Esta unidad ya no está disponible, elige otra.",
  unitRequired: "Selecciona una unidad disponible para continuar."
};

class ActivationKeyError extends Error {
  constructor(message, statusCode = 400, code = ACTIVATION_ERROR_CODES.activationFailed) {
    super(message);
    this.name = "ActivationKeyError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

function toIso(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toPublicExpiration(value) {
  const iso = toIso(value);
  return iso === NON_EXPIRING_KEY_EXPIRES_AT ? null : iso;
}

function normalizeActivationKey(value) {
  return String(value || "").trim().replace(/\s+/g, "").toUpperCase();
}

function isPastDate(value) {
  if (!value) {
    return false;
  }

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

function maskActivationKey(value) {
  const normalized = normalizeActivationKey(value);
  const suffix = normalized.slice(-4);
  return suffix ? `MNCB-••••••-••••••-${suffix}` : "MNCB-••••••-••••••-••••";
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

  const status = getEffectiveKeyStatus(activationKey);
  const driverState = driver?.deletedAt
    ? "deleted"
    : String(driver?.userStatus || "").trim() === "suspended"
      ? "offboarded"
      : activationKey.usedByDriverState || (driver ? "active" : null);

  return {
    id: activationKey.id,
    key: status === "available" ? activationKey.key : maskActivationKey(activationKey.key),
    keyMasked: maskActivationKey(activationKey.key),
    companyId: activationKey.companyId,
    adminId: activationKey.adminId,
    planId: activationKey.planId,
    orderId: activationKey.orderId || null,
    status,
    usedByDriverId,
    usedByDriverState: driverState,
    driver: presentDriver(driver),
    expiresAt: toPublicExpiration(activationKey.expiresAt),
    usedAt: toIso(activationKey.usedAt),
    sharedAt: toIso(activationKey.sharedAt),
    sharedBy: activationKey.sharedBy || null,
    shareCount: Number(activationKey.shareCount) || 0,
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
  return buildSubscription(order).unitsLimit;
}

function assertPlanCanActivate(order) {
  if (!buildSubscription(order).isActive) {
    throw new ActivationKeyError(
      ACTIVATION_ERRORS.planInactive,
      403,
      ACTIVATION_ERROR_CODES.planInactive
    );
  }
}

function assertActivationKeyMatchesOrder(activationKey, order) {
  const keyCompanyId = String(activationKey?.companyId || "").trim();
  const orderCompanyId = String(order?.organizationId || order?.organizationSlug || "").trim();
  const keyPlanId = String(activationKey?.planId || "").trim();
  const orderPlanId = String(order?.planId || "").trim();

  if (!keyCompanyId || !orderCompanyId || keyCompanyId !== orderCompanyId || !keyPlanId || keyPlanId !== orderPlanId) {
    throw new ActivationKeyError(
      ACTIVATION_ERRORS.planInactive,
      403,
      ACTIVATION_ERROR_CODES.planInactive
    );
  }
}

function buildActivationSummary({ order, users = [], activationKeys = [] }) {
  const subscription = buildSubscription(order);
  const activeDrivers = getActiveDrivers(users);
  const presentedKeys = activationKeys.map((entry) => presentActivationKey(entry, users));
  const maxDrivers = getPlanLimit(order);
  const availableKeys = presentedKeys.filter((entry) => entry.status === "available").length;
  const usedKeys = presentedKeys.filter((entry) => entry.status === "used").length;
  const expiredKeys = presentedKeys.filter((entry) => entry.status === "expired").length;
  const revokedKeys = presentedKeys.filter((entry) => entry.status === "revoked").length;

  return {
    planId: order?.planId || null,
    planName: order?.planName || "Sin plan activo",
    planStatus: subscription.status,
    paidUntil: subscription.expiresAt,
    maxUnits: maxDrivers,
    maxDrivers,
    activeUnits: activeDrivers.filter((entry) => entry.vehicleId).length,
    activeDrivers: activeDrivers.length,
    keysGenerated: presentedKeys.length,
    keysAvailable: availableKeys,
    keysUsed: usedKeys,
    keysExpired: expiredKeys,
    keysRevoked: revokedKeys,
    availableSlots: subscription.isActive
      ? Math.max(0, maxDrivers - activeDrivers.length - availableKeys)
      : 0,
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
  const scopedUser = {
    role: "owner",
    accountType: "company_owner",
    organizationId: activationKey?.companyId
  };

  // La vigencia del plan se resuelve siempre con la misma fuente que Portal.
  // `orderId` conserva trazabilidad, pero no puede fijar la Key a una orden
  // histórica si la empresa renovó o reactivó el mismo plan.
  const companyOrders = activationKey?.companyId
    ? await store.listCommercialOrdersForUser(scopedUser)
    : [];
  const order = pickActiveOrder(
    companyOrders.filter(
      (entry) =>
        String(entry?.planId || "").trim() === String(activationKey?.planId || "").trim()
    )
  );

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
  if (days === null) {
    return NON_EXPIRING_KEY_EXPIRES_AT;
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + Math.max(1, Number(days) || DEFAULT_KEY_TTL_DAYS));
  return expiresAt.toISOString();
}

async function generateActivationKeyForAdmin(store, user, options = {}) {
  const context = await getAdminActivationContext(store, user);
  const summary = buildActivationSummary(context);

  assertPlanCanActivate(context.order);

  if (summary.availableSlots <= 0) {
    throw new ActivationKeyError(
      ACTIVATION_ERRORS.limitReached,
      409,
      ACTIVATION_ERROR_CODES.planLimitReached
    );
  }

  let activationKey = null;

  for (let attempt = 0; attempt < 8 && !activationKey; attempt += 1) {
    try {
      const payload = {
        key: generateSecureKeyValue(),
        companyId: context.companyId,
        adminId: user.id,
        planId: context.order.planId,
        orderId: context.order.id,
        status: "available",
        expiresAt: getExpiration(options.expiresInDays),
        createdAt: new Date().toISOString()
      };
      const claimed = typeof store.createActivationKeyWithinCapacity === "function"
        ? await store.createActivationKeyWithinCapacity(payload, { maxDrivers: summary.maxDrivers })
        : { capacityExceeded: false, activationKey: await store.createActivationKey(payload) };

      if (claimed.capacityExceeded) {
        throw new ActivationKeyError(
          ACTIVATION_ERRORS.limitReached,
          409,
          ACTIVATION_ERROR_CODES.planLimitReached
        );
      }
      activationKey = claimed.activationKey;
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

async function deleteActivationKeyForAdmin(store, user, activationKeyId) {
  const context = await getAdminActivationContext(store, user);
  const activationKey = context.activationKeys.find((entry) => entry.id === activationKeyId);

  if (!activationKey) {
    throw new ActivationKeyError(ACTIVATION_ERRORS.keyNotFound, 404);
  }

  const status = getEffectiveKeyStatus(activationKey);

  if (status !== "available") {
    if (status === "used") {
      throw new ActivationKeyError(
        "No se puede eliminar una key que ya fue utilizada. El historial debe mantenerse para integridad del sistema.",
        409
      );
    }

    if (status === "revoked") {
      throw new ActivationKeyError(
        "No se puede eliminar una key revocada. El historial debe mantenerse para integridad del sistema.",
        409
      );
    }

    if (status === "expired") {
      throw new ActivationKeyError(
        "No se puede eliminar una key expirada. El historial debe mantenerse para integridad del sistema.",
        409
      );
    }

    throw new ActivationKeyError("No se puede eliminar esta key en su estado actual.", 409);
  }

  const driverWithKey = context.users.find(
    (entry) => entry.activationKeyId === activationKeyId && entry.role === "driver"
  );

  if (driverWithKey) {
    throw new ActivationKeyError(
      "No se puede eliminar la key porque está asociada a un conductor activo.",
      409
    );
  }

  await store.deleteActivationKey(activationKeyId);

  return listAdminActivationKeys(store, user);
}

async function shareActivationKeyForAdmin(store, user, activationKeyId) {
  const context = await getAdminActivationContext(store, user);
  const activationKey = context.activationKeys.find((entry) => entry.id === activationKeyId);

  if (!activationKey) {
    throw new ActivationKeyError(ACTIVATION_ERRORS.keyNotFound, 404);
  }

  const status = getEffectiveKeyStatus(activationKey);

  if (status !== "available") {
    throw new ActivationKeyError(
      status === "used"
        ? ACTIVATION_ERRORS.keyUsed
        : status === "revoked"
          ? ACTIVATION_ERRORS.keyRevoked
          : status === "expired"
            ? ACTIVATION_ERRORS.keyExpired
            : "Esta key no puede ser compartida en su estado actual.",
      409
    );
  }

  const now = new Date().toISOString();
  const currentCount = Number(activationKey.shareCount) || 0;

  await store.updateActivationKey(
    activationKey.id,
    {
      sharedAt: now,
      sharedBy: user.id,
      shareCount: currentCount + 1
    },
    { companyId: context.companyId }
  );

  return listAdminActivationKeys(store, user);
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
    throw new ActivationKeyError(
      ACTIVATION_ERRORS.keyNotFound,
      404,
      ACTIVATION_ERROR_CODES.keyNotFound
    );
  }

  const status = getEffectiveKeyStatus(activationKey);

  if (status === "used") {
    throw new ActivationKeyError(
      ACTIVATION_ERRORS.keyUsed,
      409,
      ACTIVATION_ERROR_CODES.keyUsed
    );
  }

  if (status === "revoked") {
    throw new ActivationKeyError(
      ACTIVATION_ERRORS.keyRevoked,
      409,
      ACTIVATION_ERROR_CODES.keyRevoked
    );
  }

  if (status === "expired") {
    throw new ActivationKeyError(
      ACTIVATION_ERRORS.keyExpired,
      409,
      ACTIVATION_ERROR_CODES.keyExpired
    );
  }

  if (status !== "available") {
    throw new ActivationKeyError(
      ACTIVATION_ERRORS.activationFailed,
      400,
      ACTIVATION_ERROR_CODES.keyInvalidState
    );
  }
}

async function listAvailableActivationUnits(store, companyId) {
  const organizationId = String(companyId || "").trim();

  if (!organizationId || typeof store.getLiveLocations !== "function") {
    return [];
  }

  const live = await store.getLiveLocations();
  const fleet = live?.vehicles;

  return (Array.isArray(fleet) ? fleet : [])
    .filter(
      (vehicle) =>
        String(vehicle?.organizationId || "").trim() === organizationId &&
        String(vehicle?.status || "").trim().toLowerCase() === "available" &&
        !vehicle?.driverId
    )
    // Minimo necesario para que el conductor reconozca su unidad en el selector.
    // La ruta y el estado se omiten a proposito: no ayudan a identificarla y
    // este endpoint es anonimo.
    .map((vehicle) => ({
      id: vehicle.id,
      code: String(vehicle.code || "").trim() || "Sin número económico",
      plate: String(vehicle.plate || "").trim() || null
    }));
}

async function claimSelectedUnit(store, payload, companyId, driverId) {
  const vehicleId = String(payload?.unit?.vehicleId || "").trim();

  if (!vehicleId) {
    throw new ActivationKeyError(
      ACTIVATION_ERRORS.unitRequired,
      400,
      ACTIVATION_ERROR_CODES.unitRequired
    );
  }

  const vehicle = await store.getVehicleById(vehicleId);

  if (!vehicle || String(vehicle.organizationId || "").trim() !== String(companyId || "").trim()) {
    throw new ActivationKeyError(
      ACTIVATION_ERRORS.unitNotFound,
      404,
      ACTIVATION_ERROR_CODES.unitNotFound
    );
  }

  if (typeof store.claimVehicleForDriver !== "function") {
    throw new ActivationKeyError(
      ACTIVATION_ERRORS.infrastructureUnavailable,
      500,
      ACTIVATION_ERROR_CODES.activationFailed
    );
  }

  // Update condicional: solo tiene efecto si la unidad sigue libre. Devuelve
  // null cuando otro conductor la tomo entre la validacion y el registro.
  const claimed = await store.claimVehicleForDriver(vehicleId, {
    organizationId: companyId,
    driverId
  });

  if (!claimed) {
    throw new ActivationKeyError(
      ACTIVATION_ERRORS.unitTaken,
      409,
      ACTIVATION_ERROR_CODES.unitTaken
    );
  }

  return claimed;
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
    throw new ActivationKeyError(
      ACTIVATION_ERRORS.limitReached,
      409,
      ACTIVATION_ERROR_CODES.planLimitReached
    );
  }

  return {
    valid: true,
    keyId: activationKey.id,
    companyId: activationKey.companyId,
    companyName: context.order?.companyName || "Empresa ManeComb",
    planId: context.order?.planId || activationKey.planId,
    planName: context.order?.planName || "Plan activo",
    expiresAt: toPublicExpiration(activationKey.expiresAt),
    availableDrivers: summary.remainingDriverSlots,
    availableUnits: await listAvailableActivationUnits(store, activationKey.companyId)
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
    throw new ActivationKeyError(
      "Nombre, correo o teléfono, contraseña y key son obligatorios",
      400,
      ACTIVATION_ERROR_CODES.identityInvalid
    );
  }

  const passwordError = validatePasswordStrength(password);

  if (passwordError) {
    throw new ActivationKeyError(passwordError, 400, ACTIVATION_ERROR_CODES.passwordInvalid);
  }

  return {
    name,
    email,
    phone: rawPhone || phoneDigits || "Pendiente",
    password
  };
}

function normalizeRegistrationWriteError(error) {
  if (error instanceof ActivationKeyError) {
    return error;
  }

  const duplicateEmail =
    (error?.code === 11000 && (error?.keyPattern?.email || error?.keyValue?.email)) ||
    /correo ya existe|duplicate key.*email|email.*duplicate/i.test(String(error?.message || ""));

  if (duplicateEmail) {
    return new ActivationKeyError(
      ACTIVATION_ERRORS.accountExists,
      409,
      ACTIVATION_ERROR_CODES.accountExists
    );
  }

  return error;
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
    throw new ActivationKeyError(
      ACTIVATION_ERRORS.limitReached,
      409,
      ACTIVATION_ERROR_CODES.planLimitReached
    );
  }

  const identity = normalizeDriverIdentity(payload);
  const existingUser = await store.findUserByEmail(identity.email);

  if (existingUser) {
    const existingOrganizationId = String(existingUser.organizationId || "").trim();

    if (existingOrganizationId !== context.companyId) {
      throw new ActivationKeyError(
        ACTIVATION_ERRORS.accountTenantConflict,
        409,
        ACTIVATION_ERROR_CODES.accountTenantConflict
      );
    }

    if (String(existingUser.role || "") !== "driver") {
      throw new ActivationKeyError(
        ACTIVATION_ERRORS.accountRoleConflict,
        409,
        ACTIVATION_ERROR_CODES.accountRoleConflict
      );
    }

    if (String(existingUser.userStatus || "active") === "suspended") {
      throw new ActivationKeyError(
        ACTIVATION_ERRORS.accountSuspended,
        409,
        ACTIVATION_ERROR_CODES.accountSuspended
      );
    }

    if (existingUser.vehicleId) {
      const existingVehicle = await store.getVehicleById(existingUser.vehicleId);
      if (
        !existingVehicle ||
        String(existingVehicle.organizationId || "").trim() !== context.companyId ||
        existingVehicle.driverId !== existingUser.id
      ) {
        throw new ActivationKeyError(
          ACTIVATION_ERRORS.accountVehicleConflict,
          409,
          ACTIVATION_ERROR_CODES.accountVehicleConflict
        );
      }
    }

    // El registro por key crea una identidad nueva. Reactivar, reasignar o
    // cambiar credenciales de una cuenta existente pertenece al lifecycle del
    // administrador, nunca a este endpoint anonimo.
    throw new ActivationKeyError(
      ACTIVATION_ERRORS.accountExists,
      409,
      ACTIVATION_ERROR_CODES.accountExists
    );
  }

  const driverId = randomUUID();
  // La unidad se reclama de forma atomica ANTES de consumir la key: si dos
  // conductores eligen la misma unidad, solo uno gana y el perdedor conserva
  // su key intacta para volver a intentar con otra unidad.
  const selectedVehicle = await claimSelectedUnit(store, payload, context.companyId, driverId);
  let userPersisted = false;

  try {
    const claimedKey = await store.markActivationKeyUsed(activationKey.id, {
      companyId: context.companyId,
      driverId
    });

    if (!claimedKey) {
      const latestKey = await store.findActivationKeyByKey(normalizedKey);
      assertActivationKeyCanBeUsed(latestKey);
      throw new ActivationKeyError(
        ACTIVATION_ERRORS.activationFailed,
        409,
        ACTIVATION_ERROR_CODES.activationConflict
      );
    }

    const nowIso = new Date().toISOString();
    const vehicle = selectedVehicle;
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
      vehicleId: vehicle?.id || null,
      activationKeyId: activationKey.id,
      activatedAt: nowIso
    };
    const user = await store.createUser(userPayload, "driver");
    userPersisted = true;

    try {
      await updateStarterFleet(store, context.order, user, vehicle);
    } catch (starterFleetError) {
      logger.warn({
        action: "StarterFleetSync",
        module: "ActivationKeys",
        organizationId: context.companyId,
        userId: user.id,
        status: "degraded",
        message: "No fue posible sincronizar starterFleet despues de activar al conductor",
        metadata: {
          errorName: String(starterFleetError?.name || "Error").slice(0, 80)
        }
      });
    }

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
  } catch (error) {
    // Compensacion segura: si el fallo ocurre despues de consumir la key,
    // restaurarla solo cuando siga ligada a ESTE intento. Ninguna compensacion
    // debe ocultar el error original ni revertir cambios de otro proceso.
    const compensations = [];

    if (!userPersisted && typeof store.updateActivationKey === "function") {
      compensations.push(
        Promise.resolve().then(() =>
          store.updateActivationKey(
            activationKey.id,
            {
              status: "available",
              usedByDriverId: null,
              usedByDriverState: null,
              usedAt: null
            },
            {
              companyId: context.companyId,
              status: "used",
              usedByDriverId: driverId
            }
          )
        )
      );
    }

    if (!userPersisted && selectedVehicle && typeof store.releaseVehicleFromDriver === "function") {
      compensations.push(
        Promise.resolve().then(() => store.releaseVehicleFromDriver(selectedVehicle.id, driverId))
      );
    }

    await Promise.allSettled(compensations);
    throw normalizeRegistrationWriteError(error);
  }
}

module.exports = {
  ACTIVATION_ERROR_CODES,
  ACTIVATION_ERRORS,
  ActivationKeyError,
  buildActivationSummary,
  getEffectiveKeyStatus,
  generateActivationKeyForAdmin,
  listAdminActivationKeys,
  normalizeActivationKey,
  presentActivationKey,
  maskActivationKey,
  registerDriverWithActivationKey,
  deleteActivationKeyForAdmin,
  revokeActivationKeyForAdmin,
  shareActivationKeyForAdmin,
  validateDriverActivationKey
};
