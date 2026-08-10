const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const gate = path.join(__dirname, 'android-mapbox-artifact-gate.js');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manecomb-mapbox-gate-'));

function run(token, fileName) {
  return spawnSync(process.execPath, [gate, 'prepare', path.join(tempDir, fileName)], {
    encoding: 'utf8',
    env: { ...process.env, MAPBOX_ACCESS_TOKEN: token },
  });
}

const missing = run('', 'missing.env');
assert.notEqual(missing.status, 0, 'gate sin token debe fallar');
const invalid = run('sk.invalid-token', 'invalid.env');
assert.notEqual(invalid.status, 0, 'formato invalido debe fallar');
const testToken = 'pk.ci-contract-value-that-must-not-be-logged';
const valid = run(testToken, 'valid.env');
assert.equal(valid.status, 0, 'valor pk.* debe pasar');
assert.match(valid.stdout, /^Mapbox CI configuration: PASS\s*$/);
assert.ok(!`${missing.stdout}${missing.stderr}${invalid.stdout}${invalid.stderr}${valid.stdout}${valid.stderr}`.includes(testToken));

// Contrato de `certify`. Antes solo se probaba `prepare`, y por eso llego a CI
// una condicion imposible de satisfacer: se exigia el token en el
// AndroidManifest, donde ni la app ni @rnmapbox/maps lo declaran.
const { missingMapboxArtifactEvidence } = require(gate);

assert.deepEqual(
  missingMapboxArtifactEvidence({ dex: true, resourceValue: true, resourceEntry: true }),
  [],
  'con las tres evidencias presentes el APK esta certificado'
);
assert.deepEqual(
  missingMapboxArtifactEvidence({ dex: false, resourceValue: true, resourceEntry: true }),
  ['dex'],
  'sin BuildConfig en dex debe reportarse dex'
);
assert.deepEqual(
  missingMapboxArtifactEvidence({ dex: true, resourceValue: false, resourceEntry: true }),
  ['resources'],
  'sin el valor en resources debe reportarse resources'
);
assert.deepEqual(
  missingMapboxArtifactEvidence({ dex: true, resourceValue: true, resourceEntry: false }),
  ['string/mapbox_access_token'],
  'sin el string resource declarado debe reportarse por nombre'
);
assert.deepEqual(
  missingMapboxArtifactEvidence({ dex: false, resourceValue: false, resourceEntry: false }),
  ['dex', 'resources', 'string/mapbox_access_token'],
  'debe listar toda la evidencia ausente, no solo la primera'
);

// El AndroidManifest no forma parte del contrato: exigirlo era la causa del
// fallo. Evidencia debil (assert sobre fuente), declarada como tal.
const gateSource = fs.readFileSync(gate, 'utf8');
assert.ok(!gateSource.includes('AndroidManifest.xml'), 'certify no debe inspeccionar el manifest');
assert.ok(!gateSource.includes('xmltree'), 'certify no debe volcar xmltree');

console.log('Android Mapbox CI gate tests: PASS');

