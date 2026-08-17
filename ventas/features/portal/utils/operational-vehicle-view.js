/**
 * View model efimero. No muta Vehicle ni copia el snapshot dentro de otra
 * autoridad; se reconstruye en cada render desde identidad + runtime.
 *
 * @param {object} vehicle
 * @param {object | null | undefined} unit
 */
export function buildOperationalVehicleView(vehicle, unit) {
  const lat = typeof unit?.gps?.lat === 'number' && Number.isFinite(unit.gps.lat) ? unit.gps.lat : null;
  const lng = typeof unit?.gps?.lng === 'number' && Number.isFinite(unit.gps.lng) ? unit.gps.lng : null;
  return {
    vehicle,
    unit: unit || null,
    point: lat === null || lng === null ? null : { latitude: lat, longitude: lng },
    speedKmh: typeof unit?.gps?.speedKmh === 'number' && Number.isFinite(unit.gps.speedKmh)
      ? unit.gps.speedKmh
      : null,
  };
}
