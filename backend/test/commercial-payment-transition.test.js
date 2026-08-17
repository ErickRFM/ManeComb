/**
 * Autoridad unica de transicion de pago comercial.
 *
 * Antes la regla vivia duplicada: `services/commercial-payment.js` la exportaba
 * para el camino Mongo (`payment-repository.js`) y `data/store.js` la replicaba
 * inline para el adaptador embebido. Dos implementaciones de una sola regla, con
 * el riesgo clasico de que las pruebas pasaran contra memoria mientras
 * produccion divergia.
 */
const assert = require("node:assert/strict");
const {
  evaluatePaymentTransition,
  normalizePaymentTransitionStatus
} = require("../src/domain/commercial-payment-transition");
const commercialPayment = require("../src/services/commercial-payment");
const { createEmbeddedStore } = require("../src/data/store");

// --- El servicio re-exporta exactamente la autoridad de dominio --------------
assert.equal(
  commercialPayment.evaluatePaymentTransition,
  evaluatePaymentTransition,
  "services/commercial-payment debe re-exportar la funcion de dominio, no una copia"
);

// --- El dominio es puro ------------------------------------------------------
assert.equal(normalizePaymentTransitionStatus("approved"), "paid");
assert.equal(normalizePaymentTransitionStatus("  PAID "), "paid");
assert.equal(normalizePaymentTransitionStatus(null), "");

// --- Matriz de decision ------------------------------------------------------
{
  const cases = [
    // [estado actual, entrante, decision, activa]
    ["pending", "approved", "apply", true],
    ["pending", "paid", "apply", true],
    ["rejected", "paid", "apply", true],
    ["cancelled", "paid", "apply", true],
    ["pending", "pending", "duplicate", false],
    ["paid", "paid", "duplicate", false],
    // Un pago confirmado no retrocede aunque el proveedor entregue fuera de orden.
    ["paid", "pending", "stale", false],
    ["paid", "rejected", "stale", false],
    ["paid", "cancelled", "stale", false],
    ["pending", "loquesea", "unknown", false]
  ];

  for (const [current, incoming, decision, shouldActivate] of cases) {
    const result = evaluatePaymentTransition(current, incoming);
    assert.equal(result.decision, decision, `${current} -> ${incoming}`);
    assert.equal(result.shouldActivate, shouldActivate, `${current} -> ${incoming} activacion`);
  }
}

// --- Regresion: el estado ACTUAL tambien se normaliza -------------------------
// La regla inline anterior comparaba `order.paymentStatus` en crudo contra la
// allowlist. Una orden historica con `paymentStatus: "approved"` (vocabulario del
// proveedor, no el canonico) caia en la rama "apply" con `shouldActivate: true`,
// es decir permitia RE-ACTIVAR una orden ya pagada.
{
  assert.equal(
    evaluatePaymentTransition("approved", "paid").decision,
    "duplicate",
    "una orden ya aprobada no puede volver a aplicarse"
  );
  assert.equal(
    evaluatePaymentTransition("approved", "paid").shouldActivate,
    false,
    "y jamas puede volver a activar la suscripcion"
  );
  assert.equal(
    evaluatePaymentTransition("approved", "pending").decision,
    "stale",
    "ni degradarse a pendiente"
  );
}

// --- El store embebido decide con la misma autoridad --------------------------
{
  const store = createEmbeddedStore();
  const order = store.createCommercialOrder({
    organizationId: "org-1",
    planId: "starter-2",
    contactEmail: "cliente@example.com"
  });

  const confirmation = { paymentExternalReference: order.id, approvedAt: new Date().toISOString() };
  const apply = (incomingStatus) => store.applyPaymentTransitionAtomically({
    orderId: order.id,
    provider: "mercado_pago",
    paymentId: "pay-1",
    incomingStatus,
    confirmation
  });

  const first = apply("approved");
  assert.equal(first.applied, true);
  assert.equal(first.shouldActivate, true);
  assert.equal(first.currentStatus, "paid");
  // `previousStatus` real: antes se devolvia el literal "pending" siempre que
  // hubiera activacion, aunque la orden viniera de otro estado.
  assert.equal(first.previousStatus, "pending");

  // Webhook duplicado.
  assert.equal(apply("approved").reason, "already_applied");

  // Evento atrasado: no degrada un pago confirmado.
  const stale = apply("pending");
  assert.equal(stale.applied, false);
  assert.equal(stale.reason, "stale_transition");

  const current = store.getCommercialOrderById(order.id);
  assert.equal(current.paymentStatus, "paid", "el estado pagado sobrevive al evento fuera de orden");
}

console.log("ok - transicion de pago con autoridad unica, idempotente y sin regresion de estado");
