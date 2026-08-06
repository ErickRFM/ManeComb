import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const adminRoot = resolve(import.meta.dirname, '..');
const repoRoot = resolve(adminRoot, '..');
const readAdmin = (path) => readFileSync(resolve(adminRoot, path), 'utf8');
const readRepo = (path) => readFileSync(resolve(repoRoot, path), 'utf8');

const runtime = readAdmin('src/lib/private-runtime.ts');
const main = readAdmin('src/main.tsx');
const headers = readAdmin('public/_headers');
const robots = readAdmin('public/robots.txt');
const adminEnv = readAdmin('.env.example');
const index = readAdmin('index.html');
const app = readRepo('backend/src/app.js');
const server = readRepo('backend/src/server.js');
const backendEnv = readRepo('backend/.env.example');
const deployment = readRepo('docs/admin-global-private-deployment.md');

assert.match(runtime, /VITE_PLATFORM_ACCESS_REQUIRED/);
assert.match(runtime, /parsed\.protocol !== 'https:'/);
assert.match(runtime, /admin-api\.manecomb\.com/);
assert.match(runtime, /validatePrivateAdminRuntime/);
assert.match(main, /assertPrivateAdminRuntimeConfiguration\(\)/);

for (const directive of [
  'X-Content-Type-Options: nosniff',
  'X-Frame-Options: DENY',
  'Referrer-Policy: no-referrer',
  'Content-Security-Policy:',
  "frame-ancestors 'none'",
  "object-src 'none'",
  'https://admin-api.manecomb.com',
  'Cache-Control: no-store',
]) {
  assert.ok(headers.includes(directive), `Falta header privado: ${directive}`);
}
assert.doesNotMatch(headers, /unsafe-eval|connect-src[^\n]*\*/i);
assert.match(robots, /Disallow: \/$/m);
assert.match(index, /name="robots" content="noindex, nofollow, noarchive"/);

for (const variable of [
  'VITE_API_URL=https://admin-api.manecomb.com',
  'VITE_PLATFORM_ACCESS_REQUIRED=true',
  'VITE_PLATFORM_API_HOST=admin-api.manecomb.com',
]) {
  assert.ok(adminEnv.includes(variable), `Falta ${variable} en Admin Global env example.`);
}

assert.match(app, /platformAccess/);
assert.match(app, /app\.use\("\/api\/platform", platformAccess, platformRouter\)/);
assert.match(server, /assertPlatformAccessConfiguration/);
for (const variable of [
  'PLATFORM_ACCESS_ENFORCEMENT_ENABLED=',
  'PLATFORM_ACCESS_ISSUER=',
  'PLATFORM_ACCESS_AUDIENCE=',
  'PLATFORM_ACCESS_JWKS_URL=',
]) {
  assert.ok(backendEnv.includes(variable), `Falta ${variable} en backend env example.`);
}

assert.match(deployment, /403.*sin Access/s);
assert.match(deployment, /401.*sin token Platform/s);
assert.match(deployment, /200.*Access \+ Platform \+ MFA/s);
assert.match(deployment, /no afirma que DNS, Cloudflare Access, Render o Producción ya estén configurados/);

console.log('ok - ADM-GLOBAL-P5 private access and deployment contracts');
