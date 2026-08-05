import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const app = read('src/App.tsx');
const api = read('src/features/platform/companies/api.ts');
const store = read('src/features/platform/companies/store.ts');
const screen = read('src/features/platform/companies/companies-screen.tsx');
const types = read('src/features/platform/companies/types.ts');
const shell = read('src/features/platform/components/admin-shell.tsx');

assert.match(app, /AdminCompaniesScreen/);
assert.match(app, /AdminCompanyDetailScreen/);
assert.match(app, /case '\/admin\/companies':/);
assert.match(app, /pathname\.startsWith\('\/admin\/companies\/'\)/);

assert.match(api, /createPlatformApiClient\('\/api\/platform\/companies'\)/);
assert.match(api, /URLSearchParams/);
assert.match(api, /encodeURIComponent\(organizationId\)/);
assert.match(api, /getPlatformTokenHeader\(token\)/);

assert.match(store, /loadList/);
assert.match(store, /loadDetail/);
assert.match(store, /listState: 'error'/);
assert.match(store, /detailState: 'error'/);

for (const field of [
  'company.companyName',
  'company.organizationId',
  'company.owner',
  'company.plan',
  'company.users',
  'company.vehicles',
  'company.commercial',
]) {
  assert.ok(screen.includes(field), `La interfaz debe consumir ${field}.`);
}
assert.match(screen, /Solo lectura/);
assert.match(screen, /paymentStatus/);
assert.match(screen, /planId/);
assert.match(screen, /pagination\.hasNext/);
assert.match(screen, /router\.push\(`\/admin\/companies\//);
assert.doesNotMatch(screen, /suspend|reactivate|changePlan|refund|forceActivation/i);

assert.match(types, /operationalStatus: 'operational' \| 'attention' \| 'inactive'/);
assert.doesNotMatch(types, /latitude|longitude|location:/i);
assert.match(shell, /pathname\.startsWith/);

console.log('ok - ADM-GLOBAL-P2 company list and detail contracts');
