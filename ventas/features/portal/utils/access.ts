import type { AccountChannel, User } from '@/src/types/app';

type PortalUser = Pick<User, 'accountType' | 'role'> & {
  accountChannel?: AccountChannel | string | null;
  capabilities?: string[] | null;
};

const PORTAL_ROLES = new Set(['owner', 'admin', 'billing_manager', 'support', 'viewer']);
const LEGACY_ROLE_PERMISSIONS = {
  owner: new Set(['users', 'billing', 'vehicles', 'routes']),
  admin: new Set(['users', 'billing', 'vehicles', 'routes']),
  billing_manager: new Set(['billing']),
  support: new Set<string>(),
  viewer: new Set<string>(),
} as const;

const PORTAL_CAPABILITIES = {
  users: 'users.manage',
  billing: 'billing.manage',
  vehicles: 'vehicles.manage',
  routes: 'routes.manage',
} as const;

export function isPortalRole(role: User['role'] | string | null | undefined) {
  return PORTAL_ROLES.has(String(role || ''));
}

function hasExplicitCapabilities(user: PortalUser) {
  return Array.isArray(user.capabilities);
}

export function canAccessPortal(user: PortalUser | null | undefined) {
  if (!user) return false;

  const explicitChannel = String(user.accountChannel || '').trim();

  if (hasExplicitCapabilities(user)) {
    return explicitChannel === 'company_portal' && user.capabilities!.includes('portal.access');
  }

  if (explicitChannel) {
    return explicitChannel === 'company_portal';
  }

  // Compatibilidad temporal para una sesión emitida antes del contrato de canal.
  // Es deliberadamente AND y falla cerrada para combinaciones incompatibles.
  return user.accountType === 'company_owner' && isPortalRole(user.role);
}

export type PortalPermission = keyof typeof PORTAL_CAPABILITIES;

export function hasPortalPermission(
  user: PortalUser | null | undefined,
  permission: PortalPermission
) {
  if (!canAccessPortal(user)) return false;

  if (hasExplicitCapabilities(user)) {
    return user!.capabilities!.includes(PORTAL_CAPABILITIES[permission]);
  }

  const role = String(user?.role || '');
  return LEGACY_ROLE_PERMISSIONS[role as keyof typeof LEGACY_ROLE_PERMISSIONS]?.has(permission) || false;
}