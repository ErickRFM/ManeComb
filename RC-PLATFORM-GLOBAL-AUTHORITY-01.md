# RC-PLATFORM-GLOBAL-AUTHORITY-01

## Estado

**Implementado — pendiente únicamente de certificación del SHA final en CI.**

Esta fase corrige una frontera de autoridad global: información y configuración de toda la plataforma estaban accesibles desde rutas protegidas con el middleware empresarial legacy `requireAdmin`, aunque no pertenecen a ningún tenant.

## Base de la fase

- PR padre: `#65` — `agent/subscription-realtime-redaction-20260809`.
- Rama: `agent/platform-global-authority-20260809`.
- PR: `#66`.
- La fase permanece apilada y draft; no debe avanzar antes de su padre.

## Hallazgo confirmado

### 1. Observabilidad global bajo un guard empresarial

`GET /api/ops/observability` usaba `authenticate + requireAdmin` y llamaba `store.getOperationalInsights()`.

La implementación Mongo agrega información global sin `organizationId`:

- `AppEventModel`;
- incidentes críticos;
- sesiones RTC recientes.

Por lo tanto, no era una vista tenant-scoped: era telemetría de plataforma expuesta mediante una identidad empresarial legacy.

### 2. Readiness de pagos duplicada fuera de Platform

`GET /api/ops/readiness/payments` también estaba detrás de `requireAdmin`.

La autoridad Platform ya tenía `/api/platform/system/readiness`, que incluye readiness de pagos y del resto de integraciones. Mantener una segunda ruta global no aportaba una capacidad distinta y duplicaba la frontera de autorización.

### 3. Configuración global de la aplicación mutable por admin legacy

`PATCH /api/app/info` permitía modificar estado global de publicación:

- nombre;
- versión;
- estado;
- URL del APK;
- Android mínimo;
- tamaño;
- fecha de release;
- release notes;
- historial de versiones.

El mismo módulo exponía `GET /api/app/device-stats`, también global, con `requireAdmin`.

`GET /api/app/info` sí debe seguir siendo público porque los clientes necesitan consultar información de versión; la mutación y las estadísticas globales no pertenecen al plano empresarial.

### 4. CI estaba congelando la conducta incorrecta

`backend/test/app-global-authority.test.js` esperaba `200` para un usuario `role: "admin", accountType: "operations"` al consultar estadísticas globales de aplicación.

No era solo falta de prueba: existía una regresión que convertía la fuga de autoridad en comportamiento esperado.

## Corrección

### `/api/app` queda read-only público

Se conserva:

- `GET /api/app/info` — lectura pública de metadata de release.

Se retiran del plano empresarial:

- `PATCH /api/app/info`;
- `GET /api/app/device-stats`.

Ambos dejan de existir en ese router y responden `404`.

### `/api/ops/*` deja de ser autoridad global

El router legacy ya no lee store, telemetría ni configuración de pagos. Cualquier ruta bajo `/api/ops/*` responde `410 Gone` con:

```json
{
  "ok": false,
  "code": "platform_authority_required",
  "message": "Este recurso global fue retirado del plano operativo"
}
```

No existe alias silencioso hacia Platform: un consumidor viejo falla de forma explícita y sin datos.

### Nueva autoridad Platform

`backend/src/modules/platform/system-authority-routes.js` concentra las nuevas rutas globales.

#### `GET /api/platform/system/observability`

Requiere:

- `platformAuth`;
- `platform.system.read`.

El payload no devuelve `AppEvent` crudo. Usa DTO allowlist y solo expone por evento:

- `id`;
- `type`;
- `scope`;
- `level`;
- `status`;
- `route`;
- `method`;
- `durationMs`;
- `createdAt`.

Quedan fuera `userId`, metadata arbitraria, mensajes internos, tokens y secretos.

#### `GET /api/platform/system/app/device-stats`

Requiere `platform.system.read` y devuelve solo agregados saneados:

- total;
- conteo por versión;
- versión más usada;
- última publicación.

#### `PATCH /api/platform/system/app/info`

Requiere `platform.actions.execute`.

Con el catálogo actual esto reserva la mutación de release al `platform_owner`; `platform_admin` puede observar el sistema, pero no publicar cambios globales.

La entrada usa allowlist, rechaza campos desconocidos, limita textos y arreglos, sanea historial de versiones y valida `apkUrl` como HTTP/HTTPS sin credenciales embebidas.

## Integración de Admin Global

La pantalla `Sistema` ya era el lugar correcto para esta información, por lo que no se creó otro módulo ni otra pantalla.

Su store ahora carga en paralelo:

- readiness existente;
- observability Platform;
- device/version stats Platform.

Los resultados se agregan al grid existente como estado de observabilidad y adopción de versiones. No se agregó un editor de release en esta fase: una escritura global owner-only requiere un flujo deliberado y no un botón improvisado.

## Regresión permanente

`backend/test/app-global-authority.test.js` ahora verifica que:

1. `GET /api/app/info` sigue público.
2. El admin empresarial recibe `404` para stats y write legacy de `/api/app`.
3. `/api/ops/observability` y `/api/ops/readiness/payments` responden `410` sin datos.
4. Platform Admin puede leer observability y device stats.
5. Platform Admin no puede mutar release (`403`).
6. Platform Owner sí puede mutar un payload válido.
7. Campos desconocidos se rechazan o se eliminan de estructuras anidadas según contrato.
8. El DTO de observability no filtra `userId`, metadata, mensaje ni secretos sembrados por la prueba.
9. Un scan de `backend/src/**/*.js` falla si un archivo vuelve a combinar `requireAdmin` con cualquiera de estas autoridades globales:
   - `getOperationalInsights`;
   - `getDeviceVersionStats`;
   - `updateAppConfig`;
   - `getPaymentReadiness`.

`backend/test/payment-readiness.test.js` conserva las pruebas del servicio de readiness y deja de certificar la ruta HTTP legacy.

## Incidente de CI durante la fase

La primera corrida de #66 devolvió `503` en el nuevo endpoint Platform de observability. La causa no estaba en el endpoint ni en el store: el nuevo test no inicializaba `PLATFORM_MFA_ENCRYPTION_KEY` antes de cargar los módulos.

`platformAuth` falla cerrado cuando MFA de Platform no está operativo. El harness se alineó con los tests Platform existentes inicializando la clave de prueba antes de los imports. No se relajó MFA ni se cambió runtime para hacer verde el test.

La corrida posterior confirmó Backend completo en verde.

## Fuera de alcance / siguiente P1 confirmado

La auditoría de esta fase detectó una deuda diferente: en `backend/src/data/mongo-store.js`, `appConfigStore` y `deviceVersionsStore` se inicializan desde seed y permanecen en memoria del proceso.

Consecuencia: aunque la autoridad de lectura/escritura ya quedó correctamente en Platform, la configuración global de release y las estadísticas de adopción no parecen durables frente a restart/redeploy ni compartidas entre múltiples instancias.

Esto debe resolverse en una fase separada con persistencia canónica; no se mezcla con el cambio de autorización para mantener causalidad y rollback claros.

## Veredicto de arquitectura

Después de esta fase:

- tenant admin administra su empresa;
- Platform Admin observa estado global;
- Platform Owner ejecuta la mutación global de release;
- el cliente público solo lee metadata de app;
- `/api/ops` ya no constituye una segunda autoridad;
- CI impide que `requireAdmin` vuelva a apropiarse de estado global.

**Una responsabilidad, una autoridad.**
