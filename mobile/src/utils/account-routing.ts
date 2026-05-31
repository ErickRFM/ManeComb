import { Platform } from 'react-native';
import type { User } from '@/src/types/app';

export function isCustomerAccount(user: Pick<User, 'accountType'> | null | undefined) {
  return user?.accountType === 'company_owner';
}

export function getAuthenticatedHome(
  user: Pick<User, 'accountType' | 'role'> | null | undefined
) {
  if (isCustomerAccount(user)) {
    return '/portal';
  }

  if (Platform.OS === 'web' && ['billing_manager', 'support', 'viewer'].includes(String(user?.role || ''))) {
    return '/portal';
  }

  if (Platform.OS === 'web' && user?.role === 'admin') {
    return '/portal';
  }

  return '/mapa';
}

export function getOperationalHome(
  _user: Pick<User, 'accountType'> | null | undefined
) {
  return '/mapa';
}
