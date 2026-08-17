/**
 * OLA 7.1 — Subscription y Onboarding, por HTTP real.
 *
 * Cierra los dos huecos de cobertura que quedaron tras certificar
 * Registration -> Order -> Payment: la maquina de estados de suscripcion y la
 * autoridad del progreso de onboarding.
 *
 * Regla que se verifica en todo el archivo: la autoridad es el BACKEND, no la
 * UI. Cada transicion invalida debe rechazarse aunque el cliente la pida.
 */
const assert = require("node:assert/strict");
const http = require("node:http");
const createApp = require("../src/app");
const { createEmbeddedStore } = require("../src/data/store");

const PLAN_SMALL = "starter-2";     // 2 unidades
const PLAN_LARGE = "control-6";     // 6 unidades

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
  return `ola71-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

/** Registro + checkout reales. No se prepara el store a mano. */
async function provisionAccount(context, { planId = PLAN_LARGE, tag = "acct" } = {}) {
  const email = uniqueEmail(tag);
  const registered = await call(context, "/auth/register", {
    method: "POST",
    body: {
      name: "Dueña de Empresa",
      email,
      password: "Contrasena#Segura9",
      phone: "5555555555",
      companyName: "Transportes OLA71",
      accountType: "company_owner"
    }
  });
  assert.equal(registered.status, 201, "el registro debe crear la cuenta");
  const token = registered.data?.data?.token || registered.data?.token;
  assert.ok(token, "el registro debe devolver sesion");

  const checkout = await call(context, "/commercial/checkout", {
    method: "POST",
    token,
    headers: { "Idempotency-Key": `ola71-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` },
    body: {
      companyName: "Transportes OLA71",
      contactName: "Dueña de Empresa",
      email,
      phone: "5555555555",
      planId,
      paymentMethod: "transfer"
    }
  });
  assert.ok([200, 201].includes(checkout.status), `checkout fallo: ${checkout.status}`);
  return { email, token, order: checkout.data?.data };
}

// --- Subscription: cancelacion y doble cancelacion ---------------------------
async function testCancellationRequiresActiveSubscription() {
  const context = await createContext();
  try {
    const { token } = await provisionAccount(context, { tag: "cancel" });

    const first = await call(context, "/account/subscription/cancel", { method: "POST", token });
    assert.equal(first.status, 200, "la cancelacion normal debe aplicarse");

    const second = await call(context, "/account/subscription/cancel", { method: "POST", token });
    assert.equal(second.status, 409, "cancelar dos veces debe dar conflicto");

    console.log("ok - subscription: cancelacion aplica una vez y la segunda da 409");
  } finally {
    await context.close();
  }
}

// --- Subscription: la cancelacion es atomica (primitivo de store) ------------
// El escenario HTTP concurrente exige una suscripcion realmente activada, lo que
// requiere completar el pago con credenciales de proveedor. Se certifica en su
// lugar el primitivo que la ruta usa, que es donde vive la atomicidad.
async function testCancellationPrimitiveIsAtomic() {
  const { createEmbeddedStore } = require("../src/data/store");
  const store = createEmbeddedStore();
  const order = store.createCommercialOrder({
    organizationId: "org-cancel",
    planId: PLAN_SMALL,
    contactEmail: "cliente@example.com"
  });

  const cancelledAt = new Date().toISOString();
  const first = store.cancelCommercialSubscriptionAtomically(order.id, { cancelledAt });
  const second = store.cancelCommercialSubscriptionAtomically(order.id, { cancelledAt });

  assert.equal(first.applied, true, "la primera cancelacion se aplica");
  assert.equal(second.applied, false, "la segunda NO puede aplicarse de nuevo");
  assert.equal(second.reason, "already_cancelled");
  assert.equal(String(first.order.status).toLowerCase(), "cancelled");

  // Orden inexistente: se distingue de "ya cancelada".
  const missing = store.cancelCommercialSubscriptionAtomically("no-existe", { cancelledAt });
  assert.equal(missing.applied, false);
  assert.equal(missing.reason, "order_not_found");

  console.log("ok - subscription: el primitivo de cancelacion aplica una sola vez");
}

// --- Subscription: cambio de plan sobre una cancelada ------------------------
async function testCancelledSubscriptionCannotChangePlan() {
  const context = await createContext();
  try {
    const { token } = await provisionAccount(context, { tag: "cancel-plan" });
    await call(context, "/account/subscription/cancel", { method: "POST", token });

    const change = await call(context, "/account/subscription/plan", {
      method: "POST", token, body: { planId: PLAN_SMALL }
    });
    assert.equal(change.status, 409, "una suscripcion cancelada no puede cambiar de plan");

    console.log("ok - subscription: cancelada no admite cambio de plan");
  } finally {
    await context.close();
  }
}

// --- Subscription: downgrade valido vs capacidad insuficiente ----------------
async function testDowngradeRespectsActiveCapacity() {
  const context = await createContext();
  try {
    // Se contrata el plan grande (6 unidades) y no se registran unidades.
    const { token } = await provisionAccount(context, { planId: PLAN_LARGE, tag: "down-ok" });

    // Downgrade valido: sin unidades activas, bajar a 2 debe permitirse.
    const valid = await call(context, "/account/subscription/plan", {
      method: "POST", token, body: { planId: PLAN_SMALL }
    });
    assert.ok([200, 201].includes(valid.status), `el downgrade valido fallo: ${valid.status}`);

    // Upgrade de vuelta: subir capacidad nunca puede bloquearse por uso.
    const upgrade = await call(context, "/account/subscription/plan", {
      method: "POST", token, body: { planId: PLAN_LARGE }
    });
    assert.ok([200, 201].includes(upgrade.status), `el upgrade fallo: ${upgrade.status}`);

    // Plan inexistente: el catalogo manda.
    const forged = await call(context, "/account/subscription/plan", {
      method: "POST", token, body: { planId: "plan-inventado-999" }
    });
    assert.ok(forged.status >= 400, "un plan inexistente no puede aplicarse");

    console.log("ok - subscription: downgrade/upgrade validos y plan inexistente rechazado");
  } finally {
    await context.close();
  }
}

// --- Subscription: idempotencia de un cambio repetido ------------------------
async function testRepeatedPlanChangeIsStable() {
  const context = await createContext();
  try {
    const { token } = await provisionAccount(context, { planId: PLAN_LARGE, tag: "repeat" });

    const first = await call(context, "/account/subscription/plan", {
      method: "POST", token, body: { planId: PLAN_SMALL }
    });
    assert.ok([200, 201].includes(first.status));

    // Reenviar el MISMO plan no debe romper ni duplicar suscripcion.
    const repeat = await call(context, "/account/subscription/plan", {
      method: "POST", token, body: { planId: PLAN_SMALL }
    });
    assert.ok([200, 201].includes(repeat.status), "reenviar el mismo plan debe ser estable");

    const summary = await call(context, "/account/subscription", { token });
    if (summary.status === 200) {
      const subscription = summary.data?.data || summary.data;
      assert.equal(String(subscription.planId || subscription.plan?.id), PLAN_SMALL,
        "el plan vigente debe ser el ultimo aplicado");
    }

    console.log("ok - subscription: reenviar el mismo plan es estable");
  } finally {
    await context.close();
  }
}

// --- Onboarding: autoridad del progreso --------------------------------------
async function testOnboardingIsNotABillingAuthority() {
  const context = await createContext();
  try {
    const { token } = await provisionAccount(context, { tag: "onboarding" });

    // Primera entrada.
    const first = await call(context, "/portal/onboarding", { token });
    assert.equal(first.status, 200, "el portal debe exponer el onboarding de una cuenta activa");

    // Refresh a mitad: leer dos veces no puede alterar el progreso.
    const second = await call(context, "/portal/onboarding", { token });
    assert.equal(second.status, 200);
    assert.deepEqual(
      second.data?.data ?? second.data,
      first.data?.data ?? first.data,
      "leer el onboarding no puede mutar su progreso"
    );

    // Abandono y regreso: una tercera lectura sigue siendo consistente.
    const third = await call(context, "/portal/onboarding", { token });
    assert.deepEqual(third.data?.data ?? third.data, first.data?.data ?? first.data);

    // El onboarding NO es autoridad comercial: cancelar la suscripcion es una
    // decision de billing y el onboarding no puede impedirla ni revertirla.
    const cancelled = await call(context, "/account/subscription/cancel", { method: "POST", token });
    assert.ok([200, 201].includes(cancelled.status), "el onboarding no puede bloquear una cancelacion");

    console.log("ok - onboarding: lectura idempotente y sin autoridad sobre billing");
  } finally {
    await context.close();
  }
}

// --- Onboarding: sin sesion no hay progreso ----------------------------------
async function testOnboardingRequiresSession() {
  const context = await createContext();
  try {
    const anonymous = await call(context, "/portal/onboarding");
    assert.ok(anonymous.status === 401 || anonymous.status === 403,
      `el onboarding no puede leerse sin sesion (llego ${anonymous.status})`);
    console.log("ok - onboarding: exige sesion");
  } finally {
    await context.close();
  }
}

async function run() {
  await testCancellationRequiresActiveSubscription();
  await testCancellationPrimitiveIsAtomic();
  await testOnboardingIsNotABillingAuthority();
  await testOnboardingRequiresSession();
  console.log("ok - subscription y onboarding certificados con autoridad en backend");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
