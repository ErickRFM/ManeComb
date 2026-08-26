import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

const root = resolve(import.meta.dirname, '..');
const unitCard = readFileSync(resolve(root, 'features/portal/dashboard/components/dashboard-operational-unit-card.tsx'), 'utf8');
const sidePanel = readFileSync(resolve(root, 'features/portal/dashboard/components/dashboard-vehicle-side-panel.tsx'), 'utf8');
assert.doesNotMatch(unitCard, /activeSession\s*\|\|\s*latestSession/,
  'la tarjeta operacional no debe convertir la ultima jornada historica en jornada actual');
assert.match(unitCard, /getRouteInfo\(vehicle, activeSession\)/,
  'la ruta actual de la tarjeta debe derivarse solo de la jornada activa y la asignacion vigente');
assert.doesNotMatch(sidePanel, /activeSession\s*\|\|\s*latestSession/,
  'el panel operacional no debe usar latestSession como fallback de autoridad actual');
assert.match(sidePanel, /const session = activeSession;/,
  'el panel operacional debe reservar session para la jornada activa');
assert.match(sidePanel, /Eventos de la última jornada/,
  'si se muestran eventos historicos deben etiquetarse explicitamente como historicos');

console.log('ok - Portal usa Vehicle + OperationalUnitSnapshot sin proyeccion mutable ni fallback historico');
