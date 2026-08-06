import {
  canAccessPortal,
  isPortalRole,
} from '@/features/portal/utils/access';
import type { AccountChannel, User } from '@/src/types/app';

type RouteUser = Pick<User, 'accountType' | 'role'> & {
  accountChannel?: AccountChannel | string | null;
};

const OPERATIONAL_ROLES = new Set([
  'owner',
  'admin',
  'dispatcher',
  'supervisor',
  'driver',
]);

export function getAccountChannel(
  user: RouteUser | null | undefined
): AccountChannel {
  if (!user) return 'blocked';

  const explicitChannel = String(user.accountChannel || '').trim();

  if (
    explicitChannel === 'blocked' ||
    explicitChannel === 'company_portal' ||
    explicitChannel === 'mobile_operations' ||
    explicitChannel === 'platform_admin'
  ) {
    return explicitChannel;
  }

  // Compatibilidad temporal para tokens/sesiones emitidos antes del contrato.
  if (user.accountType === 'company_owner' && isPortalRole(user.role)) {
    return 'company_portal';
  }

  if (
    user.accountType === 'operations' &&
    OPERATIONAL_ROLES.has(String(user.role || ''))
  ) {
    return 'mobile_operations';
  }

  return 'blocked';
}

export function isCustomerAccount(user: RouteUser | null | undefined) {
  return canAccessPortal(user);
}

export function getAuthenticatedHome(user?: RouteUser | null) {
  const channel = getAccountChannel(user);

  if (channel === 'company_portal') return '/portal';
  if (channel === 'mobile_operations') return '/acceso-operativo';
  if (channel === 'platform_admin') return '/acceso-admin';
  return '/acceso-restringido';
}
