# MP-EMAIL-03A — Auditoría y cierre del consumo de eventos reales

**Estado:** Cerrado con pendientes funcionales inventariados

**Rama:** `codex/mp-email-03a`

**Commit base:** `c40423b`

**Modo de correo durante la auditoría:** `EMAIL_DRY_RUN=true` / envíos reales `0`

**Veredicto:** `MP_EMAIL_03A_NOT_READY`

## 1. Alcance y método

La revisión partió de las transiciones persistidas del backend, no del catálogo de plantillas. Se siguieron productores en `backend/src/modules/`, servicios, stores embebido y Mongo, adaptador central y `communication-service`. También se buscaron consumidores y accesos directos a proveedores en `backend`, `ventas`, `mobile`, `admin-global` y `communication-service`.

No se modificó Render, MongoDB, Valkey, Resend ni la configuración productiva. No se ejecutó la validación real de MP-EMAIL-02B y no se enviaron correos reales.

## 2. Resultado ejecutivo

- Hay **26 plantillas registradas**.
- Hay **8 eventos activos conectados** a **8 plantillas consumidas**.
- Hay **18 plantillas sin consumidor funcional**; algunas corresponden a transiciones reales pendientes y otras no tienen productor de dominio.
- No se encontró ningún frontend contactando un proveedor o construyendo entregas.
- No se encontraron consumidores duplicados de los ocho eventos activos.
- Se corrigieron dos defectos demostrables en el flujo comercial:
  1. Los seis correos comerciales ahora priorizan `ownerAccountEmail`, persistido desde la cuenta autenticada, sobre el email libre del checkout.
  2. La activación y su periodo se persisten antes de producir `PAYMENT_CONFIRMED` y `SUBSCRIPTION_ACTIVATED`, de modo que la clave de activación procede de una versión de dominio ya guardada.
- El cableado no puede declararse listo: existen transiciones reales con `MISSING_CONSUMER`, además de eventos con `MISSING_TEMPLATE`.

## 3. Flujo efectivo

```text
Ventas / App / Portal / Admin
  -> API del backend
  -> transición de dominio persistida
  -> communication.sendEmail o commercial-notifier
  -> DeliveryEngine
  -> EmailDelivery único
  -> BullMQ / worker cuando aplica
  -> provider adapter
  -> Resend
```

Las siguientes equivalencias no son válidas y se mantuvieron separadas durante la auditoría:

```text
plantilla existente != evento conectado
evento emitido != evento consumido
job creado != correo entregado
dry_run != envío real
```

## 4. Matriz de eventos reales y candidatos funcionales

| Dominio | Evento real | Productor / transición persistida | Consumidor | Plantilla | Destinatario / tenant | Idempotencia | Estado |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Auth | Registro público / bienvenida | `auth/routes.js`, usuario registrado antes del envío | `communication.sendEmail` | `welcome` | `user.email`; organización o `user:{id}` | `welcome:{userId}` | CONNECTED |
| Auth | Solicitud de recuperación | `generatePasswordResetToken`, hash y expiración persistidos | `communication.sendEmail` | `password-reset` | email persistido del usuario; organización o usuario | `password-reset:{resetRequestId}` | CONNECTED |
| Auth | Contraseña cambiada | `resetPasswordWithToken`, hash actualizado y sesiones revocadas | Ninguno | `password-changed` existe | usuario persistido | No hay versión persistida del cambio expuesta al consumidor | MISSING_IDEMPOTENCY |
| Usuarios | Correo del perfil cambiado | `users PATCH /me` o `PATCH /:userId`, usuario actualizado | Ninguno | `email-changed` existe | nuevo email persistido y tenant del usuario | No existe versión monotónica del cambio | MISSING_IDEMPOTENCY |
| Usuarios | Alta administrada | `users POST /`, usuario creado directamente; no es invitación | Ninguno | `welcome` sería compatible | usuario creado y organización | `welcome:{userId}` sería estable | MISSING_CONSUMER |
| Usuarios | Alta de conductor por activation key | `registerDriverWithActivationKey`, usuario y consumo de key persistidos | Ninguno | `welcome` sería compatible; `driver-invitation` no lo es | conductor persistido y organización | `welcome:{userId}` sería estable | MISSING_CONSUMER |
| Usuarios | Invitación owner/admin/supervisor/dispatcher | No existe entidad ni aceptación de invitación; el sistema crea usuario directamente | — | `company-invitation`, `admin-invitation` | — | — | NOT_APPLICABLE |
| Usuarios | Invitación de conductor | La activation key se genera sin destinatario; el conductor se registra después | — | `driver-invitation` | No existe recipient al generar la key | — | MISSING_RECIPIENT |
| Comercial | Orden creada | Orden y reserva de checkout completadas | `commercial-notifier` | `order-created` | `ownerAccountEmail`; organización de la orden | `order-created:{orderId}` | CONNECTED |
| Comercial | Pago pendiente | Transición de pago atómica aplicada | `commercial-notifier` | `payment-pending` | cuenta propietaria persistida; organización | `payment-pending:{provider}:{paymentId}:{status}` | CONNECTED |
| Comercial | Pago confirmado | Transición atómica y activación persistida antes de notificar | `commercial-notifier` | `payment-approved` | cuenta propietaria persistida; organización | `payment-approved:{provider}:{paymentId}` | CONNECTED |
| Comercial | Pago fallido | Transición de pago atómica aplicada | `commercial-notifier` | `payment-rejected` | cuenta propietaria persistida; organización | `payment-rejected:{provider}:{paymentId}:{status}` | CONNECTED |
| Comercial | Suscripción activada | Activación, periodo y entitlement guardados antes del consumidor | `commercial-notifier` | `subscription-activated` | cuenta propietaria persistida; organización | `subscription-activated:{subscriptionId}:{periodStart}` | CONNECTED |
| Comercial | Suscripción cancelada | Cancelación persistida por Account antes del consumidor | `commercial-notifier` | `subscription-cancelled` | cuenta propietaria persistida; organización | `subscription-cancelled:{subscriptionId}:{cancelledAt}` | CONNECTED |
| Comercial | Renovación | No existe una transición o scheduler de renovación | — | `plan-renewal` | — | — | NOT_APPLICABLE |
| Comercial | Reembolso confirmado | Operación conciliada y estado financiero persistido | Ninguno | No existe plantilla de reembolso | cuenta propietaria y organización están disponibles | `refund:{refundId}` podría derivarse de entidad real | MISSING_TEMPLATE |
| Comercial | Contracargo actualizado | Webhook reclamado, contracargo y entitlement persistidos | Ninguno | No existe plantilla de contracargo | cuenta propietaria y organización están disponibles | `chargeback:{chargebackId}:{status}` podría derivarse de entidad real | MISSING_TEMPLATE |
| Comercial | Factura disponible | La factura es una vista derivada de una orden pagada; no existe transición de emisión independiente | — | `invoice-available` | — | — | NOT_APPLICABLE |
| Documentos | Documento cargado | `documents POST /`, documento y asset persistidos | Ninguno | No existe plantilla específica | propietario/gestores pueden resolverse | entidad `documentId` disponible | MISSING_TEMPLATE |
| Documentos | Documento aprobado | `documents PATCH /:id/review`, revisión persistida | Ninguno | No existe plantilla específica | propietario persistido y organización | falta versión explícita de revisión | MISSING_TEMPLATE |
| Documentos | Documento rechazado | `documents PATCH /:id/review`, revisión persistida | Ninguno | No existe plantilla específica | propietario persistido y organización | falta versión explícita de revisión | MISSING_TEMPLATE |
| Documentos | Próximo a vencer / vencido | El estado se deriva por fecha al consultar; no hay job ni transición persistida | — | No existe plantilla específica | — | — | NOT_APPLICABLE |
| Cuenta | Cuenta de usuario suspendida | `users PATCH /:userId`, `userStatus` y `suspendedAt` persistidos | Ninguno | `account-suspended` existe | usuario persistido y organización | `suspendedAt` puede versionar la suspensión | MISSING_CONSUMER |
| Cuenta | Cuenta de usuario reactivada | `users PATCH /:userId`, `userStatus=active` persistido | Ninguno | `account-reactivated` existe | usuario persistido y organización | requiere conservar la versión de suspensión anterior | MISSING_CONSUMER |
| Onboarding | Onboarding completado | No existe transición `completed`; solo estados derivados de activación | — | — | — | — | NOT_APPLICABLE |
| Onboarding | Empresa configurada | Cambios parciales de perfil, sin evento de dominio independiente | — | — | — | — | NOT_APPLICABLE |
| Operación | Incidencia crítica / SOS | Incidencia persistida antes de push y Socket.IO | Ninguno para email | `critical-incident` existe | gestores de incidencias del mismo tenant | `critical-incident:{incidentId}:recipient:{userId}` es posible | MISSING_CONSUMER |
| Operación | Cambio de estado de incidencia | Estado persistido; no hay razón funcional definida para email | — | — | — | — | NOT_APPLICABLE |
| Operación | Asignación de unidad o ruta | Asignación persistida, con actualización en tiempo real | — | — | — | — | NOT_APPLICABLE |
| Operación | GPS, tracking, chat y radio | Eventos operativos de alta frecuencia / tiempo real | — | — | — | — | NOT_APPLICABLE |

## 5. Ocho eventos activos, extremo a extremo

| Evento | Productor | Consumer | Plantilla | Recipient source | Tenant source | Entity source | Clave | Cobertura |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| WELCOME | `POST /auth/register` después de `registerUser` | central directo | `welcome` | `user.email` | `user.organizationId` o usuario | `user.id` | `welcome:{userId}` | backend + communication |
| PASSWORD_RESET | `POST /auth/forgot-password` después de guardar hash/expiración | central directo | `password-reset` | resultado persistido del store | organización o usuario | `requestId` de la solicitud | `password-reset:{resetRequestId}` | password recovery + communication |
| ORDER_CREATED | checkout tras orden y reserva `ready` | `commercial-notifier` | `order-created` | `ownerAccountEmail` | `order.organizationId` | `order.id` | `order-created:{orderId}` | communication |
| PAYMENT_CONFIRMED | transición atómica conciliada | `commercial-notifier` | `payment-approved` | `ownerAccountEmail` | `order.organizationId` | pago del proveedor | `payment-approved:{provider}:{paymentId}` | communication + Mercado Pago |
| PAYMENT_FAILED | transición atómica conciliada | `commercial-notifier` | `payment-rejected` | `ownerAccountEmail` | `order.organizationId` | pago + estado | `payment-rejected:{provider}:{paymentId}:{status}` | communication + Mercado Pago |
| PAYMENT_PENDING | transición atómica conciliada | `commercial-notifier` | `payment-pending` | `ownerAccountEmail` | `order.organizationId` | pago + estado | `payment-pending:{provider}:{paymentId}:{status}` | communication + Mercado Pago |
| SUBSCRIPTION_ACTIVATED | periodo y activación persistidos | `commercial-notifier` | `subscription-activated` | `ownerAccountEmail` | `order.organizationId` | suscripción/organización + periodo | `subscription-activated:{subscriptionId}:{periodStart}` | communication + activación comercial |
| SUBSCRIPTION_CANCELLED | cancelación persistida | `commercial-notifier` | `subscription-cancelled` | `ownerAccountEmail` | `order.organizationId` | suscripción + versión cancelación | `subscription-cancelled:{subscriptionId}:{cancelledAt}` | communication + account |

Confirmación manual, polling y webhook de Mercado Pago convergen en `applyReconciledPayment`; la identidad del correo se deriva del pago y no del endpoint. Los estados ya aplicados se rechazan antes del notificador y el historial central vuelve a bloquear una entrega equivalente.

## 6. Contratos de datos activos

| Evento | Requeridos | Opcionales | Fuente del destinatario | Fuente del tenant | Fuente de entidad |
| --- | --- | --- | --- | --- | --- |
| WELCOME | `name` | URLs y organización | usuario persistido | usuario persistido | usuario creado |
| PASSWORD_RESET | `name`, `resetUrl` | organización | resultado del store | usuario persistido | solicitud de reset |
| ORDER_CREATED | `name`, `referenceCode` | plan, monto, checkout | `ownerAccountEmail` | orden persistida | orden |
| PAYMENT_CONFIRMED | `name`, `referenceCode` | plan, monto, método | `ownerAccountEmail` | orden persistida | pago conciliado |
| PAYMENT_FAILED | `name`, `referenceCode` | plan, estado | `ownerAccountEmail` | orden persistida | pago conciliado |
| PAYMENT_PENDING | `name`, `referenceCode` | plan, checkout, estado | `ownerAccountEmail` | orden persistida | pago conciliado |
| SUBSCRIPTION_ACTIVATED | `name`, `planName` | dashboard | `ownerAccountEmail` | orden persistida | activación/periodo |
| SUBSCRIPTION_CANCELLED | `name`, `planName` | dashboard | `ownerAccountEmail` | orden persistida | cancelación |

La validación central rechaza destinatario inválido, plantilla no registrada, `eventType` vacío, `idempotencyKey` vacía, `tenantScope` vacío y eventos comerciales sin organización.

## 7. Correcciones realizadas

### 7.1 Destinatario comercial confiable

Antes, `sendEmailNotification` consumía `order.email`, que procede originalmente del cuerpo del checkout. La orden ya conserva `ownerAccountEmail` desde `req.user.email`. Se añadió `getCommercialEmailRecipient()` y se prioriza la cuenta persistida, manteniendo `order.email` solo como compatibilidad para órdenes históricas.

Impacta de forma homogénea a `ORDER_CREATED`, `PAYMENT_CONFIRMED`, `PAYMENT_FAILED`, `PAYMENT_PENDING`, `SUBSCRIPTION_ACTIVATED` y `SUBSCRIPTION_CANCELLED`. No cambia el destinatario de WhatsApp ni la operación comercial.

### 7.2 Persistencia previa de activación

Antes, `applyReconciledPayment` construía `activated` en memoria y producía dos correos antes de completar la persistencia de efectos. Una caída en ese intervalo podía recalcular otro `periodStart` en un reintento y alterar la identidad de `SUBSCRIPTION_ACTIVATED`.

Ahora se calcula `activationUpdate`, se guarda mediante `updateCommercialOrder`, y solo entonces se generan los correos. `completePaymentEffects` conserva la finalización del lease y las referencias de entrega. El fallo de comunicación continúa sin revertir pago, activación o suscripción.

## 8. Inventarios

### EVENTOS CONECTADOS

1. WELCOME
2. PASSWORD_RESET
3. ORDER_CREATED
4. PAYMENT_CONFIRMED
5. PAYMENT_FAILED
6. PAYMENT_PENDING
7. SUBSCRIPTION_ACTIVATED
8. SUBSCRIPTION_CANCELLED

### EVENTOS REALES PENDIENTES

| Evento | Bloqueo |
| --- | --- |
| Contraseña cambiada | MISSING_IDEMPOTENCY |
| Correo cambiado | MISSING_IDEMPOTENCY |
| Alta administrada / bienvenida | MISSING_CONSUMER |
| Alta de conductor / bienvenida | MISSING_CONSUMER |
| Invitación de conductor al generar key | MISSING_RECIPIENT |
| Cuenta suspendida | MISSING_CONSUMER |
| Cuenta reactivada | MISSING_CONSUMER |
| Incidencia crítica | MISSING_CONSUMER |
| Reembolso | MISSING_TEMPLATE |
| Contracargo | MISSING_TEMPLATE |
| Documento cargado | MISSING_TEMPLATE |
| Documento aprobado | MISSING_TEMPLATE |
| Documento rechazado | MISSING_TEMPLATE |

### PLANTILLAS SIN CONSUMIDOR

1. `account-activation`
2. `password-changed`
3. `email-changed`
4. `company-invitation`
5. `admin-invitation`
6. `driver-invitation`
7. `invoice-available`
8. `plan-renewal`
9. `plan-expiring`
10. `trial-expiring`
11. `account-suspended`
12. `account-reactivated`
13. `weekly-report`
14. `monthly-report`
15. `critical-incident`
16. `new-device-connected`
17. `suspicious-login`
18. `identity-verification`

Las plantillas huérfanas no se eliminaron: esta fase no debía rediseñar plantillas y varias representan trabajo funcional futuro. `backend/modules/communication/templates/` tampoco se eliminó silenciosamente.

## 9. Consumidores y proveedores

Consumidores funcionales de email encontrados:

- `backend/src/modules/auth/routes.js`: WELCOME y PASSWORD_RESET.
- `backend/src/services/commercial-notifier.js`: los seis eventos comerciales.

No hay consumidores de email en `ventas`, `mobile` ni `admin-global`. Las implementaciones de Resend, SMTP, SendGrid, Mailgun y Postmark están dentro de `communication-service/src/providers/`, es decir, en adaptadores autorizados. La llamada HTTP a Resend permanece únicamente en `communication-service/src/providers/resend.provider.js`.

**Consumidores duplicados eliminados:** 0. No se encontró un doble funcional que debiera borrarse.

## 10. Pruebas y evidencia

La prueba focalizada de comunicación cubre:

- selección de las seis plantillas comerciales;
- `eventType`, organización, tenant y clave de los seis eventos;
- convergencia manual/webhook para el pago aprobado;
- prioridad del email persistido sobre el email libre del checkout;
- fallback compatible para órdenes históricas;
- persistencia de activación antes del consumidor;
- dos solicitudes concurrentes por cada evento comercial producen un envío potencial;
- la misma identidad en tenants distintos no colisiona;
- dry-run no contacta al provider;
- las 26 plantillas siguen renderizando.

Resultados finales:

| Comando | Archivos / grupos | Resultado |
| --- | ---: | --- |
| `communication-service/npm test` | 1 archivo, 24 grupos reportados | Aprobado |
| `backend/npm test` | 28 archivos encadenados | Aprobado |
| `backend/npm run test:password-recovery` | 1 archivo focalizado | Aprobado |
| Prueba focalizada de eventos comerciales | incluida en `backend/test/communication.test.js` | Aprobado |

Total ejecutado: **30 archivos de prueba**, **0 fallos**, **0 envíos reales**. La suite usa providers simulados; las líneas de log con estado `sent` corresponden a dobles de prueba, no a Resend.

## 11. Riesgos pendientes

1. Valkey Free conserva `Persistence Mode: Off`; `productionQueueDurability=false` continúa siendo una limitación operativa conocida, no introducida por esta fase.
2. La confirmación visual de recepción de MP-EMAIL-02B no forma parte de esta auditoría y no se repitió el envío real.
3. Password y email change necesitan una versión persistida de transición antes de cablear correo sin claves ambiguas.
4. Las invitaciones actuales no son entidades de invitación: crear usuarios directamente o generar una key sin recipient no satisface el contrato de las plantillas existentes.
5. Refund, chargeback y documentos requieren trabajo de plantillas/contrato separado; no se inventaron plantillas en esta fase.
6. La incidencia crítica tiene productor, destinatarios y clave posibles, pero necesita una decisión explícita de política para evitar enviar a todos los roles gestores sin una preferencia de notificación.

## 12. Cierre

| Métrica | Resultado |
| --- | --- |
| Eventos conectados | 8 |
| Plantillas registradas | 26 |
| Plantillas consumidas | 8 |
| Plantillas sin consumidor | 18 |
| Consumidores duplicados | 0 |
| Correcciones técnicas | 2 |
| Archivos de prueba ejecutados | 30 |
| Pruebas fallidas | 0 |
| Envíos reales | 0 |
| EMAIL_DRY_RUN final | `true` por configuración vigente; no se alteró runtime |

El criterio `MP_EMAIL_03A_EVENT_WIRING_READY` no se cumple porque existen eventos reales con `MISSING_CONSUMER`, `MISSING_RECIPIENT` y `MISSING_IDEMPOTENCY`.

```text
MP_EMAIL_03A_NOT_READY
```
