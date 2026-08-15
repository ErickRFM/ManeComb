# RC-GPS-ROUTE-HISTORY-LEARNING-01

Cierre de GPS, historial de recorrido, jornada libre y aprendizaje de rutas.

## Base

- `BASE_SHA`: `edf39a74950b7f9d6141667fe81ea894542f859f` (`origin/main` al iniciar y al cerrar; no avanzó durante el trabajo, no hizo falta rebase).
- `BRANCH`: `fix/gps-route-history-learning-20260814`
- `FINAL_SHA`: `9efb06d6`

## Causas raíz encontradas

### 1. Tres autoridades de frescura GPS que se contradecían

| Derivación | Umbral | Reloj | Taxonomía | Consumidores |
|---|---|---|---|---|
| `services/tracking-time.js` `buildGpsFreshness` | 120 s | `locationTimestamp` (teléfono) | `fresh/stale/missing` | `/locations/live`, socket `location:updated`, incidencias |
| `domain/operational-unit-snapshot.js` `buildGps` | 8/15/30 s | `locationReceivedAt` (servidor) | `freshness` + `connectionState` | snapshot operacional |
| `ventas/.../utils/tracking.ts` | booleano | — | `GPS actualizado` / `GPS vencido` | Portal |

Una unidad que dejó de reportar hace 20 s era **`fresh` por REST y `stale` por snapshot en el mismo instante**. El Portal, además, colapsaba cinco estados posibles en un booleano.

### 2. `never_reported` no existía como estado

Sin coordenadas, `buildGps` devolvía `connectionState: "lost"`. El Portal mostraba "Sin GPS" o, peor, "GPS vencido".

Escenario certificado: **empresa existente → unidad existente con última ubicación histórica → key → conductor nuevo → asignación**. La unidad conserva una coordenada real de otro momento, así que `vehicle.location` y `locationTimestamp` existen y `isVehicleGpsFresh` devolvía `false` ⇒ **"GPS vencido"**, sin manera de distinguir "el conductor aún no ha encendido la app" de "se perdió la señal hace diez segundos".

La antigüedad de la cuenta nunca participó en el cálculo; el defecto era de **taxonomía y presentación**, no de datos. La historia no se tocó.

### 3. Historial perdido al reconciliar una jornada iniciada sin Internet

Secuencia real:

1. El conductor inicia jornada a T0 sin red. Mobile crea la sesión local `pending:{vehicleId}` y encola `control:sessionStart` y los puntos.
2. Al reconectar a T1 la cola se reproduce en orden. `control:sessionStart` crea la jornada en el servidor, que sellaba `startedAt` con **T1**.
3. Los puntos llegan con su instante de captura correctamente reconstruido por `clientQueueAgeMs` (T0..T1).
4. `canSessionAcceptPosition` exige `positionTime >= session.startedAt`, así que **todos** quedaban por debajo del inicio y se descartaban en silencio.

Resultado: **GPS visible en el mapa, cero `RouteSessionPosition`**. Es la causa raíz de los casos C, D e I.

### 4. La identidad técnica de jornada se mostraba como ruta

`getRouteInfo` cae a `session.routeId` para el código, y `recording:{vehicleId}` no coincide con el patrón de UUID opaco, así que pasaba el filtro y se usaba como nombre. El Portal mostraba literalmente **"Ruta recording:vehicle-101"** y **"Codigo recording:vehicle-101"** en cada jornada libre.

### 5. Un solo turno cerraba la evidencia de ruta aprendida

`upsertLearnedRouteCandidate` promovía a `READY_FOR_REVIEW` con `evidenceCount >= minEvidenceCount`. Tres vueltas de la misma mañana bastaban para proponer una ruta oficial, que puede ser un desvío puntual y no un recorrido habitual.

## Arquitectura final

```
Backend decide → shared contract representa → clientes presentan
```

- `backend/src/domain/gps-telemetry-state.js` — **autoridad semántica única** del enlace GPS. Taxonomía `never_reported | live | delayed | stale | lost` (8/15/30 s sobre reloj de servidor, con `transport_queue_age` para no rejuvenecer backlog).
- `tracking-time.buildGpsFreshness` y `operational-unit-snapshot.buildGps` **delegan** en ella. `freshness` de tres estados sobrevive como proyección derivada y deprecada.
- `backend/src/domain/learned-route-evidence.js` — regla única de madurez del candidato, compartida por el store embebido y el de Mongo.
- `services/tracking-time.resolveSessionStartedAt` — política única de inicio retroactivo de jornada.
- `shared/operational-contract` — taxonomía, formato de antigüedad (`formatGpsAge`) e identidades técnicas de ruta (`isTechnicalRouteId`, `isRecordingRouteId`, `RECORDING_JOURNEY_LABEL`).

### Duplicación eliminada

- Escalera de frescura de 120 s en `tracking-time.js` (`TRACKING_GPS_FRESHNESS_MS` deja de definir frescura).
- Escalera de frescura embebida en `operational-unit-snapshot.buildGps`.
- `isVehicleGpsFresh` del Portal (colapso booleano). Sustituido por `getVehicleGpsConnectionState`.
- Condición de promoción de candidato duplicada entre los dos stores.

### Conservado a propósito

- `RouteSessionPosition` sigue siendo la evidencia histórica canónica. No se creó ninguna colección nueva.
- `vehicle-location-ingestion.js` sigue siendo el único pipeline GPS.
- El motor `auto-route-learning.js` no se reimplementó: se afinó su regla temporal.
- El editor de rutas y el panel de sugerencias del Portal ya existían; **no se crearon duplicados**.
- Las incidencias conservan su ventana propia de 120 s, ahora como política de dominio explícita y documentada que lee la edad de la autoridad única. "El enlace está vivo" y "esta posición sirve para geolocalizar un reporte" son preguntas distintas.
- Ownership foreground/background: revisado y **sin cambios**. Ya existe una máquina de estados explícita (`getLocationCaptureOwner`, con estado `TRANSITIONING`), token de propiedad, cola serializada de operaciones y cobertura de pruebas. El solapamiento breve es deliberado y documentado para eliminar el hueco background → foreground; perder puntos es peor que un duplicado transitorio. No se encontró defecto demostrable, así que no se inventó un cambio.

## Archivos modificados

38 archivos, +1437 / −135, en 4 commits:

```
53b0fb4b fix(tracking): unify canonical gps freshness authority
8fbf7aa4 fix(journey): persist offline tracking history on reconciliation
f0010091 feat(routes): strengthen repeated-route evidence with service days
9efb06d6 feat(portal): present recurring routes and hide technical journey ids
```

Altas: `backend/src/domain/gps-telemetry-state.js`, `backend/src/domain/learned-route-evidence.js`, `backend/test/gps-telemetry-state.test.js`, `backend/test/route-recording-history.test.js`, `ventas/scripts/verify-tracking-presentation.mjs`.

## Tests ejecutados

| Gate | Comando | Resultado |
|---|---|---|
| Backend | `cd backend && npm test` | **PASS** (exit 0) |
| Mobile typecheck | `cd mobile && npx tsc --noEmit` | **PASS** |
| Mobile | `cd mobile && npm test -- --runInBand` | **PASS** — 100 suites, 566 tests |
| Ventas typecheck | `cd ventas && npx tsc --noEmit` | **PASS** |
| Ventas contratos + build | `npm run build` (incluye `verify:contracts`) | **PASS** |
| Higiene | `git diff --check` | limpio |

`ventas` no define script `test`; sus candados son los `verify:*` que ejecuta `npm run build`.

El build de `ventas` exige `VITE_API_URL` con HTTPS. Con el `.env` local (`http://localhost:5000`) falla **antes de compilar**, por configuración y no por código; se verificó con `VITE_API_URL=https://api.example.com`.

### Cobertura añadida

- `gps-telemetry-state.test.js`: escalera completa, `never_reported` vs `lost`, **alta de conductor nuevo sobre unidad con ubicación histórica**, irrelevancia de la antigüedad de cuenta, desfase de reloj, edad de cola offline, posición sin sello, sello sin posición, y equivalencia REST ⇄ snapshot sobre el mismo vehículo.
- `route-recording-history.test.js`: política de inicio retroactivo; jornada libre bajo `recording:*` que persiste historial y **no** aparece como ruta; jornada offline reconciliada que conserva sus 8 puntos; idempotencia del replay por `packetId`.
- `auto-route-learning.test.js`: tres vueltas del mismo día se quedan en `COLLECTING`; una cuarta en otro día cierra la evidencia.
- `incident-location.test.js` se incorporó al runner de `npm test` (antes existía pero no se ejecutaba).

Ambas regresiones nuevas se verificaron **desactivando el arreglo**: sin `resolveSessionStartedAt` la prueba falla en la política y en el conteo de historial.

## Configuración requerida

```
DEPLOYMENT_CONFIGURATION_REQUIRED
```

El repositorio **no contiene manifiesto de despliegue** (no hay `render.yaml`); las variables viven en el panel de Render, que no puedo inspeccionar. No afirmo su estado actual.

- `AUTO_ROUTE_LEARNING_ENABLED` y `AUTO_ROUTE_REVIEW_ENABLED` tienen default `false` en `config/auto-route.js` y en `.env.example`. **No se cambiaron.** Con `learning` apagado, `processCompletedRouteSession` retorna `learning_disabled` sin tocar datos; con `review` apagado, los endpoints `/navigation/learned-routes*` responden `503 auto_route_review_disabled`. Son independientes: se puede habilitar aprendizaje y dejar la revisión cerrada para acumular evidencia antes de exponerla.
- Nueva: `AUTO_ROUTE_MIN_DISTINCT_SERVICE_DAYS` (default `2`). Documentada en `backend/.env.example`.
- Índices Mongo de `learned_route_candidates`: los existentes (`{organizationId, groupKey}` único y `{organizationId, status, updatedAt}`) siguen siendo suficientes. Los campos nuevos (`evidenceServiceDates`, `distinctServiceDays`, `firstSeenAt`, `lastSeenAt`) se leen con el documento y no requieren índice.
- Migración: no hace falta. Los candidatos anteriores quedan con `distinctServiceDays: 0` y siguen su curso; solo tardarán un día operativo más en madurar.

## Prueba física pendiente

```
PHYSICAL_GATE: ACCEPTED_PENDING
```

No se compiló APK ni se ejecutó recorrido real. Los cambios de Mobile son TypeScript (`route-session-actions`, `client`, `offline-cache`, presentación); **no se tocó `ManeCombLocationService.kt`, el manifiesto, permisos ni el bridge nativo**, así que no hay superficie nativa nueva que certificar. Falta validar en dispositivo:

1. Pantalla bloqueada y foreground ↔ background durante una jornada larga.
2. Corte real de red Wi-Fi ↔ datos y reconciliación de la cola (el caso ahora cubierto por prueba lógica).
3. Que el conteo de puntos del historial coincida con el recorrido real, sin faltantes ni duplicados.
4. Replay de la jornada en Portal con volumen alto de puntos.
5. Ciclo completo hasta ruta aprendida con recorridos en días distintos y asignación manual posterior.

## Riesgos restantes reales

1. **La frescura se endureció de 120 s a 15 s en REST y socket.** Es la corrección buscada —antes REST mentía respecto al snapshot—, pero cualquier consumidor que asumiera la ventana amplia verá más unidades fuera de `live`. El snapshot ya se comportaba así, de modo que la UI principal no cambia de criterio.
2. **`resolveSessionStartedAt` acepta un `startedAt` declarado por el cliente.** Está acotado al pasado y a la ventana de la cola (24 h) y nunca al futuro, pero permite que un cliente comprometido declare un inicio de jornada hasta 24 h atrás. El límite coincide con la retención real de la cola offline, así que no abre evidencia que no pudiera existir.
3. **`distinctServiceDays` retrasa un día la primera sugerencia.** Es intencional; con `AUTO_ROUTE_MIN_DISTINCT_SERVICE_DAYS=1` se recupera el comportamiento anterior.
4. **El aprendizaje sigue apagado en producción** hasta que se decida habilitarlo (ver configuración requerida). Nada de lo entregado depende de encenderlo para funcionar.
5. La oferta de asignación tras aprobar sólo puede resolver la unidad si sigue en el listado operativo cargado; si no, muestra el mensaje de guardado y deja la asignación al catálogo.
