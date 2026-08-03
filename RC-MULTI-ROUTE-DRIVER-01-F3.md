# RC-MULTI-ROUTE-DRIVER-01 — F3: Motor de activación atómica de asignaciones ruta-vehículo

> **Estado:** F3 implementada por etapas (1→10). **STOP para revisión (etapa 11).** Rama `rc-multi-route-driver-01-f3` sobre base `5ee7f07`. **Sin push / merge / PR / tags.** Suite backend completa **verde**. Diff **100% dentro de `backend/`** (mobile/ventas/shared intactos).

---

## 0. Resumen ejecutivo
F3 introduce el **escritor ÚNICO** `activateVehicleRouteAssignment`, autoridad exclusiva del estado `ACTIVE` de una asignación y de la proyección persistida del vehículo (`Vehicle.routeId` + `Vehicle.assignedRoute`). La decisión vive en un **planificador puro** compartido por ambos stores (embedded y Mongo), garantizando paridad. Se añadió `Route.revision` (versionado operativo) para detectar drift, su migración idempotente, el CRUD interno mínimo de asignaciones, e idempotencia + reconciliación. El cutover del escritor legado se **difirió a F6** (decisión del usuario) por pertenecer la semántica de switch a F6/F7.

## 1. Git gate (§3) — OK
- **Rama:** `rc-multi-route-driver-01-f3`. **SHA base:** `5ee7f07`. Un solo worktree, limpio.
- Baseline backend **verde** sobre `5ee7f07` (tras `npm install` de deps ya integradas).

## 2. Decisiones tomadas (2 gates)
1. **Contrato de eventos (§20) — aprobado:** el store no tiene bus de eventos (los eventos se emiten en la capa de módulo con `req`/`io`, p.ej. `emitToRouteAudience`). Por eso el motor **devuelve** el payload sanitizado `route-assignment:updated` (solo en `ACTIVATED`/`RECONCILED`) y **la emisión física queda en F4**. No se inventó un bus en el store.
2. **Escritor legado (§17) — diferido a F6 (decisión del usuario):** adaptar `assignRouteToVehicle` al motor **ahora** regresaría la re-asignación del endpoint vivo `POST /navigation/assign` (el motor bloquea `already_active` porque el **switch** de ruta es F6/F7). Además el modo manual del endpoint no tiene entidad `Route`. Se conserva `assignRouteToVehicle` como escritor legado documentado; el motor es escritor único del **flujo nuevo** (APIs F4/F5).

## 3. Autoría (§17) — escritor único
`activateVehicleRouteAssignment` es el único escritor de: estado `ACTIVE` de la asignación, `Vehicle.routeId`, `Vehicle.assignedRoute`. **Snapshot operacional = DERIVADO** (no persistido): `OperationalUnitSnapshot` se computa on-read desde `vehicle.assignedRoute` (`domain/operational-unit-snapshot.js`), así que basta re-proyectar el vehículo. `updateVehicle` (ambos stores) usa una **allow-list estricta** (`code/plate/status/currentKilometers`) que por construcción excluye `routeId/assignedRoute/activeRouteProgress` — invariante documentada.

## 4. Etapas implementadas

| # | Etapa | Entregable | Commit |
|---|---|---|---|
| 2 | `Route.revision` + migración | `models.js` (revision default 1, min 0); `domain/route-revision.js` (fingerprint operativo estable); increment en `updateRoute` solo por cambio operativo; `scripts/migrate-route-revision.js` (idempotente, dry-run) | `a4271d7` |
| 3 | CRUD interno mínimo | `create/getById/list` de asignaciones (filtro org+vehículo+status) en ambos stores | `b2103cf` |
| 4 | Motor embedded | `domain/vehicle-route-assignment-activation.js` (planificador puro) + motor embedded con mutex por (org\|vehículo) y rollback recuperable | `e64cdbd` |
| 5 | Motor Mongo | `withTransaction`, CAS por `activationVersion` dentro de la tx, E11000→`already_active`, fail-closed (`transaction_unavailable`) | `a7ef07d` |
| 6 | Legado + invariante | `assignRouteToVehicle` marcado legado (cutover F6); invariante `updateVehicle` documentada | `871c7f1` |
| 7-8 | Idempotencia/reconciliación + eventos | Contrato blindado con pruebas (identidad de activación estable; evento solo en ACTIVATED/RECONCILED) | `66492f2` |

## 5. Contrato del motor `activateVehicleRouteAssignment(params)`
**Params:** `{ organizationId, vehicleId, assignmentId, actor, actorId, source, reason, expectedActiveAssignmentId?, expectedActivationVersion?, withinOperationalSchedule?, now? }`.
**Resultado:** `{ outcome, reason, applied, assignment, vehicle, event }`.

| Outcome | Cuándo | Escribe | Evento |
|---|---|---|---|
| `ACTIVATED` | target AVAILABLE/SCHEDULED activable, sin otra ACTIVE | asignación→ACTIVE (`activatedAt`, `++activationVersion`, captura `routeRevision`) + proyección vehículo | sí |
| `IDEMPOTENT` | target ya ACTIVE, proyectado y revisión vigente | nada | no |
| `RECONCILED` | target ya ACTIVE pero proyección drifteada o `routeRevision` viejo | re-proyecta + refresca `routeRevision` (identidad estable) | sí |
| `CONFLICT` | precondición/CAS/sesión/carrera | nada | no |

**Razones de conflicto:** `not_found`, `expired`, `invalid_status`, `no_route`, `out_of_window`, `already_active` (otra ACTIVE — switch es F6/F7), `admin_locked` (driver sobre `selectableByDriver=false`), `outside_schedule`, `active_route_session` (jornada en otra ruta), `active_assignment_conflict` (CAS ACTIVE esperada), `activation_version_conflict` (CAS versión), `route_projection_failed`, `vehicle_not_found`, `transaction_unavailable` (Mongo sin replica set → fail-closed).

**Defensas de "una sola ACTIVE por unidad":** (a) planificador rechaza `already_active`; (b) CAS por `activationVersion`; (c) índice único parcial `{org,vehicle} where status=ACTIVE` como defensa final (E11000→`already_active`).

## 6. `Route.revision` (§9) y migración (§10)
- Rutas nuevas nacen en `1`. `0` = legado no migrado (no decide drift por sí solo).
- Incrementa **solo** en cambio operativo: `origin/destination/originLabel/destinationLabel/stops/polyline/distanceMeters/durationSeconds/durationInTrafficSeconds`. `name/code/color` **no**. Comparación por fingerprint estable (redondeo 1e-6, ignora orden de claves y `_id` de subdocs).
- **Migración** `scripts/migrate-route-revision.js`: dry-run por defecto (`--apply` para escribir), no corre al boot, lleva legado→1, idempotente, verifica que no queden pendientes. Script npm `migrate:route-revision`. **No ejecutada contra producción** (queda a tu criterio).

## 7. Validación (estado REAL)
- **Backend `npm test`: verde (EXIT=0).** Incluye 3 pruebas nuevas en la cadena: `route-revision`, `vehicle-route-assignment-store`, `vehicle-route-assignment-activation` (planner puro + motor embedded: activación, idempotencia, reconciliación por revisión y por proyección, `already_active`, `active_route_session`, CAS, `admin_locked`/`not_found`/tenant, y contrato de evento).
- **Ventas `tsc --noEmit`: verde (EXIT=0)** — confirma no-contaminación (ventas no comparte código con backend).
- **Mobile:** **cero archivos tocados por F3** (diff 100% en `backend/`). Su baseline (incl. suite conocida 26/134 y `tsc`) se mantiene sin cambios por definición; no se reconstruyó `assembleRelease` porque F3 no altera código mobile.
- **Motor Mongo — límite honesto de validación:** la suite corre sobre el store **embedded** (sin `mongod`), así que la **decisión** del motor Mongo se valida vía el `planActivation` puro (probado) y el motor embedded (probado end-to-end); la parte **específica de Mongo** (transacción real, CAS en `findOneAndUpdate`, E11000→`already_active`, fail-closed) **no se ejercita contra un replica set en CI**. Está construida sobre el patrón `withTransaction` ya usado en el store (`runFleetLifecycleTransaction`). **No se afirma** que esté probada contra Mongo real.

## 8. Alcance y restricciones respetadas
- Sin push / merge / PR / tags / `--force`. Commits **locales** en `rc-multi-route-driver-01-f3`, solo tras suite verde.
- No se tocó password-recovery / Cloudflare / Documentos / Fleet / Email / Radio / Webhooks / Gradle / APK.
- Logs sanitizados: `sanitizeAuditContext` (whitelist actorId/actorRole/source/reason/assignmentId/vehicleId/routeId); **nunca** tokens/passwords/coordenadas/polylines/geometrías/snapshots/secrets/emails.

## 9. Diferido a fases posteriores (fuera de F3)
- **F4:** API admin + **emisión física** de `route-assignment:updated`.
- **F5:** API driver (auto-activación con `selectableByDriver`).
- **F6:** cutover del escritor legado `assignRouteToVehicle` + **switch sin jornada** (semántica de reemplazo de la ACTIVE previa: definir estado terminal de la asignación superada).
- **F7:** switch durante jornada activa (cierre de sesión con `route_switched`).
- Migración `Route.revision` contra producción (a tu criterio).

---

**STOP (etapa 11) — para tu revisión.** Motor de activación completo (embedded + Mongo), idempotente y reconciliador, con `Route.revision` + migración, CRUD interno y contrato de eventos listo para F4. Suite backend verde, ventas typecheck verde, mobile intacto. Sin publicar. ¿Apruebas F3 y sigo con F4 (API admin + emisión del evento)?
