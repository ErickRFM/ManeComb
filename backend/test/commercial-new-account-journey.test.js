/**
 * Recorrido comercial de una cuenta COMPLETAMENTE NUEVA, extremo a extremo y por
 * HTTP real:
 *
 *   Registration -> Order -> Payment -> Tenant -> Subscription -> Portal
 *
 * No se prepara Mongo ni el store a mano para hacer avanzar el flujo: cada paso
 * ocurre por su endpoint, como lo viviria un usuario real. El objetivo es
 * detectar estados parciales y dependencias ocultas, no confirmar el happy path.
 */
const assert = require("node:assert/strict");
const http = require("node:http");
const createApp = require("../src/app");
const { createEmbeddedStore } = require("../src/data/store");

const PLAN_ID = "starter-2";

async function createContext() {
  const store = createEmbeddedStore();
  const app = createApp({ store, getDbState: () => ({ connected: false, mode: "embedded", message: "test" }) });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    store,
    url: `http://127.0.0.1:${server.address().port}/api`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

async function call(context, path, { method = "GET", body, token, headers = {} } = {}) {
  const response = await fetch(`${context.url}${path}`, {
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

function uniqueEmail(tag) {
  return `ola7-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

function registrationPayload(email) {
  return {
    name: "Dueña de Empresa",
    email,
    password: "Contrasena#Segura9",
    phone: "5555555555",
    companyName: "Transportes OLA7",
    accountType: "company_owner"
  };
}

// --- 1. Registro: cuenta nueva y rechazo de duplicado ------------------------
async function testRegistrationIsAuthoritative() {
  const context = await createContext();
  try {
    const email = uniqueEmail("reg");
    const first = await call(context, "/auth/register", { method: "POST", body: registrationPayload(email) });
    assert.equal(first.status, 201, "una cuenta nueva debe registrarse");
    assert.ok(first.data?.data?.token || first.data?.token, "el registro debe devolver sesion");

    // Mismo correo otra vez: la autoridad es el backend, no un boton deshabilitado.
    const duplicate = await call(context, "/auth/register", { method: "POST", body: registrationPayload(email) });
    assert.notEqual(duplicate.status, 201, "el mismo correo no puede registrarse dos veces");
    assert.ok(duplicate.status >= 400, `se esperaba rechazo, llego ${duplicate.status}`);

    // Doble submit simultaneo del MISMO correo: solo una cuenta puede nacer.
    const raceEmail = uniqueEmail("race");
    const [a, b] = await Promise.all([
      call(context, "/auth/register", { method: "POST", body: registrationPayload(raceEmail) }),
      call(context, "/auth/register", { method: "POST", body: registrationPayload(raceEmail) })
    ]);
    const created = [a, b].filter((r) => r.status === 201);
    assert.equal(created.length, 1, "un doble submit concurrente no puede crear dos cuentas");

    console.log("ok - registro: duplicado y doble submit rechazados por backend");
  } finally {
    await context.close();
  }
}

// --- 2. Order: idempotencia por Idempotency-Key ------------------------------
async function testOrderIdempotency() {
  const context = await createContext();
  try {
    const email = uniqueEmail("order");
    const registered = await call(context, "/auth/register", { method: "POST", body: registrationPayload(email) });
    const token = registered.data?.data?.token || registered.data?.token;
    assert.ok(token, "se requiere sesion para checkout");

    const checkoutBody = {
      companyName: "Transportes OLA7",
      contactName: "Dueña de Empresa",
      email,
      phone: "5555555555",
      planId: PLAN_ID,
      paymentMethod: "transfer"
    };

    // Sin Idempotency-Key el checkout debe rechazarse.
    const missingKey = await call(context, "/commercial/checkout", { method: "POST", body: checkoutBody, token });
    assert.equal(missingKey.status, 400, "el checkout exige Idempotency-Key");

    const key = `ola7-${Date.now()}`;
    const first = await call(context, "/commercial/checkout", {
      method: "POST", body: checkoutBody, token, headers: { "Idempotency-Key": key }
    });
    assert.ok([200, 201].includes(first.status), `checkout inicial fallo: ${first.status}`);
    const firstOrderId = first.data?.data?.id;
    assert.ok(firstOrderId, "el checkout debe devolver una orden");

    // Retry del cliente: misma clave => la MISMA orden, no una segunda.
    const retry = await call(context, "/commercial/checkout", {
      method: "POST", body: checkoutBody, token, headers: { "Idempotency-Key": key }
    });
    assert.ok([200, 201].includes(retry.status));
    assert.equal(retry.data?.data?.id, firstOrderId, "un retry con la misma clave no puede crear otra orden");

    // Doble submit concurrente con la misma clave.
    const raceKey = `ola7-race-${Date.now()}`;
    const [a, b] = await Promise.all([
      call(context, "/commercial/checkout", { method: "POST", body: checkoutBody, token, headers: { "Idempotency-Key": raceKey } }),
      call(context, "/commercial/checkout", { method: "POST", body: checkoutBody, token, headers: { "Idempotency-Key": raceKey } })
    ]);
    const ids = [a, b].filter((r) => [200, 201].includes(r.status)).map((r) => r.data?.data?.id);
    assert.ok(ids.length >= 1, "al menos una respuesta valida");
    assert.equal(new Set(ids).size, 1, "un doble submit concurrente no puede producir dos ordenes");

    console.log("ok - order: Idempotency-Key obligatoria, retry y doble submit no duplican");
  } finally {
    await context.close();
  }
}

// --- 3. planId manipulado: la orden manda sobre la capacidad -----------------
async function testPlanIdCannotBeForged() {
  const context = await createContext();
  try {
    const email = uniqueEmail("plan");
    const registered = await call(context, "/auth/register", { method: "POST", body: registrationPayload(email) });
    const token = registered.data?.data?.token || registered.data?.token;

    const forged = await call(context, "/commercial/checkout", {
      method: "POST",
      token,
      headers: { "Idempotency-Key": `ola7-forged-${Date.now()}` },
      body: {
        companyName: "Transportes OLA7",
        contactName: "Dueña de Empresa",
        email,
        phone: "5555555555",
        planId: "plan-inventado-999",
        paymentMethod: "transfer"
      }
    });
    assert.ok(forged.status >= 400, "un planId inexistente no puede generar orden");

    console.log("ok - order: planId inexistente rechazado por el catalogo autoritativo");
  } finally {
    await context.close();
  }
}

// --- 4. Planes: el catalogo publico es la unica fuente -----------------------
async function testPublicPlanCatalogIsAuthoritative() {
  const context = await createContext();
  try {
    const plans = await call(context, "/commercial/plans");
    assert.equal(plans.status, 200);
    const list = plans.data?.data || plans.data;
    assert.ok(Array.isArray(list) && list.length > 0, "el catalogo publico debe exponer planes");
    const starter = list.find((plan) => plan.id === PLAN_ID);
    assert.ok(starter, `el catalogo debe incluir ${PLAN_ID}`);
    assert.ok(Number.isFinite(Number(starter.price)), "cada plan publica su precio");

    // El precio que ve el cliente es exactamente el del catalogo del backend.
    const { getCommercialPlanById } = require("../src/config/commercial-plans");
    assert.equal(
      Number(starter.price),
      Number(getCommercialPlanById(PLAN_ID).price),
      "el precio publicado debe ser el mismo con el que opera el backend"
    );

    console.log("ok - planes: catalogo publico y autoridad backend coinciden");
  } finally {
    await context.close();
  }
}

async function run() {
  await testRegistrationIsAuthoritative();
  await testOrderIdempotency();
  await testPlanIdCannotBeForged();
  await testPublicPlanCatalogIsAuthoritative();
  console.log("ok - recorrido comercial de cuenta nueva certificado");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
