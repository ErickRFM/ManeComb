jest.mock('@/src/config/api_config', () => ({
  readRuntimeValue: () => '',
}));

import {
  ENTERPRISE_CAPABILITY,
  canLoadMobileDirectory,
  canManageMobileDocuments,
  canManageMobileIncidents,
  canRefreshMobileOperations,
  getEnterpriseCapabilities,
  hasEnterpriseCapability,
} from './mobile-authority';
import type { AuthRoutingContext, User } from '@/src/types/app';

type CapabilityUser = Omit<User, 'capabilities'> & { capabilities?: unknown };

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
  } as CapabilityUser;
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

describe('enterprise capability helpers', () => {
  it('normaliza capabilities explícitas y descarta valores inválidos', () => {
    const currentUser = user({
      capabilities: [ENTERPRISE_CAPABILITY.analyticsView, 123, null, ''],
    });

    expect(getEnterpriseCapabilities(currentUser)).toEqual([
      ENTERPRISE_CAPABILITY.analyticsView,
    ]);
    expect(
      hasEnterpriseCapability(currentUser, ENTERPRISE_CAPABILITY.analyticsView)
    ).toBe(true);
    expect(
      hasEnterpriseCapability(currentUser, ENTERPRISE_CAPABILITY.documentsManage)
    ).toBe(false);
  });

  it('falla cerrado cuando capabilities no existen o no son arreglo', () => {
    expect(getEnterpriseCapabilities(user())).toEqual([]);
    expect(getEnterpriseCapabilities(user({ capabilities: 'analytics.view' }))).toEqual([]);
  });
});

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
      user({ capabilities: [ENTERPRISE_CAPABILITY.mobileAccess, ENTERPRISE_CAPABILITY.operationsUse] })
    )).toBe(true);
    expect(canRefreshMobileOperations(
      null,
      user({ capabilities: [ENTERPRISE_CAPABILITY.mobileAccess] })
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
      user({ role: 'dispatcher', capabilities: [ENTERPRISE_CAPABILITY.analyticsView, ENTERPRISE_CAPABILITY.routesManage] })
    )).toBe(true);
  });

  it('rechaza capabilities explícitas sin analytics.view aunque el rol heredado antes entrara', () => {
    expect(canLoadMobileDirectory(
      user({ role: 'supervisor', capabilities: [ENTERPRISE_CAPABILITY.documentsManage] })
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
      user({ role: 'dispatcher', capabilities: [ENTERPRISE_CAPABILITY.incidentsManage, ENTERPRISE_CAPABILITY.analyticsView] })
    )).toBe(true);
  });

  it('respeta capabilities explícitas antes que el fallback de rol', () => {
    expect(canManageMobileIncidents(
      user({ role: 'supervisor', capabilities: [ENTERPRISE_CAPABILITY.documentsManage] })
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

describe('canManageMobileDocuments', () => {
  it('permite supervisor cuando backend serializa documents.manage', () => {
    expect(canManageMobileDocuments(
      user({ role: 'supervisor', capabilities: [ENTERPRISE_CAPABILITY.documentsManage, ENTERPRISE_CAPABILITY.analyticsView] })
    )).toBe(true);
  });

  it('rechaza dispatcher sin documents.manage', () => {
    expect(canManageMobileDocuments(
      user({ role: 'dispatcher', capabilities: [ENTERPRISE_CAPABILITY.analyticsView, ENTERPRISE_CAPABILITY.routesManage] })
    )).toBe(false);
  });

  it('conserva owner/admin/supervisor como fallback legado', () => {
    expect(canManageMobileDocuments(user({ role: 'owner' }))).toBe(true);
    expect(canManageMobileDocuments(user({ role: 'admin' }))).toBe(true);
    expect(canManageMobileDocuments(user({ role: 'supervisor' }))).toBe(true);
    expect(canManageMobileDocuments(user({ role: 'dispatcher' }))).toBe(false);
  });
});
