# MP-EMAIL-01B — Validación operativa en Render y cierre del módulo de correos

**Fecha de validación inicial:** 28 de julio de 2026
**Estado actualizado:** 30 de julio de 2026
**Commit desplegado:** `a21942c`
**Estado:** Cola conectada y funcional en dry-run — durabilidad productiva pendiente
**Veredicto:** `MP_EMAIL_01_NOT_READY`

## Alcance

Esta fase continuó desde la implementación estructural de `MP-EMAIL-01`. No se
reconstruyó el servicio, no se conectaron eventos nuevos, no se modificó lógica
comercial y no se enviaron correos reales.

La validación cubrió:

- configuración efectiva del servicio web en Render;
- despliegue activo;
- conexión operativa con MongoDB;
- preflight de duplicados históricos;
- creación y verificación del índice idempotente;
- disponibilidad y durabilidad real de la cola Valkey/BullMQ;
- health público y métricas de correo;
- conservación de `EMAIL_DRY_RUN=true`.

## Configuración verificada

En el servicio `ManeComb` de Render se confirmó:

| Variable | Resultado |
| --- | --- |
| `EMAIL_ENABLED` | Presente y configurada en `true` |
| `EMAIL_DRY_RUN` | Presente y configurada en `true` |
| `EMAIL_FROM` | Presente |
| `EMAIL_FROM_NAME` | Presente |
| `EMAIL_REPLY_TO` | Presente |
| `RESEND_API_KEY` | Presente |
| `MONGO_URI` | Presente |
| `REDIS_URL` | Presente |
| `ENABLE_QUEUES` | Presente y configurada en `true` |
| `APP_URL` | Presente; funciona como fallback de `PORTAL_PUBLIC_URL` y `APP_PUBLIC_URL` |

No se revelaron ni copiaron valores secretos.

## Despliegue

Render reportó como activo el despliegue:

```text
Commit: a21942c8769673eea509ab586aea1b7b9277eb3b
Mensaje: Conexion de correos con backend
Estado: live
Build: successful
```

Los logs de arranque confirmaron:

```text
MongoDB conectado (combisapp)
dbMode: mongo
API Combis lista
```

El endpoint público respondió:

```text
GET /api/health
HTTP 200
status: degraded
```

El estado `degraded` es congruente con una configuración que todavía no está
lista para entrega durable.

La ruta `POST /api/auth/forgot-password` respondió `HTTP 200` y mantuvo la
respuesta pública genérica. Esa primera petición utilizó un destinatario
ilustrativo que probablemente no existe, por lo que no constituye todavía una
prueba del ciclo interno completo.

## MongoDB e idempotencia

Se ejecutó primero el preflight en modo lectura:

```json
{
  "mode": "dry-run",
  "duplicates": []
}
```

Al no existir duplicados históricos, se aplicó el índice previsto por
`backend/scripts/migrate-email-deliveries.js`.

La verificación posterior confirmó:

```json
{
  "exists": true,
  "name": "email_delivery_idempotency",
  "unique": true,
  "key": {
    "tenantScope": 1,
    "eventType": 1,
    "idempotencyKey": 1
  }
}
```

### Resultado

La idempotencia durable de MongoDB quedó preparada. El servicio debe
reinicializar su readiness después de cualquier cambio operativo futuro para
volver a leer el estado físico del índice.

## BullMQ y Valkey

Render contiene el servicio:

```text
Nombre: manecomb-email-queue
Runtime: Valkey 8.1.4
Región: Oregon
Estado: available
```

Los logs de Valkey confirmaron:

```text
Running mode=standalone, port=6379
Ready to accept connections tcp
```

La validación posterior confirmó además:

```text
ENABLE_QUEUES=true
Maxmemory Policy=noeviction
BullMQ conectado a Valkey
```

La instancia gratuita de Valkey mantiene `Persistence Mode: Off`. Render
declara explícitamente que las instancias gratuitas no persisten datos en
disco.

### Consecuencia

La cola está conectada y funciona durante la vida de la instancia, pero no
ofrece durabilidad ante un reinicio de Valkey. Su estado operativo debe
interpretarse así:

```text
connected: true
functional: true
durableAcrossValkeyRestart: false
```

BullMQ no está desconectado ni degradado por un bug de integración. La
limitación corresponde exclusivamente a la ausencia de persistencia del plan
Free.

## Dry-run y ausencia de envíos

`EMAIL_DRY_RUN` permaneció en `true` durante toda la validación.

Las métricas públicas no registraron contadores de:

```text
provider_attempts
deliveries_sent
deliveries_failed
```

No se contactó a Resend y no se envió ningún correo real.

El 30 de julio de 2026 se ejecutó además una recuperación controlada con una
cuenta real de desarrollo existente y el código corregido de MP-EMAIL-02. La
verificación forzó `EMAIL_DRY_RUN=true` y bloqueó expresamente cualquier
invocación al proveedor. El resultado fue:

| Comprobación | Resultado |
| --- | --- |
| Respuesta HTTP | `200`, mensaje público genérico |
| Entregas creadas | `1` |
| Evento | `PASSWORD_RESET` |
| Estado central | `dry_run` |
| Identificador de solicitud | Creado, sin exponer el token |
| Destinatario persistido | Enmascarado y con hash |
| Token, URL o error crudo persistido | Ninguno |
| Llamadas al proveedor | `0` |
| Incremento de `provider_attempts` | `0` |
| Eventos `email_delivery_failed` | `0` |

La prueba confirma la semántica corregida: `dry_run` es una entrega aceptada y
simulada, no una entrega real ni un fallo.

## Cambios realizados

### Infraestructura

- Se creó el índice único `email_delivery_idempotency` en MongoDB.

### Código y configuración de Render

- La validación inicial de Render no requirió modificar código fuente.
- MP-EMAIL-02 corrigió localmente el contrato de resultados y el tratamiento
  de recuperación de contraseña; estos cambios todavía no forman parte del
  commit desplegado `a21942c`.
- No se cambió `EMAIL_DRY_RUN`.
- Posteriormente se configuró `ENABLE_QUEUES=true`.
- BullMQ quedó inicializado contra Valkey.
- Se confirmó `Maxmemory Policy=noeviction`.
- No se cambió el plan de Valkey.
- El commit `a21942c` quedó desplegado.

### Repositorio

El árbol estaba limpio al iniciar MP-EMAIL-01B. Al actualizar este reporte ya
existen cambios locales de MP-EMAIL-02 para el contrato de entrega, recuperación
de contraseña, pruebas y verificación controlada. Los cambios preexistentes de
otras RC y los artefactos Postman permanecen fuera de este alcance.

## Bloqueos de cierre

Para alcanzar `MP_EMAIL_01_READY` todavía se requiere:

1. migrar `manecomb-email-queue` a una instancia con persistencia habilitada;
2. confirmar que el readiness actualizado reporta historial e índice durable,
   y cola durable;
3. conservar `EMAIL_DRY_RUN=true` después de la prueba controlada completada;
4. realizar después una prueba manual protegida y autorizada antes de cambiar
   `EMAIL_DRY_RUN=false`.

Cambiar el plan de Valkey puede implicar costo y datos de pago, por lo que no se
realizó automáticamente.

## Resultado final

| Área | Resultado | Evidencia |
| --- | --- | --- |
| Dominio y remitente | Configurados | Variables de Render presentes; dominio ya verificado en Resend |
| Despliegue | Operativo | Commit `a21942c` en estado `live` |
| MongoDB | Conectado | Log de arranque `MongoDB conectado (combisapp)` |
| Duplicados históricos | Ninguno | Preflight `duplicates: []` |
| Índice idempotente | Aplicado y único | `email_delivery_idempotency`, `unique: true` |
| Valkey | Disponible y funcional | Estado `available`, acepta conexiones TCP, `noeviction` |
| BullMQ | Conectado | `ENABLE_QUEUES=true`, inicializado contra Valkey |
| Persistencia de cola | No durable | `Persistence Mode: Off` en instancia Free |
| Dry-run | Activo y validado | Una entrega `PASSWORD_RESET` quedó en `dry_run`, sin llamada al proveedor |
| Envíos reales | Ninguno | Sin contadores de intentos o entregas |
| Readiness público | Degradado | `/api/health` respondió `status: degraded` |
| Recuperación HTTP | Respuesta genérica correcta | `POST /api/auth/forgot-password` respondió `200`; `dry_run` no generó evento de fallo |

```text
MP_EMAIL_01_NOT_READY
```
