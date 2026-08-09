import type { AuthRoutingContext, User } from '@/src/types/app';

type CapabilityAwareUser = Pick<User, 'accountType' | 'role'> & {
  capabilities?: string[] | null;
};

const LEGACY_OPERATIONAL_ROLES = new Set([
  'owner',
  'admin',
  'dispatcher',
  'supervisor',
  'driver',
]);

const LEGACY_DIRECTORY_ROLES = new Set(['owner', 'admin', 'supervisor']);
const LEGACY_INCIDENT_MANAGER_ROLES = new Set(['owner', 'admin', 'dispatcher', 'supervisor']);

function hasExplicitCapabilities(user: CapabilityAwareUser | null | undefined) {
  return Array.isArray(user?.capabilities);
}

function hasCapability(
  user: CapabilityAwareUser | null | undefined,
  capability: string
) {
  return Array.isArray(user?.capabilities) && user.capabilities.includes(capability);
}

/**
 * Decide si Mobile debe cargar el dominio operativo.
 *
 * La respuesta vigente del backend es la autoridad principal. `accountChannel`
 * describe el destino principal de la identidad, pero no puede negar un segundo
 * producto que el backend haya concedido explícitamente.
 */
export function canRefreshMobileOperations(
  authContext: AuthRoutingContext | null | undefined,
  user: CapabilityAwareUser | null | undefined
) {
  if (!user) return false;

  if (typeof authContext?.canAccessMobile === 'boolean') {
    return authContext.canAccessMobile === true && authContext.canUseOperations === true;
  }

  if (hasExplicitCapabilities(user)) {
    return hasCapability(user, 'mobile.access') && hasCapability(user, 'operations.use');
  }

  // Compatibilidad únicamente para sesiones antiguas sin authContext/capabilities.
  return LEGACY_OPERATIONAL_ROLES.has(String(user.role || ''));
}

/**
 * Autoridad de lectura del Directorio. Backend protege GET /users con
 * canViewAnalytics, serializada como analytics.view.
 */
export function canLoadMobileDirectory(user: CapabilityAwareUser | null | undefined) {
  if (!user) return false;

  if (hasExplicitCapabilities(user)) {
    return hasCapability(user, 'analytics.view');
  }

  // Compatibilidad con sesiones anteriores al contrato de capabilities.
  return LEGACY_DIRECTORY_ROLES.has(String(user.role || ''));
}

/**
 * Autoridad para cambiar el estado de una incidencia. Backend protege PATCH
 * /incidents/:incidentId/status con canManageIncidents -> incidents.manage.
 */
export function canManageMobileIncidents(user: CapabilityAwareUser | null | undefined) {
  if (!user) return false;

  if (hasExplicitCapabilities(user)) {
    return hasCapability(user, 'incidents.manage');
  }

  // Support no tiene acceso Mobile en el contrato actual, por eso el fallback
  // legado solo incluye roles operativos. Si backend lo habilita en el futuro,
  // su capability explícita prevalecerá sobre esta tabla de compatibilidad.
  return LEGACY_INCIDENT_MANAGER_ROLES.has(String(user.role || ''));
}
