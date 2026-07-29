# MP-EMAIL-01 — Cierre estructural del sistema de correos de ManeComb

## Estado inicial

El proyecto ya disponía de un servicio central de comunicaciones, proveedor Resend, renderer, plantillas, cola, historial y métricas. La auditoría previa confirmó una llamada directa a Resend desde recuperación de contraseña, ausencia de idempotencia funcional, registros separados por estado, doble contabilidad potencial, fallback silencioso a memoria, ausencia de dry-run y exposición de datos sensibles.

## Alcance

Esta fase modifica únicamente la infraestructura de entrega y los ocho eventos ya conectados:

- `WELCOME`
- `PASSWORD_RESET`
- `ORDER_CREATED`
- `PAYMENT_CONFIRMED`
- `PAYMENT_FAILED`
- `PAYMENT_PENDING`
- `SUBSCRIPTION_ACTIVATED`
- `SUBSCRIPTION_CANCELLED`

No se conectaron documentos, reembolsos, contracargos, invitaciones, onboarding ni alertas nuevas.

## Hallazgos atendidos

- Eliminación de la llamada directa a `api.resend.com` desde autenticación.
- Contrato central con destinatario, evento, scope e identidad idempotente.
- Separación de `deliveryId` e `idempotencyKey`.
- Reclamación atómica con `findOneAndUpdate` y `upsert`.
- Índice único compuesto por scope, evento y clave idempotente.
- Inyección explícita de la conexión Mongoose del backend; el paquete ya no intenta deducir durabilidad desde una instancia aislada.
- Bloqueo preventivo del provider cuando Mongo o el índice idempotente no están disponibles.
- Un solo registro por ciclo de entrega.
- `jobId` estable y sin datos sensibles.
- Propiedad única del historial y métricas en el delivery engine.
- Reintentos directos limitados para fallos temporales y reintentos BullMQ.
- Estados explícitos `created`, `queued`, `processing`, `sent`, `failed`, `skipped` y `dry_run`.
- Configuración global enabled/dry-run.
- Readiness con `disabled`, `dry_run`, `ready`, `degraded` y `error`.
- Dirección enmascarada, hash de destinatario y errores sanitizados.
- HTML dinámico escapado y cuerpo de texto plano.
- Respuesta genérica de recuperación aun cuando el transporte falla.
- Rate limit específico de recuperación: cinco solicitudes por quince minutos.

## Decisiones de arquitectura

Se conservó `communication-service` como única fuente de verdad. El backend continúa usando `backend/modules/communication` como adaptador. Solo los providers pueden comunicarse con proveedores externos.

El worker no crea historial ni incrementa métricas finales. Recibe un trabajo y delega al delivery engine. El provider solo normaliza la respuesta externa.

La cola en memoria sigue disponible para desarrollo y pruebas, pero reporta `degraded` y `durable: false`.

`provider_attempts` cuenta intentos técnicos. `deliveries_failed` se incrementa una sola vez cuando una entrega termina definitivamente; un timeout posteriormente recuperado no se contabiliza como entrega fallida.

## Modelo de entrega

Cada registro nuevo contiene:

- `deliveryId`
- `tenantScope`
- `organizationId`
- `userId`
- `eventType`
- `idempotencyKey`
- `recipientMasked`
- `recipientHash`
- `template`
- `provider`
- `status`
- `providerMessageId`
- `attempts`
- `errorCategory`
- `errorCode`
- `errorMessage`
- timestamps del ciclo

No se guarda HTML, token, URL de recuperación, respuesta cruda del proveedor, API key ni objeto completo de error.

## Idempotencia

La identidad funcional es:

```text
tenantScope + eventType + idempotencyKey
```

La reclamación utiliza un upsert atómico. Una colisión de índice devuelve la entrega existente. Dos solicitudes concurrentes en el mismo scope producen una sola llamada al provider.

Cuando `requireDurableHistory` está activo, el engine no permite contactar al proveedor si:

- no existe conexión Mongo inyectada;
- la conexión no está activa;
- el índice `email_delivery_idempotency` no existe o no pudo verificarse.

La memoria solo puede usarse cuando la configuración declara explícitamente que la durabilidad no es requerida, como en pruebas locales. Readiness permanece degradado.

Claves implementadas:

| Evento | Clave |
| --- | --- |
| WELCOME | `welcome:{userId}` |
| PASSWORD_RESET | `password-reset:{resetRequestId}` |
| ORDER_CREATED | `order-created:{orderId}` |
| PAYMENT_CONFIRMED | `payment-approved:{provider}:{paymentId}` |
| PAYMENT_FAILED | `payment-rejected:{provider}:{paymentId}:{statusVersion}` |
| PAYMENT_PENDING | `payment-pending:{provider}:{paymentId}:{statusVersion}` |
| SUBSCRIPTION_ACTIVATED | `subscription-activated:{subscriptionId}:{periodStart}` |
| SUBSCRIPTION_CANCELLED | `subscription-cancelled:{subscriptionId}:{cancellationVersion}` |

La confirmación manual y el webhook derivan la identidad del mismo objeto comercial, no del endpoint.

## Estados

Con cola:

```text
created → queued → processing → sent|failed
```

Directo:

```text
created → processing → sent|failed
```

Modos operativos:

```text
created → dry_run
created → skipped
```

## Configuración

Variables añadidas:

```env
EMAIL_ENABLED=true
EMAIL_DRY_RUN=false
EMAIL_FROM=
EMAIL_FROM_NAME=ManeComb
EMAIL_REPLY_TO=
PORTAL_PUBLIC_URL=
APP_PUBLIC_URL=
```

Se conserva compatibilidad con `RESEND_FROM_EMAIL` y `RESEND_REPLY_TO`.

## Health/readiness

Readiness considera:

- interruptor global;
- dry-run;
- provider realmente construido;
- modo de cola;
- durabilidad del historial;
- exigencia de Redis.
- existencia física del índice idempotente;
- último error operativo sanitizado.

No se envía ningún correo desde readiness. `ResendProvider.verifyConnection()` solo comprueba que exista configuración; no ejecuta `fetch`.

La conexión Mongoose utilizada es la misma que conecta el backend. Esto corrige el riesgo de que `communication-service` resolviera otra instancia del paquete y permaneciera en memoria a pesar de existir Mongo en la aplicación.

## Sanitización

Se añadieron:

- `maskEmail()`
- `hashRecipient()`
- `sanitizeProviderError()`
- `safeDeliveryLog()`

Los logs muestran direcciones como `r***@e***.com`. Los query params sensibles, bearer tokens y credenciales reconocibles son reemplazados o truncados.

## Migración

`backend/scripts/migrate-email-deliveries.js`:

- opera en dry-run por defecto;
- exige `--apply` para crear el índice;
- detecta duplicados de la nueva identidad;
- se detiene si encuentra duplicados;
- no borra ni modifica entregas históricas;
- crea un índice parcial, por lo que documentos legacy sin los nuevos campos siguen siendo legibles;
- no se ejecuta al iniciar el backend.

No se ejecutó contra una base remota durante esta tarea.

Se intentó ejecutar el dry-run dos veces, sin `--apply`. La resolución DNS de MongoDB Atlas falló primero con `ETIMEOUT` y después con `ECONNREFUSED`. No se alcanzó la colección y no hubo escrituras. Por ello no fue posible confirmar duplicados históricos ni aplicar el índice.

## Pruebas

### Communication service

`npm test` valida:

- 26 plantillas;
- contrato estricto;
- destinatario y plantilla;
- idempotencia secuencial y concurrente;
- aislamiento de tenant;
- ciclo único en cola;
- `jobId` estable;
- dry-run y disabled;
- reintento temporal;
- ausencia de reintento permanente;
- cola/historial en memoria degradados;
- enmascarado y sanitización;
- ausencia de token en logs e historial;
- HTML escapado;
- HTML y texto plano;
- health sin envío.
- separación entre intentos técnicos y resultado funcional;
- rechazo previo al provider cuando se exige historial durable y solo existe memoria;
- readiness `disabled`, `dry_run`, `ready`, `degraded` y `error`.

Resultado: 23 grupos de pruebas correctos.

### Backend

`npm test` ejecutó la suite completa del backend, incluidos arquitectura, tenant isolation, Mercado Pago, webhooks, comunicación y smoke tests.

Resultado: 28 archivos de pruebas correctos.

`npm run test:password-recovery` verificó:

- respuesta idéntica para usuario existente e inexistente;
- fallo de correo sin cambio a respuesta pública;
- recuperación y revocación posterior.

Resultado: 1 suite de integración correcta.

Total ejecutado en el cierre: 52 suites o grupos de prueba, además de las 26 plantillas recorridas dentro del registro.

## Archivos modificados

### Backend

- `backend/.env.example`
- `backend/modules/communication/index.js`
- `backend/src/config/env.js`
- `backend/src/data/models.js`
- `backend/src/data/mongo-store.js`
- `backend/src/data/store.js`
- `backend/src/modules/auth/routes.js`
- `backend/src/server.js`
- `backend/src/services/commercial-notifier.js`
- `backend/test/communication.test.js`
- `backend/test/password-recovery.test.js`

### Communication service

- `communication-service/src/config/index.js`
- `communication-service/src/core/validators.js`
- `communication-service/src/delivery/engine.js`
- `communication-service/src/delivery/pipeline.js`
- `communication-service/src/health/index.js`
- `communication-service/src/history/index.js`
- `communication-service/src/index.js`
- `communication-service/src/logger/index.js`
- `communication-service/src/providers/resend.provider.js`
- `communication-service/src/queue/index.js`
- `communication-service/src/renderer/index.js`
- `communication-service/src/templates/builders.js`
- `communication-service/src/workers/index.js`
- `communication-service/tests/communication.test.js`

## Archivos nuevos

- `communication-service/src/security/index.js`
- `backend/scripts/migrate-email-deliveries.js`
- `MP-EMAIL-01.md`

## Archivos eliminados

Ninguno.

Las copias en `backend/modules/communication/templates/` fueron confirmadas sin consumidores estáticos, dinámicos, de pruebas o scripts. Se conservaron para que su eliminación pueda hacerse como limpieza separada y explícita.

## Riesgos pendientes

1. El índice no fue aplicado ni verificado contra la base productiva.
2. El dry-run no pudo consultar MongoDB Atlas por fallo DNS del entorno.
3. El entorno local no tiene `REDIS_URL`; por tanto no puede validar BullMQ durable.
4. La garantía durable depende de MongoDB y Redis.
5. Un despliegue sin Mongo, sin el índice o con cola en memoria reportará correctamente `degraded` o `error`; no contactará al provider cuando se exija durabilidad.
6. Los campos `lastEmail*` permanecen legibles por compatibilidad histórica, pero los flujos nuevos solo escriben `lastNotificationDeliveryId`, `lastNotificationStatus` y `lastNotificationAt`.
7. La eliminación de plantillas backend huérfanas queda fuera de este bloque.
8. La comprobación operativa con credenciales reales de Resend debe hacerse de forma manual y protegida; readiness no la realiza.

## Comparación

| Área | Antes | Después | Evidencia |
| --- | --- | --- | --- |
| Vía de envío | Ruta auth y provider podían llamar Resend | Solo provider autorizado | Búsqueda final de `api.resend.com` |
| Contrato | `to`, template y data | recipient, eventType, scope e idempotencyKey | Validadores y callers |
| Idempotencia | No existía | Claim atómico e índice compuesto | Prueba concurrente |
| Historial | Un registro por etapa | Un registro actualizado | Prueba queued → sent |
| Métricas | Podían duplicarse por intento | Delivery engine registra un resultado funcional y N intentos técnicos | Prueba de retry recuperado y fallo final |
| Dry-run | No existía | Estado `dry_run`, cero llamadas | Prueba con mock |
| Disabled | Fallo o ausencia implícita | Estado `skipped` | Prueba con mock |
| Readiness | Posible falso positivo y Mongoose aislado | Misma conexión backend, índice físico y estados operativos | Pruebas de health e inicialización |
| Logs | Destinatario/error completos | Dirección enmascarada y error sanitizado | Prueba de captura |
| Plantillas | Solo HTML | HTML y texto | Prueba del renderer |
| Recuperación | Fallback directo y posible 500 | Servicio central y respuesta genérica | Integración backend |
| Tenant | Sin identidad en entrega | Scope incluido en unicidad | Prueba A/B |

## Resultado final

La implementación estructural y sus pruebas locales están completas. El código no declara durabilidad cuando utiliza memoria y bloquea el provider si la configuración requiere idempotencia durable.

El cierre operativo requiere conectividad con MongoDB Atlas, ejecutar satisfactoriamente el dry-run, aplicar/verificar el índice y disponer de Redis para BullMQ durable. Hasta contar con esa evidencia externa, el veredicto es:

```text
MP_EMAIL_01_NOT_READY
```
