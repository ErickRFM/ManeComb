import type { Vehicle } from '../../../src/types/app';

export function isVehicleGpsFresh(vehicle: Vehicle | null | undefined, now = Date.now()) {
  if (!vehicle?.location || !vehicle.locationTimestamp || !vehicle.gpsFreshness?.freshUntil) return false;
  const freshUntil = new Date(vehicle.gpsFreshness.freshUntil).getTime();
  return Number.isFinite(freshUntil) && now <= freshUntil;
}
