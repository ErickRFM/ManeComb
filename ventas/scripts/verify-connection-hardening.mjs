import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DISCONNECTED_RECONCILE_MS,
  shouldReconcileDisconnected,
  shouldResyncAfterTokenRotation,
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

assert.equal(
  shouldResyncAfterTokenRotation({ previousToken: null, nextToken: 'token-a', userId: 'u1' }),
  false,
  'el login inicial ya conecta el socket y no debe contarse como rotacion'
);
assert.equal(
  shouldResyncAfterTokenRotation({ previousToken: 'token-a', nextToken: 'token-a', userId: 'u1' }),
  false,
  'el mismo JWT no debe reconstruir realtime'
);
assert.equal(
  shouldResyncAfterTokenRotation({ previousToken: 'token-a', nextToken: 'token-b', userId: 'u1' }),
  true,
  'una rotacion JWT autenticada debe re-sincronizar el socket antes del siguiente handshake'
);

const guard = read('src/realtime/portal-realtime-recovery-guard.tsx');
assert.ok(guard.includes("reconcile('token')"), 'el guard debe reaccionar a la rotacion JWT');
assert.ok(guard.includes('shouldReconcileDisconnected'), 'el watchdog debe usar estados reales del transporte');
assert.ok(!guard.includes('REALTIME_STALL_RECONCILE_MS'), 'no debe volver el watchdog por falta de movimiento');
assert.ok(!guard.includes('operationalUnits'), 'la salud del socket no debe depender de que cambie la flota');

const plansCache = read('features/commercial/services/plans-cache.ts');
assert.ok(plansCache.includes('PLANS_CACHE_TTL_MS'), 'el cache de planes debe tener TTL explicito');
assert.ok(plansCache.includes('cacheAgeMs <= PLANS_CACHE_TTL_MS'), 'el TTL debe aplicarse al leer el cache');
assert.ok(plansCache.includes('localStorage.removeItem'), 'un catalogo vencido debe descartarse');

const readiness = read('../backend/src/services/runtime-readiness.js');
assert.ok(
  readiness.includes('redis.enabled && !redis.ready'),
  'Redis configurado pero caido debe degradar readiness'
);
assert.ok(
  readiness.includes('redisRequiredButUnavailable'),
  'la degradacion Redis debe quedar nombrada y auditable'
);

console.log('ok - ventas connection hardening behavior and contracts');
