/**
 * Regla unica de transicion de estado de pago comercial.
 *
 * Vive en `domain/` y es PURA: recibe estados, devuelve una decision. No conoce
 * Mongo, HTTP, Mercado Pago, JWT ni ninguna dependencia de infraestructura.
 *
 * Existe aqui, y no dentro de `services/commercial-payment.js`, porque los dos
 * adaptadores de persistencia tienen que decidir con el MISMO criterio:
 *
 *  - `data/repositories/payment-repository.js` (camino Mongo/produccion)
 *  - `data/store.js` (adaptador embebido: modo dev/test y respaldo explicito de
 *    13 repositorios cuando no hay modelo Mongo; lo usan 70 suites)
 *
 * `store.js` no puede importar `services/commercial-payment.js` para obtener la
 * regla: esa cadena arrastra `commercial-downloads -> jsonwebtoken`, es decir
 * meteria JWT dentro de la capa de datos. Antes de esta extraccion el store
 * embebido replicaba la regla inline, con el riesgo clasico de que las pruebas
 * pasaran contra memoria mientras produccion divergia.
 */

/** `approved` es vocabulario del proveedor; `paid` es el vocabulario canonico. */
function normalizePaymentTransitionStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  return status === "approved" ? "paid" : status;
}

const KNOWN_PAYMENT_STATUSES = Object.freeze(["pending", "paid", "rejected", "cancelled"]);

/**
 * @param {string} currentState  Estado actual persistido de la orden.
 * @param {string} incomingState Estado que declara el evento entrante.
 * @returns {{decision: 'apply'|'duplicate'|'stale'|'unknown'|'invalid', shouldActivate: boolean}}
 *
 *  apply     -> la transicion debe escribirse
 *  duplicate -> el mismo estado ya esta aplicado; idempotente
 *  stale     -> evento atrasado o fuera de orden; NO debe degradar el estado
 *  unknown   -> estado no reconocido
 */
function evaluatePaymentTransition(currentState, incomingState) {
  const current = normalizePaymentTransitionStatus(currentState || "pending");
  const incoming = normalizePaymentTransitionStatus(incomingState);
  const known = new Set(KNOWN_PAYMENT_STATUSES);
  if (!known.has(incoming)) return { decision: "unknown", shouldActivate: false };

  // Un pago confirmado no retrocede. Mercado Pago puede entregar eventos fuera
  // de orden: si la orden ya esta `paid`, cualquier otro estado llega tarde.
  if (current === "paid") {
    return incoming === "paid"
      ? { decision: "duplicate", shouldActivate: false }
      : { decision: "stale", shouldActivate: false };
  }

  if (current === incoming) return { decision: "duplicate", shouldActivate: false };
  if (["pending", "rejected", "cancelled"].includes(current) && incoming === "paid") {
    return { decision: "apply", shouldActivate: true };
  }
  if (known.has(current)) return { decision: "apply", shouldActivate: false };
  return incoming === "paid"
    ? { decision: "invalid", shouldActivate: false }
    : { decision: "unknown", shouldActivate: false };
}

module.exports = {
  KNOWN_PAYMENT_STATUSES,
  evaluatePaymentTransition,
  normalizePaymentTransitionStatus
};
