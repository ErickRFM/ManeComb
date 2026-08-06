import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
const readDist = (path) => readFileSync(resolve(dist, path), 'utf8');
const readRoot = (path) => readFileSync(resolve(root, path), 'utf8');

for (const file of ['index.html', '_headers', 'robots.txt']) {
  assert.equal(existsSync(resolve(dist, file)), true, `El build privado debe incluir ${file}.`);
}
assert.equal(
  existsSync(resolve(dist, '_redirects')),
  false,
  'Workers Static Assets no debe publicar el fallback Pages _redirects.'
);
assert.equal(existsSync(resolve(root, 'wrangler.jsonc')), true, 'Debe existir wrangler.jsonc versionado.');

const headers = readDist('_headers');
const robots = readDist('robots.txt');
const index = readDist('index.html');
const wrangler = readRoot('wrangler.jsonc');

assert.match(wrangler, /"directory"\s*:\s*"\.\/dist"/);
assert.match(wrangler, /"not_found_handling"\s*:\s*"single-page-application"/);
assert.match(wrangler, /"workers_dev"\s*:\s*false/);
assert.match(wrangler, /"preview_urls"\s*:\s*false/);
assert.match(headers, /Content-Security-Policy:/);
assert.match(headers, /https:\/\/admin-api\.manecomb\.com/);
assert.match(headers, /Cache-Control: no-store/);
assert.doesNotMatch(headers, /unsafe-eval|connect-src[^\n]*\*/i);
assert.match(robots, /Disallow: \/$/m);
assert.match(index, /name="robots" content="noindex, nofollow, noarchive"/);

const assets = existsSync(resolve(dist, 'assets')) ? readdirSync(resolve(dist, 'assets')) : [];
assert.ok(assets.some((name) => name.endsWith('.js')), 'El build debe incluir JavaScript empaquetado.');
assert.equal(assets.some((name) => name.endsWith('.map')), false, 'El build privado no debe publicar sourcemaps.');

console.log('ok - private Admin Global Worker build controls');
