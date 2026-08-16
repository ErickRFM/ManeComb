import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DISCONNECTED_RECONCILE_MS,
  shouldReconcileDisconnected,
} from '../src/realtime/recovery-policy.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (relativePath) => readFileSync(resolve(root, relativePath), 'utf8');

assert.equal(
  shouldReconcileDisconnected({ socketStatus: 'connected', visible: true, disconnectedForMs: 120_000 }),
  false,
  'una flota quieta con Socket.IO conectado no debe disparar polling REST'
);
assert.equal(
  shouldReconcileDisconnected({ socketStatus: 'connecting', visible: true, disconnectedForMs: 120_000 }),
  false,
  'el watchdog no debe competir contra un handshake en curso'
);
assert.equal(
  shouldReconcileDisconnected({
    socketStatus: 'disconnected',
    visible: true,
    disconnectedForMs: DISCONNECTED_RECONCILE_MS - 1,
  }),
  false,
  'una desconexion breve debe permitir primero la reconexion nativa de Socket.IO'
);
assert.equal(
  shouldReconcileDisconnected({
    socketStatus: 'disconnected',
    visible: true,
    disconnectedForMs: DISCONNECTED_RECONCILE_MS,
  }),
  true,
  'una desconexion sostenida debe reconciliar contra REST'
);
assert.equal(
  shouldReconcileDisconnected({ socketStatus: 'error', visible: true, disconnectedForMs: 30_000 }),
  true,
  'un connect_error sostenido debe activar recuperacion'
);
assert.equal(
  shouldReconcileDisconnected({ socketStatus: 'disconnected', visible: false, disconnectedForMs: 30_000 }),
  false,
  'una pestana oculta no debe generar polling de recuperacion'
);

const guard = read('src/realtime/portal-realtime-recovery-guard.tsx');
assert.ok(guard.includes('shouldReconcileDisconnected'), 'el watchdog debe usar estados reales del transporte');
assert.ok(!guard.includes('REALTIME_STALL_RECONCILE_MS'), 'no debe volver el watchdog por falta de movimiento');
assert.ok(!guard.includes('operationalUnits'), 'la salud del socket no debe depender de que cambie la flota');
assert.ok(!guard.includes("reconcile('token')"), 'rotar JWT no debe forzar una recarga completa del Portal');

const store = read('src/store/use-app-store.ts');
assert.ok(
  store.includes('socket.auth = { token: session.token };'),
  'el refresh HTTP debe actualizar la credencial del siguiente handshake Socket.IO'
);
assert.ok(
  store.includes('socketSessionKey = `${SOCKET_URL}:${refreshedState.user.id}:${session.token}`;'),
  'la clave de sesion realtime debe quedar alineada con el JWT rotado'
);
assert.ok(
  store.includes('if (socket && refreshedState.user)'),
  'la sincronizacion JWT debe reutilizar el socket existente y tolerar que aun no exista'
);

const plansCache = read('features/commercial/services/plans-cache.ts');
assert.ok(plansCache.includes('PLANS_CACHE_TTL_MS'), 'el cache de planes debe tener TTL explicito');
assert.ok(plansCache.includes('cacheAgeMs <= PLANS_CACHE_TTL_MS'), 'el TTL debe aplicarse al leer el cache');
assert.ok(plansCache.includes('localStorage.removeItem'), 'un catalogo vencido debe descartarse');
assert.ok(
  /try\s*\{\s*return Boolean\(window\.localStorage\);/s.test(plansCache),
  'el cache de planes debe tolerar navegadores con localStorage restringido'
);

console.log('ok - ventas connection hardening behavior and contracts');
