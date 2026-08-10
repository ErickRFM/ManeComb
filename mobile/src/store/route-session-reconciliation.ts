/**
 * `activeRouteSession` significa "la jornada activa de MI unidad". La autoridad
 * durable es REST: `refreshAll` la puebla con
 * `user.vehicleId ? getActiveRouteSessionRequest(user.vehicleId) : null`.
 *
 * Backend difunde `route-session:updated` a las salas de **todo rol con
 * canViewAnalytics** (owner, admin, dispatcher, supervisor, billing_manager,
 * support, viewer) ademas de a `user:{driverId}`. Un conductor solo recibe las
 * suyas, pero un rol administrativo recibe las de cualquier conductor de su
 * organizacion.
 *
 * Adoptarlas sin filtrar sobrescribia su propio estado con el de otro actor y lo
 * persistia en su cache offline. Realtime representa el estado; no redefine a
 * quien pertenece la jornada.
 */
export function shouldAdoptRouteSessionUpdate(input: {
  sessionVehicleId?: string | null;
  userVehicleId?: string | null;
}) {
  const ownVehicleId = String(input.userVehicleId || '').trim();
  if (!ownVehicleId) return false;

  return ownVehicleId === String(input.sessionVehicleId || '').trim();
}
