# MP-EMAIL-03B — Conexión de eventos reales pendientes

**Estado:** Desplegado y validado en dry-run

**Rama integrada:** `main`

**Commit base:** `99b8c95`

**Commit de implementación:** `d34767a6f1ab39b902ecf35309ddeea252f1e1d7`

**Modo de correo:** `EMAIL_DRY_RUN=true` / envíos reales `0`

**Veredicto:** `MP_EMAIL_03_EVENT_WIRING_DEPLOYED`

## 1. Alcance

Esta fase continuó el inventario de `MP-EMAIL-03A.md` y conectó únicamente transiciones de dominio que ya tenían una identidad persistible, un destinatario confiable y una política funcional suficiente. No se modificaron Redis, Valkey, Render, Resend, la arquitectura central de entrega ni la configuración productiva.

Todo evento nuevo sigue este orden:

```text
validar transición
→ persistir entidad y versión de dominio
→ resolver destinatario desde backend
→ construir eventType + tenantScope + idempotencyKey
→ communication.sendEmail
→ DeliveryEngine / historial único / cola
```

Los fallos de comunicación se normalizan en `sendEmailSafely()` y no revierten usuarios, credenciales, reembolsos, contracargos ni documentos.

## 2. Resultado ejecutivo

| Métrica | Antes | Después |
| --- | ---: | ---: |
| Plantillas registradas | 26 | 31 |
| Eventos conectados | 8 | 17 |
| Plantillas consumidas | 8 | 17 |
| Plantillas sin consumidor | 18 | 14 |
| Consumidores duplicados | 0 | 0 |
| Envíos reales | 0 | 0 |
| Pruebas finales fallidas | 0 | 0 |

Se añadieron cinco plantillas: `refund-confirmed`, `chargeback-updated`, `document-uploaded`, `document-approved` y `document-rejected`. Las plantillas existentes `password-changed`, `email-changed`, `account-suspended` y `account-reactivated` recibieron consumidores reales.

`WELCOME` mantiene un solo contrato central y ahora tiene tres productores legítimos: registro público preexistente, alta administrada y registro de conductor con activation key. Los tres convergen en `welcome:{userId}`.

## 3. Matriz de eventos de MP-EMAIL-03B

| Evento | Productor | Transición persistida | Recipient | Template | Idempotencia | Tests | Estado |
| --- | --- | --- | --- | --- | --- | --- | --- |
| WELCOME | `users POST /` | usuario creado | `user.email` persistido | `welcome` | `welcome:{userId}` | contrato, tenant, clave y orden | CONNECTED |
| WELCOME | `registerDriverWithActivationKey` | conductor creado, tenant asociado y key consumida | `activation.user.email` persistido | `welcome` | `welcome:{userId}` | orden de persistencia y suite de activation keys | CONNECTED |
| ACCOUNT_SUSPENDED | `users PATCH /:userId` | `active → suspended`, `suspendedAt` guardado | usuario actualizado | `account-suspended` | `account-suspended:{userId}:{suspendedAt}` | no-op, transición y clave | CONNECTED |
| ACCOUNT_REACTIVATED | `users PATCH /:userId` | `suspended → active`, `accountStatusVersion` incrementada | usuario actualizado | `account-reactivated` | `account-reactivated:{userId}:{version}` | no-op, transición y clave | CONNECTED |
| PASSWORD_CHANGED | `users PATCH /me`, `users PATCH /:userId`, `auth reset-password` | hash guardado, `credentialVersion` incrementada y sesiones revocadas | usuario persistido | `password-changed` | `password-changed:{userId}:{version}` | cambio legítimo, reset y fallo aislado | CONNECTED |
| EMAIL_CHANGED | `users PATCH /me`, `users PATCH /:userId` | nuevo email validado y guardado, `credentialVersion` incrementada | nuevo email persistido | `email-changed` | `email-changed:{userId}:{version}` | mismo email no cambia; nuevo email sí | CONNECTED |
| REFUND_CONFIRMED | `account POST /orders/:orderId/refunds` | operación de refund confirmada y estado financiero actualizado | `ownerAccountEmail` de la orden | `refund-confirmed` | `refund-confirmed:{providerRefundId}` | recipient, monto, contrato y clave | CONNECTED |
| CHARGEBACK_UPDATED | webhook de chargebacks | transición relevante aplicada, contracargo y entitlement guardados | `ownerAccountEmail` de la orden | `chargeback-updated` | `chargeback:{providerChargebackId}:{status}` | estado relevante/no relevante y clave | CONNECTED |
| DOCUMENT_UPLOADED | `documents POST /` | asset y documento creados | propietario conductor o conductor asignado a la unidad | `document-uploaded` | `document-uploaded:{documentId}:recipient:{userId}` | driver, unidad, tenant y sin asignación | CONNECTED |
| DOCUMENT_APPROVED | `documents PATCH /:id/review` | revisión distinta, `reviewVersion + 1` | misma política documental | `document-approved` | `document-approved:{documentId}:{reviewVersion}` | misma revisión no duplica | CONNECTED |
| DOCUMENT_REJECTED | `documents PATCH /:id/review` | revisión distinta, `reviewVersion + 1` | misma política documental | `document-rejected` | `document-rejected:{documentId}:{reviewVersion}` | nueva revisión sí notifica | CONNECTED |
| CRITICAL_INCIDENT | incidencias | incidencia persistida, pero sin preferencia de email ni conjunto de destinatarios aprobado | no resuelto | `critical-incident` | propuesta por incidencia y recipient | no se conectó | PENDING_POLICY |
| DRIVER_INVITATION | creación de activation key | la key no contiene recipient ni representa invitación | inexistente | `driver-invitation` | inexistente | no se conectó | PENDING_RECIPIENT |

## 4. Identidades persistidas

### Cuenta y credenciales

El usuario conserva:

- `suspendedAt`: versión temporal persistida de cada suspensión real;
- `reactivatedAt`: evidencia de la última reactivación;
- `accountStatusVersion`: versión monotónica de transiciones de estado;
- `credentialVersion`: versión monotónica compartida por cambios reales de email o contraseña;
- `passwordChangedAt` y `emailChangedAt`: evidencia operativa persistida.

Guardar nuevamente `active`, `suspended` o el mismo email no incrementa una versión. Cada cambio legítimo posterior genera una identidad nueva. El reset de contraseña incrementa la versión en la misma operación que guarda el hash y devuelve el usuario actualizado.

### Documentos

`reviewVersion` comienza en cero y aumenta atómicamente únicamente cuando cambia `reviewStatus` o `reviewNotes`. En MongoDB la reclamación usa `findOneAndUpdate` con filtro de diferencia y `$inc`, por lo que dos revisiones idénticas concurrentes no crean dos versiones.

### Finanzas

El reembolso utiliza `providerRefundId` de la operación confirmada. El contracargo utiliza `providerChargebackId + status` después de aplicar la transición. Ninguna clave usa email, URL, `Date.now()`, `Math.random()` ni el `requestId` genérico del webhook.

## 5. Política de destinatarios

| Dominio | Fuente confiable | Regla de tenant |
| --- | --- | --- |
| Usuarios y seguridad | usuario devuelto por el store después de persistir | `organization:{organizationId}` o scope estable del usuario |
| Reembolso y contracargo | `ownerAccountEmail` persistido en la orden; `order.email` solo como compatibilidad histórica | organización de la orden |
| Documento de conductor | perfil persistido del propietario | usuario y documento deben compartir organización |
| Documento de unidad | conductor actualmente asignado a la unidad | unidad, documento y conductor deben compartir organización |

No se envía un documento de unidad sin conductor asignado. Tampoco se hace difusión masiva a administradores o gestores. Esta política evita asumir destinatarios que el dominio no ha aprobado.

## 6. Contratos de las plantillas nuevas

| Evento | Datos mínimos | Contenido excluido |
| --- | --- | --- |
| REFUND_CONFIRMED | `name`, `referenceCode`, `amount`, `currency`, `refundStatus`, `supportUrl` | credenciales, respuesta cruda, método de pago completo |
| CHARGEBACK_UPDATED | `name`, `referenceCode`, `amount`, `currency`, `chargebackStatus`, `supportUrl` | payload de webhook, IDs internos, headers |
| DOCUMENT_UPLOADED | `documentType`, `vehicleOrDriverLabel`, `reviewStatus`, `reviewDate`, `portalUrl` | storage key, bucket, URL privada |
| DOCUMENT_APPROVED | mismos campos documentales | notas internas y rutas privadas |
| DOCUMENT_REJECTED | mismos campos documentales | notas internas y rutas privadas |

El renderer central sigue produciendo `{ subject, html, text }`. Los valores dinámicos pasan por los componentes con escapado HTML y las pruebas renderizan las 31 plantillas.

## 7. Idempotencia y duplicados

- Alta administrada, alta por activation key y registro público comparten `welcome:{userId}`; el índice central impide una segunda entrega de la misma identidad.
- `active → active` y `suspended → suspended` no cambian versión ni ejecutan consumidor.
- La misma revisión documental devuelve `reviewChanged=false`; una revisión diferente incrementa `reviewVersion`.
- Un webhook de contracargo repetido no supera la reclamación/transición ya aplicada; si llegara de nuevo al servicio central, la clave funcional vuelve a bloquearlo.
- La operación de refund se notifica solo después de `completeRefundOperation`; no se produce correo al solicitar el reembolso.
- La unicidad durable continúa siendo `tenantScope + eventType + idempotencyKey` en el historial central.

## 8. Eventos deliberadamente pendientes

### PENDING_POLICY

`CRITICAL_INCIDENT` no se conectó. El sistema tiene permisos de gestión de incidencias, pero no una preferencia de correo ni una política aprobada que determine exactamente qué usuarios activos deben recibir cada incidencia. Enviar a todos los roles administrativos sería una difusión indiscriminada.

### PENDING_RECIPIENT

`driver-invitation` no se conectó. Una activation key actual contiene capacidad de registro, no `invitationId`, `recipientEmail`, estado de aceptación ni destinatario. El correo de bienvenida se envía después de crear al conductor; eso no convierte la key en invitación.

### NOT_APPLICABLE

- vencimiento documental: estado derivado por fecha, sin scheduler o transición persistida;
- invoice disponible: vista derivada de orden, sin evento de emisión;
- renovación, expiración de plan/trial y reportes: sin scheduler de dominio conectado;
- GPS, tracking, chat y radio: eventos de alta frecuencia que no corresponden a correo transaccional en esta fase.

## 9. Inventario final

### CONNECTED — 17 eventos / plantillas

1. WELCOME
2. PASSWORD_RESET
3. ORDER_CREATED
4. PAYMENT_CONFIRMED
5. PAYMENT_FAILED
6. PAYMENT_PENDING
7. SUBSCRIPTION_ACTIVATED
8. SUBSCRIPTION_CANCELLED
9. PASSWORD_CHANGED
10. EMAIL_CHANGED
11. ACCOUNT_SUSPENDED
12. ACCOUNT_REACTIVATED
13. REFUND_CONFIRMED
14. CHARGEBACK_UPDATED
15. DOCUMENT_UPLOADED
16. DOCUMENT_APPROVED
17. DOCUMENT_REJECTED

### PENDING_TEMPLATE

Ningún evento exigido por MP-EMAIL-03B quedó bloqueado por plantilla.

### PENDING_IDEMPOTENCY

Ningún evento conectado quedó sin identidad persistida.

### PENDING_RECIPIENT

- DRIVER_INVITATION.

### PENDING_POLICY

- CRITICAL_INCIDENT.

### Plantillas registradas sin consumidor — 14

1. `account-activation`
2. `company-invitation`
3. `admin-invitation`
4. `driver-invitation`
5. `invoice-available`
6. `plan-renewal`
7. `plan-expiring`
8. `trial-expiring`
9. `weekly-report`
10. `monthly-report`
11. `critical-incident`
12. `new-device-connected`
13. `suspicious-login`
14. `identity-verification`

## 10. Pruebas

La nueva suite `backend/test/email-domain-events.test.js` contiene 52 aserciones directas y cubre:

- contrato, plantilla, event type, tenant y clave de cada grupo nuevo;
- destinatario persistido en usuarios, finanzas y documentos;
- transiciones reales y no-op de cuenta;
- versión de credenciales;
- refund confirmado y chargeback relevante/no relevante;
- documento de conductor, unidad asignada, unidad sin conductor y cruce de tenant;
- misma revisión sin versión nueva y revisión distinta con versión nueva;
- persistencia previa al consumidor mediante verificaciones estructurales;
- ausencia de `Date.now`, `Math.random` y `requestId` en las claves del adaptador;
- aislamiento del fallo de comunicación y sanitización del error.

Resultados finales:

| Comando | Cobertura | Resultado |
| --- | --- | --- |
| `cd communication-service && npm test` | 1 archivo; contrato central, concurrencia, dry-run, provider mock y 31 templates | APROBADO |
| `cd backend && npm test` | 29 archivos encadenados, incluida la suite nueva | APROBADO |
| `cd backend && npm run test:password-recovery` | reset real del store, revocación de sesión y PASSWORD_CHANGED | APROBADO |

Total ejecutado: **31 archivos de prueba**, **0 fallos finales**, **0 envíos reales**. Los estados `sent` que aparecen en logs de las pruebas provienen de providers simulados. La primera ejecución confinada de backend encontró `EPERM` al escribir el fixture temporal de documentos; se repitió con acceso de filesystem y la misma suite terminó correctamente.

## 11. Búsquedas finales

- Resend directo: la URL `api.resend.com` permanece únicamente en `communication-service/src/providers/resend.provider.js`.
- Productores de backend: usan `communication.sendEmail` mediante el adaptador central o `commercial-notifier`; no acceden al provider.
- Frontends: no se añadieron consumidores ni accesos a correo.
- Claves nuevas: no contienen email, URL, token, `Date.now()`, `Math.random()` ni request ID genérico.

## 12. Archivos modificados

### Backend

- `backend/package.json`
- `backend/src/data/models.js`
- `backend/src/data/mongo-store.js`
- `backend/src/data/store.js`
- `backend/src/modules/account/routes.js`
- `backend/src/modules/activation-keys/routes.js`
- `backend/src/modules/auth/routes.js`
- `backend/src/modules/commercial/routes.js`
- `backend/src/modules/documents/routes.js`
- `backend/src/modules/users/routes.js`
- `backend/src/services/domain-email-events.js` (nuevo)
- `backend/test/communication.test.js`
- `backend/test/email-domain-events.test.js` (nuevo)
- `backend/test/password-recovery.test.js`

### Communication service

- `communication-service/src/core/types.js`
- `communication-service/src/core/validators.js`
- `communication-service/src/templates/builders.js`
- `communication-service/tests/communication.test.js`

### Documentación

- `MP-EMAIL-03B.md` (nuevo)

Archivos eliminados: **0**. No se modificaron archivos móviles, ventas, Postman, configuración de Render ni lockfiles.

## 13. Riesgos pendientes

1. `productionQueueDurability=false`: Valkey Free conserva `Persistence Mode: Off`. Esta limitación operativa es preexistente y no se presenta como producción lista.
2. La incidencia crítica requiere política de destinatarios y preferencia de notificación antes de conectarse.
3. La invitación de conductor requiere una entidad real con recipient; una activation key no satisface ese contrato.
4. Los eventos programados de expiración y reportes necesitan scheduler y transición persistida antes de consumir sus plantillas.

## 14. Cierre

Los eventos conectables exigidos tienen productor real, persistencia previa, recipient de backend, aislamiento por tenant, plantilla válida, clave funcional estable y cobertura automatizada. Los dos pendientes permitidos permanecen explícitos y no provocan envíos indiscriminados.

```text
EMAIL_DRY_RUN=true
realDeliveries=0
failedTests=0
productionQueueDurability=false
reason=Valkey Free Persistence Mode Off
MP_EMAIL_03_EVENT_WIRING_DEPLOYED
```

## 15. MP-EMAIL-03C — Integración y validación desplegada

### Integración y despliegue

| Evidencia | Resultado |
| --- | --- |
| Commit de implementación | `d34767a6f1ab39b902ecf35309ddeea252f1e1d7` |
| Commit integrado a `main` | `d34767a6f1ab39b902ecf35309ddeea252f1e1d7` |
| Método de integración | fast-forward desde `codex/mp-email-03b` |
| Conflictos | 0 |
| `main == origin/main` al desplegar | Sí |
| Commit desplegado y validado | `d34767a6f1ab39b902ecf35309ddeea252f1e1d7` |
| Despliegue Render | `dep-d9mdm9gae00c73eg879g` |
| Fecha de despliegue | 31 de julio de 2026, 11:29 a. m. (`America/Mexico_City`) |
| Build | Successful |
| Servicio | Live |

El commit de implementación fue desplegado antes de registrar esta evidencia. El cierre documental se versiona en un commit posterior para no reescribir la historia ni intentar incluir el hash de un commit dentro de sí mismo.

### Readiness desplegado

Las consultas a `GET /api/health` y `GET /api/health/ready` devolvieron HTTP 200. El estado global permanece `degraded` por la falta de persistencia de Valkey Free, no por una falla funcional del correo.

| Campo | Valor desplegado |
| --- | --- |
| `communication.functional` | `true` |
| `providerConfigured` | `true` |
| `provider` | `resend` |
| `communication.status` | `dry_run` |
| `history.mode` | `mongo` |
| `history.idempotencyIndex` | `true` |
| `queue.mode` | `bullmq` |
| `queue.connected` | `true` |
| `queue.functional` | `true` |
| `queue.workerStarted` | `true` |
| `queue.maxmemoryPolicy` | `noeviction` |
| `queue.persistence` | `false` |
| `productionDurability` | `false` |
| `lastError` | `null` |

### Smoke tests internos en dry-run

Se ejecutó un fixture interno efímero sobre el mismo código del commit desplegado. No se creó un endpoint de prueba, no se usaron clientes reales, no se llamó a Mercado Pago y el fixture fue retirado al terminar. Esto permitió validar el evento financiero sin provocar un reembolso real.

| Grupo | Evento | Estado | Entregas nuevas | Repetición | Tenant |
| --- | --- | --- | ---: | --- | --- |
| Usuarios | `WELCOME` | `dry_run` | 1 | `duplicate=true` | correcto |
| Seguridad | `PASSWORD_CHANGED` | `dry_run` | 1 | `duplicate=true` | correcto |
| Cuenta | `ACCOUNT_SUSPENDED` | `dry_run` | 1 | `duplicate=true` | correcto |
| Comercial | `ORDER_CREATED` | `dry_run` | 1 | bloqueada; 0 entregas adicionales | correcto |
| Financiero | `REFUND_CONFIRMED` | `dry_run` | 1 | `duplicate=true` | correcto |
| Documentos | `DOCUMENT_APPROVED` | `dry_run` | 1 | `duplicate=true` | correcto |

En las seis entregas se comprobó `accepted=true`, `simulated=true`, `failed=false`, `recipientMasked` presente, `recipientHash` presente e `idempotencyKey` estable. Resultado agregado:

```text
fixtures=6
deliveries=6
duplicates_prevented=6
provider_attempts=0
email_delivery_failed=0
realDeliveries=0
EMAIL_DRY_RUN=true
```

### Estado final

Los 17 event types permanecen conectados; los tres productores de `WELCOME` siguen agrupados bajo un solo event type. `CRITICAL_INCIDENT=PENDING_POLICY` y `DRIVER_INVITATION=PENDING_RECIPIENT` continúan deliberadamente pendientes. No se modificaron Redis, Valkey, Resend, MongoDB ni la configuración externa.

```text
productionQueueDurability=false
reason=Valkey Free Persistence Mode Off
MP_EMAIL_03_EVENT_WIRING_DEPLOYED
```
