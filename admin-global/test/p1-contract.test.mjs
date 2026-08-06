import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const app = read('src/App.tsx');
const authApi = read('src/features/auth/api.ts');
const authStore = read('src/features/auth/store.ts');
const platformApi = read('src/features/platform/api.ts');
const platformStore = read('src/features/platform/store.ts');
const navigation = read('src/features/platform/navigation.ts');
const shell = read('src/features/platform/components/admin-shell.tsx');
const overview = read('src/features/platform/screens/overview-screen.tsx');
const sharedClient = read('src/lib/platform-api-client.ts');

assert.match(app, /case '\/admin\/overview':/);
assert.match(app, /<Redirect href="\/admin\/overview"/);
assert.doesNotMatch(app, /placeholder-screen/);
assert.match(app, /AdminProtectedRoute/);

assert.match(sharedClient, /createPlatformApiClient/);
assert.match(sharedClient, /parsed\.username \|\| parsed\.password/);
assert.match(sharedClient, /Authorization: `Bearer \$\{token\}`/);
assert.match(authApi, /@\/lib\/platform-api-client/);
assert.doesNotMatch(authApi, /axios\.create/);

assert.match(authStore, /restoreSessionFromRefresh/);
assert.match(authStore, /platformRefreshRequest\(refreshToken\)/);
assert.match(authStore, /persistSession\(refreshed\.token, refreshed\.refreshToken\)/);
assert.match(authStore, /renewSession:/);
assert.match(authStore, /renewalPromise/);
assert.match(authStore, /shouldRenewPlatformSession/);
assert.match(authStore, /persistSession\(refreshResult\.token, refreshResult\.refreshToken\)/);

assert.match(platformApi, /'\/capabilities'/);
assert.match(platformApi, /'\/overview'/);
assert.match(platformApi, /getPlatformTokenHeader\(token\)/);

const capabilitiesIndex = platformStore.indexOf('platformCapabilitiesRequest(token)');
const overviewIndex = platformStore.indexOf('platformOverviewRequest(token)');
assert.ok(capabilitiesIndex >= 0, 'El store debe cargar capabilities.');
assert.ok(overviewIndex > capabilitiesIndex, 'Capabilities deben cargarse antes del overview.');
assert.match(platformStore, /capabilities\.modules\.companies/);
assert.match(platformStore, /state: 'error'/);
assert.match(platformStore, /force = false/);

for (const moduleName of ['companies', 'commercial', 'system', 'audit', 'users', 'sessions']) {
  assert.match(navigation, new RegExp(`module: '${moduleName}'`));
}
assert.match(navigation, /capabilities\.modules\[item\.module\]/);
assert.match(navigation, /phase: 'P1'/);
assert.match(navigation, /phase: 'P4'/);

assert.match(shell, /useWindowDimensions/);
assert.match(shell, /getAdminNavigation\(capabilities\)/);
assert.match(shell, /resetPlatform\(\)/);
assert.match(shell, /router\.replace\('\/admin\/login'\)/);
assert.match(shell, /shouldRenewPlatformSession\(session\.token\)/);
assert.match(shell, /setInterval\(verifyExpiration, 60_000\)/);
assert.match(shell, /visibilitychange/);

for (const field of [
  'overview.companies.total',
  'overview.users.total',
  'overview.vehicles.total',
  'overview.commercialOrders',
  'capabilities.modules',
]) {
  assert.ok(overview.includes(field), `El dashboard debe consumir ${field}.`);
}
assert.match(overview, /state === 'loading'/);
assert.match(overview, /state === 'error'/);
assert.match(overview, /load\(token, true\)/);
assert.doesNotMatch(overview, /Math\.random|mockData|fakeData|sampleData/i);

console.log('ok - ADM-GLOBAL-P1 shell, capabilities, overview and session renewal contracts');
