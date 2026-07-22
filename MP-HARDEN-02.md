# MP-HARDEN-02 — Conciliación financiera de pagos de Mercado Pago

**Estado:** Cerrado

## Base y alcance

| Campo | Evidencia |
|---|---|
| Rama | `main` |
| Commit base | `fa92d38` |
| Estado inicial de Backend | Limpio |
| Trabajo paralelo | Cambios ajenos en `mobile/`, documentos `RC-MOBILE-*.md` y un temporal eliminado en `docs/` |
| Alcance final | Dos archivos de Backend, una prueba y este reporte |

No se ejecutaron reset, restore global, revert, rebase, cherry-pick ni amend. Tampoco se realizaron llamadas reales a Mercado Pago.

## Problema anterior

Una respuesta `approved` consultada al proveedor podía activar una orden con solo disponer de una referencia externa no vacía. No se comprobaban monto, moneda, ambiente, metadata ni reutilización del Payment ID antes de actualizar el estado y ejecutar la activación.

## Inventario real

La orden local conserva ID, referencia comercial, `totalPrice`, proveedor, Preference ID inicial en `paymentProviderReference`, referencia externa, estado de pago, propietario y organización. No conserva moneda explícita; el checkout actual construye sus items en MXN.

El pago consultado puede aportar ID, status, `external_reference`, `transaction_amount`, `currency_id`, `live_mode`, `collector_id` y metadata. Los mocks se ampliaron para representar únicamente esos campos demostrados y la metadata que el backend envía al crear la preferencia.

## Frontera central

`reconcileMercadoPagoPaymentWithOrder(payment, order, configuration)` es determinista y no escribe, activa, navega ni realiza solicitudes. Devuelve `ok`, status normalizado, checks y metadatos financieros normalizados; ante un fallo devuelve un código y mensaje seguro.

Checks implementados:

- Payment ID válido.
- `external_reference` exactamente igual al ID de la orden.
- monto exacto en unidades menores;
- moneda exacta;
- `live_mode` coherente con sandbox o producción;
- `metadata.order_id`, cuando está presente;
- Payment ID no asociado a otra orden.

Códigos principales: `invalid_payment_id`, `missing_external_reference`, `external_reference_mismatch`, `invalid_payment_amount`, `invalid_order_amount`, `amount_mismatch`, `invalid_currency`, `currency_mismatch`, `payment_environment_mismatch`, `metadata_mismatch` y `payment_already_linked_to_another_order`.

## Monto y moneda

`toMinorUnits` acepta números o strings decimales válidos con hasta dos posiciones y los convierte en enteros. Rechaza vacío, NaN, infinito, negativos, tipos inesperados y precisión superior. La conciliación compara enteros exactos, sin tolerancia flotante.

La moneda se normaliza a mayúsculas y se compara con la moneda de la orden o, ante la ausencia actual de ese campo, con el contrato comercial MXN. No existe conversión de divisas.

## Referencia y ambiente

La fuente de verdad es `external_reference` obtenida mediante la consulta autenticada al proveedor. Una referencia enviada por navegador o incluida en el body del Webhook nunca reemplaza ese valor. Si confirmación recibe una referencia explícita, la conciliación impide que el pago de otra orden la sustituya silenciosamente.

Sandbox exige `live_mode === false` y producción exige `live_mode === true`. El campo ausente o de tipo ambiguo es rechazado.

## Preferencia, metadata y collector

La metadata estable `order_id` se valida cuando Mercado Pago la devuelve. Su ausencia no se presenta como una comprobación realizada: la orden todavía queda protegida por referencia, monto, moneda, ambiente y Payment ID.

El payload actual no demuestra un campo que relacione inequívocamente el pago con el Preference ID persistido. Por ello el Preference ID queda como no conciliable sin una consulta adicional.

No existe actualmente un collector esperado configurado de forma confiable. `collector_id` se normaliza cuando aparece, pero no se afirma una validación inexistente. Incorporar un collector público esperado y su readiness queda como endurecimiento posterior.

## Payment ID y pertenencia

Antes de actualizar una orden, ambas rutas revisan las órdenes persistidas. Repetir el mismo Payment ID sobre la misma orden es compatible; encontrarlo en otra orden produce rechazo. No se modificaron modelos ni repositorios.

Esta verificación impide la reutilización silenciosa observada, pero no constituye una restricción atómica frente a dos procesos concurrentes. Un índice único parcial o una operación condicional persistente deberá evaluarse junto con la idempotencia en MP-HARDEN-03.

## Confirmación, Webhook y activación

Confirmación y Webhook siguen el mismo orden: consultan directamente el pago, localizan la orden, detectan vínculos previos, invocan `confirmCommercialPayment`, que consume la conciliación central, y solo después actualizan o activan.

Una conciliación fallida produce `409` seguro en confirmación. El Webhook conserva el acknowledgment `202` existente, registra únicamente código, Order ID y un Payment ID parcial, y no marca la orden como pagada ni llama a activación. Firma e idempotencia de MP-HARDEN-01 permanecen intactas.

Los estados pending, rejected, cancelled o desconocidos nunca activan. La protección existente evita degradar una orden ya pagada.

## Pruebas

| Grupo | Cobertura | Resultado |
|---|---|---|
| Normalización | entero, string, uno/dos decimales, vacío, NaN, infinito, negativo y precisión inválida | Aprobado |
| Monto | exacto, menor, mayor, ausente/no numérico y orden inválida | Aprobado |
| Moneda | MXN, minúsculas, USD, vacía y desconocida | Aprobado |
| Referencia | correcta, ausente, distinta y body manipulado | Aprobado |
| Ambiente | sandbox, producción, mismatch, ausente y tipo inválido | Aprobado |
| Metadata | correcta, distinta y ausente con política documentada | Aprobado |
| Payment ID | válido, ausente, misma orden y otra orden persistida | Aprobado |
| Rutas | confirmación 409 sin mutación; Webhook 202 sin activación; approved conciliado activa | Aprobado |
| Estados | pending, rejected y cancelled no activan | Aprobado |
| MP-HARDEN-01 | firma fail-closed, ambiente, URL, readiness y provider test | Aprobado |
| Suite completa Backend | `npm test` | Aprobado |

Todas las respuestas externas fueron mocks. Los errores públicos no incluyen payload, token, secreto, firma, comprador ni tarjeta.

## Compatibilidad

No cambiaron endpoints, rutas públicas, frontend, planes, precios, add-ons, facturas, Portal, Mobile, activación interna, provider manual, provider test fuera de producción, firma ni servicio de idempotencia. El flujo manual conserva su respuesta y efectos previos.

## Pendientes para MP-HARDEN-03

- Transición robusta pending → approved.
- Eventos fallidos, leases, reintentos y recuperación.
- Doble submit e idempotency key de checkout.
- Restricción atómica/índice para Payment ID.
- Conciliación adicional de Preference ID y collector configurado.
- Refunds, chargebacks, periodos y elegibilidad de trial.

## Métricas

- 2 archivos de producción modificados.
- 1 archivo de pruebas modificado.
- 1 reporte creado.
- 2 funciones puras financieras creadas.
- 3 escenarios integrados nuevos, además de la matriz unitaria de conciliación.
- Suite específica de Mercado Pago, suite de ambiente y suite completa Backend ejecutadas.

## Rollback

```bash
git revert <HASH_MP_HARDEN_02>
```

El rollback queda documentado y no fue ejecutado.
