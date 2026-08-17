/**
 * Regresion de concurrencia: cancelacion de suscripcion.
 *
 * CARRERA DEMOSTRADA. Antes, la ruta hacia leer -> comprobar -> escribir con
 * `await` entre medias. Dos cancelaciones concurrentes leian la misma orden no
 * cancelada, ambas pasaban la guarda y ambas ejecutaban los efectos.
 *
 * Medido con barrera determinista sobre el codigo anterior:
 *
 *   respuestas ................ [200, 200]
 *   escrituras de cancelacion . 2
 *   eventos de auditoria ...... 2
 *
 * El estado final coincidia (`cancelled`), asi que los codigos HTTP no
 * revelaban nada: el dano era el efecto DUPLICADO. El correo de cancelacion
 * viaja por el mismo camino que la auditoria, despues de la guarda.
 *
 * Con `cancelCommercialSubscriptionAtomically`:
 *
 *   respuestas ................ [200, 409]
 *   escrituras de cancelacion . 1
 *   eventos de auditoria ...... 1
 *
 * La barrera se coloca en la ESCRITURA a proposito: garantiza que ambas
 * peticiones ya leyeron el estado previo y pasaron la guarda antes de competir.
 * Sin ella el test seria no determinista y no probaria nada.
 */
const assert = require("node:assert/strict");
const http = require("node:http");
const createApp = require("../src/app");
const { createEmbeddedStore } = require("../src/data/store");

/** Libera cuando `expected` participantes han llegado. */
function createBarrier(expected) {
  let arrived = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  return async function wait() {
    arrived += 1;
    if (arrived >= expected) release();
    await gate;
  };
}

/** Cuenta efectos reales; no depende de proveedores externos. */
function instrumentStore(baseStore, barrier) {
  const counters = { cancellationWrites: 0, auditCancelEvents: 0, applied: 0, rejected: 0 };
  const proxy = Object.create(baseStore);

  proxy.recordAppEvent = async (payload) => {
    if (String(payload?.type || "") === "subscription_cancelled") counters.auditCancelEvents += 1;
    return baseStore.recordAppEvent ? baseStore.recordAppEvent(payload) : undefined;
  };

  proxy.cancelCommercialSubscriptionAtomically = async (orderId, options) => {
    await barrier();
    const result = await baseStore.cancelCommercialSubscriptionAtomically(orderId, options);
    if (result.applied) {
      counters.cancellationWrites += 1;
      counters.applied += 1;
    } else {
      counters.rejected += 1;
    }
    return result;
  };

  return { proxy, counters };
}

async function call(url, path, { method = "GET", body, token, headers = {} } = {}) {
  const response = await fetch(`${url}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try { data = await response.json(); } catch { data = null; }
  return { status: response.status, data };
}

async function testConcurrentCancellationAppliesOnce() {
  const baseStore = createEmbeddedStore();
  const barrier = createBarrier(2);
  const { proxy, counters } = instrumentStore(baseStore, barrier);

  const app = createApp({ store: proxy, getDbState: () => ({ connected: false, mode: "embedded", message: "test" }) });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}/api`;

  try {
    const email = `race-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
    const registered = await call(url, "/auth/register", {
      method: "POST",
      body: {
        name: "Dueña", email, password: "Contrasena#Segura9",
        phone: "5555555555", companyName: "Race SA", accountType: "company_owner"
      }
    });
    assert.equal(registered.status, 201);
    const token = registered.data?.data?.token || registered.data?.token;

    const checkout = await call(url, "/commercial/checkout", {
      method: "POST", token,
      headers: { "Idempotency-Key": `race-${Date.now()}` },
      body: {
        companyName: "Race SA", contactName: "Dueña", email,
        phone: "5555555555", planId: "control-6", paymentMethod: "transfer"
      }
    });
    assert.ok([200, 201].includes(checkout.status), "el checkout debe crear la orden");

    const [a, b] = await Promise.all([
      call(url, "/account/subscription/cancel", { method: "POST", token, body: {} }),
      call(url, "/account/subscription/cancel", { method: "POST", token, body: {} })
    ]);

    const statuses = [a.status, b.status].sort();
    assert.deepEqual(statuses, [200, 409], `una aplica y la otra entra en conflicto (llego ${statuses})`);

    // Lo que realmente importa: los EFECTOS, no los codigos.
    assert.equal(counters.cancellationWrites, 1, "solo una transicion efectiva");
    assert.equal(counters.auditCancelEvents, 1, "solo una entrada de auditoria");
    assert.equal(counters.applied, 1, "el primitivo aplica una sola vez");
    assert.equal(counters.rejected, 1, "y rechaza la concurrente");

    const finalOrder = baseStore.getCommercialOrderById(checkout.data.data.id);
    assert.equal(String(finalOrder.status).toLowerCase(), "cancelled", "estado final cancelado");

    // Retry posterior: idempotente, sin nuevos efectos.
    const retry = await call(url, "/account/subscription/cancel", { method: "POST", token, body: {} });
    assert.equal(retry.status, 409, "un retry posterior no vuelve a cancelar");
    assert.equal(counters.cancellationWrites, 1, "el retry no produce otra transicion");
    assert.equal(counters.auditCancelEvents, 1, "ni otra entrada de auditoria");

    console.log("ok - cancelacion concurrente: 1 transicion, 1 auditoria, estado cancelled");
  } finally {
    server.close();
  }
}

// El primitivo, aislado del transporte.
function testPrimitiveRejectsSecondCancellation() {
  const store = createEmbeddedStore();
  const order = store.createCommercialOrder({
    organizationId: "org-race",
    planId: "starter-2",
    contactEmail: "cliente@example.com"
  });
  const cancelledAt = new Date().toISOString();

  const first = store.cancelCommercialSubscriptionAtomically(order.id, { cancelledAt });
  const second = store.cancelCommercialSubscriptionAtomically(order.id, { cancelledAt });

  assert.equal(first.applied, true);
  assert.equal(second.applied, false);
  assert.equal(second.reason, "already_cancelled");

  const missing = store.cancelCommercialSubscriptionAtomically("no-existe", { cancelledAt });
  assert.equal(missing.applied, false);
  assert.equal(missing.reason, "order_not_found");

  console.log("ok - primitivo: aplica una vez y distingue orden inexistente");
}

async function run() {
  testPrimitiveRejectsSecondCancellation();
  await testConcurrentCancellationAppliesOnce();
  console.log("ok - carrera de cancelacion cerrada con evidencia de efectos");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
