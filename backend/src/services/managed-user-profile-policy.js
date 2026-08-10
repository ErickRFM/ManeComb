const MANAGED_STAFF_ROLES = new Set([
  "admin",
  "dispatcher",
  "supervisor",
  "billing_manager",
  "support",
  "viewer"
]);

const PORTAL_ONLY_STAFF_ROLES = new Set([
  "billing_manager",
  "support",
  "viewer"
]);

const OPERATIONS_ONLY_STAFF_ROLES = new Set([
  "dispatcher",
  "supervisor"
]);

class ManagedUserProfilePolicyError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.name = "ManagedUserProfilePolicyError";
    this.code = code;
    this.statusCode = statusCode;
    this.publicMessage = message;
  }
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function resolveManagedStaffAccountType(actor, role, requestedAccountType) {
  const normalizedRole = normalize(role);

  if (PORTAL_ONLY_STAFF_ROLES.has(normalizedRole)) {
    return "company_owner";
  }

  if (OPERATIONS_ONLY_STAFF_ROLES.has(normalizedRole)) {
    return "operations";
  }

  if (normalizedRole === "admin") {
    const requested = normalize(requestedAccountType);
    if (requested === "company_owner" || requested === "operations") {
      return requested;
    }

    return normalize(actor?.accountType) === "company_owner"
      ? "company_owner"
      : "operations";
  }

  return "operations";
}

function resolveManagedUserCreationIdentity(actor, payload = {}) {
  const role = normalize(payload.role);

  if (role === "driver" || role === "conductor") {
    throw new ManagedUserProfilePolicyError(
      "DRIVER_ACTIVATION_REQUIRED",
      "Los conductores deben registrarse con una key de activación.",
      409
    );
  }

  if (role === "owner") {
    throw new ManagedUserProfilePolicyError(
      "OWNER_REGISTRATION_REQUIRED",
      "El propietario se crea únicamente durante el alta de la empresa.",
      409
    );
  }

  if (!role || !MANAGED_STAFF_ROLES.has(role)) {
    throw new ManagedUserProfilePolicyError(
      "INVALID_MANAGED_ROLE",
      "Selecciona un tipo de perfil válido para el usuario.",
      400
    );
  }

  return {
    role,
    accountType: resolveManagedStaffAccountType(actor, role, payload.accountType)
  };
}

function assertManagedUserIdentityStable(targetUser, payload = {}) {
  if (!targetUser) {
    return;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "role")) {
    const requestedRole = normalize(payload.role);
    const currentRole = normalize(targetUser.role);
    if (!requestedRole || requestedRole !== currentRole) {
      throw new ManagedUserProfilePolicyError(
        "PROFILE_ROLE_IMMUTABLE",
        "El tipo de perfil no se puede cambiar desde la edición genérica. Usa un flujo explícito de cambio de rol.",
        409
      );
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "accountType")) {
    const requestedAccountType = normalize(payload.accountType);
    const currentAccountType = normalize(targetUser.accountType);
    if (!requestedAccountType || requestedAccountType !== currentAccountType) {
      throw new ManagedUserProfilePolicyError(
        "PROFILE_CHANNEL_IMMUTABLE",
        "El canal del perfil no se puede cambiar desde la edición genérica.",
        409
      );
    }
  }
}

module.exports = {
  MANAGED_STAFF_ROLES,
  ManagedUserProfilePolicyError,
  OPERATIONS_ONLY_STAFF_ROLES,
  PORTAL_ONLY_STAFF_ROLES,
  assertManagedUserIdentityStable,
  resolveManagedStaffAccountType,
  resolveManagedUserCreationIdentity
};
