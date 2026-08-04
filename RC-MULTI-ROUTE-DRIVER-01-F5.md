# RC-MULTI-ROUTE-DRIVER-01 — F5: API driver (auto-selección de ruta)

> **Estado:** F5 completada (Fase 1 auditoría + Fase 2 implementación). **STOP para revisión.** Rama `rc-multi-route-driver-01-f3` sobre `d438d22`. Suite backend completa **verde**. **Sin push / merge / PR / tags.**

## 0. Qué es F5
Permitir que el **conductor** vea sus asignaciones y **auto-active** una ruta **seleccionable** (respetando `selectableByDriver`), sobre el motor F3. No crea/borra asignaciones (eso es admin, F4). No toca `/assign` legado (F6).

## 1. Decisiones aprobadas (Fase 1)
- **Rutas driver-específicas** (separadas del flujo admin F4): admin activa con `actor:"admin"` (ignora `selectableByDriver`); driver con `actor:"driver"` (lo respeta).
- **`/assignments/mine`** devuelve las **no terminales** de la unidad con flag **`selectable`** + `selectableReason`.

## 2. Endpoints (`authenticate` + `requireOperationalAccess`, autorización **driver o admin**, scope a la unidad del conductor)
`backend/src/modules/navigation/routes.js`.

| Método | Ruta | Comportamiento |
|---|---|---|
| `GET` | `/assignments/mine` | Lista no terminales (`AVAILABLE/SCHEDULED/ACTIVE`) de la unidad del conductor; anota `selectable` + `selectableReason` vía dominio `canActivate(actor:"driver")`. Default de unidad: `req.user.vehicleId`. |
| `POST` | `/assignments/:id/select` | Auto-activa (`actor:"driver"`, `source:"driver"`, `reason:"driver_selected"`); el motor aplica `selectableByDriver` (`admin_locked`→409) y todas las precondiciones/CAS; emite `route-assignment:updated` en ACTIVATED/RECONCILED. |

**Guardas de propiedad:** ambos exigen `role !== "driver" && !canManageRoutes` → 403; el driver solo su unidad (`getAccessibleVehicle` branch driver + `vehicle.driverId === req.user.id`). Registrado **antes** de `/assignments/:assignmentId` para que `mine` no caiga en el parámetro.

**Nota de contrato (orden de `canActivate`):** con una asignación ya ACTIVE, seleccionar otra devuelve `already_active` **antes** de evaluar `selectableByDriver`. Es correcto: con jornada/ruta activa el cambio pertenece a F6/F7. El flag `admin_locked` aplica cuando **no** hay otra ACTIVE.

## 3. Validación (estado REAL)
- **Backend `npm test`: verde (EXIT=0).** Nueva prueba `test/vehicle-route-assignment-driver-api.test.js` (integración HTTP, seed `vehicle-101`/`user-driver-01`):
  - `/assignments/mine`: anota `selectable` (abierta→true; bloqueada→false, `selectableReason: admin_locked`) y **aísla por unidad** (no incluye asignaciones de otra unidad);
  - `select` de bloqueada (sin otra ACTIVE) → 409 `admin_locked`;
  - `select` seleccionable → 200 `ACTIVATED`, proyección **mínima** (sin geometría);
  - `select` de asignación de **otra unidad** → 403.
- **Mobile/ventas:** F5 solo tocó `backend/`. Mobile no ejecutado (no se modificó mobile/shared).

## 4. Alcance y restricciones respetadas
Sin push / merge / PR / tags. Commit local. `/assign` legado intacto (F6). Motor F3 sin cambios (solo consumo). Sin tocar password-recovery / Cloudflare / Documentos / Fleet / Email / Radio.

## 5. Diferido
- **F6:** cutover del escritor legado + switch sin jornada. **F7:** switch durante jornada.
- `cancel/update/complete` de asignaciones (escritor de store nuevo).
- Integración mobile del flujo driver (UI que consume `/assignments/mine` + `/select`).

---

**STOP para revisión.** API driver (`/assignments/mine` con `selectable`, `/assignments/:id/select` con `actor:"driver"`), respeta `selectableByDriver`, aísla por unidad y emite el evento. Suite verde. ¿Apruebas F5?
