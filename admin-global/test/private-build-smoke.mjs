import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
const read = (path) => readFileSync(resolve(dist, path), 'utf8');

for (const file of ['index.html', '_redirects', '_headers', 'robots.txt']) {
  assert.equal(existsSync(resolve(dist, file)), true, `El build privado debe incluir ${file}.`);
}

const redirects = read('_redirects');
const headers = read('_headers');
const robots = read('robots.txt');
const index = read('index.html');

assert.match(redirects, /^\/\* \/index\.html 200$/m);
assert.match(headers, /Content-Security-Policy:/);
assert.match(headers, /https:\/\/admin-api\.manecomb\.com/);
assert.match(headers, /Cache-Control: no-store/);
assert.doesNotMatch(headers, /unsafe-eval|connect-src[^\n]*\*/i);
assert.match(robots, /Disallow: \/$/m);
assert.match(index, /name="robots" content="noindex, nofollow, noarchive"/);

const assets = existsSync(resolve(dist, 'assets')) ? readdirSync(resolve(dist, 'assets')) : [];
assert.ok(assets.some((name) => name.endsWith('.js')), 'El build debe incluir JavaScript empaquetado.');
assert.equal(assets.some((name) => name.endsWith('.map')), false, 'El build privado no debe publicar sourcemaps.');

console.log('ok - private Admin Global build controls');
