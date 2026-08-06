import type { User } from '@/src/types/app';

export type AccountChannel =
  | 'blocked'
  | 'company_portal'
  | 'mobile_operations'
  | 'platform_admin';

type PortalUser = Pick<User, 'accountType' | 'role'> & {
  accountChannel?: AccountChannel | string | null;
};

const PORTAL_ROLES = new Set(['owner', 'admin', 'billing_manager', 'support', 'viewer']);
const ROLE_PERMISSIONS = {
  owner: new Set(['users', 'billing', 'vehicles', 'routes']),
  admin: new Set(['users', 'billing', 'vehicles', 'routes']),
  billing_manager: new Set(['billing']),
  support: new Set<string>(),
  viewer: new Set<string>(),
} as const;

export function isPortalRole(role: User['role'] | string | null | undefined) {
  return PORTAL_ROLES.has(String(role || ''));
}

export function canAccessPortal(user: PortalUser | null | undefined) {
  if (!user) return false;

  const explicitChannel = String(user.accountChannel || '').trim();

  if (explicitChannel) {
    return explicitChannel === 'company_portal';
  }

  // Compatibilidad temporal para una sesión emitida antes del contrato de canal.
  // Es deliberadamente AND y falla cerrada para combinaciones incompatibles.
  return user.accountType === 'company_owner' && isPortalRole(user.role);
}

export type PortalPermission = 'users' | 'billing' | 'vehicles' | 'routes';

export function hasPortalPermission(
  user: PortalUser | null | undefined,
  permission: PortalPermission
) {
  if (!canAccessPortal(user)) return false;
  const role = String(user?.role || '');
  return ROLE_PERMISSIONS[role as keyof typeof ROLE_PERMISSIONS]?.has(permission) || false;
}
