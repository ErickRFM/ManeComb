jest.mock('@/src/config/api_config', () => ({
  readRuntimeValue: () => '',
}));

import {
  canLoadMobileDirectory,
  canManageMobileIncidents,
  canRefreshMobileOperations,
} from './mobile-authority';
import type { AuthRoutingContext, User } from '@/src/types/app';

type CapabilityUser = User & { capabilities?: string[] };

function user(overrides: Partial<CapabilityUser> = {}): CapabilityUser {
  return {
    id: 'user-mobile-authority',
    name: 'ManeComb User',
    email: 'authority@manecomb.test',
    role: 'driver',
    accountType: 'operations',
    phone: '',
    shift: '',
    status: 'offline',
    avatar: 'MC',
    vehicleId: null,
    ...overrides,
  };
}

function auth(overrides: Partial<AuthRoutingContext> = {}): AuthRoutingContext {
  return {
    canAccessMobile: true,
    canUseOperations: true,
    destination: 'HomeOperativo',
    mobileBlockReason: null,
    route: '/mapa',
    ...overrides,
  };
}

describe('canRefreshMobileOperations', () => {
  it('obedece canAccessMobile + canUseOperations aunque el canal principal sea Portal', () => {
    expect(canRefreshMobileOperations(
      auth({ accountChannel: 'company_portal', canAccessMobile: true, canUseOperations: true }),
      user({ role: 'owner', accountType: 'company_owner' })
    )).toBe(true);
  });

  it('no usa accountChannel como permiso cuando backend concede Mobile', () => {
    expect(canRefreshMobileOperations(
      auth({ accountChannel: 'company_portal', canAccessMobile: true, canUseOperations: true }),
      user({ role: 'admin', accountType: 'company_owner' })
    )).toBe(true);
  });

  it('falla cerrado cuando backend permite Mobile pero niega operación', () => {
    expect(canRefreshMobileOperations(
      auth({ canAccessMobile: true, canUseOperations: false }),
      user({ role: 'admin' })
    )).toBe(false);
  });

  it('falla cerrado cuando backend niega Mobile', () => {
    expect(canRefreshMobileOperations(
      auth({ canAccessMobile: false, canUseOperations: false }),
      user({ role: 'driver' })
    )).toBe(false);
  });

  it('usa capabilities explícitas cuando no existe authContext', () => {
    expect(canRefreshMobileOperations(
      null,
      user({ capabilities: ['mobile.access', 'operations.use'] })
    )).toBe(true);
    expect(canRefreshMobileOperations(
      null,
      user({ capabilities: ['mobile.access'] })
    )).toBe(false);
  });

  it('mantiene fallback legado solo para sesiones sin decisiones explícitas', () => {
    expect(canRefreshMobileOperations(null, user({ role: 'supervisor' }))).toBe(true);
    expect(canRefreshMobileOperations(null, user({ role: 'support', accountType: 'company_owner' }))).toBe(false);
  });
});

describe('canLoadMobileDirectory', () => {
  it('permite dispatcher cuando backend serializa analytics.view', () => {
    expect(canLoadMobileDirectory(
      user({ role: 'dispatcher', capabilities: ['analytics.view', 'routes.manage'] })
    )).toBe(true);
  });

  it('rechaza capabilities explícitas sin analytics.view aunque el rol heredado antes entrara', () => {
    expect(canLoadMobileDirectory(
      user({ role: 'supervisor', capabilities: ['documents.manage'] })
    )).toBe(false);
  });

  it('conserva fallback legado para una sesión sin capabilities', () => {
    expect(canLoadMobileDirectory(user({ role: 'supervisor' }))).toBe(true);
    expect(canLoadMobileDirectory(user({ role: 'driver' }))).toBe(false);
  });
});

describe('canManageMobileIncidents', () => {
  it('permite dispatcher cuando backend serializa incidents.manage', () => {
    expect(canManageMobileIncidents(
      user({ role: 'dispatcher', capabilities: ['incidents.manage', 'analytics.view'] })
    )).toBe(true);
  });

  it('respeta capabilities explícitas antes que el fallback de rol', () => {
    expect(canManageMobileIncidents(
      user({ role: 'supervisor', capabilities: ['documents.manage'] })
    )).toBe(false);
  });

  it('mantiene owner/admin/dispatcher/supervisor como compatibilidad operativa', () => {
    for (const role of ['owner', 'admin', 'dispatcher', 'supervisor'] as const) {
      expect(canManageMobileIncidents(user({ role }))).toBe(true);
    }
    expect(canManageMobileIncidents(user({ role: 'driver' }))).toBe(false);
    expect(canManageMobileIncidents(user({ role: 'support', accountType: 'company_owner' }))).toBe(false);
  });
});
