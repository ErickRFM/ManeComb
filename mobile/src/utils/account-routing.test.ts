jest.mock('@/src/config/api_config', () => ({
  readRuntimeValue: () => '',
}));

import { resolveMobilePostLoginRoute } from '@/src/utils/account-routing';
import { getSalesPortalPathForBlockReason } from '@/src/utils/sales-portal';
import type {
  AuthRoutingContext,
  MobileBlockReason,
  User,
} from '@/src/types/app';

type AccountChannel =
  | 'blocked'
  | 'company_portal'
  | 'mobile_operations'
  | 'platform_admin';

type ChannelAwareUser = User & {
  accountChannel?: AccountChannel;
  accountChannelReason?: string;
};

type ChannelAwareAuthContext = AuthRoutingContext & {
  accountChannel?: AccountChannel;
  accountChannelReason?: string;
};

function user(overrides: Partial<ChannelAwareUser> = {}): ChannelAwareUser {
  return {
    accountType: 'operations',
    accountChannel: 'mobile_operations',
    avatar: 'MC',
    email: 'driver@manecomb.test',
    id: 'user-driver',
    name: 'Conductor ManeComb',
    phone: 'Pendiente',
    role: 'driver',
    shift: 'Matutino',
    status: 'online',
    vehicleId: null,
    ...overrides,
  };
}

function authContext(
  overrides: Partial<ChannelAwareAuthContext> = {}
): ChannelAwareAuthContext {
  return {
    accountChannel: 'mobile_operations',
    canAccessMobile: true,
    canUseOperations: true,
    destination: 'HomeOperativo',
    mobileBlockReason: null,
    route: '/mapa',
    ...overrides,
  };
}

describe('resolveMobilePostLoginRoute', () => {
  it('envia token invalido o usuario ausente a Login', () => {
    expect(resolveMobilePostLoginRoute(null).destination).toBe('Login');
    expect(resolveMobilePostLoginRoute(null).route).toBe('/login');
  });

  it('abre HomeOperativo para mobile_operations autorizado', () => {
    const result = resolveMobilePostLoginRoute({
      authContext: authContext(),
      user: user(),
    });

    expect(result.destination).toBe('HomeOperativo');
    expect(result.reason).toBe('active_mobile_access');
    expect(result.route).toBe('/mapa');
  });

  it.each(['owner', 'admin'] as const)('abre Mobile para company_portal con rol %s cuando backend lo autoriza', (role) => {
    const result = resolveMobilePostLoginRoute({
      authContext: authContext({
        accountChannel: 'company_portal',
        canAccessMobile: true,
      }),
      user: user({
        accountChannel: 'company_portal',
        accountType: 'company_owner',
        role,
      }),
    });

    expect(result.destination).toBe('HomeOperativo');
    expect(result.reason).toBe('active_mobile_access');
    expect(result.route).toBe('/mapa');
  });

  it('no concede Mobile a un rol de Portal sin capacidad administrativa de app', () => {
    const result = resolveMobilePostLoginRoute({
      authContext: authContext({
        accountChannel: 'company_portal',
        canAccessMobile: true,
      }),
      user: user({
        accountChannel: 'company_portal',
        accountType: 'company_owner',
        role: 'billing_manager',
      }),
    });

    expect(result.destination).toBe('PlanBlocked');
    expect(result.reason).toBe('wrong_channel');
    expect(result.route).toBe('/plan-blocked');
  });

  it('bloquea identidades marcadas por el backend como blocked', () => {
    const result = resolveMobilePostLoginRoute({
      authContext: authContext({
        accountChannel: 'blocked',
        canAccessMobile: false,
      }),
      user: user({ accountChannel: 'blocked' }),
    });

    expect(result.destination).toBe('PlanBlocked');
    expect(result.reason).toBe('account_blocked');
    expect(result.route).toBe('/plan-blocked');
  });

  it.each<MobileBlockReason>([
    'no_plan',
    'payment_pending',
    'inactive_plan',
    'missing_tenant',
    'sync_error',
  ])('bloquea una identidad elegible cuando backend devuelve %s', (reason) => {
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

  it('acepta el contrato plano heredado para una identidad operational valida', () => {
    const result = resolveMobilePostLoginRoute({
      canAccessMobile: true,
      user: user({ accountChannel: undefined }),
    });

    expect(result.destination).toBe('HomeOperativo');
    expect(result.route).toBe('/mapa');
  });

  it.each(['owner', 'admin'] as const)('acepta el contrato plano heredado para company_owner %s autorizado', (role) => {
    const result = resolveMobilePostLoginRoute({
      canAccessMobile: true,
      user: user({
        accountChannel: undefined,
        accountType: 'company_owner',
        role,
      }),
    });

    expect(result.destination).toBe('HomeOperativo');
    expect(result.reason).toBe('active_mobile_access');
    expect(result.route).toBe('/mapa');
  });

  it('no concede acceso usando plan y tenant locales sin decision vigente del backend', () => {
    const result = resolveMobilePostLoginRoute({
      user: user(),
    });

    expect(result.destination).toBe('SyncError');
    expect(result.reason).toBe('sync_error');
    expect(result.route).toBe('/sync-error');
  });

  it('mantiene Platform Admin fuera del producto Mobile aunque una bandera sea inconsistente', () => {
    const result = resolveMobilePostLoginRoute({
      authContext: authContext({
        accountChannel: 'platform_admin',
        canAccessMobile: true,
      }),
      user: user(),
    });

    expect(result.destination).toBe('PlanBlocked');
    expect(result.reason).toBe('wrong_channel');
    expect(result.route).toBe('/plan-blocked');
  });

  it('manda a sync-error cuando hay usuario operativo cacheado pero no respuesta vigente', () => {
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
    expect(getSalesPortalPathForBlockReason('no_plan')).toBe('/ventas/');
    expect(getSalesPortalPathForBlockReason('missing_tenant')).toBe('/portal/onboarding');
    expect(getSalesPortalPathForBlockReason('sync_error')).toBe('/ventas/');
  });
});
