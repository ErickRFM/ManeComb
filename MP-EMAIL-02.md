# MP-EMAIL-02 — Contrato de entrega y preparación de activación

**Fecha:** 30 de julio de 2026
**Rama:** `main`
**Commit base local:** `60d44cd8a25ccb1e4c33ef19849f8b123972d9ed`
**Commit desplegado al iniciar:** `a21942c8769673eea509ab586aea1b7b9277eb3b`
**Estado:** Cerrado técnicamente — pendiente de confirmación externa de Render
**Veredicto previo al despliegue:** `MP_EMAIL_02_NOT_READY`

El hash del commit de esta fase y su resultado en Render se registran como
evidencia externa después del commit. No se intenta introducir el hash del
propio commit dentro de este documento.

## Objetivo

Normalizar el resultado público de las entregas, corregir la interpretación de
recuperación de contraseña, separar funcionamiento y durabilidad de la cola,
exponer readiness sanitizado y dejar la implementación validada en dry-run.

Quedan fuera:

- activación de envíos reales;
- nuevos eventos o plantillas;
- rediseño visual de plantillas;
- cambios de proveedor;
- actualización de Redis o Valkey;
- cambios de lógica comercial;
- actualización de dependencias.

## Estado inicial

- MongoDB conectado a `combisapp`.
- Índice `email_delivery_idempotency` único y aplicado.
- Duplicados históricos: 0.
- BullMQ conectado mediante Valkey.
- `ENABLE_QUEUES=true`.
- Política `noeviction` verificada operativamente.
- Persistencia de Valkey Free desactivada.
- `EMAIL_ENABLED=true`.
- `EMAIL_DRY_RUN=true`.
- Resend y el dominio de ManeComb configurados.
- Render ejecutaba el commit `a21942c`.

## Contrato central de resultados

El contrato devuelve:

```text
status
accepted
delivered
simulated
skipped
duplicate
failed
final
```

| Estado | accepted | delivered | simulated | skipped | failed |
| --- | ---: | ---: | ---: | ---: | ---: |
| `sent` | true | true | false | false | false |
| `queued` | true | false | false | false | false |
| `dry_run` | true | false | true | false | false |
| `skipped` | true | false | false | true | false |
| duplicado de `sent` | true | true | false | false | false |
| duplicado de `queued` | true | false | false | false | false |
| duplicado de `dry_run` | true | false | true | false | false |
| `failed` | false | false | false | false | true |

`success` se conserva únicamente como compatibilidad y refleja aceptación. Los
consumidores deben utilizar `getDeliveryStatus`, `isDeliveryAccepted`,
`isDeliveryFailed` e `isDeliveryFinal`.

## Recuperación de contraseña

La ruta conserva una respuesta genérica para usuarios existentes e
inexistentes. El transporte no modifica el resultado público de la operación de
seguridad.

Solo `failed` o una excepción real producen:

- advertencia sanitizada;
- evento `email_delivery_failed`.

`dry_run`, `queued`, `skipped` y los duplicados aceptados no se registran como
fallos. No se persisten en `EmailDelivery`:

- token de recuperación;
- URL completa de recuperación;
- HTML;
- destinatario completo;
- error crudo del proveedor.

La búsqueda final confirmó que la llamada a la API de Resend existe únicamente
en `communication-service/src/providers/resend.provider.js`.

## Observabilidad

El arranque genera un evento sanitizado:

```text
module=Communication
action=RuntimeDiagnostics
```

Su metadata informa exclusivamente:

- correo habilitado y dry-run;
- proveedor configurado;
- cola habilitada y modo;
- Redis configurado como booleano;
- worker iniciado;
- conexión y funcionamiento de cola;
- durabilidad a través de reinicios;
- política declarada de memoria;
- modo de historial;
- índice idempotente verificado;
- durabilidad productiva.

No expone URLs, credenciales, destinatarios, tokens ni API keys.

## Readiness

`/api/health` mantiene el contrato público compacto.

`/api/health/ready` agrega el componente sanitizado `communication`, que
distingue:

```text
functional
productionDurability
providerConfigured
history.mode
history.idempotencyIndex
queue.enabled
queue.mode
queue.connected
queue.functional
queue.workerStarted
queue.maxmemoryPolicy
queue.persistence
queue.durableAcrossRestart
```

BullMQ conectado no implica persistencia. Con Valkey Free y persistencia
desactivada, la cola puede estar conectada y funcional mientras
`productionDurability=false`; el estado global debe permanecer degradado.

Las variables declarativas para reflejar los hechos ya verificados son:

```env
REDIS_PERSISTENCE_ENABLED=false
REDIS_MAXMEMORY_POLICY=noeviction
```

Estas variables no configuran ni modifican Valkey.

## Pruebas

| Suite | Resultado |
| --- | --- |
| `communication-service: npm test` | Aprobada |
| `backend: npm test` | Aprobada; 28 archivos encadenados |
| `backend: npm run test:password-recovery` | Aprobada |
| Prueba focalizada de observabilidad | Aprobada |
| `git diff --check` | Sin errores |

La cobertura relevante incluye:

- contrato completo y compatibilidad;
- duplicados de `sent`, `queued` y `dry_run`;
- concurrencia con una sola llamada al proveedor;
- aislamiento de tenant;
- dry-run sin proveedor;
- disabled sin proveedor;
- recuperación genérica;
- usuario existente e inexistente;
- cero eventos de fallo en dry-run;
- destinatario enmascarado;
- token ausente de historial y logs;
- readiness sanitizado;
- cola funcional separada de persistencia.

Las pruebas usan dobles y credenciales ficticias. No enviaron correos reales.

## Prueba controlada previa al despliegue

La implementación local se ejecutó contra MongoDB con una cuenta real de
desarrollo, manteniendo dry-run y bloqueando el proveedor:

| Evidencia | Resultado |
| --- | --- |
| HTTP | `200` |
| Respuesta genérica | Sí |
| Entregas `PASSWORD_RESET` creadas | 1 |
| Estado | `dry_run` |
| Destinatario enmascarado y con hash | Sí |
| Token o URL persistidos | No |
| Llamadas al proveedor | 0 |
| Incremento de `provider_attempts` | 0 |
| Eventos `email_delivery_failed` | 0 |

Esta evidencia no sustituye la validación posterior del commit desplegado.

## Vulnerabilidad npm

`npm audit` reportó una vulnerabilidad directa:

| Campo | Resultado |
| --- | --- |
| Paquete | `nodemailer` |
| Versión instalada | `6.10.1` |
| Tipo | Dependencia directa |
| Severidad agregada | Alta |
| Vectores | Inyección SMTP/CRLF, acceso a archivos o SSRF mediante opciones no utilizadas, validación TLS OAuth2 y DoS del parser |
| Afectación actual | Reducida: producción usa Resend; el adaptador SMTP existe pero no es el proveedor activo |
| Versión corregida propuesta por npm | `9.0.3` |
| Breaking change | Sí, salto mayor |

No se ejecutó `npm audit fix --force` ni se modificaron `package.json` o
lockfiles. La actualización requiere una RC independiente con pruebas de
compatibilidad del adaptador SMTP.

## Archivos de alcance

### Documentación

- `MP-EMAIL-01B.md`
- `MP-EMAIL-02.md`

### Backend

- `backend/modules/communication/index.js`
- `backend/scripts/verify-email-dry-run.js`
- `backend/src/app.js`
- `backend/src/config/env.js`
- `backend/src/modules/auth/routes.js`
- `backend/src/server.js`
- `backend/src/services/commercial-notifier.js`
- `backend/src/services/runtime-readiness.js`
- `backend/test/communication.test.js`
- `backend/test/observability.test.js`
- `backend/test/password-recovery.test.js`

### Communication service

- `communication-service/src/config/index.js`
- `communication-service/src/delivery/engine.js`
- `communication-service/src/delivery/result.js`
- `communication-service/src/health/index.js`
- `communication-service/src/history/index.js`
- `communication-service/src/index.js`
- `communication-service/src/queue/index.js`
- `communication-service/tests/communication.test.js`

## Cambios ajenos preservados

No forman parte de MP-EMAIL-02 y no deben incluirse en su commit:

- `RC-MOBILE-ROUTEUI-02.md`;
- `RC-MOBILE-MAPUI-01.md`;
- `.postman/`;
- `postman/`.

## Riesgos y acciones pendientes

1. Valkey Free no conserva la cola tras reinicios.
2. El commit nuevo debe desplegarse y verificarse en Render.
3. Render debe declarar los hechos ya verificados mediante
   `REDIS_PERSISTENCE_ENABLED=false` y
   `REDIS_MAXMEMORY_POLICY=noeviction`.
4. Debe repetirse una recuperación controlada sobre el código desplegado.
5. `EMAIL_DRY_RUN` debe permanecer en `true`.
6. Nodemailer requiere una actualización mayor independiente.

## Incidente detectado durante el despliegue

El primer readiness del commit desplegado informó
`history.index="missing"` aunque el índice había sido aplicado previamente. La
causa fue una diferencia de selección de base:

- el servidor conecta con `dbName=MONGO_DB_NAME`;
- el script `migrate-email-deliveries.js` utilizaba solo el URI y podía operar
  sobre la base predeterminada del cluster.

El script fue corregido para utilizar `MONGO_DB_NAME` con fallback
`combisapp`. La corrección se versiona por separado y su hash se conserva como
evidencia externa.

## Criterio de cierre

Antes del despliegue el veredicto permanece:

```text
MP_EMAIL_02_NOT_READY
```

Después del despliegue solo puede cambiar externamente a:

```text
MP_EMAIL_02_DRY_RUN_READY
```

si el hash nuevo está activo, el diagnóstico es correcto y la recuperación
desplegada produce una entrega `dry_run` sin contacto con Resend.
