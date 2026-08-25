import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (relativePath) => readFileSync(resolve(root, relativePath), 'utf8');
const guard = read('src/realtime/portal-realtime-recovery-guard.tsx');
const main = read('src/main.tsx');
const store = read('src/store/use-app-store.ts');
const manualPayment = read('features/portal/payments/manual-transfer-evidence-card.tsx');
const failures = [];

function requireContains(source, fragment, message) {
  if (!source.includes(fragment)) failures.push(message);
}

requireContains(main, '<PortalRealtimeRecoveryGuard>', 'main debe montar el guard de recuperacion realtime');
requireContains(guard, "window.addEventListener('online'", 'debe reconciliar al recuperar Internet');
requireContains(guard, "window.addEventListener('pageshow'", 'debe reconciliar al restaurar una pagina dormida');
requireContains(guard, "document.addEventListener('visibilitychange'", 'debe reconciliar al volver a primer plano');
requireContains(guard, 'shouldReconcileDisconnected', 'el watchdog debe depender del estado real de Socket.IO');
requireContains(guard, 'refreshAll()', 'la recuperacion debe usar la autoridad REST existente');
requireContains(guard, 'subscribeSharedPortalRealtimeSocket', 'los eventos operativos deben reutilizar el Socket.IO compartido');
requireContains(guard, "boundSocket?.on('incident:created'", 'Portal debe consumir incident:created');
requireContains(guard, "boundSocket?.on('incident:sos'", 'Portal debe consumir incident:sos');
requireContains(guard, "applyRealtimeEvent('incident:updated'", 'created y SOS deben reutilizar la proyeccion incremental canonica de incidentes');
requireContains(store, "'operational-unit:updated'", 'Socket.IO debe seguir siendo la via realtime primaria');
requireContains(store, 'getOperationalUnitsRequest()', 'el fallback debe reconciliar el snapshot operacional canonico');
requireContains(store, 'socket.auth = { token: session.token };', 'el refresh JWT debe actualizar la credencial realtime');
requireContains(manualPayment, 'subscribeSharedPortalRealtimeSocket', 'la evidencia SPEI debe reutilizar el socket compartido');
requireContains(manualPayment, "boundSocket?.on('manual-payment:updated'", 'la evidencia SPEI debe reaccionar al evento backend real');
requireContains(manualPayment, "String(payload?.orderId || '') !== orderId", 'una orden SPEI no debe recargarse por eventos de otra orden');
requireContains(manualPayment, 'void load();', 'el evento de pago debe reconciliar la evidencia desde su endpoint canonico');

if (/\bio\s*\(/.test(guard) || guard.includes('socket.io-client')) {
  failures.push('el guard no debe abrir un segundo Socket.IO');
}
if (/\bio\s*\(/.test(manualPayment) || manualPayment.includes('socket.io-client')) {
  failures.push('la tarjeta SPEI no debe abrir un segundo Socket.IO');
}
if (guard.includes('REALTIME_STALL_RECONCILE_MS') || guard.includes('operationalUnits')) {
  failures.push('la salud realtime no debe inferirse por movimiento de la flota');
}
if (guard.includes("reconcile('token')")) {
  failures.push('la rotacion JWT no debe provocar una recarga REST completa');
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
