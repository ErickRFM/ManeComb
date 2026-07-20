# RC-ACTIVATION-FLOW-CONSOLIDATION-01

## Dictamen

**Certificación de código aprobada. Validación contra el tenant desplegado pendiente.**

Se consolidó el flujo de activación sobre la fuente de verdad que ya existía: `buildSubscription(order)` en `backend/src/services/portal-account.js`. No se agregaron endpoints, modelos, servicios, estados, permisos ni capacidades.

## Auditoría completa

### Persistencia

- La suscripción no tiene colección propia: se proyecta desde la orden comercial (`commercial_leads`).
- La empresa se identifica por `organizationId`/`organizationSlug` en la orden y `organizationId` en usuarios y Keys.
- El pago efectivo proviene de `paymentStatus`.
- La vigencia proviene de `currentPeriodEnd`/`paidUntil`; para trial, de `trialEndsAt`.
- Las Keys usan `available`, `used`, `expired` y `revoked`.

### Backend

| Responsabilidad | Archivo | Decisión encontrada |
|---|---|---|
| Estado canónico de suscripción | `backend/src/services/portal-account.js` | `buildSubscription` |
| Empresa/tenant y acceso móvil | `backend/src/services/auth-context.js` | `buildAuthContext` y `resolveMobileAccess` |
| Enforcement operacional | `backend/src/middlewares/operational-access.js` | Consume `buildAuthContext` |
| Generación y uso de Keys | `backend/src/services/activation-keys.js` | Cupos, estado de Key y vigencia del plan |
| API de Keys | `backend/src/modules/activation-keys/routes.js` | Listar, generar, compartir, revocar, validar y registrar |
| Compra y confirmación | `backend/src/modules/commercial/routes.js` | Actualiza pago/activación y emite eventos |
| Suscripción del Portal | `backend/src/modules/account/routes.js` | Devuelve `buildSubscription(activeOrder)` |
| Consultas Mongo de órdenes | `backend/src/data/repositories/payment-repository.js` | Propietario, email u organización |

### Portal

- `use-portal-store.ts` carga overview, suscripción, onboarding y Keys desde Backend.
- `subscription-state.ts` solo traduce `subscription.status` a presentación; no concede activación.
- `portal-onboarding-screen.tsx` usa el resumen y los pasos entregados por Backend.
- `canGenerate` depende de `activationSummary.availableSlots`.

### Aplicación móvil

- `account-routing.ts` obedece exclusivamente `canAccessMobile` y `mobileBlockReason`.
- `root-store.ts` obtiene esa autoridad de `/auth/me`/sesión y la revalida en eventos de suscripción.
- `mobile-account-gate-screen.tsx` solo presenta el motivo entregado por Backend.
- Validar y registrar conductor consume `/driver/activation/validate` y `/driver/activation/register`.

## Revisión de cambios recientes

Se revisaron especialmente los cambios de los días 16–18 de julio y las RC:

- `RC-SUBSCRIPTION-CONSISTENCY-01.md`.
- `RC-PORTAL-ACTIVATION-CERTIFICATION-01.md`.
- `RC-PORTAL-ACTIVATION-CERTIFICATION-02.md`.
- `RC-PORTAL-ACTIVATION-FINAL-01.md`.
- `docs/stabilization-report.md`.

La RC de consistencia ya había declarado `buildSubscription` como autoridad. La divergencia restante apareció en el enlace Key → orden y en condiciones heredadas del onboarding.

## Causa raíz

### 1. Keys históricas resolvían una orden distinta a Portal

Generar Keys usaba:

```text
empresa → listCommercialOrdersForUser → pickActiveOrder → buildSubscription
```

Validar/registrar usaba:

```text
Key → orderId → getCommercialOrderById → buildSubscription
```

Las Keys creadas antes de persistir `orderId` conservan `companyId` y `planId`, pero tienen `orderId=null`. Portal las mostraba como disponibles; móvil resolvía `order=null` y respondía “El plan de la empresa no está activo”.

### 2. `activationStatus=active` era un camino alternativo al pago

`getSubscriptionStatus` aceptaba una orden como activa si `activationStatus` era `active`, aunque `paymentStatus` siguiera pendiente. Esto permitía que un flag heredado sustituyera al pago confirmado.

### 3. Onboarding recalculaba estados

- “Plan activo” y “GPS / Radio” comparaban directamente `order.activationStatus`.
- “Pago” podía completarse por tener tarjeta guardada, sin pago confirmado.
- El timeline repetía la comparación directa de activación.

### 4. Consulta Mongo ignoraba organización sin usuario/email

`PaymentRepository.listCommercialOrdersForUser` retornaba vacío si faltaban `id` y `email`, aunque existiera `organizationId`. Esto impedía resolver de forma segura la orden de una Key anónima por su empresa.

## Consolidación aplicada

El flujo efectivo queda:

```text
Empresa y plan seleccionados
  → pago paid / paid_test o trial_active
  → buildSubscription: active/trial
  → tenant operativo
  → generación de Key con cupo
  → Key available, vigente y asociada a empresa/plan
  → registro de conductor
  → asignación/reclamación de unidad
  → Key used y cuenta activa
```

Reglas únicas:

- Pago confirmado, no `activationStatus` aislado, habilita la suscripción.
- Cancelación, suspensión, expiración y `past_due` siguen dominando flags históricos de pago.
- Portal y Keys consumen `buildSubscription(order).isActive`.
- Mobile consume `canAccessMobile`, derivado del mismo objeto de suscripción.
- Una Key con `orderId` usa esa orden exacta.
- Una Key histórica sin `orderId` resuelve la orden activa de la misma empresa y el mismo plan mediante `pickActiveOrder`.
- Un plan inactivo expone `availableSlots=0`; Portal ya no habilita visualmente “Generar Key” para una operación que Backend rechazará.

## Código obsoleto eliminado

- Regla alternativa `activationStatus === "active"` para declarar una suscripción activa.
- `getPlanPaidUntil`, sin consumidores.
- `hasOperationalTenant`, sin consumidores.
- Wrapper `hasActiveMobileSubscription`, que repetía `isActiveSubscription`.
- Revalidación local de fechas/estados dentro de `auth-context`; ahora confía en `subscription.isActive`, calculado por `buildSubscription`.
- Uso de perfil de tarjeta como sustituto de pago confirmado en onboarding.

## Archivos modificados

- `backend/src/services/portal-account.js`
- `backend/src/services/auth-context.js`
- `backend/src/services/activation-keys.js`
- `backend/src/data/repositories/payment-repository.js`
- `backend/test/auth-context.test.js`
- `backend/test/activation-keys.test.js`
- `RC-ACTIVATION-FLOW-CONSOLIDATION-01.md`

No se modificaron UX, RBAC, autenticación, endpoints, modelos, stores cliente ni arquitectura general.

## Evidencia Portal / Mobile

| Superficie | Fuente recibida | Autoridad final |
|---|---|---|
| Portal plan/pagos | `/account/subscription` | `buildSubscription` |
| Portal onboarding | `/portal/onboarding` | `buildOnboarding` usando `buildSubscription` |
| Portal Keys | `/admin/activation-keys` | Resumen usando `buildSubscription` |
| Mobile login/sesión | `/auth/*` | `buildAuthContext` usando `buildSubscription` |
| Mobile registro con Key | `/driver/activation/*` | Orden exacta o fallback empresa+plan, luego `buildSubscription` |

Los clientes no calculan si la empresa está habilitada; presentan la decisión del Backend.

## Escenarios validados

| Escenario | Resultado |
|---|---|
| Empresa nueva sin orden | `no_plan`; no genera Key |
| Empresa con pago pendiente | `payment_pending`; onboarding pendiente; cero slots generables |
| Flag heredado `activationStatus=active` sin pago | Bloqueado; no sustituye pago |
| Pago `paid` / `paid_test` | Suscripción `active` |
| Trial vigente | Suscripción `trial`, acceso permitido |
| Plan vencido | `expired`, bloqueado |
| Empresa/suscripción suspendida | Bloqueada |
| Key vigente con `orderId` | Valida y registra |
| Key histórica sin `orderId` | Resuelve empresa+plan y valida |
| Key revocada | 409, mensaje específico |
| Key vencida | 409, mensaje específico |
| Key utilizada | 409, mensaje específico |
| Cupo agotado | 409, sin consumir Key adicional |
| Asignación concurrente de unidad | Un solo conductor gana; la otra Key se conserva |

## Validaciones realizadas

- Suite completa Backend: **PASS**.
- TypeScript Mobile: **PASS**.
- TypeScript Portal/Ventas: **PASS**.
- Mercado Pago pending/rejected/cancelled/approved y webhook: **PASS**.
- Auth context y rutas operacionales: **PASS**.
- Activation Keys y asignación concurrente: **PASS**.
- Tenant isolation y RBAC: **PASS**.
- Build Android: no ejecutado por indicación del usuario.

## Riesgos remanentes

1. Falta desplegar el Backend y repetir el flujo con una Key real del tenant afectado.
2. Una Key histórica sin `orderId` solo puede recuperarse si conserva `companyId` y `planId` válidos; una Key corrupta seguirá rechazándose.
3. Las Keys ligadas explícitamente a una orden expirada no migran silenciosamente a otra orden, para conservar integridad comercial.
4. No se realizó una migración de datos porque no es necesaria para la corrección y estaba fuera de alcance.

## Dictamen final

El código queda consolidado en una sola cadena de decisión. Portal, acceso móvil, onboarding y Keys usan la misma proyección de suscripción. Se eliminó el camino alternativo basado únicamente en `activationStatus`, se impidió que una tarjeta guardada simule pago, y las Keys históricas válidas ya no producen un falso “plan inactivo”.

No se agregaron funcionalidades ni se alteró la arquitectura. La certificación operativa final depende únicamente del despliegue y de una prueba real con el tenant afectado.
