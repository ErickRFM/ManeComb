# RC-MULTI-ROUTE-DRIVER-01 — F4: API admin de asignaciones + emisión del evento

> **Estado:** F4 completada (Fase 1 auditoría + Fase 2 implementación). **STOP para revisión.** Rama `rc-multi-route-driver-01-f3` sobre `7202346`. Suite backend completa **verde**. **Sin push / merge / PR / tags.**

## 0. Qué es F4
Exponer el subsistema `VehicleRouteAssignment` (motor F3) por HTTP para **administración**, y realizar la **emisión física** de `route-assignment:updated` que F3 dejó lista (devolviendo el payload sanitizado). **No** toca el escritor legado `/navigation/assign` (gate F6).

## 1. Decisiones aprobadas (Fase 1)
- **Alcance:** solo `create / list / get / activate` (lo que el motor F3 soporta). `cancel/update/complete` **diferidos** (requieren un escritor de store nuevo con su semántica de transiciones).
- **Payload del evento:** el descriptor **sanitizado del motor** + la **asignación serializada** + una **vista mínima del vehículo** (`id/routeId/routeName/driverId`), **sin geometría ni coordenadas crudas**.
- **Namespace:** `/api/navigation/assignments`.

## 2. Endpoints (todos: `authenticate` + `requireOrganization` + `requireOperationalAccess` + `hasPermission("canManageRoutes")`)
`backend/src/modules/navigation/routes.js` (montado en `/api/navigation`, app.js:242).

| Método | Ruta | Comportamiento |
|---|---|---|
| `POST` | `/assignments` | Valida `vehicleId`+`routeId` accesibles del tenant (`getAccessibleVehicle`, `canAccessTenantResource`); crea AVAILABLE. `invalid_assignment_input`→400. |
| `GET` | `/assignments?vehicleId=&status=` | Lista por unidad, tenant-scoped. |
| `GET` | `/assignments/:id` | Obtiene una, tenant-scoped (404 si otra org). |
| `POST` | `/assignments/:id/activate` | Llama al motor (`actor:"admin"`); **emite `route-assignment:updated`** solo en ACTIVATED/RECONCILED; mapea CONFLICT→HTTP. |

**Emisión (§20):** `if (result.applied && result.event) emitToRouteAudience(req, org, "route-assignment:updated", { ...result.event, assignment, vehicle: minimalVehicleView }, vehicle.driverId)`. **Nunca** en IDEMPOTENT/CONFLICT. `emitToRouteAudience` usa `io?.` (no rompe sin socket).

**Mapeo CONFLICT→HTTP:** `not_found`/`vehicle_not_found`→404; `already_active`/`active_route_session`/`active_assignment_conflict`/`activation_version_conflict`/`admin_locked`/`invalid_status`/`expired`/`out_of_window`/`outside_schedule`/`no_route`/`route_projection_failed`→409 (con `code`=reason); `transaction_unavailable`→**503**. Respuesta `{ ok:false, code, message }`.

## 3. Validación (estado REAL)
- **Backend `npm test`: verde (EXIT=0).** Nueva prueba `test/vehicle-route-assignment-api.test.js` (integración HTTP sobre store embedded):
  - crear (201, AVAILABLE) + validaciones (400 sin routeId, 404 ruta inexistente);
  - listar (con filtro `status`) y obtener (404 desconocida);
  - activar (200, `ACTIVATED`, proyección **mínima** — sin `assignedRoute`/`polyline` en la respuesta) e **idempotencia** (200, `IDEMPOTENT`, `applied:false`);
  - conflicto `already_active`→409 con `code`;
  - permisos: driver (sin `canManageRoutes`)→403 en crear y activar;
  - la emisión no rompe sin `io` (optional chaining).
- **Mobile/ventas:** F4 solo tocó `backend/`. Mobile no ejecutado (no se modificó mobile/shared). Ventas sin cambios.

## 4. Alcance y restricciones respetadas
- Sin push / merge / PR / tags. Commit local en `rc-multi-route-driver-01-f3`.
- `/navigation/assign` legado **intacto** (cutover = F6). Máquina de estados y motor F3 sin cambios (solo consumo).
- Sin tocar password-recovery / Cloudflare / Documentos / Fleet / Email / Radio.

## 5. Diferido
- **F5:** API driver (auto-activación con `selectableByDriver`).
- **F6:** cutover legado + switch sin jornada. **F7:** switch durante jornada.
- `cancel/update/complete` de asignaciones (necesitan escritor de store nuevo).

---

**STOP para revisión.** API admin (`create/list/get/activate`) sobre el motor F3, con emisión de `route-assignment:updated` en ACTIVATED/RECONCILED (payload sanitizado + vistas, sin geometría), mapeo CONFLICT→HTTP y permisos. Suite verde. ¿Apruebas F4 y sigo con F5 (API driver)?
