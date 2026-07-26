import type { Vehicle } from '../../../src/types/app';

// §5.4 (bug de produccion): antes leia gpsFreshness.freshUntil, que
// applyOperationalSnapshot pone en null al fusionar el snapshot -> devolvia
// false siempre y toda unidad salia "GPS vencido". La frescura resuelta del
// snapshot vive en gpsFreshness.state (misma derivacion que usa mobile).
export function isVehicleGpsFresh(vehicle: Vehicle | null | undefined) {
  return vehicle?.gpsFreshness?.state === 'fresh';
}
