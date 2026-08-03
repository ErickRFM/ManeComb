# RC-MULTI-ROUTE-DRIVER-01 — F2.1: Endurecimiento del modelo + contratos (STOP antes de F3)

> **Estado:** F2.1 cerrada. Sin CRUD, sin API, sin F3. Modelo endurecido + lógica pura testeada + contratos documentados. Rama `rc-multi-route-driver-01`. **STOP para tu aprobación antes de F3.**
> **Validación:** suite backend completa verde (incluye la nueva `vehicle-route-assignment.test.js`).

---

## 1. Integración — ORDEN Y REBASE (no arrancar F3 sobre esta base)
Esta rama parte de `origin/main` (`e76965b`). Hay RC pendientes que **también** modifican los archivos que F3 tocará (`store.js`, `mongo-store.js`), y no están en `origin/main`:

| Rama pendiente | Toca | Nota |
|---|---|---|
| **`codex/rc-documents-driver-admin-02`** | models.js, store.js, mongo-store.js | **La "RC documental"** — la más importante de integrar antes de F3 |
| `codex/mp-email-03a` / `03b` | models.js, store.js, mongo-store.js | Correos |
| `codex/ptt-radio-realtime` | models.js, store.js, mongo-store.js | Radio |
| `stabilization/production-hardening` | models.js, store.js, mongo-store.js | Hardening |

**Contrato de integración:**
- **F2 (ya hecho)** solo tocó `models.js` de forma **aditiva** (schema+índices+export nuevos, sin modificar schemas existentes) → bajo riesgo de conflicto.
- **F3 tocará `store.js`/`mongo-store.js`** (activación + proyección). **ANTES de F3, `rc-multi-route-driver-01` DEBE rebasearse sobre `main` actualizado** con la RC documental (y las demás store-RC) ya integradas. Rebasar sobre un main sin ellas garantiza conflictos en los stores.
- **NO borrar ni sobrescribir schemas de otras RC** al rebasear: el schema `vehicleRouteAssignmentSchema` es nuevo y aislado; se conserva junto a los ajenos.
- Orden sugerido: mergear primero la RC documental + email/radio/hardening a main → rebasar esta rama → recién entonces F3.

## 2. Versión de Route — `routeRevision`, no una versión ficticia
**Auditoría del modelo `Route` real** (`models.js:75-99`): tiene `name, code, color, origin, destination, stops, distanceMeters, durationSeconds, durationInTrafficSeconds, polyline, updatedAt` — **NO tiene `revision`**. Por eso el `routeVersion` de F2 era ficticio; **renombrado a `routeRevision`** (F2.1) con fuente definida:

- **Estrategia preferida:** agregar **`Route.revision`** (entero, incremental) al modelo Route. La asignación copia ese valor en `routeRevision` **al activar** (F3). Hasta que `Route.revision` exista, `routeRevision = 0 = "sin versionar"` y **NO debe usarse para decidir drift** (documentado en el schema).
- **Alternativa documentada:** *fingerprint operativo* — hash estable de los campos que definen la ruta (ver abajo). Sirve **sin** modificar Route (se computa on-read). Trade-off: no es monótono; detecta cambio pero no ordena revisiones.
- **Regla:** **no se guarda un número sin fuente real.** `routeRevision` solo se puebla desde `Route.revision` (o el fingerprint) — nunca inventado.

**Qué cambios incrementan `Route.revision`** (o cambian el fingerprint): `origin`, `destination`, `stops`, `polyline`, `distanceMeters`, `durationSeconds`/`durationInTrafficSeconds`. (Cambios cosméticos como `color`/`name` NO incrementan revisión operativa.)

**No se implementa el update de Route en F2.1** (ampliaría demasiado). El contrato queda inequívoco para F3: al tocar/editar una Route, incrementar `Route.revision`; al activar una asignación, copiar `Route.revision → assignment.routeRevision`.

## 3. Máquina de estados (documentada + PROBADA en `vehicle-route-assignment.js`)
Fuente única: `backend/src/domain/vehicle-route-assignment.js` (`TRANSITIONS`, `isValidAssignmentTransition`), con pruebas en `test/vehicle-route-assignment.test.js`.

| Desde | Transiciones permitidas |
|---|---|
| **AVAILABLE** | → ACTIVE (activar), → CANCELLED (cancelar) |
| **SCHEDULED** | → AVAILABLE, → ACTIVE (dentro de ventana), → EXPIRED, → CANCELLED |
| **ACTIVE** | → COMPLETED (completar), → CANCELLED (**solo bajo regla explícita** del cambio de ruta, F3/F7 — no libre) |
| **COMPLETED / CANCELLED / EXPIRED** | terminales (sin transiciones) |

**`selectableByDriver` — significado exacto:** "el **conductor** puede auto-activar esta asignación". `false` === **ADMIN_LOCKED** (el conductor no puede; **el admin sí**). La activación **NO depende solo de este booleano** — `canActivate(assignment, context)` exige, para ambos actores: `status ∈ {AVAILABLE, SCHEDULED}`, tenant (`organizationId`), `vehicleId`, `routeId` presente, ventana horaria (si SCHEDULED), **no otra ACTIVE** (`hasOtherActive`), jornada operativa (`withinOperationalSchedule`); y **solo si `actor === 'driver'`** además exige `selectableByDriver === true`. Cada rechazo devuelve un `reason` trazable (`admin_locked`, `already_active`, `out_of_window`, `tenant_mismatch`, …).

## 4. Duplicados y horarios (reglas definidas ANTES del CRUD)
| Pregunta | Regla F2.1 |
|---|---|
| ¿Misma `routeId` repetida para la misma unidad? | **Permitido** en estados no-ACTIVE (p.ej. varias AVAILABLE/SCHEDULED de la misma ruta con distinta ventana/prioridad). El único parcial solo restringe **una ACTIVE**. |
| ¿Dos SCHEDULED superpuestas? | **Permitido a nivel de datos**; la activación resuelve el conflicto (solo una llega a ACTIVE). El solape de ventanas **no** se prohíbe por índice (sería frágil); F3/F4 pueden advertir, no bloquear. |
| ¿Dos AVAILABLE equivalentes? | Permitido; la desduplicación es responsabilidad de la UI/F4, no del índice. |
| ¿Cómo se resuelve `priority`? | Mayor `priority` primero (índice `{org,vehicle,status,priority:-1}`); a igualdad, `assignedAt` más reciente. Es orden de **presentación/sugerencia**, no auto-activación. |
| ¿Qué pasa al vencer `scheduledUntil`? | La asignación pasa a **EXPIRED** (transición SCHEDULED→EXPIRED). La transición la ejecuta F3/un barrido; F2.1 solo define la regla y la valida. |

**Índices** (F2.1, en `models.js`): único parcial `{org,vehicle}` where `status=ACTIVE` (conservado); + consulta `{org,vehicle,status,priority:-1}`, `{org,routeId,status}`, `{org,vehicle,scheduledFrom,scheduledUntil}`, `{org,vehicle,route,status}`. **No se agregó ningún único nuevo** sin regla (solo el de ACTIVE, ya justificado).

## 5. Historial de ruta — fuente explícita
**`routeId + routeRevision` solo DETECTA cambios; NO reconstruye la geometría histórica por sí mismo.** El historial **no** se declara resuelto por guardar `routeRevision`.

**Fuente histórica decidida:** el **snapshot en `RouteSession`** es la fuente histórica canónica de "qué ruta se recorrió" (la sesión ya persiste métricas/posiciones y su `routeId`; F7 cerrará la sesión con `route_switched` al cambiar de ruta). La asignación **no** duplica geometría. Si en el futuro se requiere reconstruir la geometría exacta de una asignación pasada sin sesión, la opción mínima sería un snapshot reducido en la asignación — **no se hace ahora** (sin justificación de necesidad). Regla: **no duplicar geometría sin justificación.**

## 6. Contrato de `activateVehicleRouteAssignment()` (F3 — diseño, NO implementado)
Único escritor autorizado de: **la asignación ACTIVE**, **`Vehicle.routeId`**, **`Vehicle.assignedRoute`** (proyección), y la **proyección operacional** (`OperationalUnitSnapshot.assignedRoute`). Ningún otro código escribe `assignedRoute`.

Firma propuesta: `activateVehicleRouteAssignment({ actor, organizationId, vehicleId, assignmentId, expectedActiveAssignmentId, reason })`.

Debe contemplar (para F3):
- **Precondiciones:** `canActivate(assignment, context)` (dominio F2.1) antes de escribir.
- **Transacción Mongo** cuando disponible: (a) `assignment` seleccionada → ACTIVE, (b) ACTIVE previa → AVAILABLE/COMPLETED, (c) `Vehicle.routeId`+`assignedRoute`+snapshot, en **una** unidad atómica. Copiar `Route.revision → routeRevision` y `++activationVersion`.
- **Paridad embedded:** el `store.js` (no-mongo) replica la atomicidad con una transición recuperable + estado explícito (sin transacción real).
- **Rollback / fallo intermedio:** una falla no puede dejar **dos ACTIVE**, `assignedRoute` inconsistente, ni sesión≠snapshot. Si falla tras marcar ACTIVE pero antes de proyectar → revertir o reintentar de forma idempotente.
- **Conflicto E11000** (índice único ACTIVE): si dos activaciones simultáneas compiten, **una gana** (la otra recibe E11000) → traducir a `already_active`/reintento controlado; nunca crash.
- **Activaciones simultáneas:** `expectedActiveAssignmentId` da control optimista (CAS): activar solo si la ACTIVE actual es la esperada.
- **Evento después de persistencia:** emitir `route-assignment:updated` (F12) **solo tras** confirmar la escritura, con payload sanitizado (sin geometría).
- **Reconciliación de drift:** si `assignedRoute` del vehículo no coincide con la asignación ACTIVE (o `routeRevision` quedó viejo), F3 es quien reconcilia; nadie más reescribe `assignedRoute`.

## 7. Pruebas F2.1 (`test/vehicle-route-assignment.test.js`, en `npm test`)
Cubren (sin CRUD ni API): matriz de transiciones + estados terminales; ventana horaria; **precondiciones de `canActivate`** (status/tenant/vehículo/ruta/otra ACTIVE/ventana/jornada/`selectableByDriver` por actor); validación de fechas coherentes (`scheduledUntil > scheduledFrom`) y prioridad ≥ 0; serialización; y del **modelo mongoose**: validadores (status enum, prioridad, ventana) + índices declarados (único parcial ACTIVE + consulta por prioridad). Aislamiento tenant se prueba vía `canActivate` (`tenant_mismatch`); el aislamiento de **consultas** se probará en F4/F5 cuando exista el CRUD.

## 8. Integración final F2.1
`cd backend && npm test` → **suite completa verde** (incluida la prueba nueva). Cambios puramente aditivos: nuevo schema/índices/módulo de dominio/test; **cero** modificación de schemas o stores ajenos.

---

## Archivos F2.1
- `backend/src/data/models.js` — `routeVersion`→`routeRevision` (fuente definida), `min:0` en prioridad/activationVersion, validador de ventana horaria, índices de consulta.
- `backend/src/domain/vehicle-route-assignment.js` (nuevo) — estados, transiciones, `canActivate`, validación, serialización (lógica pura, fuente única para F3-F5).
- `backend/test/vehicle-route-assignment.test.js` (nuevo) + `package.json` (en la cadena `npm test`).

**STOP:** ¿apruebas el modelo endurecido + los contratos (revisión de Route, historial, F3, integración/rebase) para pasar a F3 — **tras** rebasar sobre main con la RC documental integrada?
