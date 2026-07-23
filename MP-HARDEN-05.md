# MP-HARDEN-05 — Trial, activación y periodos de suscripción

**Estado:** Cerrado

## Base y alcance

| Dato | Valor |
| --- | --- |
| Rama | `main` |
| Commit MP-HARDEN-04 | `9ebdb0c` — `fix(payments): make checkout creation idempotent` |
| Commit base MP-HARDEN-05 | `9ebdb0c` |
| Backend inicial | Limpio dentro del alcance |
| Ventas inicial | Limpio dentro del alcance |
| Trabajo paralelo | Cambios ajenos en `mobile/` y reportes `RC-MOBILE-*`; no se modificaron ni se incluyeron |

La fase se limitó al dominio de trial, activación, periodos y proyección de suscripción. No se modificaron precios, planes, conciliación financiera, firma de Webhook, leases de Webhook, idempotencia de checkout de MP-HARDEN-04 ni Mobile.

## Problema anterior

El cliente podía solicitar `requestTrial`, pero el Backend no aplicaba una política persistente por organización. La duración aparecía duplicada, no existía un consumo único atómico y claves idempotentes distintas podían intentar abrir más de un trial. Las fechas se recalculaban durante la activación y usaban aritmética local.

La primera activación pagada no establecía de forma central `currentPeriodStart`, `currentPeriodEnd`, `paidUntil` y `nextBillingAt`. La proyección del Portal seleccionaba órdenes principalmente por recencia, de modo que una orden pendiente o un trial vencido podían ocultar servicio pagado. Además, el Portal describía la cancelación como diferida aunque la ruta existente la ejecutaba inmediatamente.

## Vocabulario efectivo

| Dimensión | Estados relevantes | Autoridad |
| --- | --- | --- |
| Orden | `new`, `completed`, `cancelled` y estados históricos existentes | Store comercial |
| Pago | `pending`, `paid`, `paid_test`, `trial_active`, `rejected`, `cancelled` | Flujo de pago existente |
| Activación | `pending_payment`, `active`, `cancelled`, `suspended` | Activación comercial |
| Trial | disponible por evaluación, `active`, consumido por entitlement, `expired` por fecha | Política y `TrialEntitlement` |
| Suscripción | `pending`, `trial`, `active`, `expired`, `cancelled`, `suspended`, `inactive` | Proyección central del Backend |

No se introdujo un motor de cobro recurrente ni estados sin persistencia o consumidor real.

## Política de trial

`evaluateTrialEligibility` es pura, determinista y recibe una hora inyectable. La organización es el ámbito de elegibilidad. El Backend rechaza el trial cuando falta la organización, el plan no lo admite, existe un trial activo o histórico consumido, o existe servicio pagado activo/histórico.

La duración procede de la configuración del plan del Backend. El cliente no decide duración, inicio ni fin. La ruta usa una sola captura de `now`, guarda timestamps UTC y aplica fin exclusivo: el trial está activo únicamente mientras `now < trialEndsAt`. En el instante exacto de vencimiento se proyecta `expired`.

Una repetición con la misma clave de checkout devuelve la misma orden y conserva exactamente las fechas. Una clave distinta no concede otro trial. La compra pagada posterior se convierte en la suscripción principal sin borrar el historial ni sumar el tiempo restante del trial.

## Consumo persistente y concurrencia

Se añadió `TrialEntitlement`, con un índice único por `organizationId`. Sus campos son:

- `organizationId`, `orderId` y `planId`;
- `status`;
- `trialStartedAt` y `trialEndsAt`;
- `consumedAt` y `createdAt`.

Mongo reclama el entitlement mediante un `findOneAndUpdate` con `upsert`; el store embebido conserva el mismo contrato. La misma orden obtiene un replay válido y una orden distinta recibe `trial_already_consumed`. El índice único resuelve la carrera entre procesos: solo una organización/orden puede ganar.

Las órdenes históricas siguen siendo evidencia de consumo para compatibilidad con datos creados antes de esta entidad.

## Activación y periodos

La primera activación pagada crea un periodo mensual de calendario en UTC:

```text
currentPeriodStart = instante de activación
currentPeriodEnd   = mismo instante, un mes calendario después
paidUntil          = currentPeriodEnd
nextBillingAt      = currentPeriodEnd
```

Para días inexistentes, se utiliza el último día del mes destino: 31 de enero termina el último día de febrero; 31 de marzo termina el 30 de abril. Se cubren año bisiesto y cambio de diciembre a enero. No se suman 30 días ni se usa horario local.

`nextBillingAt` conserva el nombre público por compatibilidad, pero significa la fecha esperada/límite de renovación. No garantiza un débito automático. Un replay de activación conserva las fechas ya persistidas y no extiende el servicio.

## Cambio de plan y cancelación

El cambio de plan existente continúa siendo inmediato y conserva el periodo. No reinicia trial, no concede tiempo adicional y no reactiva una suscripción vencida por sí solo. Prorrateos y cobro del cambio permanecen fuera de alcance.

La política real de cancelación es inmediata. La ruta establece `cancelledAt`, `cancelAt` al mismo instante, `cancelAtPeriodEnd=false` y estados de orden/activación cancelados. El acceso deja de considerarse activo de inmediato y se conserva el historial. Se corrigió únicamente el texto engañoso del modal del Portal para reflejar esta conducta.

## Selección de orden y proyección

`pickActiveOrder` ya no depende solo de la recencia. Aplica esta prioridad:

1. pago activo y no vencido;
2. trial activo;
3. pago pendiente relevante;
4. estado vencido;
5. cancelado o expirado como historial;
6. rechazado u otro estado sin derecho de acceso.

`deriveSubscriptionStatus` evalúa estados y fechas sin mutar documentos. Un trial vence exactamente en `trialEndsAt`; un periodo pagado vencido conserva el contrato histórico `expired`; una cancelación tiene prioridad y un pago pendiente no se convierte en activo por un flag legado.

`buildSubscription` centraliza la salida consumida por Portal y cuenta: plan, precio, moneda, capacidad, periodo, `nextBillingAt`, fechas de trial, cancelación, add-ons y orden. Una orden pendiente más reciente ya no oculta una suscripción pagada válida.

## Compatibilidad de Ventas

Se añadieron como opcionales a `PortalSubscription` los campos `nextBillingAt`, `cancelAtPeriodEnd` y `cancelledAt`. No se cambiaron rutas, componentes, checkout ni diseño. La única modificación visible es el texto de confirmación de cancelación inmediata.

## Pruebas y validaciones

| Validación | Cobertura | Resultado |
| --- | --- | --- |
| `commercial-activation.test.js` | Elegibilidad, consumo previo, pago existente, plan no elegible, UTC, bordes mensuales y replay | Pasa |
| `portal-account.test.js` | Prioridad de órdenes, expiración exacta, cancelación y proyección de fechas | Pasa |
| `checkout-idempotency.test.js` | Claim embebido, replay de misma orden y conflicto con orden distinta | Pasa |
| `mercado-pago.test.js` | Trial nuevo, replay, clave distinta, concurrencia, bloqueo tras pago y regresión MP-HARDEN-01 a 04 | Pasa |
| `webhook-idempotency.test.js` | Leases e idempotencia de Webhook sin cambios | Pasa |
| Suite completa Backend (`npm.cmd test`) | 25 suites del script real | Pasa |
| Ventas `npm.cmd run typecheck` | Contratos TypeScript | Pasa |
| Ventas `npm.cmd run build` | Build Vite, 630 módulos | Pasa |

No se realizaron llamadas reales a Mercado Pago. Los escenarios usan stubs o `PAYMENT_PROVIDER=test` fuera de producción.

## Matriz de compatibilidad

| Área | Cambio |
| --- | --- |
| Precios y catálogo de planes | No |
| Checkout normal sin trial | No |
| Conciliación financiera | No |
| Firma y readiness del Webhook | No |
| Leases/transiciones de MP-HARDEN-03 | No |
| Idempotencia de checkout MP-HARDEN-04 | Conservada |
| Preferencias o cargos reales | No |
| Portal visual | Sin rediseño |
| Mobile | No |
| Dependencias | No |

## Pendientes explícitos

- `MP-HARDEN-06` — Refunds y chargebacks.
- `MP-SANDBOX-01` — Prueba end-to-end controlada en sandbox.
- Cobro recurrente, prorrateo y cancelación al fin del periodo requieren un contrato comercial/proveedor futuro; no se simularon.
- La suspensión operativa automática tras el vencimiento puede endurecerse en una fase separada si más endpoints no consumen aún la proyección central.

## Métricas

| Métrica | Resultado |
| --- | --- |
| Archivos incluidos | 15 (12 modificados, 3 nuevos) |
| Backend | 8 archivos de implementación y 4 de pruebas |
| Ventas | 2 archivos mínimos de contrato/presentación |
| Documentación | 1 reporte |
| Campos añadidos a orden comercial | 3 |
| Entidad persistente nueva | 1 (`TrialEntitlement`) |
| Índices únicos nuevos | 1, por organización |
| Funciones centrales nuevas o especializadas | 7 |
| Suites específicas ejecutadas | 5 |
| Suite Backend completa | 25 suites del script `test` |
| Diff antes del commit | 511 inserciones, 37 eliminaciones |

## Rollback

```bash
git revert <HASH_MP_HARDEN_05>
```

No ejecutar hasta sustituir el marcador por el hash real del commit. No se creará un segundo commit solo para insertar ese hash en este reporte.
