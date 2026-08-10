import { LOCATION_FIX_WATCHDOG_MS } from '../constants/tracking';

export type SilentLocationIssue =
  | 'permission_denied'
  | 'services_disabled'
  | 'unavailable';

export function hasLocationFixTimedOut(
  lastObservedAt: number | null,
  now: number,
  timeoutMs = LOCATION_FIX_WATCHDOG_MS
) {
  if (lastObservedAt === null) return false;
  return Math.max(0, now - lastObservedAt) >= timeoutMs;
}

export function resolveSilentLocationIssue({
  servicesEnabled,
  permissionGranted,
}: {
  servicesEnabled: boolean;
  permissionGranted: boolean;
}): SilentLocationIssue {
  if (!permissionGranted) return 'permission_denied';
  return servicesEnabled ? 'unavailable' : 'services_disabled';
}
