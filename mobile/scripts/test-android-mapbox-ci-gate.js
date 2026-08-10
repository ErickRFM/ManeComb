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
console.log('Android Mapbox CI gate tests: PASS');

