import type { User } from '@/src/types/app';

export function isCustomerAccount(user: Pick<User, 'accountType' | 'role'> | null | undefined) {
  return user?.accountType === 'company_owner' || ['owner', 'billing_manager', 'support', 'viewer'].includes(String(user?.role || ''));
}

export function getAuthenticatedHome(user?: Pick<User, 'accountType' | 'role'> | null | undefined) {
  return isCustomerAccount(user) ? '/portal' : '/mapa';
}
