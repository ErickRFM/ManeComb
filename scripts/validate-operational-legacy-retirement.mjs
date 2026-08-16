import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('../', import.meta.url);
const scanRoots = [
  'ventas/features/portal',
  'ventas/src/store',
  'mobile/src/screens',
  'mobile/src/hooks',
  'mobile/src/store',
  'backend/src',
];
const extensions = new Set(['.js', '.mjs', '.ts', '.tsx']);

function filesUnder(path) {
  const absolute = join(root.pathname.slice(1), path);
  const result = [];
  for (const entry of readdirSync(absolute)) {
    const candidate = join(absolute, entry);
    if (statSync(candidate).isDirectory()) result.push(...filesUnder(relative(root.pathname.slice(1), candidate)));
    else if (extensions.has(candidate.slice(candidate.lastIndexOf('.'))) && !candidate.includes('.test.')) result.push(candidate);
  }
  return result;
}

const sources = scanRoots.flatMap(filesUnder).map((file) => ({
  file: relative(root.pathname.slice(1), file).replaceAll('\\', '/'),
  source: readFileSync(file, 'utf8'),
}));

const forbidden = [
  ['legacy operational projection', /applyOperationalSnapshot\s*\(/],
  ['legacy location socket contract', /(?:\.on|\.emit)\s*\(\s*['"]location:updated['"]/],
  ['mutable mapData incident mirror', /applyIncidentToMapData|mapData\s*:\s*\{[\s\S]{0,300}?incidents\s*:/],
];

for (const [label, pattern] of forbidden) {
  const matches = sources.filter(({ source }) => pattern.test(source)).map(({ file }) => file);
  assert.deepEqual(matches, [], `${label}: ${matches.join(', ')}`);
}

const portalLive = sources.filter(({ file }) => file.startsWith('ventas/features/portal/'));
const legacyVehicleLiveRead = /\bvehicle\.(?:location|locationTimestamp|gpsFreshness|speed|operationalState|etaMinutes|activeRouteProgress)\b/;
assert.deepEqual(
  portalLive.filter(({ source }) => legacyVehicleLiveRead.test(source)).map(({ file }) => file),
  [],
  'Portal live surfaces must read OperationalUnitSnapshot'
);

console.log('operational legacy retirement gates passed');
