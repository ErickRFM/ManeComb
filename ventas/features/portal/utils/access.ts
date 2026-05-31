import type { PortalSubscription, User } from '@/src/types/app';

const PORTAL_ROLES = new Set(['owner', 'admin', 'billing_manager', 'support', 'viewer']);
const OPERATIONAL_SUBSCRIPTION_STATUSES = new Set(['active', 'trial', 'trial_active']);

export function canAccessPortal(user: Pick<User, 'accountType' | 'role'> | null | undefined) {
  return user?.accountType === 'company_owner' || PORTAL_ROLES.has(String(user?.role || ''));
}

export function canOpenOperationalPanel(
  subscription: PortalSubscription | null | undefined,
  user: Pick<User, 'organizationId' | 'role'> | null | undefined
) {
  const isPlatformAdmin = user?.role === 'admin' && !String(user.organizationId || '').trim();
  const status = String(subscription?.status || '').trim().toLowerCase();

  return isPlatformAdmin || OPERATIONAL_SUBSCRIPTION_STATUSES.has(status);
}
