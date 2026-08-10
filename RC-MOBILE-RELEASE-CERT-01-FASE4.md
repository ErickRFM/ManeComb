# RC-MOBILE-RELEASE-CERT-01 — FASE 4: Jornada / Route Session

**Estado:** auditoría de código CERRADA.
**Base:** `af46bfa840e19f39605f437f870be15786d7d630`

---

## 4.1 Cadena reconstruida

```
Intencion (Mobile)
 └─ map-screen.native::handleJourneyAction
     └─ route-session-actions::executeRouteSessionAction
         ├─ jornada canonica  -> POST /journeys/:id/transition
         └─ sesion legada     -> POST /navigation/sessions/start
                                 PATCH /navigation/sessions/:id/status

Autoridad durable (backend)
 └─ POST /navigation/sessions/start
     ├─ role === driver || canManageRoutes            (403 si no)
     ├─ getAccessibleVehicle                          (tenant)
     ├─ vehicle.driverId requerido                    (409 si falta)
     ├─ driver && vehicle.driverId !== user.id        (403)
     └─ store.createRouteSession
         ├─ getActiveRouteSession -> creationApplied:false  (idempotencia)
         ├─ activeKey = vehicleId
         └─ indice unico parcial models.js:398        (atomicidad real)

Telemetria
 └─ POST /locations/update | socket location:update
     └─ ingestVehicleLocation
         ├─ canPublishVehicleTelemetry                (F-13)
         ├─ resolveTrackingSession(requestedSessionId)
         └─ canSessionAcceptPosition                  (ventana temporal + estado)

Representacion (Mobile)
 └─ refreshAll -> getActiveRouteSessionRequest(user.vehicleId)   AUTORIDAD
 └─ socket route-session:updated                                 representacion
```

**Regla verificada:** la jornada pertenece al backend. Mobile expresa intención
(`executeRouteSessionAction`) y representa estado (`activeRouteSession`). El GPS
aporta posiciones y **no** crea jornadas: `ingestVehicleLocation` nunca llama a
`createRouteSession`; sólo resuelve una sesión ya existente.

---

## 4.2 Atención especial — ningún flujo de jornada publica GPS con token admin

Barrido completo de `/locations/update` y `location:update` en `backend/test` y
`backend/src`:

| Sitio | Actor | Veredicto |
|---|---|---|
| `test/route-sessions.test.js` | conductor de la unidad (`requestAsDriver`) | **corregido en F-13** — antes usaba token admin por conveniencia |
| `test/activation-keys.test.js` | conductor, afirmando `403` sobre unidad ajena | correcto, no depende de bypass |
| `test/vehicle-location-ingestion.test.js` | conductor propietario + casos negativos | correcto |

No queda ningún flujo ni fixture de jornada que dependa de publicar ubicación con
token administrativo.

---

## 4.3 Hallazgo F-14 — la causa real del rechazo se descartaba

**CAUSE**
`map-screen.native::handleJourneyAction` capturaba con `catch {` (sin binding) y
escribía siempre `'No fue posible actualizar la jornada.'`.

**REPRO**
Conductor pulsa *Iniciar jornada* sobre una unidad sin `driverId`: backend
responde `409 "La unidad no tiene chofer asignado"`. La UI muestra el texto
genérico. Igual con `403 "Solo el chofer asignado puede iniciar la jornada"` y con
los `409` de transición inválida: tres causas distintas, un único mensaje
indistinguible. Es el caso 30 de esta fase.

**AUTHORITY**
`getApiErrorMessage` (`src/api/client.ts`), ya usada por `documents-screen` y por
el propio store vía `getReadableErrorMessage`.

**MINIMAL FIX**
Vincular el error y pasarlo por esa autoridad, conservando el texto de respaldo.
Sin componentes nuevos, sin lógica por rol. Commit `3c5e2be`.

**REGRESSION**
`src/screens/map/journey-action-errors.test.js`. `MapScreen` no se puede renderizar
bajo Jest sin una capa de mocks de Mapbox y permisos nativos que el repositorio no
tiene, así que el invariante se fija sobre el fuente, con la misma convención que
`background-location-authority.test.js`. Se declara como evidencia más débil que
una prueba de comportamiento.

**RESULT** Corregido.

---

## 4.4 Hallazgo F-15 — realtime adoptaba la jornada de otro actor

**CAUSE**
`socket.on('route-session:updated')` escribía `activeRouteSession` con el payload
recibido, sin comprobar de quién era.

**REPRO**
`emitToRouteAudience` (`navigation/routes.js:33`) difunde el evento a las salas
`org:{orgId}:role:{rol}` de **todo rol con `canViewAnalytics`** —owner, admin,
dispatcher, supervisor, billing_manager, support, viewer— además de a
`user:{driverId}`.

Un conductor sólo recibe las suyas (`driver` tiene únicamente `canAccessRTC`).
Pero un supervisor con la app abierta recibe la jornada de **cualquier** conductor
de su organización: su `activeRouteSession` quedaba sobrescrito con la sesión
ajena y `persistOfflineSnapshot` la escribía en su caché offline. Entre refrescos
el estado oscilaba entre la sesión ajena y `null`, porque `refreshAll` lo repone
desde REST.

Superficies afectadas: `checklist-screen.tsx:82` (`syncedActiveSession`, la
pantalla que usan justamente esos roles), `map-screen.native:558-560` y
`use-location-engine.ts:330`.

**AUTHORITY**
REST ya define el alcance en `refreshAll`:
`user.vehicleId ? getActiveRouteSessionRequest(user.vehicleId) : null`.
`activeRouteSession` significa "la jornada de MI unidad".

**MINIMAL FIX**
`shouldAdoptRouteSessionUpdate`, predicado puro que replica ese alcance, aplicado
en el handler. No introduce una regla nueva: hace que realtime obedezca la que ya
existía. Commit `8c39b7f`.

**REGRESSION**
`src/store/route-session-reconciliation.test.ts`, **prueba de comportamiento**:
adopta la propia unidad; ignora otra unidad; ignora todo cuando el actor no opera
unidad (el caso admin/dispatcher/supervisor); ignora payload sin unidad.

**RESULT** Corregido.

---

## 4.5 Auditoría de los 32 casos

| # | Caso | Veredicto | Evidencia |
|---|---|---|---|
| 1 | Solo el conductor propietario inicia | **OK** | `sessions/start`: `driver && vehicle.driverId !== user.id` → 403 |
| 2 | Admin/supervisor administran, no suplantan telemetría | **OK** | iniciar exige `canManageRoutes`; `driverId` sale del vehículo, no del actor; `startedBy` audita. Publicar exige propiedad (F-13) |
| 3 | Dos jornadas RUNNING para una unidad | **OK** | `activeKey` + índice único parcial `models.js:398`; E11000 → `creationApplied:false` |
| 4 | Conductor activo en dos unidades | **OK** | `driver-journey-exclusivity.test.js:161` |
| 5 | Doble tap de iniciar | **OK** | `createRouteSession` devuelve la activa con `creationApplied:false` → 200 en vez de 201 |
| 6 | Retry tras timeout sin segunda sesión | **OK** | mismo mecanismo, atómico en Mongo |
| 7 | App cerrada/reabierta con jornada activa | **OK** | `refreshAll` repone desde `getActiveRouteSessionRequest` |
| 8 | Logout/login con jornada activa | **OK** | la sesión es durable en backend; `clearSessionState` sólo limpia estado local |
| 9 | Cambio de conductor/unidad en jornada | **OK** | `driver-journey-exclusivity.test.js:96`; `409` en `PATCH /users/:id` con jornada activa |
| 10 | Unidad desasignada con jornada viva | **OK** | mismo `409` |
| 11 | Ruta revisionada durante jornada | **OK** | `route-revision.test.js`; la sesión guarda `routeId`, la geometría llega aparte |
| 12 | Ruta eliminada con historial | **OK** | las sesiones referencian `routeId`; el historial no depende del documento de ruta |
| 13 | Pause/resume repetido o fuera de orden | **OK** | tabla `transitions` + `expectedStatus` atómico → `transitionApplied:false` |
| 14 | Finish repetido | **OK** | mismo guard; `activeKey` pasa a `null` |
| 15 | GPS tardío tras FINISHED | **OK** | `canSessionAcceptPosition` acepta PAUSED/FINISHED sólo con `requestedSessionId` y dentro de la ventana |
| 16 | GPS anterior al inicio | **OK** | `positionTime < startedAt` → rechazado |
| 17 | `requestedSessionId` de otra unidad | **OK** | `session.vehicleId !== vehicleId` → no persiste |
| 18 | `requestedSessionId` de otro tenant | **OK** | idem, más `cross_tenant_vehicle` en la ingesta |
| 19 | Jornada fuera del horario operativo | **OK** | el gate horario aplica al GPS sin `sessionId`; con jornada activa la sesión manda. Deliberado |
| 20 | Cruce de medianoche | **OK** | las sesiones usan `startedAt`/`finishedAt` ISO, sin bucket por día. `serviceDate` existe sólo para `tripLogs` |
| 21 | Reloj/zona horaria del dispositivo | **OK** | la ingesta calcula `clockSkewMs` y normaliza a `processedTimestamp` |
| 22 | Background/foreground en jornada | **OK** | `AppState 'active'` → `refreshAll`; el engine reconcilia la propiedad nativa |
| 23 | Reconnect sin duplicar | **PARCIAL** | posiciones deduplicadas por `packetId` en ambos stores. La deduplicación de **eventos** de sesión no tiene guard equivalente — ver deuda |
| 24 | Métricas calculadas una sola vez | **OK** | `statisticsReady` + `processingStatus`; recálculo sólo por endpoint explícito |
| 25 | Distancia/tiempo sin duplicate/out_of_order | **OK** | la decisión temporal descarta antes de persistir posición |
| 26 | Historial tenant-scoped | **OK** | `organizationId: canAccessAllTenants ? undefined : getOrganizationId(user)` |
| 27 | Driver ve sólo lo suyo | **OK** | `sessions/history` fuerza `vehicleId = req.user.vehicleId` para driver |
| 28 | Admin/supervisor ven lo concedido | **OK con nota** | el historial se gobierna por `requireOperationalAccess` + tenant, sin capability adicional. Mobile es **más estricto**: sólo se expone en Control (`routes.manage`). Deliberado, no defecto |
| 29 | UI no inventa estados | **REFUTADO** | ver 4.6 |
| 30 | loading/error/empty esconden 4xx/5xx | **F-14 — CORREGIDO** | §4.3 |
| 31 | Segunda autoridad de jornada en Mobile | **OK** | `executeRouteSessionAction` rechaza simular jornadas canónicas offline (`if (currentJourney) throw error`) |
| 32 | Realtime sustituyendo a REST | **F-15 — CORREGIDO** | §4.4 |

---

## 4.6 Sospechas refutadas — no se tocan

- **Caso 29, mapeo de `journeyStatus`.** El `else` del ternario en
  `map-screen.native:549-556` cae en `'running'` para cualquier estado no
  contemplado, lo que parecía inventar estado para jornadas FINISHED/CANCELLED.
  **Refutado:** `OperationalJourneyStatus` es
  `'ASSIGNED' | 'READY' | 'RUNNING' | 'PAUSED'`
  (`shared/operational-contract/types.ts:18`) y el snapshot sólo transporta la
  jornada activa. La rama sólo es alcanzable por `RUNNING`. No se modifica.
- **Sesión optimista `pending:{vehicleId}` offline.** Parecía una segunda
  autoridad de jornada en Mobile. **Refutado como bloqueante:** sólo aplica al
  camino legado y el propio código se niega a simular una jornada canónica.
  Si ese `id` llegara a viajar como `requestedSessionId`, `getRouteSessionById`
  devuelve `null` y la búsqueda por ventana temporal no puede casar con una
  sesión terminada. Se registra como deuda, no se toca.

---

## 4.7 Cierre

```
JOURNEY_CODE_CERTIFIED:     PASS
SESSION_OWNERSHIP:          PASS
SESSION_IDEMPOTENCY:        PASS
HISTORY_TENANT_ISOLATION:   PASS
REALTIME_RECONCILIATION:    PASS   (tras F-15)
```

**Gates**, sobre `8aed4ea`:

```
mobile   npx tsc --noEmit    exit 0
mobile   npx eslint .        0 errores, 32 warnings (no-void, preexistentes)
mobile   npm test            63 suites, 365 tests, PASS
backend  npm test            suite completa, exit 0 (verificada en F-13)
```

**PHYSICAL_TESTS_REQUIRED:**

- doble tap real sobre *Iniciar jornada* con red lenta de Render;
- iniciar jornada, matar la app y reabrir con la jornada viva;
- logout/login con jornada activa y verificar que sigue en backend;
- pausa/reanudación con pantalla bloqueada y "Permitir siempre" concedido;
- modo avión durante la jornada y reconexión: comprobar que no se duplican
  posiciones ni eventos;
- finalizar jornada sin red y verificar la cola de sincronización;
- jornada que cruza la medianoche real del dispositivo;
- cambio manual de reloj/zona horaria del teléfono en jornada;
- verificación en Admin/Portal de que la jornada y sus métricas aparecen una sola
  vez.

**DEBT:**

- **F-16 (nueva, no bloqueante):** los eventos de sesión no tienen deduplicación
  equivalente a `packetId`. Un reintento de `recordSessionEvent` tras reconexión
  podría duplicar un evento del historial. No se abre en esta fase: sin
  reproducción causal todavía.
- **F-17 (nueva, no bloqueante):** la sesión optimista `pending:{vehicleId}` es
  un identificador fabricado en Mobile que puede viajar como `requestedSessionId`.
  Hoy es inocuo; conviene que el flush de la cola reconcilie el id antes de
  publicar.
- Sin abrir por instrucción: **F-05, F-06, F-07, F-08**.
- En carril separado con Codex: **F-12** (token Mapbox / CI).
