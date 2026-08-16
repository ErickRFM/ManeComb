import type { GpsConnectionState } from '@shared/operational-contract';
import type { Vehicle } from '../../../src/types/app';

/**
 * El Portal NO calcula frescura GPS. La autoridad es
 * `backend/src/domain/gps-telemetry-state.js`, viaja en el contrato operacional
 * y aqui solo se lee.
 *
 * Historia del bug que esto cierra: primero se leia `gpsFreshness.freshUntil`,
 * que `applyOperationalSnapshot` dejaba en `null`, asi que toda unidad salia
 * "GPS vencido". Se corrigio a `gpsFreshness.state === 'fresh'`, pero eso
 * colapsaba cinco estados en un booleano: una unidad que jamas reporto y otra
 * que perdio senal hace diez segundos se mostraban igual, y una unidad nueva
 * con ubicacion historica de otro conductor decia "GPS vencido".
 */
export function getVehicleGpsConnectionState(
  vehicle: Vehicle | null | undefined
): GpsConnectionState {
  const freshness = vehicle?.gpsFreshness;
  if (freshness?.connectionState) return freshness.connectionState;

  // Compatibilidad con payloads previos al contrato canonico: sin
  // `connectionState` solo se puede afirmar lo que el estado legado permite.
  if (!freshness) return vehicle?.location ? 'lost' : 'never_reported';
  if (freshness.state === 'fresh') return 'live';
  if (freshness.state === 'stale') return 'stale';
  return vehicle?.location ? 'lost' : 'never_reported';
}

/** Una unidad con enlace vivo. `delayed` ya perdio el lease de presencia. */
export function isVehicleGpsLive(vehicle: Vehicle | null | undefined) {
  return getVehicleGpsConnectionState(vehicle) === 'live';
}

/**
 * Solo `never_reported` significa "todavia no hay nada"; el resto conserva una
 * ultima posicion conocida que sigue siendo util operacionalmente.
 */
export function hasVehicleEverReportedGps(vehicle: Vehicle | null | undefined) {
  return getVehicleGpsConnectionState(vehicle) !== 'never_reported';
}
