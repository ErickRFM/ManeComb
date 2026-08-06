import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const app = read('src/App.tsx');
const api = read('src/features/platform/governance/api.ts');
const store = read('src/features/platform/governance/store.ts');
const screens = read('src/features/platform/governance/governance-screens.tsx');
const types = read('src/features/platform/governance/types.ts');
const shell = read('src/features/platform/components/admin-shell.tsx');

for (const screen of ['AdminTeamScreen', 'AdminSessionsScreen']) {
  assert.match(app, new RegExp(screen));
}
assert.match(app, /case '\/admin\/team':/);
assert.match(app, /case '\/admin\/sessions':/);

assert.ok(api.includes('/team'), 'La API debe usar /team.');
assert.ok(api.includes('/sessions'), 'La API debe usar /sessions.');
assert.match(api, /['`]\/actions['`]/);
assert.match(api, /'Idempotency-Key': idempotencyKey/);
assert.match(api, /getPlatformTokenHeader\(token\)/);

assert.match(store, /globalThis\.crypto/);
assert.match(store, /randomUUID/);
assert.match(store, /getRandomValues/);
assert.doesNotMatch(store, /Math\.random/);
assert.match(store, /pendingAction/);
assert.match(store, /current && current\.fingerprint === fingerprint/);
assert.match(store, /retryAction/);
assert.match(store, /pending\.idempotencyKey/);
assert.doesNotMatch(store, /localStorage|sessionStorage/);
for (const guard of ['teamRequestId', 'sessionsRequestId', 'createRequestId', 'actionRequestId']) {
  assert.ok(store.includes(guard), `El store debe invalidar respuestas viejas con ${guard}.`);
}
assert.match(store, /requestId !== actionRequestId/);
assert.match(store, /actionRequestId \+= 1/);

assert.match(screens, /secureTextEntry/);
assert.match(screens, /La contraseña es temporal, no se persiste en el navegador/);
assert.match(screens, /expectedConfirmation = `CONFIRM \$\{action\}`/);
assert.match(screens, /reason\.trim\(\)\.length < 10/);
assert.match(screens, /capabilities\?\.modules\.actions/);
assert.match(screens, /capabilities\.user\.role === 'platform_owner'/);
assert.match(screens, /Reintentar misma acción/);
assert.match(screens, /misma Idempotency-Key/);
assert.doesNotMatch(screens, /console\.log|console\.error/);

assert.doesNotMatch(types, /passwordHash|mfaSecretEncrypted|mfaBackupCodes|refreshTokenHash|userAgent|\bip:/i);
assert.match(shell, /resetGovernance\(\)/);
assert.match(shell, /\['P1', 'P2', 'P3', 'P4'\]/);

console.log('ok - ADM-GLOBAL-P4 governance, idempotency and request ordering contracts');
