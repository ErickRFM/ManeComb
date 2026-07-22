# MP-HARDEN-04 — Idempotencia de creación de Checkout y órdenes comerciales

**Estado:** Cerrado

## Base y alcance

- Rama: `main`.
- Base real: `8b45531`.
- MP-HARDEN-03: `fdc4a28`.
- Backend y Ventas estaban limpios al iniciar.
- Existió trabajo paralelo autorizado en `mobile/` y `RC-MOBILE-MODULARIZATION-07.md`; no forma parte de esta RC.
- No se modificaron precios, planes, conciliación, Webhook, activación, Portal ni Mobile.

## Problema anterior

`POST /api/commercial/checkout` creaba primero una orden y después una preferencia. Las guardas `paymentInFlight` y `submitInFlight` evitaban parte del doble clic en una sola instancia, pero una recarga, dos pestañas, dos procesos o una respuesta perdida podían producir órdenes y preferencias distintas para una intención equivalente.

## Contrato de idempotencia ManeComb

- Header obligatorio: `Idempotency-Key`.
- Formato: cadena opaca de 16 a 128 caracteres, limitada a `A-Z`, `a-z`, dígitos, punto, guion, guion bajo y tilde.
- No se acepta fallback aleatorio en Backend.
- Scope: dominio `commercial-checkout` + organización + usuario autenticado.
- Persistencia: SHA-256 de `scope:key`; la clave original no se guarda ni registra.
- La reserva no tiene TTL destructivo: queda como evidencia estable. El lease de procesamiento dura 60 segundos.
- Ausencia, longitud o caracteres inválidos: HTTP 400 con código estable.
- Misma clave y huella diferente: HTTP 409 `idempotency_key_reused`.
- Lease vigente: HTTP 409 `checkout_in_progress`.
- Resultado ambiguo del proveedor: HTTP 503 `provider_result_unknown`, sin repetir la creación.

## Huella canónica de intención

El Backend normaliza y firma únicamente:

- usuario autenticado;
- organización autenticada;
- `planId`;
- `paymentMethod`;
- `requestTrial`;
- `selectedAddOns`, sin duplicados y ordenados.

No incluye precio del frontend, IP, fecha, User-Agent, URL, token ni datos de tarjeta. El precio continúa calculándose con el catálogo del Backend.

## Modelo persistente

Se eligió una entidad separada `CheckoutIdempotency`, colección `checkout_idempotency`. La reserva debe existir antes de crear la orden y conserva un `orderId` determinista para cerrar la ventana entre reserva y persistencia de la orden.

Campos: scope, hash, fingerprint, order ID, clave técnica del proveedor, estado, intentos, propietario y vencimiento del lease, respuesta segura, último error y timestamps de creación, actualización, éxito o fallo.

Índices:

1. Único `{ scope, keyHash }`.
2. Operativo `{ status, leaseUntil }`.

La colección nueva evita afectar órdenes históricas. No se borran ni migran documentos anteriores.

## Reclamo y recuperación

Mongo realiza el reclamo mediante `findOneAndUpdate` con `upsert` e índice único. Solo un worker crea la reserva. Los demás reciben `ready`, `currently_processing`, `key_reused`, `permanent_failure` o `provider_result_unknown`.

Un lease vencido o un `failed_retryable` puede recuperarse manteniendo el mismo `orderId`, referencia e intento. El almacenamiento embebido implementa el mismo contrato para desarrollo y pruebas; la garantía multiproceso productiva reside en Mongo y su índice único.

La respuesta persistida excluye identidad, correo, teléfono, perfil fiscal, headers y secretos. Conserva únicamente campos comerciales públicos necesarios para reconstruir el contrato de checkout.

## Mercado Pago

- Endpoint real: `POST https://api.mercadopago.com/checkout/preferences` (Checkout Pro Preferences).
- La referencia oficial específica consultada no documenta `X-Idempotency-Key` para este endpoint.
- Mercado Pago sí documenta el header para Payments, Refunds y Checkout API Orders, que son contratos distintos.
- Decisión: no enviar un header no demostrado a Preferences.
- Se genera y persiste una clave técnica estable para una futura migración de endpoint, pero actualmente no se transmite.
- Una respuesta HTTP conocida se clasifica como fallo conocido.
- Un error de transporte después de iniciar `fetch` queda como `provider_result_unknown`; la misma clave no vuelve a crear una preferencia a ciegas.

Fuentes verificadas el 22 de julio de 2026:

- Referencia oficial de Preferences: https://www.mercadopago.com.mx/developers/es/reference/preferences/_checkout_preferences/post
- Aviso oficial de idempotencia para Payments y Refunds: https://www.mercadopago.com.mx/developers/es/news/2023/01/04/Idempotency-key-usage-will-be-mandatory
- Referencia oficial de Checkout API Orders: https://www.mercadopago.com.mx/developers/es/reference/online-payments/checkout-api/create-order/post

## Frontend Ventas

- La clave se crea con `crypto.randomUUID`; si no existe, se usa `crypto.getRandomValues`, nunca `Math.random`.
- Se genera al enviar una intención nueva, no durante render ni dentro del cliente HTTP.
- Se guarda en el contexto local junto con una representación normalizada de usuario, plan, método, trial y add-ons.
- Re-render, recarga y retry equivalente reutilizan la clave.
- Cambio de usuario, plan, método, trial o add-ons genera otra clave.
- La confirmación exitosa y el flujo local completado limpian el contexto.
- `ApiCheckoutServiceAdapter` separa la clave del payload y `api.ts` la envía exclusivamente como header.
- Se conservaron `paymentInFlight` y `submitInFlight`.

## Modos

| Modo | Garantía |
|---|---|
| Mercado Pago | Una reserva, una orden y como máximo una llamada de Preferences; timeout ambiguo queda bloqueado. |
| Manual | El replay devuelve la misma orden pendiente. |
| Test | El replay devuelve la misma orden `paid_test`; no duplica activación. |
| Trial | El replay devuelve la misma orden de trial; no cambia elegibilidad ni duración. |

## Pruebas y validaciones

| Validación | Resultado |
|---|---|
| Clave ausente, vacía, corta, larga y caracteres inválidos | Aprobado |
| Hash no contiene la clave original | Aprobado |
| Fingerprint normaliza casing, duplicados y orden de add-ons | Aprobado |
| Misma clave e intención conserva orden, referencia, URL y Preference ID | Aprobado |
| Misma clave no llama dos veces al proveedor | Aprobado |
| Otra intención produce 409 | Aprobado |
| Scope distinto no comparte reserva | Aprobado |
| Dos reclamos, lease vigente y recuperación de lease vencido | Aprobado |
| Timeout ambiguo no crea otra preferencia | Aprobado |
| Manual, test, trial y Mercado Pago | Cubiertos por suite existente e integración nueva |
| `checkout-idempotency.test.js` | Aprobado |
| `mercado-pago.test.js` | Aprobado |
| Suite completa Backend `npm test` | Aprobado |
| Ventas `npm run typecheck` | Aprobado |
| Ventas `npm run build` | Aprobado |
| Ventas `test` / `lint` | No existen scripts; no se modificó `package.json` |
| Llamadas reales a Mercado Pago | Ninguna; todas las externas fueron mocks |

## Compatibilidad

- Los consumidores Backend de pruebas fueron actualizados para expresar la nueva clave obligatoria.
- No cambiaron precios, planes, add-ons, permisos, autenticación, firma de Webhook, conciliación, transición de pagos, activación ni facturación.
- No se agregó Redis, cola, dependencia ni variable de entorno.

## Métricas

- 19 archivos de código/pruebas afectados y este reporte.
- 2 archivos nuevos de Backend: servicio y prueba específica.
- 1 colección nueva con 16 campos y 2 índices.
- 3 operaciones persistentes: claim, complete y fail.
- 1 utilidad central con validación, scope, hash, fingerprint y reserva.
- 1 generador/persistidor de intención en Ventas.
- Diff final preparado: 720 inserciones y 30 eliminaciones, incluyendo archivos nuevos y reporte.

## Pendientes

- MP-HARDEN-05 — Trial y periodos de suscripción.
- MP-HARDEN-06 — Refunds y chargebacks.
- MP-SANDBOX-01 — Prueba end-to-end controlada.
- Evaluar una migración futura a un endpoint de Mercado Pago que documente idempotencia oficial de creación.

## Rollback

No ejecutado:

```bash
git revert <HASH_MP_HARDEN_04>
```
