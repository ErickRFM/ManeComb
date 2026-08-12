import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (relativePath) => readFileSync(resolve(root, relativePath), 'utf8');
const guard = read('src/realtime/portal-realtime-recovery-guard.tsx');
const main = read('src/main.tsx');
const store = read('src/store/use-app-store.ts');
const failures = [];

function requireContains(source, fragment, message) {
  if (!source.includes(fragment)) failures.push(message);
}

requireContains(main, '<PortalRealtimeRecoveryGuard>', 'main debe montar el guard de recuperacion realtime');
requireContains(guard, "window.addEventListener('online'", 'debe reconciliar al recuperar Internet');
requireContains(guard, "window.addEventListener('pageshow'", 'debe reconciliar al restaurar una pagina dormida');
requireContains(guard, "document.addEventListener('visibilitychange'", 'debe reconciliar al volver a primer plano');
requireContains(guard, 'REALTIME_STALL_RECONCILE_MS', 'debe tener watchdog de snapshot estancado');
requireContains(guard, 'refreshAll()', 'la recuperacion debe usar la autoridad REST existente');
requireContains(store, "'operational-unit:updated'", 'Socket.IO debe seguir siendo la via realtime primaria');
requireContains(store, 'getOperationalUnitsRequest()', 'el fallback debe reconciliar el snapshot operacional canonico');

if (/\bio\s*\(/.test(guard) || guard.includes('socket.io-client')) {
  failures.push('el guard no debe abrir un segundo Socket.IO');
}
if (/Date\.now\(\).*gps|gps.*Date\.now\(\)/s.test(guard)) {
  failures.push('el guard no debe recalcular frescura GPS en cliente');
}

if (failures.length) {
  console.error('Portal realtime recovery contract failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('ok - portal realtime recovery contract');
