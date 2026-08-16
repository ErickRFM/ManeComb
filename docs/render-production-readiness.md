# ManeComb — Render production readiness

Este documento separa **configuracion versionada** de **secretos/configuracion externa**. `render.yaml` describe el servicio `manecomb`, pero no contiene credenciales ni crea automaticamente recursos con costo.

## Backend web service

- Servicio existente esperado: `manecomb`.
- Runtime: Docker con `backend/Dockerfile` y contexto del monorepo.
- Auto deploy: solamente cuando los checks de GitHub pasan.
- Health check: `/api/health`.
- `NODE_ENV=production`, `REQUIRE_MONGO=true` y `TRUST_PROXY=true` son invariantes de produccion.
- El backend no debe caer al store embedded si Mongo falla.

## MongoDB

Configurar `MONGO_URI` como secreto en Render. `MONGO_DB_NAME=combisapp` queda versionado.

Antes de desplegar:

1. Confirmar conectividad desde Render hacia Atlas.
2. Confirmar que `/api/health/ready` reporta `database.connected=true`.
3. No habilitar un fallback embedded en produccion.

## Redis / Render Key Value

ManeComb usa Redis-compatible Key Value para coordinacion distribuida de Socket.IO, floor-control de Radio, RTC y colas de comunicaciones.

No se provisiona automaticamente desde `render.yaml` para evitar crear un recurso de pago sin una decision explicita. En produccion:

1. Crear o reutilizar una instancia **Render Key Value persistente** en la misma region del backend.
2. Mantener acceso externo deshabilitado salvo necesidad operativa concreta.
3. Usar su URL interna en `REDIS_URL`.
4. Una vez comprobada la persistencia configurar conjuntamente:
   - `ENABLE_REDIS=true`
   - `ENABLE_QUEUES=true`
   - `REDIS_PERSISTENCE_ENABLED=true`
   - `REDIS_MAXMEMORY_POLICY` con el valor real de la instancia (para colas durables se recomienda evitar una politica que pueda expulsar mensajes pendientes).
5. Verificar `/api/health/ready` y los diagnosticos de Communication antes de considerar el despliegue cerrado.

## TURN / RTC

STUN solamente no es suficiente como garantia de conectividad entre todas las redes moviles/NAT. Para produccion configurar uno de estos modos:

### Preferido: credenciales TURN dinamicas

- `TURN_URLS`
- `TURN_SECRET`
- `TURN_REALM`
- `TURN_CREDENTIAL_TTL_SECONDS=3600`

### Compatibilidad: credenciales estaticas

- `TURN_URLS`
- `TURN_USERNAME`
- `TURN_CREDENTIAL`

Validar `/api/rtc/config` con una cuenta operativa y comprobar que `turnEnabled=true` antes de certificar llamadas fuera de Wi-Fi controlado.

## Admin Global / Cloudflare Access

Los secretos de Platform son independientes del JWT normal:

- `PLATFORM_JWT_SECRET` (minimo 32 caracteres)
- `PLATFORM_MFA_ENCRYPTION_KEY` (base64 canonico de 32 bytes)

Cloudflare Access queda fail-closed cuando se habilite. Configurar en conjunto:

- `PLATFORM_ACCESS_ENFORCEMENT_ENABLED=true`
- `PLATFORM_ACCESS_ISSUER`
- `PLATFORM_ACCESS_AUDIENCE`
- `PLATFORM_ACCESS_JWKS_URL` (puede derivarse del issuer, pero se recomienda verificarlo explicitamente)

No activar enforcement antes de tener issuer/audience validos: el backend aborta el arranque ante una configuracion de Platform incompleta.

## Correo

Para correo real:

- `RESEND_API_KEY`
- `EMAIL_FROM`
- `EMAIL_REPLY_TO`
- `EMAIL_ENABLED=true`
- `EMAIL_DRY_RUN=false`

Si `ENABLE_QUEUES=true`, la cola debe ser durable; no declarar persistencia si la instancia Key Value no la tiene realmente.

## Firebase Cloud Messaging

Mantener en Render, nunca en el cliente:

- `FCM_PROJECT_ID`
- `FCM_CLIENT_EMAIL`
- `FCM_PRIVATE_KEY`

El APK contiene unicamente configuracion publica de Firebase; las credenciales del service account permanecen en backend.

## Pagos

El modo operativo actual versionado es `PAYMENT_PROVIDER=manual`.

Para SPEI configurar:

- `BANK_TRANSFER_ACCOUNT_NAME`
- `BANK_TRANSFER_CLABE`
- `BANK_TRANSFER_BANK_NAME`

Mercado Pago permanece configurable pero no debe activarse parcialmente. Al reactivarlo configurar en conjunto ambiente, token, public key, webhook secret y URLs, y ejecutar las pruebas de conciliacion/idempotencia antes de cambiar el provider.

## Documentos

`DOCUMENT_STORAGE_DRIVER=mongo` usa GridFS y evita depender del filesystem efimero del contenedor.

La migracion de documentos historicos `storageType=local` **no corre durante startup**. Flujo operativo:

```bash
npm --prefix backend run migrate:legacy-documents
npm --prefix backend run migrate:legacy-documents -- --apply
```

El primer comando es dry-run y debe revisarse antes del segundo.

## Releases de Android

`/api/app/info` ya no contiene un fallback historico. La version publica debe publicarse desde Admin Global/AppConfig y mantenerse coherente con el artefacto Android certificado. Si no existe una version publicada, el endpoint responde `503 app_release_not_configured` en vez de inventar una version.

## Checklist posterior al deploy

1. `/api/health` responde 200.
2. `/api/health/ready` muestra Mongo y storage correctos; revisar explicitamente Redis/queues/RTC/email.
3. Login + refresh funcionan y no reusan tokens rotados.
4. Portal carga inventario desde `listVehiclesForOrganization`, no desde tracking.
5. `/api/operational-units` es la autoridad de estado/GPS/ruta/ETA.
6. GPS foreground/background llega y degrada `live -> delayed -> stale -> lost` correctamente.
7. Socket recupera despues de bloquear/desbloquear dispositivo.
8. Radio obtiene floor-control distribuido con Redis configurado.
9. Llamada prueba TURN fuera de la misma Wi-Fi.
10. Baja/eliminacion de conductor y unidad desaparece de proyecciones realtime sin borrar historia.
11. Cambio de contraseña revalida la actual y revoca otras sesiones.
12. Evidencia SPEI, incidencias, documentos y notificaciones sobreviven reinicio del backend.
13. Admin Global permanece detras de Cloudflare Access + MFA cuando enforcement este activo.
