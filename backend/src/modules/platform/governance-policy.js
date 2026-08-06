const {
  PLATFORM_ROLES,
  getPlatformPermissions
} = require("../../config/platform-roles");
const {
  PlatformForbiddenError,
  PlatformValidationError
} = require("../../utils/platform-errors");

function canAssignPlatformRole(actorRole, requestedRole) {
  if (!PLATFORM_ROLES.includes(actorRole) || !PLATFORM_ROLES.includes(requestedRole)) {
    return false;
  }
  if (actorRole === "platform_owner") return true;
  if (actorRole !== "platform_admin" || requestedRole === "platform_owner") return false;

  const actorPermissions = new Set(getPlatformPermissions(actorRole));
  return getPlatformPermissions(requestedRole).every((permission) => actorPermissions.has(permission));
}

function assertCanAssignPlatformRole(actorRole, requestedRole) {
  if (!PLATFORM_ROLES.includes(requestedRole)) {
    throw new PlatformValidationError("Rol Platform no válido");
  }
  if (!canAssignPlatformRole(actorRole, requestedRole)) {
    throw new PlatformForbiddenError("No puedes asignar un rol con privilegios superiores a los tuyos");
  }
  return requestedRole;
}

module.exports = {
  canAssignPlatformRole,
  assertCanAssignPlatformRole
};
