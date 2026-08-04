# RC-MULTI-ROUTE-DRIVER-01 — F3 + F3.1: Motor de activación atómica de asignaciones ruta-vehículo

> **Estado:** F3 implementada (etapas 1→10) + **F3.1 validación/corrección** completada. **STOP para revisión.** Rama `rc-multi-route-driver-01-f3` sobre base `5ee7f07`. **Sin push / merge / PR / tags.** Suite backend completa **verde**. Validación Mongo real (replica set no productivo) **PASÓ**.
>
> **Veredicto: F3_READY.**

---

## 0. Resumen ejecutivo
F3 introduce `activateVehicleRouteAssignment`, **escritor único del subsistema nuevo `VehicleRouteAssignment`** (estado `ACTIVE` + proyección `Vehicle.routeId`/`Vehicle.assignedRoute` derivada de ese subsistema). La decisión vive en un **planificador puro** compartido por el motor embedded y el Mongo. F3.1 añadió: (a) corrección de la afirmación de escritor único, (b) pruebas del adaptador Mongo con dobles, (c) una **validación real contra un replica set no productivo**, y (d) precisión sobre mobile.

## 1. Autoría — escritor único (PRECISIÓN F3.1 §1)
**No** es un escritor único *global* de `routeId`/`assignedRoute`. El contrato real:
- `activateVehicleRouteAssignment` es el **único escritor del subsistema nuevo `VehicleRouteAssignment`** (y de la proyección del vehículo cuando la activación la origina).
- `assignRouteToVehicle` es una **excepción legacy temporal y documentada** (endpoint `/navigation/assign`); conserva su comportamiento actual (incluido el cambio de ruta y el modo manual sin `Route`).
- El **cutover global** (que `assignRouteToVehicle` deje de escribir directo y pase por el motor) queda como **gate obligatorio de F6**, junto con la semántica de switch.

`updateVehicle` (ambos stores) usa una allow-list estricta (`code/plate/status/currentKilometers`) que por construcción **excluye** `routeId/assignedRoute/activeRouteProgress` — invariante documentada.

## 2. Decisiones previas (gates)
1. **Eventos (§20) — aprobado:** el store no tiene bus; el motor **devuelve** el payload sanitizado `route-assignment:updated` (solo en `ACTIVATED`/`RECONCILED`) y la **emisión física es F4**.
2. **Escritor legado (§17) — diferido a F6:** adaptarlo ahora regresaría la re-asignación de `/navigation/assign` (switch = F6/F7).

## 3. Contrato del motor `activateVehicleRouteAssignment(params)`
**Params:** `{ organizationId, vehicleId, assignmentId, actor, actorId, source, reason, expectedActiveAssignmentId?, expectedActivationVersion?, withinOperationalSchedule?, now? }`.
**Resultado:** `{ outcome, reason, applied, assignment, vehicle, event }`.

| Outcome | Cuándo | Escribe | Evento |
|---|---|---|---|
| `ACTIVATED` | target AVAILABLE/SCHEDULED activable, sin otra ACTIVE | asignación→ACTIVE (`activatedAt`, `++activationVersion`, captura `routeRevision`) + proyección Vehicle | sí |
| `IDEMPOTENT` | target ya ACTIVE y proyectado | nada | no |
| `RECONCILED` | target ACTIVE pero proyección del Vehicle drifteada | **únicamente Vehicle** (re-proyecta); la asignación NO se toca | sí |
| `CONFLICT` | precondición/CAS/sesión/carrera | nada | no |

**Corrección F3.1 (RECONCILED):** en la implementación original (etapa 5) RECONCILED también reescribía `routeRevision` en la asignación ante drift de revisión. Se **corrigió** para cumplir el contrato "RECONCILED modifica únicamente Vehicle": ahora RECONCILED se dispara **solo por drift de proyección** y re-proyecta **solo el Vehicle**; `routeRevision` se captura **una sola vez al ACTIVAR** (representa la revisión activada, no "la última vista"). Editar una ruta ya no reconcilia (updateRoute ya re-proyecta el vehículo) → esas llamadas devuelven `IDEMPOTENT`.

**Razones de conflicto:** `not_found`, `expired`, `invalid_status`, `no_route`, `out_of_window`, `already_active`, `admin_locked`, `outside_schedule`, `active_route_session`, `active_assignment_conflict`, `activation_version_conflict`, `route_projection_failed`, `vehicle_not_found`, `transaction_unavailable`.

**Una sola ACTIVE por unidad:** (a) planificador rechaza `already_active`; (b) CAS por `activationVersion`; (c) índice único parcial `{org,vehicle} where status=ACTIVE` (E11000→`already_active`).

## 4. `Route.revision` (§9) y migración (§10)
Rutas nuevas = `1`; `0` = legado no migrado. Incrementa solo en cambio operativo (geometría/paradas/distancia/duraciones), no cosmético. Migración `scripts/migrate-route-revision.js`: dry-run por defecto, `--apply` para escribir, idempotente, no corre al boot. **No ejecutada contra producción.**

## 5. Refactor de testabilidad (F3.1)
La orquestación transaccional Mongo se extrajo a `src/data/mongo-activation.js` con **inyección de dependencias** (modelos + builder de proyección). El store real delega ahí; el comportamiento es idéntico (suite completa verde antes y después). Esto permite validar el contrato de integración con dobles sin un `mongod`.

## 6. Validación — pruebas Mongo SIMULADAS (F3.1 §2)
`test/mongo-activation.test.js` (en `npm test`, con **dobles controlados** — **no** prueba Mongo real). Demuestra el contrato de integración transaccional:
- `startSession` requerido; `withTransaction` ejecutado; `endSession` en `finally`.
- **misma `session`** en todas las lecturas/escrituras; **ninguna** operación fuera de la tx.
- lectura de la ACTIVE actual (CAS de `activeAssignment`) y CAS por `activationVersion` + captura de `routeRevision` **dentro de la tx**.
- `IDEMPOTENT` no ejecuta ninguna escritura; `RECONCILED` escribe **solo** el Vehicle (0 escrituras a la asignación).
- error intermedio (no E11000/no tx) **se propaga** (aborta, sin resultado exitoso); `E11000`→`already_active`; `transaction_unavailable` **falla cerrado** (en `startSession` y en `withTransaction`).
- conflicto **no** devuelve descriptor de evento y no escribe.

## 7. Validación — prueba Mongo REAL no productiva (F3.1 §3)
`test/mongo-activation-replset.test.js` (script `npm run test:mongo-replset`).

- **Ambiente:** `mongodb-memory-server` → **replica set efímero** en `127.0.0.1` (loopback), DB `f31_replset_validation`. **NO productivo.** El test **nunca** lee `MONGO_URI` del entorno; levanta su propio replica set efímero y aborta si el host no es loopback.
- **Evidencia de NO-producción:** el propio test asevera `host ∈ {127.0.0.1, localhost}`; el `MONGO_URI` del `.env` (clúster real) **no se usó** en ningún momento.
- **Comando:** `npm install --no-save --ignore-scripts mongodb-memory-server && npm run test:mongo-replset` (el binario de MongoDB 8.2.6 se descarga a un caché local la primera vez).
- **Exit code:** `0`. Salida: `F3_MONGO_REAL=PASSED`.
- **Casos reales ejecutados y verdes:**
  1. primera activación (`ACTIVATED`);
  2/7. conflicto controlado al activar una segunda con otra ya ACTIVE (`already_active`, sin escribir);
  3. **rollback atómico dentro de la transacción** (se fuerza un error en la proyección del Vehicle tras escribir la asignación → la tx aborta → la asignación sigue `AVAILABLE` y el Vehicle sin `routeId`: nada persiste);
  4. dos activaciones **concurrentes** (`Promise.all`) → exactamente una `ACTIVATED`, la otra `CONFLICT`;
  5. **una sola** `Assignment` `ACTIVE` por unidad (count en DB = 1);
  6. `Vehicle.routeId` y `assignedRoute` consistentes con la ruta activada;
  8. idempotencia (`IDEMPOTENT`, `activationVersion` estable).
- **Datos creados y limpieza:** org `F31-REPLSET-ORG`, unidades `f31-veh-1..3`, rutas `f31-route-1/2`, asignaciones asociadas. **Limpieza:** `dropDatabase()` + `replicaSet.stop()` en `finally` → `CLEANUP dropDatabase=true replicaSetStopped=true`.
- **Limitaciones:** un solo nodo de replica set (suficiente para transacciones/CAS/E11000; no cubre failover multi-nodo). `mongodb-memory-server` **no** se añadió a `package.json` (evita sumar una devDependency con vulnerabilidad reportada al lockfile de un app productiva); el script **SKIPea limpio** (exit 0, `F3_MONGO_REAL=SKIPPED`) si el paquete no está instalado, sin inventar resultados.

## 8. Validación — resto
- **Backend `npm test`: verde (EXIT=0)** — incluye `route-revision`, `vehicle-route-assignment-store`, `vehicle-route-assignment-activation` (planner + motor embedded) y `mongo-activation` (dobles).
- **Ventas `tsc --noEmit`: verde.**
- **Mobile (PRECISIÓN F3.1 §4):** *Mobile no fue ejecutado porque F3 no modificó `mobile/` ni `shared/`. No se detectó impacto estático, pero no se realizó validación mobile en esta fase.* (No bloquea F3.)

## 9. Alcance y restricciones respetadas
Sin push / merge / PR / tags / `--force`. Commits **locales** en `rc-multi-route-driver-01-f3`. No se tocó password-recovery / Cloudflare / Documentos / Fleet / Email / Radio / Webhooks / Gradle / APK. Logs sanitizados (whitelist; nunca tokens/coordenadas/geometrías/secrets/emails). Producción **no** utilizada en ninguna validación.

## 10. Diferido (fuera de F3)
- **F4:** API admin + emisión física de `route-assignment:updated`.
- **F5:** API driver.
- **F6:** cutover del escritor legado `assignRouteToVehicle` + switch sin jornada.
- **F7:** switch durante jornada.
- Migración `Route.revision` contra producción (a tu criterio).

---

**STOP para revisión — Veredicto: F3_READY.** Motor completo (embedded + Mongo), idempotente, reconciliador (vehicle-only), con `Route.revision` + migración; contrato de integración Mongo verificado con dobles y **validado contra un replica set real no productivo** (8 casos verdes, limpieza confirmada, sin producción). ¿Apruebas F3_READY y desbloqueas F4?
