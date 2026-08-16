/**
 * Contrato de presentacion de tracking en el Portal.
 *
 * Dos reglas que ya se rompieron en produccion y no pueden volver a romperse:
 *
 * 1. El Portal NO decide frescura GPS. La autoridad es
 *    `backend/src/domain/gps-telemetry-state.js` y viaja en el contrato
 *    operacional. Colapsarla a un booleano hacia que una unidad recien dada de
 *    alta, y una unidad con ubicacion historica reasignada a un conductor nuevo,
 *    dijeran "GPS vencido".
 *
 * 2. `recording:{vehicleId}` y `assigned:{...}` son identidades TECNICAS de
 *    jornada. Nunca pueden presentarse como nombre ni codigo de ruta. Sin la
 *    guarda, cada jornada libre mostraba "Ruta recording:vehicle-101".
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const tracking = read('features/portal/utils/tracking.ts');
const dashboardUtils = read('features/portal/dashboard/dashboard.utils.ts');
const operationsMap = read('features/portal/components/operations-map.tsx');
const unitCard = read('features/portal/dashboard/components/dashboard-operational-unit-card.tsx');
const contract = read('../shared/operational-contract/selectors.ts');
const contractTypes = read('../shared/operational-contract/types.ts');

// --- 1. Taxonomia canonica completa en el contrato --------------------------
for (const state of ['never_reported', 'live', 'delayed', 'stale', 'lost']) {
  if (!contractTypes.includes(`'${state}'`)) {
    throw new Error(`Falta el estado canonico de GPS ${state} en el contrato operacional.`);
  }
}

if (!contract.includes('Esperando primera ubicación')) {
  throw new Error('El contrato debe presentar never_reported como "Esperando primera ubicación".');
}

// --- 2. El Portal presenta, no recalcula ------------------------------------
if (!tracking.includes('getVehicleGpsConnectionState')) {
  throw new Error('El Portal debe leer el estado GPS canonico con getVehicleGpsConnectionState.');
}

if (/export function isVehicleGpsFresh/.test(tracking)) {
  throw new Error(
    'isVehicleGpsFresh colapsaba cinco estados en un booleano y no puede reintroducirse.'
  );
}

for (const [file, source] of [
  ['dashboard.utils.ts', dashboardUtils],
  ['operations-map.tsx', operationsMap],
  ['dashboard-operational-unit-card.tsx', unitCard],
]) {
  if (!source.includes('getVehicleGpsConnectionState')) {
    throw new Error(`${file} debe consumir el estado GPS canonico, no derivarlo.`);
  }
}

if (dashboardUtils.includes("'GPS vencido'")) {
  throw new Error(
    'El Portal ya no puede etiquetar "GPS vencido": debe distinguir esperando/retrasado/sin señal/perdido.'
  );
}

if (!dashboardUtils.includes('Esperando primera ubicación')) {
  throw new Error('El Portal debe distinguir la unidad que nunca reporto una posicion.');
}

// La ultima posicion conocida nunca se descarta por ser antigua.
if (!dashboardUtils.includes('última ubicación')) {
  throw new Error('El Portal debe conservar y anunciar la ultima ubicacion conocida.');
}

// --- 3. La identidad tecnica de jornada nunca se muestra como ruta ----------
if (!contract.includes('isTechnicalRouteId') || !contract.includes('isRecordingRouteId')) {
  throw new Error('El contrato debe definir las identidades tecnicas de ruta en un solo lugar.');
}

if (!dashboardUtils.includes('isTechnicalRouteId')) {
  throw new Error(
    'getRouteInfo debe descartar recording:/assigned: o el Portal muestra "Ruta recording:vehicle-101".'
  );
}

if (!dashboardUtils.includes('RECORDING_JOURNEY_LABEL')) {
  throw new Error('Una jornada libre en curso debe presentarse como "Grabando recorrido".');
}

console.log('ok - presentacion de tracking consume la autoridad canonica y oculta identidades tecnicas');
