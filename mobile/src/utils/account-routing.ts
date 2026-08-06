import type {
  AccountChannel,
  AuthRoutingContext,
  MobileBlockReason,
  PostLoginDestination,
  User,
} from '@/src/types/app';

type RouteUser = Pick<User, 'accountType' | 'id' | 'role'> & {
  accountChannel?: AccountChannel | string | null;
};

type MobilePostLoginSession = {
  authContext?: AuthRoutingContext | null;
  canAccessMobile?: boolean | null;
  error?: unknown;
  mobileBlockReason?: MobileBlockReason | null;
  user?: RouteUser | null;
};

export type PostLoginResolution = {
  destination: PostLoginDestination;
  reason: MobileBlockReason | 'active_mobile_access' | 'missing_user';
  route: string;
};

const PORTAL_ROLES = new Set(['owner', 'admin', 'billing_manager', 'support', 'viewer']);
const OPERATIONAL_ROLES = new Set(['owner', 'admin', 'dispatcher', 'supervisor', 'driver', 'conductor']);

function isAccountChannel(value: unknown): value is AccountChannel {
  return (
    value === 'blocked' ||
    value === 'company_portal' ||
    value === 'mobile_operations' ||
    value === 'platform_admin'
  );
}

function resolveAccountChannel(
  session: MobilePostLoginSession
): AccountChannel {
  const explicitChannel = session.authContext?.accountChannel ?? session.user?.accountChannel;

  if (isAccountChannel(explicitChannel)) {
    return explicitChannel;
  }

  const user = session.user;

  if (!user) return 'blocked';

  // Compatibilidad temporal para una sesión emitida antes del contrato.
  if (
    user.accountType === 'company_owner' &&
    PORTAL_ROLES.has(String(user.role || ''))
  ) {
    return 'company_portal';
  }

  if (
    user.accountType === 'operations' &&
    OPERATIONAL_ROLES.has(String(user.role || ''))
  ) {
    return 'mobile_operations';
  }

  return 'blocked';
}

function normalizeBlockReason(value: unknown): MobileBlockReason {
  if (
    value === 'account_blocked' ||
    value === 'inactive_plan' ||
    value === 'missing_tenant' ||
    value === 'no_plan' ||
    value === 'payment_pending' ||
    value === 'sync_error' ||
    value === 'wrong_channel'
  ) {
    return value;
  }

  return 'sync_error';
}

export function resolveMobilePostLoginRoute(
  session: MobilePostLoginSession | null | undefined
): PostLoginResolution {
  if (!session?.user) {
    return {
      destination: 'Login',
      reason: 'missing_user',
      route: '/login',
    };
  }

  const accountChannel = resolveAccountChannel(session);

  if (accountChannel === 'blocked') {
    return {
      destination: 'PlanBlocked',
      reason: 'account_blocked',
      route: '/plan-blocked',
    };
  }

  if (accountChannel !== 'mobile_operations') {
    return {
      destination: 'PlanBlocked',
      reason: 'wrong_channel',
      route: '/plan-blocked',
    };
  }

  const canAccessMobile = session.authContext?.canAccessMobile ?? session.canAccessMobile;

  if (canAccessMobile === true) {
    return {
      destination: 'HomeOperativo',
      reason: 'active_mobile_access',
      route: '/mapa',
    };
  }

  if (canAccessMobile === false) {
    return {
      destination: 'PlanBlocked',
      reason: normalizeBlockReason(
        session.authContext?.mobileBlockReason ?? session.mobileBlockReason
      ),
      route: '/plan-blocked',
    };
  }

  return {
    destination: 'SyncError',
    reason: 'sync_error',
    route: '/sync-error',
  };
}

export function getAuthenticatedHome(
  user: RouteUser,
  authContext?: AuthRoutingContext | null
) {
  return resolveMobilePostLoginRoute({
    authContext,
    user,
  }).route;
}

export function getOperationalHome(
  user: RouteUser,
  authContext?: AuthRoutingContext | null
) {
  return getAuthenticatedHome(user, authContext);
}
