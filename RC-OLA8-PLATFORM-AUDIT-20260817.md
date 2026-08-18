# OLA 8 — Plataforma

Base auditada: `origin/main@3a222f666b1b0d8c1009bfd4d8284a740e0ffad1`.

## Resultado por dominio

| Dominio | Autoridad | Hallazgo demostrado | Estado |
| --- | --- | --- | --- |
| Redis/cache | Redis sólo cuando está habilitado; memoria sólo en despliegue explícitamente single-instance | El rate limiter degradaba silenciosamente a un contador por proceso cuando Redis estaba configurado pero caído. Al escalar, el límite efectivo se multiplicaba por réplica. | Corregido: fail-closed 503, lifecycle de reconnect reflejado en readiness. |
| Emails | `communication-service`, historial Mongo e idempotency key de evento de dominio | No se encontró doble writer. Activation, recovery, billing y seguridad persisten primero; el fallo del proveedor queda aislado de la operación principal. | Validado. Resend, retries, dry-run y URLs cubiertos. |
| Notificaciones | colección `notifications`; push es proyección best-effort | El adaptador embedded omitía `userId`, por lo que el guard descartaba todas las suscripciones. Un token también podía sobrevivir asociado a la identidad anterior. | Corregido: proyección consistente y rebinding de instalación entre usuarios/tenants. |
| Media/documentos/tokens | metadata en `Document`; asset en GridFS/Cloudinary/local | La descarga autenticaba el request, pero Cloudinary podía devolver una URL firmada reutilizable sin expiración explícita. | Corregido: URL privada con expiración de 5 minutos. MIME, 15 MiB, tenant y limpieza compensatoria validados. |
| Jobs/timers/workers | BullMQ cuando queues+Redis están activos; memoria sólo single-instance | BullMQ distribuye consumo e idempotencia de email. El freshness sweeper puede ejecutarse por réplica, pero sólo emite proyecciones derivadas y no escribe negocio; conserva guard anti-solapamiento local. | Aceptado como tráfico idempotente; no se introdujo lock que pudiera perder organizaciones observadas por otra réplica. |
| Health/readiness | `runtime-readiness` consolidado por #210 | Redis habilitado/caído bloquea readiness; email/storage/RTC opcionales degradan sin sacar el core del balanceador. | Sin cambios semánticos. |
| Observabilidad | logger estructurado, métricas y endpoints Platform | Health público no expone configuración; métricas requieren autenticación; errores mantienen trace ID. | Validado. |
| Env/config legacy | `backend/src/config/env.js` y config de `communication-service` | Existen aliases deliberados y variables exclusivas del paquete standalone. No se encontraron secretos impresos por readiness. | Clasificado abajo. |

## Contratos cerrados

- Ningún cache contiene autoridad comercial, documental, de sesión o de tracking.
- Redis habilitado y no disponible nunca crea una autoridad local paralela para rate limiting, RTC o Radio.
- Sin Redis explícitamente habilitado, memoria es una degradación declarada para una sola instancia.
- Los fallos de email/push no revierten operaciones principales ya persistidas.
- Una instalación push pertenece a una sola identidad actual; un login posterior retira el token del usuario anterior.
- La colección persistida decide leído/no leído y aplica tenant scope; realtime y push son proyecciones.
- Los downloads documentales requieren autorización backend y el salto a Cloudinary expira en cinco minutos.
- La limpieza fallida de assets queda marcada `cleanup_pending` y DELETE idempotente puede reintentarla.

## Environment sin valores

### REQUERIDA

`JWT_SECRET`; `MONGO_URI` cuando `REQUIRE_MONGO=true`; credenciales Platform cuando su seguridad está habilitada; credenciales del proveedor seleccionado cuando la capacidad correspondiente está habilitada.

### ACTIVA

`HOST`, `PORT`, `LOG_LEVEL`, `TRUST_PROXY`, `RENDER`, `MONGO_DB_NAME`, `MONGO_SERVER_SELECTION_TIMEOUT_MS`, `REQUIRE_MONGO`, `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL_DAYS`, `CHAT_ENCRYPTION_SECRET`, `CLIENT_ORIGIN`, `APP_URL`, `PASSWORD_RESET_PUBLIC_URL`, `PORTAL_PUBLIC_URL`, `APP_PUBLIC_URL`, `PUBLIC_WEBHOOK_BASE_URL`, `DOCUMENT_STORAGE_DRIVER`, `PAYMENT_PROVIDER`, `EMAIL_ENABLED`, `EMAIL_DRY_RUN`, `EMAIL_FROM`, `EMAIL_FROM_NAME`, `EMAIL_REPLY_TO`, `ENABLE_REDIS`, `REDIS_URL`, `ENABLE_QUEUES`, `REDIS_PERSISTENCE_ENABLED`, `REDIS_MAXMEMORY_POLICY`, todas las `PLATFORM_*`, `TURN_*`, `FCM_*`, `AUDIO_TRANSCRIPTION_*`, `SENTRY_*`, proveedores cartográficos, rutas de autoaprendizaje y corredor.

### OPCIONAL

Credenciales Cloudinary, Resend, Twilio, FCM, TURN, Sentry, transcripción y Mercado Pago cuando su driver/feature no está habilitado; metadata comercial/bancaria; proveedores alternativos de mapas.

### DUPLICADA (alias compatible; autoridad canónica a la izquierda)

- `MONGO_URI` ← `MONGODB_URI`.
- `ACCESS_TOKEN_TTL` ← `JWT_EXPIRES_IN`.
- `MAPBOX_ACCESS_TOKEN` ← `MANECOMB_MAPBOX_ACCESS_TOKEN`.
- `EMAIL_REPLY_TO` alimenta `RESEND_REPLY_TO`; `EMAIL_FROM` prevalece sobre `RESEND_FROM_EMAIL`.
- `APP_URL` puede derivarse de `CLIENT_URL`/`CLIENT_ORIGIN`; `PORTAL_PUBLIC_URL` y `APP_PUBLIC_URL` conservan destinos distintos.
- `MERCADO_PAGO_*` es canónico; `MERCADOPAGO_*` y `MP_*` son aliases de despliegues previos.

### LEGACY

`JWT_EXPIRES_IN`, `MONGODB_URI`, `MANECOMB_MAPBOX_ACCESS_TOKEN`, `MERCADOPAGO_*`, `MP_*`, `CLIENT_URL`, y aliases genéricos `SUCCESS_URL`, `FAILURE_URL`, `PENDING_URL`, `WEBHOOK_URL`, `WEBHOOK_SECRET`. Se conservan sólo por compatibilidad y no desplazan una variable canónica presente.

### SIN CONSUMIDOR EN EL BACKEND INTEGRADO

`SMTP_*`, `SES_*`, `MAILGUN_*`, `POSTMARK_*`, `SENDGRID_*`, `BRAND_NAME`, `LEGAL_NAME`, `SUPPORT_EMAIL`, `DOCS_URL` pertenecen al modo standalone/configurable de `communication-service`; no deben configurarse como si fueran autoridad del backend, que arranca comunicación con Resend y nombres canónicos propios.

## Validación focalizada

- Redis/cache y proxy/rate limit.
- Eventos email, recovery y neutralidad de respuestas.
- Persistencia/realtime/push y aislamiento tenant.
- Documentos: permisos, MIME, tamaño, ownership, versiones, cleanup, migración y URL temporal.
- Freshness sweeper.
- Health/readiness y observabilidad.
- Contratos environment.

No se modifica Comercial después del cierre OLA 7. `PHYSICAL_GATE` permanece `ACCEPTED_PENDING`.
