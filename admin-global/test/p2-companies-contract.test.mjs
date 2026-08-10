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
assert.match(store, /listRequestId/);
assert.match(store, /detailRequestId/);
assert.match(store, /requestId !== listRequestId/);
assert.match(store, /requestId !== detailRequestId/);

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

// Least privilege: Empresas pertenece a platform.companies.read, pero los
// datos y controles financieros solo pueden activarse con commercial.read.
assert.match(screen, /usePlatformStore/);
assert.match(screen, /platform\.commercial\.read/);
assert.match(screen, /paymentStatus: canReadCommercial \? paymentStatus : null/);
assert.match(screen, /canReadCommercial \? \(/);
assert.match(screen, /company\.commercialAccess \? \(/);
assert.match(types, /commercialAccess: boolean/);

for (const forbiddenAction of [
  'suspendCompany',
  'reactivateCompany',
  'changeCompanyPlan',
  'refundCompanyOrder',
  'forceCompanyActivation',
]) {
  assert.equal(screen.includes(forbiddenAction), false, `P2 no debe incluir ${forbiddenAction}.`);
  assert.equal(api.includes(forbiddenAction), false, `La API P2 no debe incluir ${forbiddenAction}.`);
}

assert.match(types, /operationalStatus: 'operational' \| 'attention' \| 'inactive'/);
assert.doesNotMatch(types, /latitude|longitude|location:/i);
assert.match(shell, /pathname\.startsWith/);
assert.match(shell, /resetCompanies\(\)/);

console.log('ok - ADM-GLOBAL-P2 company list, detail, permissions and request ordering contracts');
