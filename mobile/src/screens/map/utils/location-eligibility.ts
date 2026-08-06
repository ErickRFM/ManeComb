import type { AuthRoutingContext, User } from '@/src/types/app';

type LocationUser = Pick<User, 'accountType' | 'role' | 'vehicleId'>;

export function isOperationalDriverRole(role: unknown) {
  const normalized = String(role || '').trim().toLowerCase();
  return normalized === 'driver' || normalized === 'conductor';
}

export function canCaptureLocalLocation(
  user: LocationUser | null | undefined,
  authContext: AuthRoutingContext | null | undefined
) {
  if (!user) return false;

  if (authContext?.canAccessMobile === true) {
    return true;
  }

  // Una sesión operativa restaurada desde caché puede seguir leyendo el GPS
  // local mientras /auth/me se reconcilia. Esto no concede publicación ni
  // acceso a datos empresariales.
  return !authContext && user.accountType === 'operations';
}

export function canOwnVehicleTracking(
  user: LocationUser | null | undefined,
  authContext: AuthRoutingContext | null | undefined
) {
  return Boolean(
    user?.vehicleId &&
    authContext?.canAccessMobile === true &&
    isOperationalDriverRole(user.role)
  );
}
