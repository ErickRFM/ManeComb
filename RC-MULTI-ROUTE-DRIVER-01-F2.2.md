# RC-MULTI-ROUTE-DRIVER-01 — F2.2: contratos precisados + gate de integración (STOP antes de F3)

> **Estado:** F2.2 cerrada. Sin CRUD, sin API, sin F3. Contratos precisados (Route.revision, activationVersion, prioridad, expiración, invariantes, actor/motivo) + lógica pura ampliada y probada. **STOP.** Aditivo a la entidad (no toca stores) → no requiere el rebase, que además está **bloqueado** (ver §1).
> **Validación:** suite backend completa verde (incluye la prueba ampliada `vehicle-route-assignment.test.js`).

---

## 1. Gate de integración — BLOQUEADO (no arrancar F3 sobre `e76965b`)
Verificado hoy: `origin/main` = **`e76965b`**; la **RC documental `codex/rc-documents-driver-admin-02` NO está integrada** (ni las RC de email/radio/hardening que deban llegar). Como F3 tocará `store.js`/`mongo-store.js`, **no se puede iniciar F3 ni rebasar todavía** — no existe la base definitiva.

**Procedimiento cuando `origin/main` ya contenga esas RC (pendiente de merge externo):**
1. `git fetch origin`;
2. `git rebase origin/main` sobre `rc-multi-route-driver-01`;
3. resolver conflictos **sin eliminar schemas ni métodos ajenos** (el `vehicleRouteAssignmentSchema` es nuevo y aislado; se conserva junto a lo demás);
4. `git diff --check`;
5. suite backend completa (`npm test`);
6. presentar el nuevo commit base;
7. **STOP** ante cualquier regresión.

F2/F2.1/F2.2 solo tocaron `models.js` (aditivo) + archivos nuevos (`domain/`, `test/`) → conflicto esperado mínimo, solo en `models.js` si otra RC agrega schemas cerca.

## 2. Contrato `Route.revision` (definir; NO implementar en F2.x)
- Tipo **Number**. Rutas **nuevas empiezan en 1**. Rutas **existentes se migran/normalizan a 1**. **`0` = legado no migrado** (reservado, no es el valor normal).
- **Cada cambio operativo incrementa** `Route.revision`. Campos que incrementan: `origin`, `destination`, `originLabel`, `destinationLabel`, `stops`, `polyline`, `distanceMeters`, `durationSeconds`, `durationInTrafficSeconds`. (Cosméticos como `color`/`name` NO.)
- `VehicleRouteAssignment.routeRevision` **captura la revisión real de Route** al activar.
- **F3 comprueba que la revisión no cambió entre lectura y activación** (`checkRouteRevision(expected, actual)`, dominio). **Revisión desactualizada ⇒ 409 y NINGUNA asignación queda ACTIVE.**
- `Route.revision` **aún no existe** en el modelo Route → su alta + migración a 1 es prerequisito de F3 (o un prep antes de F3), documentado; no se inventa un número.

## 3. `activationVersion` — concurrencia optimista (probado)
- Contador **monotónico** de concurrencia optimista, **incrementa en toda transición persistida** (F3). No es etiqueta decorativa.
- F3 recibe/comprueba **`expectedActivationVersion`** (`checkActivationVersion(expected, actual)`, dominio). Si **no coincide**: **409**, **no** cambia Assignment, **no** cambia Vehicle, **no** emite eventos.

## 4. Prioridad — orden estable (probado)
- **Menor número = mayor prioridad**; enteros **no negativos** (validador `min:0`).
- Orden estable determinista (`compareAssignments`): **priority ASC → scheduledFrom ASC → createdAt ASC → id ASC**. Índice `{org,vehicle,status,priority:1}` (corregido a ASC en F2.2). Prueba de desempate determinista incluida.

## 5. Expiración efectiva — sin depender de cron (probado)
- `getEffectiveStatus(assignment, now)`: si `status===SCHEDULED && scheduledUntil < now` ⇒ **`EXPIRED` efectivo**, aunque el valor persistido siga SCHEDULED.
- **`canActivate` rechaza** esa asignación con `reason: "expired"` — la seguridad de la activación **no depende de un proceso posterior**.
- **Persistencia de EXPIRED (contrato):** el valor persistido se normaliza a EXPIRED **al intentar activar** (F3 lo detecta y lo persiste como EXPIRED en la misma operación que rechaza) y opcionalmente **al consultar** (F4/F5 pueden materializar el efectivo). Un barrido posterior es **optativo/optimización**, nunca la garantía de seguridad.

## 6. Invariantes por estado (dominio autoridad; probado)
`validateStateInvariants(assignment)` — el **dominio es la autoridad**, F3 lo corre **antes** de persistir (no se confía solo en Mongoose; F3 usa `runValidators: true` donde aplique además):
- **AVAILABLE:** sin `activatedAt`/`completedAt`/`cancelledAt`.
- **SCHEDULED:** `scheduledFrom` obligatorio; `scheduledUntil` opcional; si existe, `> scheduledFrom`.
- **ACTIVE:** `activatedAt` obligatorio; sin `completedAt`/`cancelledAt`.
- **COMPLETED:** `activatedAt` + `completedAt` obligatorios.
- **CANCELLED:** `cancelledAt` obligatorio.
- **EXPIRED:** no puede activarse (vía `getEffectiveStatus`/`canActivate`).

## 7. Historial — separación (documentada)
- **`VehicleRouteAssignment`** = historial **administrativo** (selección, programación, activación).
- **`RouteSession`** = **snapshot histórico del recorrido realmente iniciado**.
- **Limitación explícita:** una asignación **activada y cancelada sin crear RouteSession** conserva su historial administrativo, **pero no una geometría histórica propia**.
- **No se agrega geometría duplicada** a `VehicleRouteAssignment`.

## 8. Actor y motivo — contrato F3 + auditoría sanitizada (probado)
El contrato de F3 recibe `actorId`, `actorRole`, `source`, `reason`:
- **`SOURCES`:** `driver | admin | system | schedule`.
- **`REASONS`:** `driver_selected | admin_activated | route_switched | trip_completed | admin_cancelled | schedule_expired`.
- **`sanitizeAuditContext(context)`** — whitelist de campos seguros; **NUNCA** coordenadas, tokens ni snapshots completos en logs (probado: se descartan `coordinates`/`token`/`snapshot`; `source`/`reason` fuera de la whitelist → `null`).

## 9. Pre-F3 final
`cd backend && npm test` → **suite completa verde** (aditivo puro; cero cambios en schemas/stores ajenos). El rebase (§1) es prerequisito **externo** pendiente antes de F3.

---

## Archivos F2.2
- `backend/src/data/models.js` — índice de prioridad corregido a **ASC** (`priority:1`).
- `backend/src/domain/vehicle-route-assignment.js` — `getEffectiveStatus`, `canActivate` (reason `expired`), `compareAssignments`, `checkActivationVersion`, `checkRouteRevision`, `validateStateInvariants`, `SOURCES`/`REASONS`, `sanitizeAuditContext`.
- `backend/test/vehicle-route-assignment.test.js` — casos de desempate, expiración efectiva, concurrencia, invariantes, sanitizador.

**STOP:** contratos precisados y probados. Falta **solo** el gate externo (§1: integrar la RC documental + demás a main → rebasar) antes de F3. ¿Apruebas F2.2 y quedamos a la espera de esas integraciones para F3?
