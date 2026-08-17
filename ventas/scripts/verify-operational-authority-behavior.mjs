import assert from 'node:assert/strict';
import { buildOperationalVehicleView } from '../features/portal/utils/operational-vehicle-view.js';

const vehicle = {
  id: 'vehicle-1',
  code: 'U-01',
  location: { latitude: 19.1, longitude: -99.1 },
  speed: 10,
};
const unitAtB = {
  unitId: vehicle.id,
  gps: { lat: 19.2, lng: -99.2, speedKmh: 36, connectionState: 'live' },
};
const unitAtC = {
  ...unitAtB,
  gps: { ...unitAtB.gps, lat: 19.3, lng: -99.3, speedKmh: 42 },
};

assert.deepEqual(buildOperationalVehicleView(vehicle, unitAtB).point, { latitude: 19.2, longitude: -99.2 },
  'unit.gps B debe ganar sobre Vehicle.location A');
assert.deepEqual(buildOperationalVehicleView(vehicle, unitAtC).point, { latitude: 19.3, longitude: -99.3 },
  'un snapshot B→C debe mover el marker sin location:updated');
assert.deepEqual(buildOperationalVehicleView({ ...vehicle, location: { latitude: 18, longitude: -98 } }, unitAtC).point,
  { latitude: 19.3, longitude: -99.3 }, 'un Vehicle/location legacy tardio no puede retroceder C');
assert.equal(buildOperationalVehicleView(vehicle, unitAtC).speedKmh, 42,
  'speedKmh se consume ya convertido, sin multiplicar por 3.6');
assert.equal(buildOperationalVehicleView(vehicle, { ...unitAtC, gps: { ...unitAtC.gps, lat: null, lng: null } }).point, null,
  'never_reported conserva la unidad pero no inventa un pin 0,0');

console.log('ok - Portal usa Vehicle + OperationalUnitSnapshot sin proyeccion mutable');
