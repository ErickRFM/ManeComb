# RC-MULTI-ROUTE-DRIVER-01 — FASE 1: Auditoría (read-only, cero código)

> **Gate:** cierra la matriz + tu aprobación antes de F2. No se modificó nada, no hay commit.
> **Hallazgo central:** todo el sistema deriva el estado de ruta de **`Vehicle.assignedRoute` (una sola, embebida)**. Si F3 mantiene esa proyección como "la ruta ACTIVE", **toda la cadena aguas abajo sigue funcionando sin tocarse**. Ese es el punto de compatibilidad.

---

## 1. Flujo actual completo (con archivo+línea de lo verificado)

```
Route (saved)  ──POST /navigation/assign──>  Vehicle.routeId + Vehicle.assignedRoute  ──>  OperationalUnitSnapshot  ──socket/REST──>  Mobile (normalizeAssignedRoute → ActiveRouteSnapshot → progress/ETA/checkpoints)  ──>  RouteSession
```

1. **Asignar** — `POST /navigation/assign` ([navigation/routes.js ~:600-649](backend/src/modules/navigation/routes.js)):
   - **:621 bloquea si hay `getActiveRouteSession(vehicleId)`** → *"Finaliza la jornada activa antes de cambiar la ruta"* (409). ← supuesto una-sola-ruta + no-cambio-en-jornada.
   - :644 `store.assignRouteToVehicle({ vehicleId, routeId, assignment, assignedBy })` (sobrescribe).
2. **Persistencia/proyección** — `store.assignRouteToVehicle` → `vehicleRouteViewFromAssignment(vehicle)` ([store.js:212-244](backend/src/data/store.js)): construye `{ routeId, assignedRoute, route, routeName }` desde **`vehicle.assignedRoute` único** (gated por `hasActiveAssignedRoute`, :213). `assignedRouteFromSavedRoute` (:180) arma la proyección desde el `Route`. (Espejo en [mongo-store.js](backend/src/data/mongo-store.js), 25 usos.)
3. **Modelo** — [models.js](backend/src/data/models.js): `Vehicle.routeId: String|null` (:286), **`Vehicle.assignedRoute: assignedRouteSchema|null` (:307, embebido único)**, `activeRouteProgress: Mixed` (:306); `assignedRouteSchema` (:55-…) = proyección (routeId/name/code/color + route geometry + origin/dest/stops + assignedAt/assignedBy). Índices `{org,status,updatedAt}`, `{org,routeId}` (:315-316).
4. **Snapshot** — `buildRoute({vehicle,route,activeSession,progress})` ([operational-unit-snapshot.js:174-247](backend/src/domain/operational-unit-snapshot.js)): `assignedRoute = vehicle.assignedRoute` (:175); routeId = assignedRoute.routeId → vehicle.routeId → route.id → session.routeId (:180-184). Todo el bloque `route` del snapshot sale de esa **única** asignación.
5. **ETA/checkpoints/progress** — `calculateVehicleRouteProgress` ([route-progress.js:162-208](backend/src/services/route-progress.js)): `assignedRoute = vehicle.assignedRoute` (:163) → `route.polyline` → checkpoints/progressPercent/currentCheckpointIndex. **Sin `assignedRoute` → return null (:170) → sin ETA/checkpoints.**
6. **Mobile** — `normalizeAssignedRoute(vehicle.assignedRoute)` ([navigation-data.ts](mobile/src/utils/navigation-data.ts)) → `buildActiveRouteSnapshot` ([active-route.ts:206-247](mobile/src/utils/active-route.ts)): `assignedRoute` (:206) → sin ella return null (:208); `route = assignedRoute.route` (:212) → progress/ETA/checkpoints (:213-217); `ActiveRouteSnapshot.id = ${vehicle.id}:${assignedRoute.assignedAt}` (:242).
7. **RouteSession** — al iniciar jornada ([navigation/routes.js:753-768](backend/src/modules/navigation/routes.js)): `routeId = vehicle.routeId || 'assigned:{id}:{assignedAt}' || 'recording:{id}'` (:755-757); `assignedBy = vehicle.assignedRoute?.assignedBy` (:765). La sesión **hereda la ruta única** del vehículo.

---

## 2. Matriz `Etapa | Fuente actual | Dependencia de una-sola-ruta | Cambio requerido`

| Etapa | Fuente actual (archivo:línea) | Dependencia de una-sola-ruta | Cambio requerido |
|---|---|---|---|
| Asignar ruta | `POST /navigation/assign` (navigation/routes.js:600-649) | Sobrescribe `assignedRoute`; **bloquea en jornada activa** (:621) | F4/F6/F7: crear asignación como **entidad** sin sobrescribir; activar vía F3 |
| Persistir/proyectar | `store.assignRouteToVehicle` / `vehicleRouteViewFromAssignment` (store.js:212-244) + mongo-store.js | Proyecta desde `vehicle.assignedRoute` único | F3: `activateVehicleRouteAssignment` es **el único** que escribe esta proyección (de la ACTIVE) |
| Modelo vehículo | `Vehicle.assignedRoute` embebido único (models.js:307) | Un solo objeto | **Se conserva** como proyección de la ACTIVE (NO se vuelve array). Nueva colección `VehicleRouteAssignment` (F2) |
| Snapshot | `buildRoute` (operational-unit-snapshot.js:174-247) | Lee `vehicle.assignedRoute` | **Ninguno** si F3 mantiene la proyección de la ACTIVE ahí |
| ETA/checkpoints/progress | `calculateVehicleRouteProgress` (route-progress.js:162-208) | `vehicle.assignedRoute.route.polyline` | **Ninguno** (mismo contrato). Riesgo: cambio de ruta a media sesión mezcla polyline → F7 |
| Contrato compartido | `shared/operational-contract` (OperationalUnitSnapshot.route) | Un `route` por unidad | **Ninguno** en la forma; opcional exponer `availableAssignmentIds` (F12) |
| Serialización API | `serializers.js` (6 usos) | Serializa `assignedRoute` único | **Ninguno** (sigue serializando la ACTIVE); + endpoints nuevos (F4/F5) |
| Mobile store/consumo | root-store.ts, use-app-store.ts, navigation-data.ts, active-route.ts | `vehicle.assignedRoute` único | **Ninguno** en el consumo de la ACTIVE; + "Mis rutas" (F9) lee la nueva lista |
| Mobile mapa | map-screen.native.tsx (6), MapCanvas/route-preview | Dibuja `assignedRoute.route.polyline` | F9/F10: preview de otra ruta **sin** tocar `assignedRoute` hasta activar |
| Portal | portal-routes-screen.tsx (7), route-assigned-panel.tsx (6), dashboard.utils.ts (10), operations-map.tsx | Muestra la ruta única | F8: listar activa/disponibles/programadas + acciones |
| RouteSession | creación (navigation/routes.js:753-768) | `routeId` del vehículo único | F7: cambio en jornada = cerrar sesión (`route_switched`) + activar nueva; NO sobrescribir sesión viva |
| Rutas aprendidas | route-event-engine.js, auto-route-learning | Ruta oficial única | F11: `COLLECTING`/`READY_FOR_REVIEW` NO asignable |

---

## 3. Consumidores de `Vehicle.assignedRoute` (lista exacta — el punto de compatibilidad)

**Backend (`backend/src/`):** `data/models.js` (schema), `data/store.js` (24 — write/proyección), `data/mongo-store.js` (25 — espejo mongo), `data/serializers.js` (6 — API out), `data/seedData.js`, `domain/operational-unit-snapshot.js` (4 — snapshot), `services/route-progress.js` (3 — ETA/checkpoints), `services/route-event-engine.js` (1 — aprendizaje), `services/operational-units-service.js` (2), `modules/navigation/routes.js` (3 — assign/session), `modules/vehicles/routes.js` (1), `modules/incidents/routes.js`, `data/repositories/tracking-repository.js`.

**Mobile (`mobile/src/`):** `types/app.ts` (tipo), `utils/navigation-data.ts` (normalize), `utils/active-route.ts` (15 — ActiveRouteSnapshot), `hooks/use-point-to-point-tracker.ts`, `screens/map-screen.native.tsx` (6 — línea de ruta), `screens/checklist-screen.tsx` (6), `screens/checklist/checklist.utils.ts` (12), `screens/users-screen.tsx`.

**Ventas/portal:** `src/types/app.ts`, `features/portal/screens/portal-routes-screen.tsx` (7), `.../portal-units-screen.tsx`, `.../portal-dashboard-screen.tsx`, `features/portal/routes/routes.utils.ts` (4), `features/portal/routes/components/route-assigned-panel.tsx` (6), `features/portal/dashboard/dashboard.utils.ts` (10), `features/portal/units/components/portal-units-list.tsx` (2).

> **Todos leen la ACTIVE.** Ninguno itera "todas las rutas de la unidad". Por eso **conservar `vehicle.assignedRoute` como la proyección de la ACTIVE** (no volverlo array) deja a los ~30 consumidores intactos — la clave del plan.

---

## 4. Dónde se rompe si `assignedRoute` cambia de fuente (verificado)

| Se rompe | Por qué | Mitigación |
|---|---|---|
| **Snapshot** | `buildRoute:175` lee `vehicle.assignedRoute`; si no se actualiza al activar, publica la ruta vieja → **entidad dice X, vehículo publica Y** | F3 escribe `routeId`+`assignedRoute`+snapshot en **una** operación (garantía dura) |
| **ETA/checkpoints/progress** | `route-progress.js:170` return null sin `assignedRoute`; polyline distinta → progreso incoherente | F3 proyecta la ACTIVE; **F7** prohíbe cambiar la ruta de una sesión viva (cerrar+reabrir) |
| **Replay/historial** | `RouteSession.routeId` se fija al iniciar (:755) desde el vehículo; si cambia a media sesión, el replay mezcla 2 rutas | F7: cerrar sesión con `route_switched`, NO reutilizarla; **no mezclar posiciones** |
| **Mobile ActiveRouteSnapshot** | `active-route.ts:242` id = `${vehicle.id}:${assignedRoute.assignedAt}`; cambio de `assignedAt` re-crea el snapshot | OK si el cambio es una activación explícita (nuevo `assignedAt`) |
| **Drift entidad↔vehículo** | dos escrituras separadas (entidad y `assignedRoute`) | F3 es el **único dueño**; nunca escribir `assignedRoute` fuera de F3 |

---

## 5. Lista exacta de archivos a tocar por fase

- **F2 (entidad):** `backend/src/data/models.js` (+`VehicleRouteAssignment` schema+índices), `backend/src/data/store.js` + `mongo-store.js` (CRUD de la entidad), `backend/src/data/serializers.js` (serializar entidad). *(NO tocar `Vehicle.assignedRoute`.)*
- **F3 (compatibilidad):** `backend/src/domain/` (nuevo `activateVehicleRouteAssignment`) o `services/`, `store.js`+`mongo-store.js` (escritura atómica routeId+assignedRoute+snapshot), `operational-unit-snapshot.js` (consumir sin cambiar forma).
- **F4 (API admin):** `backend/src/modules/navigation/routes.js` (rutas nuevas), guards existentes (`requireOperationalAccess`, `canManageRoutes`).
- **F5 (API conductor):** `backend/src/modules/navigation/routes.js` (`/my-route-assignments`, `/:id/activate`), sesión autenticada (NO body `vehicleId`).
- **F6 (cambio sin jornada):** `store.js`/`mongo-store.js` + `services/` (transición atómica idempotente), socket emit.
- **F7 (cambio en jornada):** `store.js`/`mongo-store.js` (transacción), `services/route-progress.js` (no mezclar), `modules/navigation/routes.js` (cierre sesión `route_switched`), `route-event-engine.js` (aprendizaje).
- **F8 (portal):** `ventas/features/portal/screens/portal-routes-screen.tsx`, `routes/components/route-assigned-panel.tsx`, `components/operations-map.tsx`, `src/store/use-app-store.ts`, `src/api/*`.
- **F9 (app conductor):** `mobile/src/screens/map-screen.native.tsx`, `screens/checklist-screen.tsx`, `screens/map/components/*`, `src/store/root-store.ts`, `src/api/client.ts`, `utils/active-route.ts`/`navigation-data.ts` (solo lectura de la lista nueva).
- **F10 (mapbox):** `mobile/src/screens/map/components/MapCanvas.tsx`, `SelectorRouteOverlay.tsx`, `route-preview.tsx`, `hooks/use-map-selector.ts`.
- **F11 (aprendidas):** `backend/src/services/route-event-engine.js`, `auto-route-learning`, guard en F4/F5.
- **F12 (realtime):** `backend/src/sockets/index.js` (emit `route-assignment:updated`), `mobile/src/store/root-store.ts` + `ventas` (reconciliación monotónica REST/socket), `shared/operational-contract` (payload sanitizado).

---

## 6. Riesgos identificados
- **ALTO (F3):** dos fuentes de verdad (entidad vs `assignedRoute`) → drift. Mitigación: F3 dueño único, escritura atómica.
- **MUY ALTO (F7):** transacción de cambio en jornada; una falla intermedia puede dejar 2 ACTIVE / sesión≠snapshot / posiciones mezcladas. Requiere transacción Mongo o transición recuperable + **certificación en DB real**.
- **MEDIO (F5):** seguridad — jamás confiar en el `vehicleId` del cliente; todo desde la sesión + `selectableByDriver` + `ADMIN_LOCKED`.
- **MEDIO (F2):** único parcial "una sola ACTIVE por unidad" — confirmar si el store embedded/mongo lo soporta; si no, garantizarlo en F3.
- **MEDIO (F10/UI):** una sola instancia Mapbox; preview no debe tocar backend; no extrapolar posición.
- **BAJO-MEDIO (F11/F12):** aprendidas no-asignables; reconciliación monotónica (REST vieja no pisa asignación más nueva).

---

## 7. Precondiciones del plan (estado — cerrar antes de F2)
- ❌ **SOCKETAUTH** re-implementado/certificado — **pendiente** (diseño aprobado en `RC-MOBILE-SOCKETAUTH-01.md`; el intento previo se perdió en el cruce de ramas; hay que rehacerlo limpio sobre `main` unificado). Es el bug funcional grave.
- ⏳ **Fixes en dispositivo** (marcador de seguimiento ya en `main` como `3b58016`, banner, portal) — **pendiente de que tú los certifiques en el APK**.
- ⏳ **Convención de ramas / worktrees limpios** — hoy `git worktree list` tiene `main` ocupado en `C:/tmp/mp-email-02b` (con trabajo de emails sin commitear) y varios temp. Conviene ordenarlo antes de F2.
- ⬜ **Rama base** `rc-multi-route-driver-01` desde `main` — crear tras las anteriores.

---

## Entregable F1 — listo
Matriz cerrada · flujo trazado con archivo+línea · ~30 consumidores de `assignedRoute` listados · puntos de ruptura (snapshot/ETA/checkpoints/replay) confirmados con mitigación · archivos por fase · riesgos. **Cero código, sin commit.**

**Mi lectura:** el plan es sólido y el punto de compatibilidad (conservar `vehicle.assignedRoute` como proyección de la ACTIVE, F3 dueño único) es correcto y minimiza el blast-radius. **Recomiendo cerrar las precondiciones (sobre todo SOCKETAUTH + orden de ramas) antes de F2**, como el propio plan exige. Espero tu aprobación de la matriz para pasar a F2 (modelo mínimo de `VehicleRouteAssignment`).
