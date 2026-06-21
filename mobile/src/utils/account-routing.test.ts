jest.mock('@/src/config/api_config', () => ({
  readRuntimeValue: () => '',
}));

import { resolveMobilePostLoginRoute } from '@/src/utils/account-routing';
import { getSalesPortalPathForBlockReason } from '@/src/utils/sales-portal';
import type {
  AuthRoutingContext,
  AuthTenantContext,
  MobileBlockReason,
  PortalOnboarding,
  PortalSubscription,
  User,
} from '@/src/types/app';

const tenant: AuthTenantContext = {
  id: 'terminal-norte',
  isOperational: true,
  organizationId: 'terminal-norte',
  status: 'active',
};

const activeSubscription: PortalSubscription = {
  activeUnits: 2,
  availableUnits: 0,
  id: 'order-active',
  isActive: true,
  planId: 'starter-2',
  planName: 'Starter',
  status: 'active',
  totalUnits: 2,
  unitsLimit: 2,
};

const pendingOnboarding: PortalOnboarding = {
  status: 'pending',
  steps: [],
};

function user(overrides: Partial<User> = {}): User {
  return {
    accountType: 'company_owner',
    avatar: 'MV',
    email: 'ventas@manecomb.test',
    id: 'user-sales',
    name: 'ManeComb Ventas',
    phone: 'Pendiente',
    role: 'owner',
    shift: 'Centro de control',
    status: 'online',
    vehicleId: null,
    ...overrides,
  };
}

function authContext(overrides: Partial<AuthRoutingContext> = {}): AuthRoutingContext {
  return {
    canAccessMobile: true,
    canUseOperations: true,
    destination: 'HomeOperativo',
    mobileBlockReason: null,
    onboarding: pendingOnboarding,
    route: '/mapa',
    subscription: activeSubscription,
    tenant,
    ...overrides,
  };
}

describe('resolveMobilePostLoginRoute', () => {
  it('envia token invalido o usuario ausente a Login', () => {
    expect(resolveMobilePostLoginRoute(null).destination).toBe('Login');
    expect(resolveMobilePostLoginRoute(null).route).toBe('/login');
  });

  it('abre HomeOperativo cuando backend permite acceso movil', () => {
    const result = resolveMobilePostLoginRoute({
      authContext: authContext(),
      user: user(),
    });

    expect(result.destination).toBe('HomeOperativo');
    expect(result.reason).toBe('active_mobile_access');
    expect(result.route).toBe('/mapa');
  });

  it('ignora accountType, source y onboarding pendiente si canAccessMobile es true', () => {
    const result = resolveMobilePostLoginRoute({
      authContext: authContext({
        source: 'sales-portal',
        onboarding: pendingOnboarding,
      }),
      onboarding: pendingOnboarding,
      subscription: activeSubscription,
      tenant,
      user: user({ accountType: 'company_owner', role: 'owner' }),
    });

    expect(result.destination).toBe('HomeOperativo');
    expect(result.route).toBe('/mapa');
  });

  it.each<MobileBlockReason>([
    'no_plan',
    'payment_pending',
    'inactive_plan',
    'missing_tenant',
    'sync_error',
  ])('bloquea en PlanBlocked cuando backend devuelve %s', (reason) => {
    const result = resolveMobilePostLoginRoute({
      authContext: authContext({
        canAccessMobile: false,
        destination: 'PlanBlocked',
        mobileBlockReason: reason,
        route: '/plan-blocked',
      }),
      user: user(),
    });

    expect(result.destination).toBe('PlanBlocked');
    expect(result.reason).toBe(reason);
    expect(result.route).toBe('/plan-blocked');
  });

  it('acepta el contrato plano de /auth/me aunque authContext no venga anidado', () => {
    const result = resolveMobilePostLoginRoute({
      canAccessMobile: true,
      subscription: activeSubscription,
      tenant,
      user: user(),
    });

    expect(result.destination).toBe('HomeOperativo');
    expect(result.route).toBe('/mapa');
  });

  it('no concede acceso usando plan y tenant locales sin canAccessMobile del backend', () => {
    const result = resolveMobilePostLoginRoute({
      subscription: activeSubscription,
      tenant,
      user: user(),
    });

    expect(result.destination).toBe('SyncError');
    expect(result.reason).toBe('sync_error');
    expect(result.route).toBe('/sync-error');
  });

  it('bloquea si backend devuelve canAccessMobile false aunque haya plan y tenant activos en cache', () => {
    const result = resolveMobilePostLoginRoute({
      authContext: authContext({
        canAccessMobile: false,
        mobileBlockReason: 'inactive_plan',
      }),
      canAccessMobile: false,
      subscription: activeSubscription,
      tenant,
      user: user(),
    });

    expect(result.destination).toBe('PlanBlocked');
    expect(result.reason).toBe('inactive_plan');
    expect(result.route).toBe('/plan-blocked');
  });

  it('manda a sync-error cuando hay usuario cacheado pero no respuesta vigente de backend', () => {
    const result = resolveMobilePostLoginRoute({
      authContext: null,
      user: user(),
    });

    expect(result.destination).toBe('SyncError');
    expect(result.reason).toBe('sync_error');
    expect(result.route).toBe('/sync-error');
  });
});

describe('getSalesPortalPathForBlockReason', () => {
  it('usa rutas web reales para acciones de plan y pago', () => {
    expect(getSalesPortalPathForBlockReason('payment_pending')).toBe('/portal/pagos');
    expect(getSalesPortalPathForBlockReason('inactive_plan')).toBe('/portal/plan');
    expect(getSalesPortalPathForBlockReason('no_plan')).toBe('/ventas');
    expect(getSalesPortalPathForBlockReason('missing_tenant')).toBe('/portal/onboarding');
    expect(getSalesPortalPathForBlockReason('sync_error')).toBe('/ventas');
  });
});
