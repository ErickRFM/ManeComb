import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const app = read('src/App.tsx');
const api = read('src/features/platform/operations/api.ts');
const store = read('src/features/platform/operations/store.ts');
const screens = read('src/features/platform/operations/operations-screens.tsx');
const types = read('src/features/platform/operations/types.ts');
const shell = read('src/features/platform/components/admin-shell.tsx');

for (const screen of ['AdminCommercialScreen', 'AdminCommercialDetailScreen', 'AdminSystemScreen', 'AdminAuditScreen']) {
  assert.match(app, new RegExp(screen));
}
assert.match(app, /case '\/admin\/commercial':/);
assert.match(app, /case '\/admin\/system':/);
assert.match(app, /case '\/admin\/audit':/);
assert.match(app, /pathname\.startsWith\('\/admin\/commercial\/'\)/);

for (const endpoint of ['/commercial/orders', '/system/readiness', '/audit']) {
  assert.ok(api.includes(endpoint), `La API debe consumir ${endpoint}.`);
}
assert.match(api, /getPlatformTokenHeader\(token\)/);
assert.match(api, /encodeURIComponent\(orderId\)/);

for (const loader of ['loadOrders', 'loadOrder', 'loadReadiness', 'loadAudit']) {
  assert.ok(store.includes(loader), `El store debe incluir ${loader}.`);
}
for (const guard of [
  'ordersRequestId',
  'orderDetailRequestId',
  'readinessRequestId',
  'auditRequestId',
]) {
  assert.ok(store.includes(guard), `El store debe invalidar respuestas viejas con ${guard}.`);
}
assert.match(store, /auditPersistent/);

assert.match(screens, /Solo lectura/);
assert.match(screens, /Nunca expone secretos, tokens ni URLs privadas/);
assert.match(screens, /IP, user-agent y payloads crudos permanecen fuera/);
assert.match(screens, /paymentStatus/);
assert.match(screens, /Persistencia no disponible/);
assert.doesNotMatch(screens, /refundOrder|capturePayment|cancelSubscription|forceActivation|rotateSecret|deleteAudit/i);

assert.doesNotMatch(types, /accessToken|apiKey|webhookSecret|paymentProviderReference|userAgent|\bip:/i);
assert.match(shell, /resetOperations\(\)/);
assert.match(shell, /['"]P3['"]/);
assert.match(shell, /styles\.phaseBadgeReady/);

console.log('ok - ADM-GLOBAL-P3 operations, audit and request ordering contracts');
