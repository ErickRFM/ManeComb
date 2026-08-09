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

type CapabilityAwareUser = User & {
  capabilities?: unknown;
};

export function getEnterpriseCapabilities(user: User | null | undefined): string[] {
  if (!user) return [];
  const raw = (user as CapabilityAwareUser).capabilities;
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

export function hasEnterpriseCapability(
  user: User | null | undefined,
  capability: EnterpriseCapability
) {
  return getEnterpriseCapabilities(user).includes(capability);
}

export function canRefreshOperationalData(
  authContext: AuthRoutingContext | null | undefined,
  user: User | null | undefined
) {
  if (!user || !authContext) return false;

  // AuthRoutingContext is the product-routing authority returned by Backend.
  // Never infer operational access from role/accountType/accountChannel here.
  return authContext.canAccessMobile === true && authContext.canUseOperations === true;
}

export function canLoadDirectoryUsers(user: User | null | undefined) {
  return hasEnterpriseCapability(user, ENTERPRISE_CAPABILITY.analyticsView);
}
