# RC-MULTI-ROUTE-DRIVER-01 — F3 (etapa 1: baseline + auditoría) — STOP para confirmar contrato

> **Estado:** Etapa 1 de F3 (Git gate + baseline + auditoría §4). **Sin código de motor todavía.** STOP para confirmar **un ajuste de contrato** (eventos) descubierto en la auditoría antes de escribir el motor de activación (alto riesgo).

## Git gate (§3) — OK
- **Rama:** `rc-multi-route-driver-01-f3` (nueva).
- **SHA base F3:** `5ee7f07222d96f0ce11c3c899e07ec7d482af848`.
- `main` local == `origin/main` == `5ee7f07`. Un solo worktree (`C:\proyectos\combis-app`). Working tree limpio. No reutilicé `rc-multi-route-driver-01` ni worktrees previos.
- **Baseline:** suite backend completa **verde** sobre `5ee7f07` (tras `npm install` de deps nuevas de la integración — se agregó `bcryptjs` y otras). Ninguna prueba base falla → no dispara STOP §27.

## §4 Auditoría — escritores actuales (con archivo+línea)

### Escritores de `Vehicle.routeId` / `Vehicle.assignedRoute`
| # | Escritor | Ubicación | Rol | Decisión F3 |
|---|---|---|---|---|
| 1 | **`assignRouteToVehicle`** | mongo-store.js:3985-4041 (`$set routeId, assignedRoute` :4028-4029); store.js (espejo) | Asignación directa (el endpoint `/navigation/assign`) | **→ adaptador** hacia `createVehicleRouteAssignment` + `activateVehicleRouteAssignment` (§17) |
| 2 | `clearAssignedRouteFromVehicle` | mongo-store.js:4043 | Limpia ruta (null) | Se conserva (transición a sin-ruta); revisar que pase por la autoridad al retirar la ACTIVE |
| 3 | Propagación por edición de ruta | mongo-store.js:1099-1121 (`assignedRoute: nextAssignment`) | Re-proyecta `assignedRoute` cuando el Route cambia | **Territorio de reconciliación/`routeRevision`** — F3 lo trata como refresco de proyección, no como nueva activación |
| 4 | Borrado de ruta | mongo-store.js:749-754 | Limpia `routeId`/`assignedRoute` de unidades de una ruta borrada | Se conserva (limpieza); no crea ACTIVE |
| 5 | `createVehicle` | mongo-store.js:2995-3008 | Init `routeId:null, assignedRoute:null` | Se conserva (init) |
| 6 | `activeRouteProgress` | mongo-store.js:3946 | Progreso/ETA por ubicación | **Fuera de F3** (lo maneja el motor de ubicación); se restringe su escritura por flujo general (§17) |

### `Vehicle.activeRouteProgress`
Escrito por el pipeline de ubicación (mongo-store.js:3946). No lo toca F3; se documenta y se restringe que `updateVehicle` genérico lo cambie (§17).

### Autoridad (§17)
- **`activateVehicleRouteAssignment`** será el **único escritor** de: estado `ACTIVE` de la asignación, transición de la ACTIVE previa, `Vehicle.routeId`, `Vehicle.assignedRoute`.
- `assignRouteToVehicle` → **adaptador** (crea AVAILABLE + activa); no escribe `routeId`/`assignedRoute` directo.
- `updateVehicle` (mongo-store.js:3020 / store.js:3020) → se **bloquea** `routeId`/`assignedRoute`/`activeRouteProgress` desde flujos generales; solo la ruta interna del motor F3 los toca. (Pendiente confirmar en el body de updateVehicle qué campos acepta hoy — se hará al implementar §17.)

### Snapshot: **DERIVADO, no persistido** (hallazgo clave)
No existe `OperationalUnitSnapshotModel` — el `OperationalUnitSnapshot` se **computa on-read** (`domain/operational-unit-snapshot.js` `buildRoute` lee `vehicle.assignedRoute`). → **F3 NO escribe un snapshot persistido**; basta actualizar `Vehicle.assignedRoute` (+ `routeId`) y el snapshot se re-deriva. La "proyección operacional persistida real existente" (§8/§13.8) = **`Vehicle.routeId` + `Vehicle.assignedRoute`**. Esto **simplifica** F3 (una sola proyección persistida).

### Detección de RouteSession activa (§7)
`getActiveRouteSession(vehicleId)` existe en ambos stores (mongo-store.js:4063, store.js:3487) y ya se usa para bloquear el cambio de ruta en el endpoint de asignación (navigation/routes.js:636/708). → F3 lo usa para el conflicto `active_route_session`.

### Bus de eventos (§20) — **ajuste de contrato necesario**
**NO existe un bus de eventos a nivel store/dominio.** Los eventos se emiten en la **capa de módulos** vía helpers con `req` (`emitToRouteAudience` en navigation/routes.js:32, `emitAccountEvent`, sockets). El store no puede emitir `route-assignment:updated` (no tiene acceso al `io`/`req`).

**Implicación:** el motor `activateVehicleRouteAssignment` (que vive en el store) **no puede emitir el evento**. La emisión de `route-assignment:updated` debe ocurrir en la **capa de módulo** que llama al motor — que es **F4 (API admin)**, no F3.

**Ajuste de contrato propuesto (mínimo):** F3 implementa el motor y **devuelve el resultado** (`ACTIVATED`/`IDEMPOTENT`/`RECONCILED` + payload sanitizado listo para emitir); **la emisión de `route-assignment:updated` se hace en F4** (capa de módulo con `req`/`io`), después de persistir. F3 documenta el payload sanitizado y la regla (emitir solo en ACTIVATED/RECONCILED, nunca en IDEMPOTENT/conflicto/rollback), pero **la emisión física queda en F4**. Esto respeta §20 ("usa el bus existente solo si ya está disponible") y §20 ("outbox/durabilidad queda para una fase posterior si aún no existe"). **No** meto un bus nuevo en el store (sería inventar infraestructura, prohibido).

## Determinación de STOP conditions (§27)
| Condición | Resultado |
|---|---|
| `main` ≠ `origin/main` | OK (iguales) |
| cambios ajenos sin confirmar | OK (limpio) |
| falta contrato F2.1/F2.2 | OK (presentes) |
| no se identifica el escritor de `assignedRoute` | **OK — identificado** (`assignRouteToVehicle` + propagación de ruta + clear/init) |
| modelo integrado contradice la máquina de estados | OK (no) |
| Mongo sin ruta segura para transacciones | OK (`Model.db.startSession`/`withTransaction` disponibles — mongo-store.js:1688) |
| F3 exige romper Documentos/Fleet/Radio/Email | OK (no; entidad aislada) |
| proyección actual incompatible | OK (snapshot derivado de `assignedRoute` — compatible) |
| pruebas base fallan | OK (verdes) |

**Ningún STOP disparado.** Solo el **ajuste de contrato de eventos** (arriba) requiere tu confirmación antes de continuar, porque cambia dónde se emite `route-assignment:updated` (F4, no F3).

## Plan por etapas (§ veredicto) — pendientes tras tu confirmación
2. `Route.revision` + migración idempotente (script separado).
3. CRUD interno mínimo (`getById`/`list`/`create`, filtrado por org+vehicle) en ambos stores.
4. Motor **embedded** (mutex org+vehicle, rollback recuperable) + pruebas.
5. Motor **Mongo** (`withTransaction`, CAS dentro de la tx, E11000→`already_active`, fail-closed sin tx) + pruebas.
6. Adaptador del escritor legado (`assignRouteToVehicle`) + restricción de `updateVehicle`.
7. Idempotencia + reconciliación de drift.
8. Eventos — **retorno del motor** (emisión en F4).
9. Suite completa (backend + mobile typecheck/test + ventas typecheck/build).
10. Reporte final F3 completo.
11. STOP para revisión.

---

**STOP — necesito tu confirmación de un punto antes de escribir el motor:**
**El evento `route-assignment:updated` se emitirá en F4 (capa de módulo con `req`/`io`), no dentro del motor F3** (el store no tiene bus). F3 devolverá el resultado + payload sanitizado listo para emitir. ¿Apruebas este ajuste mínimo de §20? Con eso, arranco la etapa 2 (`Route.revision` + migración) y sigo el plan por etapas.
