# MP-HARDEN-03 — Idempotencia, transiciones y recuperación de Mercado Pago

**Estado:** Cerrado

## Base

| Campo | Evidencia |
|---|---|
| Rama | `main` |
| Commit MP-HARDEN-02 | `f686a8d` |
| Commit base MP-HARDEN-03 | `6c3e1ac` |
| Estado inicial de Backend | Limpio |
| Trabajo paralelo | Cambios ajenos posteriores en `mobile/`; no incluidos |

No se ejecutaron reset, revert, rebase, cherry-pick, amend ni llamadas reales a Mercado Pago.

## Problema anterior

La deduplicación identificaba un evento por Payment ID, aunque un pago puede evolucionar. El evento se registraba antes de procesarse, sin lease ni recuperación, y un fallo podía bloquear reintentos. Confirmación y Webhook ejecutaban lectura, escritura, activación, notificaciones y sockets por separado, permitiendo carreras y efectos repetidos.

## Modelo final

Se separaron cuatro identidades:

- Entrega: hash SHA-256 de proveedor, Request ID, Payment ID, tipo y timestamp firmado.
- Pago: `providerPaymentId` persistido en la orden.
- Transición: `paymentId + estado normalizado`.
- Orden: ID conciliado por MP-HARDEN-02.

El Webhook persiste únicamente identificadores técnicos, hash, estado, intentos, lease, timestamps, error seguro y Order ID. No almacena firma, headers, payload completo, comprador, tarjeta, correo, token ni secreto.

Estados: `received`, `processing`, `processed`, `failed_retryable` y `failed_permanent`.

## Lease y recuperación

- Lease: 60 segundos.
- Máximo: 5 intentos.
- Backoff base: 30 segundos multiplicado por intento.
- Cada reclamo incrementa `attemptCount`.
- Un lease vigente bloquea otro worker.
- Un lease vencido o fallo reintentable puede reclamarse.
- Un evento procesado o con fallo permanente no vuelve a ejecutarse.

El reclamo usa `findOneAndUpdate` con upsert y el índice único histórico `provider + providerEventId`, donde `providerEventId` contiene ahora la clave de entrega. Los documentos históricos siguen siendo compatibles y no requieren borrado.

## Máquina de transiciones

| Actual | Entrante | Decisión | Activa | Efectos |
|---|---|---|---|---|
| pending | approved/paid | apply | sí | se reclaman |
| pending | rejected/cancelled | apply | no | notificación una vez |
| paid | approved/paid | duplicate | no | no se repiten |
| paid | pending/rejected/cancelled | stale | no | no se repiten |
| rejected/cancelled | approved | apply | sí | se reclaman |
| cualquiera | desconocido | unknown/invalid | no | ninguno |

Refund y chargeback permanecen fuera de esta política.

## Atomicidad

`applyPaymentTransitionAtomically` usa un filtro condicional de Mongo sobre Order ID, transición no aplicada, estado actual y Payment ID compatible. La operación agrega la transición, actualiza el estado financiero y reserva los efectos en una sola escritura.

La unicidad `paymentProvider + providerPaymentId` se garantiza mediante un índice único parcial. Los registros históricos sin `providerPaymentId` no participan en el índice. Un error de clave duplicada se traduce en `payment_linked_elsewhere`.

La misma transición no gana dos veces, un estado pagado no se degrada y solo el primer cambio efectivo a paid obtiene `shouldActivate`.

El store embebido reproduce el contrato para pruebas; la garantía productiva se apoya en la operación condicional y el índice de Mongo, no en un lock en memoria.

## Confirmación y Webhook

Ambos canales consultan Mercado Pago, concilian con MP-HARDEN-02 y llaman a la misma operación de transición. Una confirmación repetida devuelve la orden estable. Una entrega diferente del mismo pago puede aplicar `pending → approved`; una entrega exacta ya procesada recibe acknowledgment estable.

Flujo Webhook: firma → delivery key → lease → consulta → conciliación → transición → efectos autorizados → processed. Un fallo permanente autenticado se reconoce con 202; un fallo transitorio o retry programado responde 503; firma inválida responde 401.

## Efectos

| Efecto | Garantía real |
|---|---|
| Estado financiero y derecho a activar | effectively-once mediante transición atómica |
| Activación, onboarding y flotilla | effectively-once mediante marcador/lease persistente en la orden |
| Notificación y correo | best effort; protegidos contra duplicados normales, pero sin outbox transaccional existe ventana de caída durante el envío |
| Eventos Socket.IO | best effort; se emiten solo para transición aplicada, pero no existe outbox durable |

No se afirma “exactly once” para efectos externos.

## Errores y HTTP

| Situación | Respuesta |
|---|---|
| Firma inválida | 401 |
| Procesada/en procesamiento/permanente | 202 estable |
| Correcta | 202 |
| Conciliación permanente fallida | 202, sin activar |
| Dependencia o excepción transitoria | 503 |
| Retry aún bajo backoff | 503 |

Los fallos permanentes incluyen referencia, ID, monto, moneda, ambiente, metadata, orden inexistente y Payment ID ajeno. El resto se conserva como retryable hasta el límite.

## Pruebas

| Grupo | Cobertura | Resultado |
|---|---|---|
| Entregas | nueva, procesada, lease vigente, lease vencido, retryable, permanente e intentos | Aprobado |
| Firma | inválida no crea entrega; válida continúa | Aprobado |
| Transiciones | pending→approved, duplicado paid y eventos atrasados | Aprobado |
| Canales | dos Webhooks, pending→approved y confirmación posterior | Aprobado |
| Efectos | activación única y transición paid única | Aprobado |
| Payment ID | misma orden, otra orden y dos asociaciones concurrentes con un ganador | Aprobado |
| Regresión | conciliación financiera, provider test y readiness | Aprobado |
| Suite Backend | `npm test` | Aprobado |

Se ejecutaron directamente `webhook-idempotency.test.js`, `mercado-pago.test.js`, `env.test.js` y la suite completa. Todas las dependencias externas fueron mocks.

## Compatibilidad

No cambiaron endpoints, firma, conciliación, checkout, planes, precios, add-ons, frontend, Portal, Mobile, provider manual ni provider test permitido fuera de producción. No se implementaron refunds, chargebacks, trial ni periodos.

## Pendientes

- MP-HARDEN-04 — Idempotencia de creación de checkout.
- MP-HARDEN-05 — Trial y periodos de suscripción.
- MP-HARDEN-06 — Refunds y chargebacks.
- Outbox transaccional para elevar correo y sockets por encima de best effort.

## Métricas

- 6 archivos de producción modificados.
- 2 archivos de pruebas afectados, uno nuevo.
- 1 reporte nuevo.
- 2 índices añadidos: Payment ID único parcial y búsqueda de lease/retry.
- 7 campos de transición/efectos en orden y 13 campos operativos de entrega.
- Funciones centrales para delivery key, claim, complete, fail, evaluación de transición y aplicación/efectos atómicos.

## Rollback

```bash
git revert <HASH_MP_HARDEN_03>
```

No se ejecutó el rollback.
