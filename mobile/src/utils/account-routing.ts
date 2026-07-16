import type {
  AuthRoutingContext,
  MobileBlockReason,
  PostLoginDestination,
  User,
} from '@/src/types/app';

type RouteUser = Pick<User, 'id'> | null | undefined;

type MobilePostLoginSession = {
  authContext?: AuthRoutingContext | null;
  canAccessMobile?: boolean | null;
  error?: unknown;
  mobileBlockReason?: MobileBlockReason | null;
  user?: RouteUser;
};

export type PostLoginResolution = {
  destination: PostLoginDestination;
  reason: MobileBlockReason | 'active_mobile_access' | 'missing_user';
  route: string;
};

function normalizeBlockReason(value: unknown): MobileBlockReason {
  if (
    value === 'inactive_plan' ||
    value === 'missing_tenant' ||
    value === 'no_plan' ||
    value === 'payment_pending' ||
    value === 'sync_error'
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
