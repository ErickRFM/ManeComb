# MP-EMAIL-01B — Validación operativa en Render y cierre del módulo de correos

**Fecha de validación:** 28 de julio de 2026  
**Commit desplegado:** `d3dc055`  
**Estado:** Validación operativa completada — cierre bloqueado por cola no durable  
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
| `ENABLE_QUEUES` | Ausente |
| `APP_URL` | Presente; funciona como fallback de `PORTAL_PUBLIC_URL` y `APP_PUBLIC_URL` |

No se revelaron ni copiaron valores secretos.

## Despliegue

Render reportó como activo el despliegue:

```text
Commit: d3dc055
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

No obstante, la validación encontró dos bloqueos:

1. `ENABLE_QUEUES` no existe en el servicio web. El backend exige
   `ENABLE_QUEUES=true` además de `REDIS_URL`; por tanto, BullMQ permanece
   desactivado y el módulo usa la ruta de cola en memoria.
2. La instancia gratuita de Valkey muestra `Persistence Mode: Off`. Render
   declara explícitamente que las instancias gratuitas no persisten datos en
   disco.

### Consecuencia

La cola está disponible como servicio de red, pero no ofrece durabilidad real.
Los trabajos pueden perderse al reiniciar la instancia. No puede declararse
entrega durable ni utilizarse esta configuración como garantía de entrega
única.

## Dry-run y ausencia de envíos

`EMAIL_DRY_RUN` permaneció en `true` durante toda la validación.

Las métricas públicas no registraron contadores de:

```text
provider_attempts
deliveries_sent
deliveries_failed
```

No se contactó a Resend y no se envió ningún correo real.

## Cambios realizados

### Infraestructura

- Se creó el índice único `email_delivery_idempotency` en MongoDB.

### Código y configuración de Render

- No se modificó código fuente.
- No se cambió `EMAIL_DRY_RUN`.
- No se agregó `ENABLE_QUEUES`.
- No se cambió el plan de Valkey.
- No se ejecutó un despliegue nuevo.

### Repositorio

El árbol estaba limpio antes de crear este reporte. El único archivo local
nuevo de esta fase es:

```text
MP-EMAIL-01B.md
```

## Bloqueos de cierre

Para alcanzar `MP_EMAIL_01_READY` todavía se requiere:

1. migrar `manecomb-email-queue` a una instancia con persistencia habilitada;
2. configurar `ENABLE_QUEUES=true` en el servicio web;
3. desplegar o reiniciar el servicio;
4. verificar que BullMQ mantiene conexiones activas contra Valkey;
5. confirmar que el readiness actualizado reporta historial e índice durable,
   y cola durable;
6. conservar `EMAIL_DRY_RUN=true` hasta completar una prueba controlada;
7. realizar después una prueba manual protegida antes de cambiar
   `EMAIL_DRY_RUN=false`.

Cambiar el plan de Valkey puede implicar costo y datos de pago, por lo que no se
realizó automáticamente.

## Resultado final

| Área | Resultado | Evidencia |
| --- | --- | --- |
| Dominio y remitente | Configurados | Variables de Render presentes; dominio ya verificado en Resend |
| Despliegue | Operativo | Commit `d3dc055` en estado `live` |
| MongoDB | Conectado | Log de arranque `MongoDB conectado (combisapp)` |
| Duplicados históricos | Ninguno | Preflight `duplicates: []` |
| Índice idempotente | Aplicado y único | `email_delivery_idempotency`, `unique: true` |
| Valkey | Disponible | Estado `available`, acepta conexiones TCP |
| BullMQ | No habilitado | Falta `ENABLE_QUEUES=true` |
| Persistencia de cola | No durable | `Persistence Mode: Off` en instancia Free |
| Dry-run | Activo | `EMAIL_DRY_RUN=true` |
| Envíos reales | Ninguno | Sin contadores de intentos o entregas |
| Readiness público | Degradado | `/api/health` respondió `status: degraded` |

```text
MP_EMAIL_01_NOT_READY
```
