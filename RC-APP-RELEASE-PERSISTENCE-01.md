# RC-APP-RELEASE-PERSISTENCE-01

## Estado

**Implementado — pendiente únicamente de certificación del SHA final en CI.**

Esta fase corrige la durabilidad del estado global de publicación de ManeComb y de la telemetría de versiones de cliente en modo Mongo.

## Base de la fase

- PR padre: `#66` — `agent/platform-global-authority-20260809`.
- Rama: `agent/app-release-persistence-20260809`.
- PR: `#67`.
- La fase permanece apilada y draft; no debe avanzar antes de su padre.

## Hallazgo confirmado

La fase anterior corrigió quién puede leer y mutar la configuración global, pero una auditoría posterior demostró que la autoridad de persistencia todavía no era durable.

En `backend/src/data/mongo-store.js` existían:

- `appConfigStore`, inicializado desde `seed.appConfig`;
- `deviceVersionsStore`, un objeto en memoria indexado por `userId`.

No existía una colección Mongo para ninguno de los dos conceptos.

### Consecuencias

1. Un restart o redeploy podía devolver la configuración de release al seed.
2. Dos instancias del backend podían observar versiones publicadas diferentes.
3. Las estadísticas de adopción se reiniciaban con el proceso.
4. Dos instancias podían producir estadísticas distintas.
5. La autoridad Platform de `#66` era correcta en autorización, pero no todavía en persistencia.

## Semántica preservada

La telemetría previa no identificaba dispositivos mediante un ID durable. Login únicamente recibe:

- `appVersion`;
- `buildNumber`;
- `platform`;
- header `x-device-model`.

El estado anterior se indexaba por `userId`, por lo que su semántica real era:

> **última versión de cliente reportada por usuario**

Esta fase preserva exactamente ese contrato. No inventa un modelo multi-dispositivo ni genera identificadores que el cliente no posee.

## Persistencia Mongo

Se añadió `backend/src/data/app-release-models.js` como módulo dedicado para no seguir ampliando el archivo monolítico de modelos.

### Colección `app_config`

Modelo `AppConfigModel` con singleton `_id = "app-config"`.

Persiste:

- nombre;
- versión;
- estado;
- URL del APK;
- Android mínimo;
- tamaño;
- fecha de release;
- release notes;
- historial de versiones;
- timestamps de persistencia.

### Colección `app_client_versions`

Modelo `AppClientVersionModel` con `_id = userId`.

Persiste la última observación conocida de:

- versión;
- build number;
- plataforma;
- modelo de dispositivo;
- timestamps.

Un nuevo login del mismo usuario actualiza el mismo documento; no crea un dispositivo adicional.

## Autoridad de acceso a datos

Se añadió `AppReleaseRepository` y `AppReleaseStoreService`, integrados en `buildBackendStore`.

### Embedded / tests

Sin modelos Mongo, los cuatro métodos continúan delegando al store base:

- `getAppConfig`;
- `updateAppConfig`;
- `recordDeviceVersion`;
- `getDeviceVersionStats`.

Esto conserva compatibilidad con embedded y pruebas existentes.

### Mongo real

Cuando `mongo-store` construye el backend store con su conjunto de modelos —identificado por la presencia de `AppEventModel`—, el servicio de app release activa los modelos persistentes dedicados y sustituye los cuatro métodos en memoria.

El marker evita que una prueba que inyecte un objeto parcial `models` active accidentalmente los modelos Mongo reales.

También se pueden inyectar explícitamente `AppConfigModel` y `AppClientVersionModel` para pruebas unitarias con dobles.

## Migración lazy sin downtime

No se requiere un script manual de migración.

La primera lectura persistente ejecuta un upsert sobre `_id = "app-config"`:

- si el singleton ya existe, se conserva;
- si no existe, se inicializa desde el `appConfig` base que ya usaba ManeComb.

El seed actual contiene la misma versión pública previa (`1.0.2`), por lo que desplegar esta fase sobre una colección vacía no cambia la versión visible por sí mismo.

Las carreras de inicialización concurrente se resuelven por `_id` único; un `E11000` durante el primer insert hace relectura del singleton ganador.

## Escritura global atómica

`updateAppConfig()` no hace una secuencia separada de `ensure` + `update`.

El primer patch también es un único `findOneAndUpdate(..., { upsert: true })`:

- los campos del patch van en `$set`;
- los campos restantes del seed van en `$setOnInsert`;
- no existen paths solapados entre ambas operaciones;
- una colisión concurrente `E11000` reintenta el patch sobre el documento ya creado.

Así no existe una ventana normal entre creación y actualización del singleton.

## Estadísticas durables

`getDeviceVersionStats()` agrega `app_client_versions` por `version` y devuelve:

- `total` de usuarios con versión reportada;
- conteo por versión;
- versión más usada;
- `lastPublication` tomado del singleton persistente.

La estadística continúa midiendo usuarios con última versión conocida, no dispositivos físicos.

## Integración HTTP y Auth

La persistencia Mongo vuelve asíncronos estos métodos, por lo que los consumidores se alinearon explícitamente.

### `GET /api/app/info`

Ahora espera `getAppConfig()` mediante `Promise.resolve`, manteniendo compatibilidad tanto con store síncrono embedded como con store Mongo asíncrono.

### Login y refresh

`getAppUpdateInfo()` ahora es async y espera la configuración durable antes de calcular:

- `updateAvailable`;
- `latestVersion`;
- `mandatory`;
- release notes;
- download URL.

Login y refresh siguen obteniendo su decisión de actualización desde la misma autoridad.

## Telemetría nunca bloquea autenticación

Persistir la versión del cliente es analítica, no una precondición de autenticación.

Se añadió `recordDeviceVersionBestEffort()`:

- espera el write para evitar promesas rechazadas sin observar;
- si falla, registra un warning saneado;
- no propaga el error;
- login continúa exitosamente.

El error registrado pasa por el saneado de seguridad existente de Communication para evitar volcar detalles del proveedor o infraestructura.

## Regresión permanente

`backend/test/app-release-persistence.test.js` forma parte del `npm test` normal y protege:

1. seed lazy del singleton;
2. persistencia de un patch frente a una nueva instancia del repository;
3. primer patch atómico en una sola operación;
4. conservación de campos seed no reemplazados;
5. allowlist de configuración;
6. overwrite de la última versión del mismo `userId`;
7. agregación por versión;
8. fallback embedded;
9. `buildBackendStore` con dobles Mongo explícitos usa persistencia;
10. `buildBackendStore` con dependencias de modelos parciales no activa Mongo real;
11. `GET /api/app/info` espera configuración async;
12. login sigue en `200` aunque falle la persistencia de telemetría;
13. login calcula actualización desde config async;
14. refresh calcula actualización desde config async.

## Infraestructura temporal

Para aplicar cambios quirúrgicos al archivo grande `auth/routes.js` se usó un workflow de codemod de una sola ejecución con paths limitados a sí mismo.

El workflow terminó correctamente, se verificó el resultado y luego fue eliminado de la rama. No forma parte del diff funcional final.

## Nota para futuras auditorías

`mongo-store.js` todavía contiene `appConfigStore` y `deviceVersionsStore` como implementación base/fallback histórica. En modo Mongo real **ya no son la autoridad efectiva**: `buildBackendStore` reemplaza esos cuatro métodos por `AppReleaseStoreService` persistente.

No deben interpretarse como una segunda autoridad ni volver a conectarse directamente a rutas.

## Fuera de alcance

Esta fase no:

- crea tracking multi-dispositivo;
- cambia la versión pública por sí sola;
- añade UI de publicación;
- cambia permisos Platform definidos en `#66`;
- modifica GPS, jornadas, pagos, suscripción, RTC, chat o radio.

## Veredicto de arquitectura

Después de esta fase:

- Platform sigue siendo la única autoridad de control global;
- Mongo es la autoridad durable de release y adopción de versiones;
- todas las instancias comparten el mismo singleton;
- la última versión por usuario sobrevive restart/redeploy;
- la telemetría no puede tumbar login;
- embedded/test conserva su comportamiento ligero sin conectarse accidentalmente a Mongo.

**Una responsabilidad, una autoridad, una persistencia durable.**
