import type { AuthRoutingContext, User } from '@/src/types/app';
import {
  ENTERPRISE_CAPABILITY,
  canLoadDirectoryUsers,
  canRefreshOperationalData,
  getEnterpriseCapabilities,
  hasEnterpriseCapability,
} from './mobile-capability-authority';

function user(overrides: Partial<User> & { capabilities?: unknown } = {}) {
  return {
    id: 'user-1',
    name: 'Usuario',
    email: 'user@manecomb.test',
    role: 'admin',
    accountType: 'operations',
    phone: '',
    shift: '',
    status: 'online',
    avatar: 'U',
    vehicleId: null,
    ...overrides,
  } as User;
}

function auth(overrides: Partial<AuthRoutingContext> = {}): AuthRoutingContext {
  return {
    destination: 'HomeOperativo',
    route: '/mapa',
    canAccessMobile: true,
    canUseOperations: true,
    ...overrides,
  };
}

describe('mobile enterprise capability authority', () => {
  it('allows company portal owner/admin operational refresh from auth context', () => {
    const owner = user({
      role: 'owner',
      accountType: 'company_owner',
      accountChannel: 'company_portal',
      capabilities: [
        ENTERPRISE_CAPABILITY.portalAccess,
        ENTERPRISE_CAPABILITY.mobileAccess,
        ENTERPRISE_CAPABILITY.operationsUse,
      ],
    } as Partial<User> & { capabilities?: unknown });

    expect(canRefreshOperationalData(auth({ accountChannel: 'company_portal' }), owner)).toBe(true);
  });

  it('does not derive operational refresh from role or capability when auth context blocks Mobile', () => {
    const owner = user({
      role: 'owner',
      accountType: 'company_owner',
      capabilities: [ENTERPRISE_CAPABILITY.mobileAccess, ENTERPRISE_CAPABILITY.operationsUse],
    } as Partial<User> & { capabilities?: unknown });

    expect(canRefreshOperationalData(auth({ canAccessMobile: false }), owner)).toBe(false);
    expect(canRefreshOperationalData(auth({ canUseOperations: false }), owner)).toBe(false);
  });

  it('allows dispatcher directory from analytics.view and denies driver', () => {
    const dispatcher = user({
      role: 'dispatcher',
      capabilities: [ENTERPRISE_CAPABILITY.analyticsView],
    } as Partial<User> & { capabilities?: unknown });
    const driver = user({
      role: 'driver',
      capabilities: [ENTERPRISE_CAPABILITY.mobileAccess, ENTERPRISE_CAPABILITY.rtcAccess],
    } as Partial<User> & { capabilities?: unknown });

    expect(canLoadDirectoryUsers(dispatcher)).toBe(true);
    expect(canLoadDirectoryUsers(driver)).toBe(false);
  });

  it('fails closed for missing or malformed capability payloads', () => {
    const malformed = user({ capabilities: ['analytics.view', 123, null] } as Partial<User> & { capabilities?: unknown });
    const missing = user();

    expect(getEnterpriseCapabilities(malformed)).toEqual(['analytics.view']);
    expect(hasEnterpriseCapability(malformed, ENTERPRISE_CAPABILITY.analyticsView)).toBe(true);
    expect(canLoadDirectoryUsers(missing)).toBe(false);
    expect(canRefreshOperationalData(null, malformed)).toBe(false);
  });
});
