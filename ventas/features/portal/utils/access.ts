import type { AccountChannel, User } from '@/src/types/app';

type PortalUser = Pick<User, 'accountType' | 'role'> & {
  accountChannel?: AccountChannel | string | null;
  capabilities?: string[] | null;
};

const PORTAL_ROLES = new Set(['owner', 'admin', 'billing_manager', 'support', 'viewer']);
const LEGACY_ROLE_PERMISSIONS = {
  owner: new Set(['users', 'billing', 'vehicles', 'routes', 'documents', 'incidents', 'analytics']),
  admin: new Set(['users', 'billing', 'vehicles', 'routes', 'documents', 'incidents', 'analytics']),
  billing_manager: new Set(['billing', 'analytics']),
  support: new Set(['incidents', 'analytics']),
  viewer: new Set(['analytics']),
} as const;

const PORTAL_CAPABILITIES = {
  users: 'users.manage',
  billing: 'billing.manage',
  vehicles: 'vehicles.manage',
  routes: 'routes.manage',
  documents: 'documents.manage',
  incidents: 'incidents.manage',
  analytics: 'analytics.view',
} as const;

export function isPortalRole(role: User['role'] | string | null | undefined) {
  return PORTAL_ROLES.has(String(role || ''));
}

function hasExplicitCapabilities(user: PortalUser) {
  return Array.isArray(user.capabilities);
}

export function canAccessPortal(user: PortalUser | null | undefined) {
  if (!user) return false;

  // Capabilities are the authoritative product contract emitted by the backend.
  // accountChannel remains a preferred destination / compatibility hint, never
  // a statement that the identity can use only one ManeComb product.
  if (hasExplicitCapabilities(user)) {
    return user.capabilities!.includes('portal.access');
  }

  const explicitChannel = String(user.accountChannel || '').trim();
  if (explicitChannel) {
    return explicitChannel === 'company_portal';
  }

  // Compatibility only for sessions issued before capabilities/accountChannel.
  // Deliberately AND and fail-closed for incompatible combinations.
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
