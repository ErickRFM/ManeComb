# RC-MOBILE-OPUNITSNAPSHOT-INVENTORY-01 — Inventario read-only del contrato unidad/driver

> **Fase:** solo lectura. **Cero cambios de código.** typecheck mobile verde (exit 0); ventas tiene `typecheck` propio (`tsc --noEmit`). Todo hallazgo con archivo+línea.

## 0. Los tres mundos (contexto)

1. **Snapshot canónico** `OperationalUnitSnapshot` — [shared/operational-contract/types.ts](shared/operational-contract/types.ts); construido en [backend/src/domain/operational-unit-snapshot.js](backend/src/domain/operational-unit-snapshot.js) (`operationalState` derivado en :329 de `status+route+gps+activeSession`; `driver` en :331; regla `unknown` si gps no fresh en :266). **Es la derivación de fuente única.**
2. **Campos legacy crudos** — `vehicle.driverId`, `vehicle.status`, `user.vehicleId` (asignación cruda).
3. **Selectores de presentación** — [shared/operational-contract/selectors.ts](shared/operational-contract/selectors.ts) (formatean el snapshot, no derivan).

El snapshot **consume** los legacy para producir `driver`/`operationalState`. El drift ocurre cuando una superficie lee los legacy crudos en vez del snapshot resuelto.

## 1. Fuentes de verdad y quién escribe (los 3 campos problema)

| Campo | Vive en (tipo) | Escrito por (backend) |
|---|---|---|
| `vehicle.driverId` | `Vehicle` — [mobile/src/types/app.ts:632](mobile/src/types/app.ts), [ventas/src/types/app.ts:166](ventas/src/types/app.ts); schema [backend/models.js:282](backend/src/data/models.js) `default: null` | Lógica de asignación: [mongo-store.js:663,676,708](backend/src/data/mongo-store.js) `driverId: userId`; unassign :681,1859 `driverId: null`; :1856 |
| `vehicle.status` | `Vehicle` — [mobile/app.ts:634](mobile/src/types/app.ts), [ventas/app.ts:159](ventas/src/types/app.ts); schema [backend/models.js:284](backend/src/data/models.js) `required: true` | Estado crudo del vehículo (alta/mantenimiento). Distinto de `operationalState` derivado |
| `user.vehicleId` | `User` — [mobile/app.ts:106](mobile/src/types/app.ts), [ventas/app.ts:54](ventas/src/types/app.ts); schema [backend/models.js:195](backend/src/data/models.js) `default: null` | [mongo-store.js:1760](backend/src/data/mongo-store.js) `user.vehicleId = nextVehicleId`; :1631 |

**Dónde se pueden contradecir:** `user.vehicleId` y `vehicle.driverId` son **los dos lados de la misma asignación**, escritos en operaciones separadas del mongo-store. Si una se actualiza sin la otra, un lector de `user.vehicleId` (¿qué unidad es la del chofer?) y uno de `vehicle.driverId` (¿qué chofer tiene la unidad?) ven realidades distintas. `vehicle.status` (crudo) vs `operationalState` (derivado) es la tercera contradicción: hay superficies que leen uno y superficies que leen el otro (§5).

## 2. Consumidores en mobile

| Archivo:línea | Lee | Fuente |
|---|---|---|
| [checklist/checklist.utils.ts:101](mobile/src/screens/checklist/checklist.utils.ts) | `vehicle.status` (→ `getVehicleOperationalStatus`) | **legacy crudo** |
| checklist.utils.ts:127,134,135,136,140 | `unit.operationalState`, `unit.label`, `driverLabel(unit.driver)`, `routeLabel(unit.route)`, `unit.route.etaAt` | snapshot |
| [checklist-screen.tsx:185](mobile/src/screens/checklist-screen.tsx) | `user.vehicleId === selectedVehicle.id` | legacy |
| checklist-screen.tsx:129,140,370 | `unit.unitId`, `driverLabel(unit?.driver)`, cruza `unit.unitId` con `vehicles` | mixto |
| [alerts/utils/alerts.utils.ts:54-62](mobile/src/screens/alerts/utils/alerts.utils.ts) | `user.vehicleId`→`unit.unitId`; `unit.gps.freshness/lat/lng/recordedAt` | snapshot + `user.vehicleId` |
| [map/components/BottomTrackingPanel.tsx:52,209,210,211,225,227,229,244,263,439](mobile/src/screens/map/components/BottomTrackingPanel.tsx) | `unit.plates`, `stateLabel(operationalState)`, `formatFreshness(gps)`, `formatSpeed(gps)`, `operationalState==='stopped'`, `status==='maintenance'/'offline'`, `formatEta(route)`, `unit.label` | **snapshot (canónico)** |
| [map/components/MapCanvas.tsx:176,178,208](mobile/src/screens/map/components/MapCanvas.tsx) | `stateColor(unit.operationalState)`, `freshnessOpacity(gps.freshness)`, `formatFreshness(gps)` | **snapshot (canónico)** |
| [map-screen.native.tsx:101,109,510,556,570](mobile/src/screens/map-screen.native.tsx) | `user.vehicleId`→`vehicleById`, `vehicle.driverId`, `vehicle.route/routeId/routeColor/assignedRoute`, `selectedUnit.gps/unitId` | **mixto**: gps del snapshot, ruta/driver del legacy |
| [utils/active-route.ts:239](mobile/src/utils/active-route.ts) | `vehicle.driverId`, `vehicle.driverName` (→ RouteSession.driver) | **legacy crudo** |
| [services/route-session-actions.ts:51](mobile/src/services/route-session-actions.ts) | `driverId || userId` | legacy |
| [profile-screen.tsx:115,118](mobile/src/screens/profile-screen.tsx) | `user.vehicleId`, `driverId` (documentos) | legacy |
| [store/root-store.ts:209,1931,1951-1952](mobile/src/store/root-store.ts) | fuente: `operationalUnits` (snapshot) + `mapData.vehicles` (legacy) **en paralelo**; `user.vehicleId`→`getActiveRouteSessionRequest` | ambos |

## 3. Consumidores en portal (ventas/)

| Archivo:línea | Lee | Fuente |
|---|---|---|
| [store/use-app-store.ts:63,258-264,517-521](ventas/src/store/use-app-store.ts) | fuente: `vehicles` + `operationalUnits` fetch **separado**; upsert por `unit.unitId` (socket) | ambos |
| [portal/dashboard/dashboard.utils.ts:172-201](ventas/features/portal/dashboard/dashboard.utils.ts) `applyOperationalSnapshot` | **fusiona snapshot→Vehicle**: `gps.lat/lng/speedKmh/heading/recordedAt/freshness`, `driver.id`, `driver.name`, `route.remainingTimeSeconds`, `route.etaAt`, `route.progressRatio`, `lastEventAt`. **NO fusiona `unit.status` ni `operationalState`.** | snapshot→legacy |
| [dashboard.utils.ts:35-38](ventas/features/portal/dashboard/dashboard.utils.ts) `getVehicleStatus` | `activeSession.status`, `vehicle.status==='maintenance'`, **`vehicle.driverId` → "Asignada"** | **legacy + inferencia** |
| [dashboard.utils.ts:91](ventas/features/portal/dashboard/dashboard.utils.ts) | `activeSession?.driverId \|\| vehicle.driverId \|\| vehicle.driver?.id` (3 fuentes) | legacy |
| [dashboard.utils.ts:83](ventas/features/portal/dashboard/dashboard.utils.ts) | `user.vehicleId === vehicle.id` | legacy |
| [dashboard.utils.ts:204-211](ventas/features/portal/dashboard/dashboard.utils.ts) `getGpsState` | deriva frescura de `vehicle.location/locationTimestamp` + `isVehicleGpsFresh` + `session.status` | **re-derivación local** |
| [portal/components/operations-map.tsx:87](ventas/features/portal/components/operations-map.tsx) | `vehicle.status==='maintenance'/'offline'` (color marcador) | legacy crudo |
| [portal/routes/components/route-unit-selector.tsx:42](ventas/features/portal/routes/components/route-unit-selector.tsx) | `vehicle.status==='maintenance'` : **`vehicle.assignedRoute` → "En jornada"** : "Disponible" | **legacy + inferencia** |
| [portal/screens/portal-dashboard-screen.tsx:90,193,196,203-204](ventas/features/portal/screens/portal-dashboard-screen.tsx) | `applyOperationalSnapshot(...)`; running/stopped de `session.status==='RUNNING'` y **`vehicle.speed<=0.8`→stopped** | **legacy + umbral de velocidad** |
| [dashboard/components/dashboard-history-filters.tsx:69-71](ventas/features/portal/dashboard/components/dashboard-history-filters.tsx) | `filters.driverId` (filtro historial) | legacy |
| [dashboard/components/dashboard-session-detail.tsx:130](ventas/features/portal/dashboard/components/dashboard-session-detail.tsx) | `formatSpeed(replayPosition?.speed)` (dato de replay, no snapshot vivo) | selector sobre replay |

## 4. Tabla de cobertura (campo → superficies → fuente → ¿derivable? / lectura)

| Campo del snapshot | Superficies que lo leen (file:line) | Tipo | Veredicto |
|---|---|---|---|
| `unitId` | mobile checklist.utils:122/133, alerts.utils:54/58, BottomTrackingPanel:191, checklist:129; ventas store:260-264, dashboard:86 | id | **Obligatorio** |
| `label` | mobile checklist.utils:134, BottomTrackingPanel:439 | derivado | **Obligatorio** |
| `plates` | mobile BottomTrackingPanel:52,244 | crudo | **Obligatorio** |
| `status` (OperationalUnitStatus) | **solo mobile** BottomTrackingPanel:227,229; ventas operations-map/route-unit leen `vehicle.status` legacy, no `unit.status` | crudo (input de `operationalState`) | **Obligatorio (mobile)** — pero ver §5.1 |
| `operationalState` | **solo mobile** BottomTrackingPanel:209/225, MapCanvas:176, checklist.utils:127; **ventas NO lo lee** | derivado | **Obligatorio (mobile)** — divergencia §5.1 |
| `gps.lat/lng` | mobile alerts.utils:56/62; ventas dashboard:176-178 | crudo | **Obligatorio** |
| `gps.speedKmh` | mobile BottomTrackingPanel:211; ventas dashboard:180 | derivado (ya km/h) | **Obligatorio** |
| `gps.heading` | ventas dashboard:181 | crudo | **Obligatorio** |
| `gps.recordedAt` | mobile alerts.utils:61; ventas dashboard:179 | crudo | **Obligatorio** |
| `gps.freshness` | mobile alerts.utils:55/60, MapCanvas:178/208, BottomTrackingPanel:210; ventas dashboard:183-184 | derivado | **Obligatorio** |
| `gps.ageSeconds` | selector `formatFreshness` (BottomTrackingPanel:210, MapCanvas:208) | derivado de `recordedAt` | **Obligatorio** (vía selector) |
| `driver.id` | ventas dashboard:189, :91 | crudo | **Obligatorio** |
| `driver.name` | mobile driverLabel (checklist.utils:135, checklist:140); ventas dashboard:190 | crudo | **Obligatorio** |
| `driver.source` | **nadie** (grep vacío) | — | **Candidato a eliminar** |
| `route.name` | mobile routeLabel (checklist.utils:136) | crudo | **Obligatorio** |
| `route.etaAt` | mobile checklist.utils:140, BottomTrackingPanel:263; ventas dashboard:196 | derivado | **Obligatorio** |
| `route.remainingTimeSeconds` | ventas dashboard:191/193 | derivado | **Obligatorio** |
| `route.progressRatio` | ventas dashboard:197/199 | derivado | **Obligatorio** |
| `route.id` | **nadie** (grep vacío) | — | **Candidato a eliminar** |
| `route.startedAt` | **nadie** | — | **Candidato a eliminar** |
| `route.deviationMeters` | **nadie** | — | **Candidato a eliminar** |
| `route.currentCheckpoint` | **nadie** (los matches de `currentCheckpointIndex` son otro campo, del tracker) | — | **Candidato a eliminar** |
| `session` (id/startedAt/elapsedSeconds) | **nadie** (mobile usa `activeRouteSession`/`sessionHistory` de otra fuente) | — | **Candidato a eliminar** |
| `incidents` (open/inProgress/lastAt) | **nadie** directo (solo los selectores `criticalityRank`/`summarizeFleet`, que están **sin usar**) | — | **Candidato a eliminar** |
| `lastEventAt` | ventas dashboard:185 (gpsFreshness.evaluatedAt) | derivado | **Obligatorio** |
| `visibility` | **nadie** (grep vacío) | — | **Candidato a eliminar** |

**Selectores definidos pero SIN USAR** (API muerta, verificado por ausencia): `criticalityRank`, `sortByCriticality`, `summarizeFleet` ([selectors.ts:103-140](shared/operational-contract/selectors.ts)). Son los únicos lectores de `incidents` → refuerza que `incidents` es eliminable.

**Conjunto mínimo que se deduce:** obligatorios = `unitId, label, plates, status, operationalState, gps{lat,lng,speedKmh,heading,recordedAt,freshness,ageSeconds}, driver{id,name}, route{name,etaAt,remainingTimeSeconds,progressRatio}, lastEventAt`. Candidatos a eliminar (nadie lee) = `driver.source, route{id,startedAt,deviationMeters,currentCheckpoint}, session, incidents, visibility`.

## 5. Divergencias de forma (los puntos de drift reales)

**5.1 `operationalState` — la divergencia mayor.** Mobile **lee** el `operationalState` derivado del snapshot ([BottomTrackingPanel:209/225](mobile/src/screens/map/components/BottomTrackingPanel.tsx), [MapCanvas:176](mobile/src/screens/map/components/MapCanvas.tsx)). **Portal lo ignora** y deriva estado por su cuenta con un blend:
- `activeSession.status === 'RUNNING'/'PAUSED'` ([dashboard.utils.ts:35-36](ventas/features/portal/dashboard/dashboard.utils.ts))
- `vehicle.status === 'maintenance'` (:37)
- **`vehicle.driverId` → "Asignada"** (:38) ← infiere asignación de `driverId != null`
- **`vehicle.assignedRoute` → "En jornada"** ([route-unit-selector:42](ventas/features/portal/routes/components/route-unit-selector.tsx))
- **`vehicle.speed <= 0.8` → stopped** ([portal-dashboard-screen:196,204](ventas/features/portal/screens/portal-dashboard-screen.tsx))

Es exactamente el patrón que describiste: el mismo estado que un lado toma de `operationalState` y el otro infiere de `driverId != null` / `assignedRoute` / umbral de velocidad.

**5.2 `driver` — tres fuentes.** Snapshot resuelve `driver{id,name,source}` (única). Pero mobile [active-route.ts:239](mobile/src/utils/active-route.ts) lee `vehicle.driverId`+`vehicle.driverName` crudos; ventas [dashboard.utils.ts:91](ventas/features/portal/dashboard/dashboard.utils.ts) usa fallback de 3 (`activeSession.driverId || vehicle.driverId || vehicle.driver?.id`). El id de chofer tiene 3+ orígenes según superficie.

**5.3 `status` crudo vs derivado — dentro de mobile.** [checklist.utils.ts:101](mobile/src/screens/checklist/checklist.utils.ts) mezcla `unit.operationalState` con `vehicle.status` crudo (`getVehicleOperationalStatus`); [BottomTrackingPanel:227](mobile/src/screens/map/components/BottomTrackingPanel.tsx) usa `unit.status`/`operationalState` canónico. Dos caminos de estado coexisten en mobile.

**5.4 Frescura GPS — dos derivaciones.** Mobile usa `formatFreshness(unit.gps)` (selector sobre `gps.freshness` derivado). Ventas re-deriva con `getGpsState(vehicle)` ([dashboard.utils.ts:204](ventas/features/portal/dashboard/dashboard.utils.ts)) desde `vehicle.location/locationTimestamp` + `isVehicleGpsFresh`, aunque `applyOperationalSnapshot` ya trajo `gps.freshness`.

**5.5 Dirección del merge — estructural.** Mobile mantiene `operationalUnits` (snapshot) y `mapData.vehicles` (legacy) **en paralelo**, y las cruza por id ([map-screen:510](mobile/src/screens/map-screen.native.tsx), [checklist:370](mobile/src/screens/checklist-screen.tsx)). Ventas **fusiona el snapshot dentro del Vehicle** ([applyOperationalSnapshot](ventas/features/portal/dashboard/dashboard.utils.ts):172) y después lee el Vehicle fusionado — pero como no fusiona `status`/`operationalState`, esos quedan legacy. Dos modelos distintos de relación entre los dos mundos.

**5.6 `user.vehicleId` ↔ `vehicle.driverId` — asignación de doble escritura.** Escritos por separado en backend (mongo-store [:1760](backend/src/data/mongo-store.js) user.vehicleId; [:663/708/1856](backend/src/data/mongo-store.js) vehicle.driverId). Consumidos independientemente: mobile [map-screen:510](mobile/src/screens/map-screen.native.tsx) usa `user.vehicleId`→unidad; [alerts.utils:54](mobile/src/screens/alerts/utils/alerts.utils.ts) `user.vehicleId`→`unitId`; ventas [dashboard.utils:83](ventas/features/portal/dashboard/dashboard.utils.ts) `user.vehicleId === vehicle.id`. Nadie cruza las dos escrituras contra una fuente única.

## 6. Validación

- Cero cambios de código. typecheck mobile **exit 0** (árbol real compila). ventas: script `typecheck` disponible (no ejecutado en esta fase por ser el árbol portal aparte; todos los hallazgos ventas son sobre archivos que compila `vite build`).
- Todo hallazgo con archivo+línea (§1-§5).

## 7. Qué queda para el siguiente RC (no ejecutado aquí)

Con §4 (cobertura) y §5 (divergencias) tienes el mapa para definir el contrato mínimo. Lo que NO hice, por instrucción: no creé/toqué contrato ni campos, no propuse migración. El siguiente RC define el mínimo y decide qué eliminar (§4 candidatos) y qué divergencia matar primero (§5.1 `operationalState` en portal es la de mayor impacto).
