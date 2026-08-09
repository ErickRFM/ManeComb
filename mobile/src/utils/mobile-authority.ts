import type { AuthRoutingContext, User } from '@/src/types/app';

export const ENTERPRISE_CAPABILITY = {
  portalAccess: 'portal.access',
  mobileAccess: 'mobile.access',
  operationsUse: 'operations.use',
  tenantAccess: 'tenant.access',
  usersManage: 'users.manage',
  billingManage: 'billing.manage',
  vehiclesManage: 'vehicles.manage',
  analyticsView: 'analytics.view',
  rtcAccess: 'communication.rtc.access',
  routesManage: 'routes.manage',
  documentsManage: 'documents.manage',
  incidentsManage: 'incidents.manage',
} as const;

export type EnterpriseCapability =
  (typeof ENTERPRISE_CAPABILITY)[keyof typeof ENTERPRISE_CAPABILITY];

type CapabilityAwareUser = Pick<User, 'accountType' | 'role'> &
  Partial<Pick<User, 'id' | 'organizationId'>> & {
    capabilities?: unknown;
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
const LEGACY_DOCUMENT_MANAGER_ROLES = new Set(['owner', 'admin', 'supervisor']);

export function getEnterpriseCapabilities(
  user: CapabilityAwareUser | null | undefined
): string[] {
  if (!Array.isArray(user?.capabilities)) return [];
  return user.capabilities.filter(
    (entry): entry is string => typeof entry === 'string' && entry.length > 0
  );
}

function hasExplicitCapabilities(user: CapabilityAwareUser | null | undefined) {
  return Array.isArray(user?.capabilities);
}

export function hasEnterpriseCapability(
  user: CapabilityAwareUser | null | undefined,
  capability: EnterpriseCapability
) {
  return getEnterpriseCapabilities(user).includes(capability);
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
    return (
      hasEnterpriseCapability(user, ENTERPRISE_CAPABILITY.mobileAccess) &&
      hasEnterpriseCapability(user, ENTERPRISE_CAPABILITY.operationsUse)
    );
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
    return hasEnterpriseCapability(user, ENTERPRISE_CAPABILITY.analyticsView);
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
    return hasEnterpriseCapability(user, ENTERPRISE_CAPABILITY.incidentsManage);
  }

  // Support no tiene acceso Mobile en el contrato actual, por eso el fallback
  // legado solo incluye roles operativos. Si backend lo habilita en el futuro,
  // su capability explícita prevalecerá sobre esta tabla de compatibilidad.
  return LEGACY_INCIDENT_MANAGER_ROLES.has(String(user.role || ''));
}

/**
 * Autoridad para abrir administración documental desde Mobile hacia Portal.
 * Backend protege las rutas administrativas con canManageDocuments.
 */
export function canManageMobileDocuments(user: CapabilityAwareUser | null | undefined) {
  if (!user) return false;

  if (hasExplicitCapabilities(user)) {
    return hasEnterpriseCapability(user, ENTERPRISE_CAPABILITY.documentsManage);
  }

  return LEGACY_DOCUMENT_MANAGER_ROLES.has(String(user.role || ''));
}

// Aliases usados por el store y la navegación. Mantienen una sola implementación
// canónica en este módulo, sin repetir reglas de autoridad.
export const canRefreshOperationalData = canRefreshMobileOperations;
export const canLoadDirectoryUsers = canLoadMobileDirectory;
