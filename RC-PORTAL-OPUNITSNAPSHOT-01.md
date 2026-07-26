# RC-PORTAL-OPUNITSNAPSHOT-01 — Fase 2: dashboard de portal consume el snapshot canónico

> **Estado:** Cerrado. Alcance = solo dashboard (puntos 1, 3, §5.2, §5.4, §5.5). Punto 2 (route-unit-selector) y §5.2-4º (getAssignedDrivers) documentados pero **intactos** (RCs aparte).
>
> **Validación:** ventas typecheck **exit 0** + **build de producción** (`vite build`) **exit 0** (`✓ built in 5.95s`). ventas tiene **cero tests automáticos** → sin más cobertura que build + análisis estático; la verificación de estado por unidad real queda **pendiente de uso real** (ver §7).

## 0. Antes de tocar — dos confirmaciones que pediste

- **`ventas/src/App.tsx` sin commit** = feature **admin/MFA** (`AdminLoginScreen`/`AdminMfaSetup`/`AdminMfaVerify`/`AdminPlaceholder` + `AdminProtectedRoute`), coincide con los commits admin del git log y con `?? ventas/features/admin/`. Es trabajo paralelo real, **no basura, no mío**. No lo toqué ni lo incluí; mis cambios están en archivos distintos → sin conflicto.
- **Backend PAUSED → `stopped`**: [operational-unit-snapshot.js:258](backend/src/domain/operational-unit-snapshot.js) `if (sessionStatus === "PAUSED") return "stopped"`. **"Pausada" cae en "Detenida".** Confirmado abajo (§6).

## 1. Cambios por punto (archivo+línea antes/después)

### §5.5 — Proyectar operationalState al Vehicle fusionado
- **Tipo** [ventas/src/types/app.ts:159](ventas/src/types/app.ts): añadido `operationalState?: OperationalState | null;` (import `OperationalState` de `@shared/operational-contract`; **no** se tocó `shared/`).
- **applyOperationalSnapshot** [dashboard.utils.ts:174](ventas/features/portal/dashboard/dashboard.utils.ts): añadido `operationalState: unit.operationalState,` al merge. Ya no omite el estado; el vehicle fusionado lo lleva.

### Punto 1 — getVehicleStatus (estado de la card)
[dashboard.utils.ts:34](ventas/features/portal/dashboard/dashboard.utils.ts).
- **Antes:** `getVehicleStatus(vehicle, activeSession)` con blend: RUNNING→"En jornada", PAUSED→"Pausada", `vehicle.status==='maintenance'`→"Mantenimiento", **`vehicle.driverId`→"Asignada"**, else→"Disponible".
- **Después:** `getVehicleStatus(vehicle)` → `stateLabel(vehicle.operationalState)` + `operationalStateTone(state)`. Sin snapshot → `"Sin estado"` (NO cae al legacy). Nueva función `operationalStateTone` mapea estado→tono.
- Call site: [dashboard-operational-unit-card.tsx:21](ventas/features/portal/dashboard/components/dashboard-operational-unit-card.tsx) `getVehicleStatus(vehicle, activeSession)` → `getVehicleStatus(vehicle)`.

### Punto 3 — stopped por operationalState (no por speed)
[portal-dashboard-screen.tsx](ventas/features/portal/screens/portal-dashboard-screen.tsx).
- **Conteo stopped** (~:194): `filter(v => { const session=...; return session?.status==='PAUSED' || (Boolean(session) && Number(v.speed)<=0.8); })` → `filter(v => v.operationalState === 'stopped')`.
- **Filtro operationalVehicles STOPPED** (~:204): `session?.status==='PAUSED' || (Boolean(session) && Number(v.speed)<=0.8)` → `v.operationalState === 'stopped'`. (El branch RUNNING sigue leyendo `session.status`, no es uno de los 3 puntos.)

### §5.2 — driver del snapshot
[dashboard.utils.ts:90](ventas/features/portal/dashboard/dashboard.utils.ts) `getActiveDriver`.
- **Antes:** `getActiveDriver(users, vehicle, activeSession)` con fallback de 3: `activeSession?.driverId || vehicle.driverId || vehicle.driver?.id`, y `|| vehicle.driver` al final.
- **Después:** `getActiveDriver(users, vehicle)` → `const driverId = vehicle.driverId || null` (proyectado del snapshot vía applyOperationalSnapshot) → `users.find(...) || null`. **Sin fallback legacy** a session/driver.
- Call sites: [dashboard-vehicle-side-panel.tsx:67](ventas/features/portal/dashboard/components/dashboard-vehicle-side-panel.tsx) y [portal-dashboard-screen.tsx:281](ventas/features/portal/screens/portal-dashboard-screen.tsx) → quitado el 3er arg.

### §5.4 — frescura GPS (BUG de producción corregido)
[tracking.ts:3](ventas/features/portal/utils/tracking.ts) `isVehicleGpsFresh`.
- **Antes:** leía `vehicle.gpsFreshness?.freshUntil` + `Date.now()`. Pero `applyOperationalSnapshot` pone `freshUntil: null` al fusionar → **devolvía `false` siempre → toda unidad "GPS vencido"**.
- **Después:** `return vehicle?.gpsFreshness?.state === 'fresh'` (donde el merge mete la frescura real del snapshot; el `Vehicle` crudo también tiene `.state`, así que el único call site —`getGpsState`— funciona en ambos casos).
- **Verificación de equivalencia:** `getGpsState` ahora produce "GPS actualizado" ⇔ `gps.freshness === 'fresh'`, y "GPS vencido" ⇔ `stale`/`missing` (misma semántica que `formatFreshness` de mobile). Antes producía "vencido" para todo por el bug.

## 2. Tabla de divergencias de estado antes/después (mapeo de etiquetas)

> **Limitación honesta:** ventas no tiene tests ni pude correr contra un backend vivo en esta corrida estática. No puedo enumerar unidades reales; entrego el **mapeo lógico** (qué etiqueta-antes cae en qué etiqueta-después bajo qué condición). Las divergencias por unidad concreta quedan pendientes de verificación en uso real (§7).

| Etiqueta ANTES (blend) | Condición que la producía | operationalState canónico | Etiqueta DESPUÉS |
|---|---|---|---|
| **"En jornada"** | session RUNNING | `on_route` (ruta + activo + gps fresh) | **"En ruta"** |
| **"Pausada"** | session PAUSED | **`stopped`** (bkd:258) | **"Detenida"** |
| **"Asignada"** | `driverId != null`, sin session activa | `no_route` (sin ruta) · `unknown` (ruta + gps no fresh) · `stopped` (ruta + fresh + lento) | **"Sin ruta"** / **"Sin datos"** / **"Detenida"** (según ruta+gps) |
| **"Disponible"** | else | `no_route` (típico) | **"Sin ruta"** |
| "Mantenimiento" | `vehicle.status === 'maintenance'` | `maintenance` (bkd:252) | "Mantenimiento" *(igual)* |
| *(nuevo)* sin snapshot para el vehicle | — | `undefined` | **"Sin estado"** |

**Lo que pediste explícito:**
- **"Pausada" → "Detenida"** (vía `stopped`). Es la traducción, no desaparece: PAUSED es una afirmación explícita del conductor que el backend clasifica como detenida.
- **"Asignada"** (que era solo "hay driver") **se disuelve en el estado real**: no existe como estado en el contrato. Una unidad con conductor pero sin ruta → **"Sin ruta"**; con ruta pero GPS no fresco → **"Sin datos"**. El driver sigue mostrándose (§5.2), pero ya no como *etiqueta de estado*.
- **"En jornada" → "En ruta"** y **"Disponible" → "Sin ruta"**, como anticipaste.

**Tonos asignados** (`operationalStateTone`): on_route→positive, stopped→warning, maintenance→warning, no_route→neutral, unknown→neutral. (Elegidos para minimizar regresión de tono respecto al blend previo; el contrato no define tonos.)

**Cambio de comportamiento del filtro "STOPPED"** (no solo etiqueta): antes requería sesión activa (`Boolean(session)`); ahora `operationalState === 'stopped'` incluye unidades detenidas **sin** sesión (p.ej. con ruta, GPS fresco y velocidad baja). Es el sentido canónico de "detenida"; lo señalo por si el conteo del panel de operaciones sube respecto a antes.

## 3. Confirmación del estado PAUSED (lo pediste)

`buildOperationalState` [operational-unit-snapshot.js:251-272](backend/src/domain/operational-unit-snapshot.js), en orden: `maintenance` → `!route`→`no_route` → **`PAUSED`→`stopped`** → `gps no fresh`→`unknown` → `speed<umbral`→`stopped` → `active`→`on_route` → else `stopped`. **PAUSED produce `stopped` → "Detenida"** (incondicional si hay ruta; sin ruta sería `no_route`→"Sin ruta").

## 4. Intactos (documentados, otro RC)

- **Punto 2 — route-unit-selector** ([route-unit-selector.tsx:42](ventas/features/portal/routes/components/route-unit-selector.tsx)): **NO tocado**. `portal-routes-screen` no tiene snapshot; migrarlo es invasivo (hilar operationalUnits hasta esa pantalla) → RC aparte. Sigue derivando `vehicle.status`/`assignedRoute`.
- **§5.2-4º — getAssignedDrivers** ([dashboard.utils.ts:77-88](ventas/features/portal/dashboard/dashboard.utils.ts)): **NO tocado** (sigue con multi-fuente driverId+driver.id+session.driverId+user.vehicleId). Evaluación aparte.
- shared/, backend, mobile, campos "candidatos a eliminar": **no tocados**.

## 5. Validación

| Verificación | Resultado |
|---|---|
| ventas `tsc --noEmit` | **PASS (exit 0)** — el switch exhaustivo de tono, las firmas nuevas y el campo `operationalState` compilan |
| **ventas build producción** (`vite build`) | **PASS (exit 0)**, `✓ built in 5.95s` (`portal-dashboard-screen` incluido) |
| Tests automáticos ventas | **No existen** (cero) — verificación = build + estático |
| Mobile | **Diff vacío por este RC** — solo toqué 6 archivos de ventas; los cambios mobile presentes son del RC de empty-state previo, no de este |
| `App.tsx` admin | intacto (14 líneas ajenas, no mías) |
| route-unit-selector / getAssignedDrivers | intactos |

**Qué NO pude verificar (pendiente uso real):** el estado visible por unidad concreta con datos vivos — requiere backend + unidades reales. En particular: (1) confirmar que ninguna unidad "Asignada" cae en un estado inesperado; (2) que el conteo "STOPPED" del panel sube de forma esperada al incluir detenidas sin sesión; (3) que el fix de GPS (antes "vencido" para todo) ahora muestra "actualizado" para las frescas. Todo ello es observación en el portal desplegado.

## 6. Archivos tocados (6)

`ventas/src/types/app.ts`, `dashboard.utils.ts`, `utils/tracking.ts`, `dashboard/components/dashboard-operational-unit-card.tsx`, `dashboard/components/dashboard-vehicle-side-panel.tsx`, `screens/portal-dashboard-screen.tsx`.

## 7. Rollback

```
cd ventas && git checkout -- src/types/app.ts features/portal/dashboard/dashboard.utils.ts features/portal/utils/tracking.ts features/portal/dashboard/components/dashboard-operational-unit-card.tsx features/portal/dashboard/components/dashboard-vehicle-side-panel.tsx features/portal/screens/portal-dashboard-screen.tsx && cd .. && rm RC-PORTAL-OPUNITSNAPSHOT-01.md
```

## 8. Pendiente (RCs aparte, no mezclar)

- **Punto 2** route-unit-selector (invasivo: snapshot hasta portal-routes-screen).
- **§5.2-4º** getAssignedDrivers (multi-fuente).
- **Verificación en uso real** del portal desplegado (§5, "qué NO pude verificar").
- Los "candidatos a eliminar" del snapshot (`session`/`incidents`/`visibility`/selectores sin usar) — thread propio, campo por campo: muerto vs pendiente de cablear.
