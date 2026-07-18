# RC-SUBSCRIPTION-CONSISTENCY-01

## Dictamen

**Certificación condicionada.**

La causa arquitectónica fue demostrada y corregida en código. Las pruebas focales de backend, Mobile y contratos pasan. La certificación queda condicionada exclusivamente a:

1. desplegar el backend corregido;
2. comparar `/auth/me` y `/account/subscription` con credenciales del tenant afectado;
3. ejecutar los builds completos omitidos por instrucción del usuario.

No se certifica todavía el deployment ni la cuenta real porque no se proporcionaron credenciales y no se realizaron builds prolongados.

## Resumen de la causa raíz

La inconsistencia no era una única falla visual. Eran tres divergencias acumulativas:

### Causa crítica 1 — payload internamente contradictorio

`buildSubscription` podía devolver simultáneamente:

```json
{
  "status": "active",
  "isActive": false,
  "expiresAt": "fecha vencida"
}
```

Portal presentaba el campo `status` y mostraba **Activa**. Mobile obedecía la decisión de acceso construida con `isActive` y mostraba **Plan no activo**.

La contradicción se originaba en `backend/src/services/portal-account.js`: la expiración afectaba `isActive`, pero no normalizaba `status` a `expired`.

### Causa crítica 2 — Mobile no podía salir de un bloqueo obsoleto

Mobile guardaba `authContext` recibido durante login/hidratación. La pantalla bloqueada llamaba `refreshAll`, pero `refreshAll` retornaba antes de consultar `/auth/me` si `canAccessMobile` ya era falso.

Consecuencia:

```text
Backend renueva/activa plan
        ↓
Portal vuelve a pedir /account/subscription → muestra activo
        ↓
Mobile conserva canAccessMobile=false
        ↓
“Reintentar” no consulta backend porque el estado viejo impide el refresh
```

Además, volver desde background no reconciliaba la cuenta.

### Causa alta 3 — taxonomías backend diferentes

- El resolver general consideraba `trial` activo.
- El guard móvil backend exigía literalmente `status === "active"`.
- Activación de keys mantenía otra regla basada en `activationStatus`, `paymentStatus` y un orden diferente de fechas.
- `paid` podía conservarse como estado distinto de `active`.
- Un plan vencido conservaba el estado `active`.

## 1. Arquitectura del flujo

### Antes

```text
CommercialLead / orden comercial
        ├─ buildSubscription ──> /account/subscription ──> Portal
        │                              └─ renderiza status
        ├─ buildAuthContext ───> /auth/login, /auth/me ──> Mobile
        │                              └─ guarda canAccessMobile
        └─ activation-keys ────> regla propia de plan/expiración
```

### Después

```text
CommercialLead / orden comercial
        ↓
buildSubscription (Subscription Resolver oficial)
        ├─ status efectivo
        ├─ isActive
        ├─ expiresAt/currentPeriodEnd
        ├─ límites
        └─ uso
        ↓
buildAuthContext
        ├─ canAccessMobile
        ├─ mobileBlockReason
        ├─ tenant
        └─ route
        ↓
API + evento subscription:updated saneado
        ├─ Portal: presenta el estado recibido
        └─ Mobile: refresca /auth/me y obedece canAccessMobile
```

## 2. Fuente oficial de verdad

La autoridad oficial es ahora:

- Resolver de suscripción: `backend/src/services/portal-account.js#buildSubscription`.
- Resolver de acceso: `backend/src/services/auth-context.js#buildAuthContext`.
- Enforcement operacional: `backend/src/middlewares/operational-access.js`.

Los clientes no conceden acceso por sí mismos:

- Portal transforma el estado canónico únicamente en una presentación.
- Mobile usa `canAccessMobile` entregado por backend.
- Activación de keys usa `buildSubscription(order).isActive`.

## 3. Modelos auditados

### Persistencia

No existe una colección `Subscription` independiente. La suscripción se proyecta desde `CommercialLead`/orden comercial.

Campos relevantes del schema:

- `organizationId`, `organizationSlug`, `ownerUserId`, `ownerAccountEmail`.
- `planId`, `planName`, `fleetSize`.
- `paymentStatus`, `paymentApprovedAt`.
- `status`, `activationStatus`.
- `trialStartedAt`, `trialEndsAt`, `trialStatus`.
- `cancelAt`.
- `currentPeriodStart`, `currentPeriodEnd`, `paidUntil` — declarados en esta RC porque el resolver ya dependía de ellos, pero Mongo no los modelaba.

### Organización y membresía

No existe un modelo Organization/Membership separado para esta decisión. El tenant se resuelve desde:

1. `user.organizationId`/`companyId`;
2. `order.organizationId`/`organizationSlug`.

La consulta de órdenes acepta propietario, email y organización. Mobile limpia cache si cambia `user.id` u `organizationId`.

## 4. Taxonomía canónica

| Entradas persistidas | Estado API | `isActive` | Acceso Mobile |
|---|---|---:|---:|
| activación activa o pago `paid`/`paid_test`, fecha vigente o sin fecha | `active` | true | permitido si tenant activo |
| `trial_active`, fecha vigente | `trial` | true | permitido si tenant activo |
| activa/trial con fecha pasada | `expired` | false | bloqueado: `inactive_plan` |
| cancelada/canceled | `cancelled` | false | bloqueado: `inactive_plan` |
| suspendida | `suspended` | false | bloqueado: `inactive_plan` |
| `past_due` | `past_due` | false | bloqueado: `inactive_plan` |
| pendiente/unpaid/requires_payment | estado pendiente | false | bloqueado: `payment_pending` |
| sin orden/plan | `inactive` | false | bloqueado: `no_plan` |

`paid` y `paid_test` son entradas del proveedor/persistencia, no estados públicos distintos: se normalizan a `active`.

## 5. Cálculo de expiración y tiempo

El cálculo se ejecuta únicamente en backend con `Date`/`Date.now()` sobre timestamps ISO.

Reglas:

- Trial: `trialEndsAt`, con fallback legado.
- Plan pagado: `currentPeriodEnd`, después `paidUntil`.
- Un timestamp pasado convierte el estado efectivo a `expired`.
- Portal y Mobile no comparan fechas para conceder acceso.

Esto elimina divergencias por timezone o reloj del dispositivo. JavaScript compara epoch UTC; el timezone solo afecta presentación.

## 6. Endpoints y payloads

### Portal

#### `GET /account/subscription`

Devuelve directamente `buildSubscription(activeOrder)`:

```json
{
  "ok": true,
  "data": {
    "id": "string|null",
    "planId": "string|null",
    "planName": "string",
    "status": "active|trial|expired|cancelled|suspended|...",
    "isActive": true,
    "activeUnits": 0,
    "availableUnits": 2,
    "totalUnits": 2,
    "unitsLimit": 2,
    "monthlyPrice": 0,
    "currency": "MXN",
    "currentPeriodStart": "ISO|null",
    "currentPeriodEnd": "ISO|null",
    "expiresAt": "ISO|null",
    "cancelAt": "ISO|null"
  }
}
```

#### `GET /portal/overview`

Incluye el mismo objeto en `data.subscription`.

### Mobile

#### `POST /auth/login`, `POST /auth/refresh`

Incluyen:

- `user`;
- `authContext`;
- `canAccessMobile`;
- `mobileBlockReason`;
- `tenant`;
- `subscription` — mismo `buildSubscription`;
- `postLoginRoute`.

#### `GET /auth/me` y `GET /auth/session`

Incluyen:

- `profile.user`;
- `profile.vehicle`;
- `profile.documents`;
- los mismos campos de autoridad de acceso y suscripción.

### Diferencia legítima

Portal recibe el objeto comercial para presentarlo. Mobile recibe además la decisión de seguridad `canAccessMobile`. Ambos se construyen en la misma solicitud backend y desde el mismo resolver.

## 7. Comparación Portal vs Mobile

| Aspecto | Portal | Mobile | Resultado tras RC |
|---|---|---|---|
| Endpoint principal | `/account/subscription` | `/auth/me` | Ambos usan `buildSubscription`. |
| Estado mostrado | `subscription.status` | `mobileBlockReason`/`canAccessMobile` | Estado e indicador ya no se contradicen. |
| Expiración | Solo presenta fecha | No recalcula | Autoridad backend. |
| Cache | Zustand, TTL 30 s | Zustand + AsyncStorage | Ambos revalidan; Mobile ya no queda atrapado. |
| Realtime | `subscription:updated` | `subscription:updated` → `/auth/me` | Misma invalidación organizacional. |
| Foreground | Reconnect/load | `/auth/me` mediante `refreshAll` | Renovación sin logout. |
| Logout/login | Reset + carga | limpia tenant/cache + `/auth/me` | Sin mezcla de organización. |

## 8. Store Mobile

### Hallazgo previo

- `authContext` era persistido en AsyncStorage.
- La identidad cambiada limpiaba cache correctamente.
- Un fallo de red restauraba cache con `authContext: null`, evitando conceder acceso offline por inferencia.
- Sin embargo, `refreshAll` comprobaba primero el `canAccessMobile` cacheado y retornaba si era falso.
- La respuesta `/auth/me` incluida en un refresh activo actualizaba perfil, pero no reconciliaba `authContext`.

### Corrección

`refreshAll` ahora:

1. consulta `/auth/me` antes de cargar datos operacionales;
2. actualiza `user` y `authContext` desde backend;
3. si backend bloquea, vacía datos operacionales y conserva la sesión bloqueada;
4. si backend permite, carga operación;
5. se ejecuta desde Reintentar, foreground y eventos de suscripción.

No se agregó una segunda regla de activación al cliente.

## 9. Store Portal

- `usePortalStore` usa TTL de 30 segundos.
- `loadAll({force})` vuelve a consultar overview y subscription.
- Socket invalida en `payment:confirmed`, `plan:active` y `subscription:updated`.
- El portal no persiste la decisión de acceso en AsyncStorage.
- El tipo `PortalSubscription` se alineó con `isActive`, `unitsLimit` y `expiresAt` del payload real.

No se modificó lógica visual del Portal.

## 10. Flujo de login y guard

```text
Login
  ↓
JWT + refresh session
  ↓
buildAuthContext(store, user)
  ↓
pickActiveOrder por owner/email/organization
  ↓
buildSubscription
  ↓
buildTenantContext
  ↓
resolveMobileAccess
  ↓
Mobile guarda authContext
  ↓
resolveMobilePostLoginRoute
  ├─ canAccessMobile=true  → /mapa
  ├─ canAccessMobile=false → /plan-blocked
  └─ sin decisión vigente  → /sync-error
```

El enforcement real de APIs sigue en `requireOperationalAccess`; no se eliminó ni relajó.

## 11. Sincronización

Se verificaron:

- Login y refresh token.
- Inicialización desde sesión almacenada.
- Cambio de identidad/organización y limpieza de cache.
- Socket.IO.
- Reconnect.
- Foreground/resume.
- Pull-to-refresh/Reintentar.
- Logout.

Los eventos `subscription:updated` ahora se publican al room organizacional con un payload saneado generado por backend. Los eventos comerciales detallados continúan limitados a roles de billing; no se expuso la orden completa a conductores.

## 12. Límites

Los límites no determinan el acceso general a Mobile:

- `unitsLimit`/`totalUnits` provienen de `fleetSize`.
- `activeUnits` y `availableUnits` son uso, no estado del plan.
- Activación de keys aplica cupos, pero ahora valida vigencia mediante `buildSubscription`.
- Exceder cupos bloquea la acción específica, no se traduce falsamente a “Plan no activo”.

## 13. Errores

| Caso | Comportamiento |
|---|---|
| 401/token vencido | recuperación con refresh token o cierre de sesión; no se convierte en plan inactivo. |
| 403 `PLAN_REQUIRED` | vuelve a consultar `/auth/me` y usa `mobileBlockReason`. |
| Timeout/offline | estado de red/cache; sin decisión backend vigente se muestra sync error. |
| 404/409 | error específico de recurso/acción. |
| Error de Mapbox/TOKEN_EMPTY | no participa en la decisión de suscripción. |

## 14. Observabilidad

Ya existía observabilidad suficiente en `backend/src/modules/auth/routes.js` bajo `AUTH_ACCESS_DEBUG=true` o desarrollo:

- `canAccessMobile`;
- `mobileBlockReason`;
- `subscriptionIsActive`;
- `subscriptionStatus`;
- `tenantStatus`;
- `organizationId` y `userId`.

`requireOperationalAccess` registra además cada bloqueo y su razón. No se dejaron `console.log` temporales en clientes ni se registran tokens, datos de pago o payloads sensibles.

## 15. Hallazgos por severidad

### Críticos

1. `status=active` junto a `isActive=false` en planes vencidos.
2. Mobile bloqueado no volvía a consultar la autoridad backend.

### Altos

3. Trial vigente aceptado por resolver general pero rechazado por guard móvil.
4. Activación de keys tenía su propio criterio de vigencia y expiración.
5. Eventos de cambio no invalidaban a todos los usuarios operacionales del tenant.
6. Campos de periodo usados por el resolver no estaban en el schema Mongo.

### Medios

7. Tipos Mobile/Portal no declaraban exactamente los mismos campos del payload.
8. `paid`/`paid_test` podían escapar como taxonomías distintas de `active`.
9. Portal usa un TTL de 30 s; durante ese intervalo puede mostrar datos anteriores si no existe socket.

### Bajos

10. Los nombres `expiresAt`, `currentPeriodEnd` y `paidUntil` coexisten por compatibilidad. El resolver ya fija la precedencia, pero una migración futura podría retirar aliases.

## 16. Archivos modificados

- `backend/src/services/portal-account.js`
- `backend/src/services/auth-context.js`
- `backend/src/services/activation-keys.js`
- `backend/src/modules/account/routes.js`
- `backend/src/modules/commercial/routes.js`
- `backend/src/data/models.js`
- `backend/test/auth-context.test.js`
- `mobile/src/store/root-store.ts`
- `ventas/src/types/app.ts`
- `RC-SUBSCRIPTION-CONSISTENCY-01.md`

El worktree ya contenía cambios ajenos a esta RC. Se conservaron; este documento enumera únicamente los archivos tocados para la corrección de suscripciones.

## 17. Evidencia de validación

| Validación | Resultado |
|---|---|
| Backend auth-context | PASS — activo, pendiente, vencido, tenant suspendido, trial y pago canónico. |
| Backend activation keys | PASS — plan, cupos y contrato Mobile. |
| Backend RBAC | PASS. |
| Backend Mercado Pago | PASS — pending/rejected/cancelled/approved, plan change y webhook. |
| Mobile account routing | PASS — 12/12. |
| TypeScript Mobile | PASS. |
| ESLint Mobile | PASS. |
| TypeScript Portal | PASS. |
| `git diff --check` | PASS. |
| Build Mobile | OMITIDO por instrucción del usuario. |
| Build Portal | OMITIDO por instrucción del usuario en esta RC. |
| Suite completa backend/mobile | OMITIDA; se ejecutaron suites focales para evitar validaciones prolongadas. |

## 18. Matriz de certificación

| Criterio | Estado |
|---|---|
| Portal y Mobile consumen autoridad backend común | Cumplido en código. |
| Suscripción activa permite operar | Probado. |
| Suscripción expirada bloquea y Portal recibe `expired` | Probado. |
| Trial vigente funciona | Probado. |
| Renovación sin cerrar sesión | Corregido por evento, foreground y refresh; pendiente prueba E2E desplegada. |
| Cambio de plan | Backend focal PASS; pendiente E2E realtime desplegado. |
| Cambio de organización | Limpieza de cache verificada por código; pendiente E2E. |
| Logout/Login refresca | Flujo usa `/auth/me`; pendiente E2E. |
| Cache obsoleta no mantiene bloqueo | Corregido; pendiente E2E en dispositivo. |
| No existen reglas duplicadas de vigencia | Backend unificado para auth y activación. |
| Bloqueo solo cuando corresponde | Casos focales PASS. |

## Riesgos remanentes

1. Los registros Mongo existentes que nunca almacenaron periodo pagado pueden tener `expiresAt=null`; se tratarán como activos sin vencimiento hasta que billing escriba `currentPeriodEnd` o `paidUntil`.
2. La adición del schema preserva valores futuros, pero no inventa fechas históricas ni migra datos.
3. Falta validar el tenant real y confirmar que Portal/Mobile usan el mismo `organizationId` desplegado.
4. Falta ejecutar builds completos y una prueba E2E en dispositivo por instrucción del usuario.

## Conclusión

El backend es ahora la única autoridad de vigencia y acceso. Portal y Mobile ya no pueden recibir una suscripción simultáneamente “active” e inactiva; trial y pagos se normalizan; Mobile revalida la decisión aun estando bloqueado; y Activación usa el mismo resolver.

La solución no fuerza `isActive`, no elimina guards, no contiene excepciones por cuenta y no hardcodea acceso. La certificación final deberá emitirse después del deployment, comparación de payloads reales y validación E2E del tenant afectado.
