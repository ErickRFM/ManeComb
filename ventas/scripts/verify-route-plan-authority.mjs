import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLatestRoutePlanAuthority } from '../features/portal/routes/latest-route-plan-authority.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const authority = createLatestRoutePlanAuthority();
const requestA = authority.begin();
assert.equal(requestA.isCurrent(), true, 'A debe iniciar como autoridad actual');
const requestB = authority.begin();
assert.equal(requestA.isCurrent(), false, 'B debe invalidar inmediatamente una respuesta tardía de A');
assert.equal(requestB.isCurrent(), true, 'B debe ser la autoridad vigente');
requestA.invalidate();
assert.equal(requestB.isCurrent(), true, 'cancelar A tarde no debe invalidar B');
requestB.invalidate();
assert.equal(requestB.isCurrent(), false, 'cerrar/cambiar editor debe invalidar la solicitud vigente');

const requestC = authority.begin();
authority.invalidate();
assert.equal(requestC.isCurrent(), false, 'un reset global debe invalidar cualquier respuesta pendiente');

const screenSource = fs.readFileSync(
  path.resolve(__dirname, '../features/portal/screens/portal-routes-screen.tsx'),
  'utf8'
);
assert.match(screenSource, /createLatestRoutePlanAuthority/);
assert.match(screenSource, /routePlanAuthorityRef\.current\.begin\(\)/);
assert.match(screenSource, /if \(!planRequest\.isCurrent\(\)\) return;/);
assert.match(screenSource, /if \(planRequest\.isCurrent\(\)\) setCatalogBusy\(false\);/);
assert.match(screenSource, /planRequest\.invalidate\(\)/);

console.log('ok - Portal Routes usa autoridad latest-wins para respuestas async de planeación');
