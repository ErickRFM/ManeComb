# MP-HARDEN-06 — Reembolsos, contracargos y reversión segura del servicio

**Estado:** Cerrado

## Base

| Dato | Valor |
| --- | --- |
| Rama | `main` |
| MP-HARDEN-05 | `1f2d8df` |
| Commit base | `1f2d8df` |
| Backend/Ventas inicial | Limpio dentro del alcance |
| Trabajo paralelo | Cambios ajenos en `mobile/` y documentos `RC-MOBILE-*`, no incluidos |

## Inventario anterior

No existían registros de refund ni chargeback. `refunded` y `charged_back` solo se reconocían como resultados visuales en Ventas. La orden comercial conservaba pago y activación, pero no saldo reembolsable, ledger, disputa ni causa de suspensión. El Webhook de Mercado Pago tenía firma fail-closed, consulta autoritativa y lease, aunque procesaba únicamente pagos.

La autorización existente y reutilizada es `authenticate` + `requirePortalAccess` + `canManageBilling`. El aislamiento se obtiene de las órdenes accesibles para el usuario; nunca se acepta una organización desde el body.

## Política de producto

| Evento confirmado | Estado financiero | Efecto de servicio |
| --- | --- | --- |
| Refund parcial | `partially_refunded` | Conserva acceso y periodo |
| Refund total acumulado | `refunded` | Suspende el entitlement pagado |
| Chargeback abierto/en revisión | `chargeback_open` | Suspende mientras existe disputa |
| Chargeback ganado/cubierto | `chargeback_won` | Restaura solo si el periodo sigue vigente y no existe cancelación/refund total |
| Chargeback perdido | `chargeback_lost` | Mantiene suspensión financiera |

Ninguna transición extiende el periodo, borra órdenes o elimina comprobantes. Refund y chargeback son dominios distintos.

## Rutas y proveedor

### Refund autorizado

```text
POST /api/account/orders/:orderId/refunds
```

Requiere autenticación, Portal, `canManageBilling` e `Idempotency-Key`. El importe es opcional; si se omite se solicita el saldo completo. La orden determina organización, Payment ID, moneda y saldo.

El servicio `createMercadoPagoRefund` encapsula:

```text
POST /v1/payments/{paymentId}/refunds
Authorization: Bearer <backend-only>
X-Idempotency-Key: <clave estable>
```

Para un refund total inicial no envía importe; para parciales o el remanente después de otro parcial envía solo `amount`. La respuesta se concilia contra Refund ID, Payment ID, importe, moneda implícita de la orden y estado confirmado. Un timeout queda como `provider_result_unknown` y un replay no hace una segunda devolución a ciegas. También se implementó la consulta oficial de refunds para una recuperación administrativa posterior; no se inventó una búsqueda por clave que Mercado Pago no garantiza.

### Chargeback firmado

```text
POST /api/commercial/webhooks/mercadopago/chargebacks
```

El handler exige tipo chargeback y firma válida antes de reclamar la entrega. Reutiliza el lease persistente con namespace separado, consulta `GET /v1/chargebacks/{id}` y no confía en importe, pago o estado enviados en el Webhook.

## Persistencia e índices

### RefundOperation

Guarda proveedor, Refund/Payment/Order/Organization IDs, importe menor, moneda, tipo, estado, hash de clave, fingerprint, actor, timestamps, lease, intentos, error seguro y respuesta segura. No guarda clave original, token, headers, firma, tarjeta ni payload completo.

Índices:

- único `{ organizationId, idempotencyKeyHash }`;
- consulta `{ orderId, status }`.

### Chargeback

Guarda identificadores, importe menor, moneda, estado, cobertura, necesidad/plazo de documentación y resolución. No almacena evidencia binaria ni URLs firmadas.

Índices:

- único `{ provider, providerChargebackId }`;
- consulta `{ orderId, updatedAt }`.

La orden añade solo la proyección agregada: estado financiero, importe reembolsado/reservado/reembolsable, chargeback y causa de suspensión.

## Idempotencia y saldo

La clave se persiste únicamente como SHA-256 y se vincula a un fingerprint de organización, orden e importe.

```text
misma clave + misma intención   → replay de la operación
misma clave + otra intención   → 409 refund_idempotency_key_reused
lease vigente                  → no se roba
lease vencido/retry permitido  → recuperación controlada
resultado ambiguo              → no repetir POST
```

El saldo se reserva atómicamente en la orden antes de llamar al proveedor. La condición Mongo impide que refunds concurrentes con claves distintas superen el importe pagado. Confirmados y en vuelo permanecen incluidos en la reserva; por ello un timeout no libera saldo ni permite devolverlo otra vez.

## Conciliación y transiciones de chargeback

`reconcileChargebackWithOrder` valida ID, Payment ID persistido, moneda e importe positivo no superior al pago. `evaluateChargebackTransition` ignora duplicados y evita que un evento abierto atrasado degrade un estado terminal ganado o perdido.

Solo la primera transición efectiva actualiza el ledger y aplica la política. La resolución favorable no crea fechas nuevas y no restaura un periodo vencido, una orden cancelada o un pago totalmente reembolsado.

## Proyección del Portal

`buildSubscription` expone opcionalmente:

- `financialStatus`;
- `refundedAmountMinor`;
- `refundableAmountMinor`;
- `chargebackStatus`;
- `serviceSuspendedReason`.

Una suspensión financiera deriva suscripción `suspended`, por lo que un refund total o disputa no continúa apareciendo como servicio activo. Ventas solo recibió tipos opcionales; no se añadieron botones ni rediseño.

## Pruebas

| Suite | Cobertura | Resultado |
| --- | --- | --- |
| `refunds.test.js` | parcial, total, saldo atómico, replay y conflicto de clave | Pasa |
| `chargebacks.test.js` | conciliación, duplicado, stale, open, won, lost y periodo vencido | Pasa |
| `portal-account.test.js` | proyección histórica MP-HARDEN-05 | Pasa |
| `mercado-pago.test.js` | regresión MP-HARDEN-01 a 05 | Pasa |
| `webhook-idempotency.test.js` | leases, retries y fallo permanente | Pasa |
| Suite Backend completa | 25 suites del script real | Pasa |
| Ventas typecheck | TypeScript sin errores | Pasa |
| Ventas build | Vite, 630 módulos | Pasa |

No se hicieron llamadas reales ni pruebas sandbox.

## Compatibilidad

- Sin cambios de precios, planes, checkout visual o navegación.
- Sin cambios en Mobile, shared o communication-service.
- Firma, readiness, conciliación de aprobación, transiciones y checkout idempotente conservados.
- Provider manual/test/trial no se vuelve reembolsable automáticamente.
- No se borran facturas, órdenes ni historial.
- No se añadieron dependencias.

## Limitaciones

- La consulta de refunds está disponible para recuperación, pero una operación ambigua no se autoasocia por heurísticas inseguras cuando el proveedor no ofrece una identidad inequívoca por clave.
- No se carga documentación de disputas.
- No se implementan alertas de fraude, CFDI, devoluciones reales ni UI administrativa.
- La validación end-to-end corresponde a `MP-SANDBOX-01`.

## Métricas

| Métrica | Resultado |
| --- | --- |
| Archivos incluidos | 13 (9 modificados, 4 nuevos) |
| Implementación Backend | 9 archivos |
| Pruebas nuevas | 2 archivos |
| Contrato Ventas | 1 archivo |
| Reporte | 1 archivo |
| Entidades persistentes nuevas | 2 |
| Índices nuevos | 4, dos únicos |
| Campos agregados a orden | 6 |
| Funciones puras de política/conciliación | 7 |
| Rutas Backend | 2 |
| Diff antes del commit | 653 inserciones, 4 eliminaciones |

## Rollback

```bash
git revert <HASH_MP_HARDEN_06>
```

No ejecutar hasta sustituir el marcador por el hash real. No se creará otro commit únicamente para insertar el hash.
