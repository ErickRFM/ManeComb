import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const COMMIT_PATTERN = /^[a-f0-9]{40}$/i;
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const metadataPath = resolve(root, 'dist/build-meta.json');
const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));

assert.equal(metadata.schemaVersion, 1, 'build-meta.json debe declarar schemaVersion=1');
assert.equal(metadata.product, 'ventas', 'build-meta.json debe pertenecer a Ventas');
assert.equal(
  metadata.commit === null || COMMIT_PATTERN.test(String(metadata.commit || '')),
  true,
  'build-meta.json solo admite un SHA Git completo o null'
);

const expectedCommit = [
  process.env.CF_PAGES_COMMIT_SHA,
  process.env.GITHUB_SHA,
  process.env.RENDER_GIT_COMMIT,
  process.env.GIT_COMMIT,
  process.env.COMMIT_SHA,
]
  .map((value) => String(value || '').trim())
  .find((value) => COMMIT_PATTERN.test(value));

if (expectedCommit) {
  assert.equal(
    metadata.commit,
    expectedCommit.toLowerCase(),
    'el artefacto de Ventas debe conservar el SHA exacto que lo construyó'
  );
}

console.log(`ok - Ventas build metadata: ${metadata.commit || 'commit no disponible en este entorno'}`);
