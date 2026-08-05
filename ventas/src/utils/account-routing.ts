import { isPortalRole } from '@/features/portal/utils/access';
import type { User } from '@/src/types/app';

export function isCustomerAccount(user: Pick<User, 'accountType' | 'role'> | null | undefined) {
  return user?.accountType === 'company_owner' || isPortalRole(user?.role);
}

export function getAuthenticatedHome(user?: Pick<User, 'accountType' | 'role'> | null | undefined) {
  return isCustomerAccount(user) ? '/portal' : '/mapa';
}
