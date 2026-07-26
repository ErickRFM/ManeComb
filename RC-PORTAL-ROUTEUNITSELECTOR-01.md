# RC-PORTAL-ROUTEUNITSELECTOR-01 — Fase 1 (read-only): mapa de arquitectura + veredicto mediano/grande

> **Estado:** Fase 1 cerrada, **solo lectura, cero cambios de código** (diff vacío). Cierra el "punto 2" diferido de RC-PORTAL-OPUNITSNAPSHOT-01: `route-unit-selector` deriva estado de `vehicle.assignedRoute → "En jornada"` en vez de `operationalState`.
>
> **Veredicto adelantado: RC MEDIANO** ("leer del store que ya existe"), **no grande**. Detalle abajo.

---

## 1. El read a migrar + alcance COMPLETO que consume `route-unit-selector`

[`route-unit-selector.tsx`](ventas/features/portal/routes/components/route-unit-selector.tsx) — props `{ vehicles: Vehicle[], selectedVehicleId, onSelectVehicle }`. Por `vehicle` consume:

| Campo | Línea | Uso |
|---|---|---|
| `vehicle.id` | 26, 29, 31 | key / selección |
| `vehicle.code` | 39 | código de unidad |
| `getDriverName(vehicle)` | 40 | conductor (ver nota abajo) |
| **`vehicle.status === 'maintenance'`** | **42** | rama "Mantenimiento" (línea de estado) |
| **`vehicle.assignedRoute`** | **42** | **el drift → "En jornada"** |

**El read a migrar es la línea 42** (la línea de estado):
```tsx
● {vehicle.status === 'maintenance' ? 'Mantenimiento' : vehicle.assignedRoute ? 'En jornada' : 'Disponible'}
```

**Nota de alcance — `getDriverName` NO es parte de este RC (pero lo documento para no migrar a medias):**
`getDriverName` ([`routes.utils.ts:17-19`](ventas/features/portal/routes/routes.utils.ts)) lee `vehicle.driver?.name || vehicle.driverName || 'Sin conductor'`. Es un read legacy de conductor, **pero prefiere el objeto anidado `vehicle.driver?.name`**, y `applyOperationalSnapshot` **no** setea `vehicle.driver` (solo el plano `driverName`, línea 206). Por tanto, migrar la línea de estado **no** arregla el conductor. El conductor es el **thread §5.2 aparte** (mismo pendiente que `getAssignedDrivers`). Este RC toca **solo la línea de estado**.

---

## 2. Patrón canónico del dashboard (la referencia a espejar)

[`portal-dashboard-screen.tsx`](ventas/features/portal/screens/portal-dashboard-screen.tsx):
- `:71 / :82` — selecciona `operationalUnits` del store (`state.operationalUnits`).
- `:85-87` — `snapshotByVehicle = useMemo(() => new Map(operationalUnits.map(u => [u.unitId, u])), [operationalUnits])`.
- `:90-91` — `operationalVehicleData = useMemo(() => vehicles.map(v => applyOperationalSnapshot(v, snapshotByVehicle.get(v.id))), …)`.

[`applyOperationalSnapshot` — `dashboard.utils.ts:187`](ventas/features/portal/dashboard/dashboard.utils.ts) es **función pura exportada**; setea `operationalState` (**:191**, justo lo que necesita la línea 42) + gps/location/speed/driverId/driverName/eta/progress.

---

## 3. El hueco en `routes-screen` — "leer del store que ya existe"

[`portal-routes-screen.tsx`](ventas/features/portal/screens/portal-routes-screen.tsx):
- **Fuente de vehículos:** selector `useAppStore(useShallow(...))` **:37-46** — selecciona `vehicles` (**:44**) pero **NO** `operationalUnits`.
- **¿`operationalUnits` está disponible desde este scope?** **SÍ.** Es el **mismo store** (`useAppStore`, mismo import `@/src/store/use-app-store`). En [`use-app-store.ts`](ventas/src/store/use-app-store.ts): campo `operationalUnits: OperationalUnitSnapshot[]` (**:63**), **se hace fetch junto con `vehicles`** (**:517-521**), y se actualiza por socket (**:262-264**).

> **Diagnóstico:** es **"leer del store que ya existe"**, NO "el store no expone operationalUnits". `routes-screen` solo necesita **añadir `operationalUnits: state.operationalUnits`** a su `useShallow`. Cero cambios de store/backend/contract.

---

## 4. Cadena de props `store → RouteUnitSelector` (directa, sin intermediarios)

```
useAppStore.vehicles (:44)
  → sortedVehicles  (:48, ordena por code)
    → routeVehicles (:52, FILTRA vehicle.status !== 'maintenance' en :53)
      → <RouteUnitSelector vehicles={routeVehicles} …/>  (:445-446)   ← directo
```

**Sin intermediarios.** UN screen + UN componente.

**Otros consumidores de `routeVehicles` (ripple auditado):**
| Consumidor | Línea | Qué lee | ¿Mergear rompe? |
|---|---|---|---|
| default de `editor.vehicleId` | 60, 241-242 | `.id` | No |
| `selectedVehicle` | 61-63 | `.id` (find) | No |
| `selectedVehicle` → mapa/editor | 80, 81, 511-516 | `assignedRoute` (`getRouteGeometry`, `.stops`, `getRouteLabel`) | **No** — `applyOperationalSnapshot` **no toca `assignedRoute`** |

Ningún consumidor lee `operationalState`/`location`/`speed`/`driverName` de `routeVehicles`; leen `.id` o `assignedRoute` (que el merge preserva). → **mergear `routeVehicles` sería seguro**, aunque una **lista mergeada exclusiva del selector** (como `operationalVehicleData` es separada de `vehicles` en el dashboard) deja el blast-radius aún más chico. Decisión de implementación para Fase 2.

---

## 5. Veredicto de taxonomía — mismo mapeo canónico, **una etiqueta a confirmar**

Etiquetas actuales en línea 42 vs canónico (`stateLabel`):

| Rama actual | Condición | Estado canónico | `stateLabel` canónico |
|---|---|---|---|
| `'Mantenimiento'` | `status==='maintenance'` | maintenance | "Mantenimiento" — **rama muerta aquí** ↓ |
| `'En jornada'` | `assignedRoute` truthy | on_route / stopped / unknown | "En ruta" / "Detenida" / "Sin datos" |
| `'Disponible'` | else (sin ruta) | no_route | "Sin ruta" |

**Hallazgos:**
1. **`'Mantenimiento'` es rama MUERTA en este componente:** `routeVehicles` ya filtra `status !== 'maintenance'` (**:53**), así que `RouteUnitSelector` **nunca recibe** unidades en mantenimiento. Al migrar, la rama se puede **eliminar** (no proyectar mantenimiento aquí).
2. **`'En jornada'` es una etiqueta GRUESA**, no una etiqueta que el canónico no cubra: colapsa on_route/stopped/unknown en una sola. El canónico es **estrictamente más fino** y cubre todos los casos. **NO hay STOP** — no existe una etiqueta única fuera del canónico.
3. **`'Disponible'` (sin ruta) = `no_route` semánticamente**; solo cambia la PALABRA UX ("Disponible" vs "Sin ruta"). Como esto es un **selector de unidades para asignar ruta**, "Disponible" (libre para asignar) puede ser mejor UX que "Sin ruta". **No es un hueco de taxonomía**, pero **es la única decisión de etiqueta que te dejo para confirmar**: ¿`stateLabel` canónico verbatim ("Sin ruta") o conservar la palabra de asignación "Disponible" para el caso `no_route` en este contexto?

> **Veredicto:** mismo mapeo canónico que el dashboard aplica. **No hay etiqueta que fuerce STOP.** Una sola decisión de wording (`Sin ruta` vs `Disponible`) — la reporto, no la decido.

---

## 6. ¿Extraer `applyOperationalSnapshot`/`snapshotByVehicle` a un helper compartido ANTES de migrar?

- **`applyOperationalSnapshot`** ya es **función pura exportada** (`dashboard.utils.ts:187`) — reutilizable tal cual.
- **`snapshotByVehicle`** es un `useMemo` inline **trivial de 3 líneas** (`dashboard-screen:85-87`) — no extraído, replicable en 3 líneas.
- **Único smell:** que `routes-screen` importe de `../dashboard/dashboard.utils` = acoplamiento cross-feature **routes → dashboard**.

**Opciones:**
- **(a)** Importar `applyOperationalSnapshot` desde `dashboard.utils` y replicar el `snapshotByVehicle` de 3 líneas. Cero cambios en dashboard, **un solo RC**. Acepta el import cross-feature.
- **(b)** Extraer a un hogar neutral (`portal/utils/operational-snapshot.ts`) **primero** → pero eso **mueve la función y toca el import del dashboard**, lo cual **queda fuera del "no toques dashboard"** de este RC. Sería un **prep-RC aparte**.

> **Recomendación:** la extracción **NO es requisito** para migrar. Mantén la migración auto-contenida con **(a)** (cross-import). Si prefieres el hogar compartido limpio, hazlo como **prep-RC separado (b) ANTES**, porque toca dashboard. **No lo bundlees con la migración.**

---

## Veredicto final: **RC MEDIANO**

| Factor | Estado |
|---|---|
| `operationalUnits` en el store | **Ya existe** (`:63`, fetch `:517`) — 0 cambios store/backend/contract |
| `applyOperationalSnapshot` | **Ya exportado** (`dashboard.utils.ts:187`) — reutilizable |
| Cadena de props | **Directa** (screen → selector), sin drilling |
| `snapshotByVehicle` | 3 líneas triviales |
| Ripple en `routeVehicles` | Seguro (consumidores leen `.id`/`assignedRoute`, no el snapshot) |

**Trabajo Fase 2 (esqueleto, para tu OK — NO ejecutado):**
1. `routes-screen`: añadir `operationalUnits: state.operationalUnits` al `useShallow` (**:37-46**).
2. `routes-screen`: `snapshotByVehicle` (memo 3 líneas) + lista mergeada (recomendado: exclusiva del selector, no reescribir `routeVehicles`).
3. `route-unit-selector` línea 42: leer `operationalState` vía `stateLabel`; **eliminar la rama muerta `'Mantenimiento'`**.
4. Decidir wording `no_route`: "Sin ruta" (canónico) vs "Disponible" (§5).

**Lo único que podría inflarlo a "grande" es la extracción compartida (§6), que es OPCIONAL y SEPARABLE — no debe bundlearse.**

**PROHIBIDO en esta fase (respetado):** cero cambios de código; no decidí la implementación; no toqué dashboard, mobile, `shared/`, backend ni el `App.tsx` admin ajeno. Diff vacío.

**Espero tu OK** (y la decisión de wording §5 + si quieres prep-RC de extracción §6) antes de Fase 2.
