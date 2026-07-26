# RC-MOBILE-CHECKLIST-STATUS-01 — Fase 2: checklist deja de leer `vehicle.status` (Opción A)

> **Estado:** Cerrado. Rectificación mínima del drift §5.3: se elimina el único read de `vehicle.status` en checklist (la línea 101). Sin extender taxonomía. Solo mobile/checklist.
>
> **Validación:** suite **26/134** (sin cambio), typecheck **exit 0**, eslint **exit 0**, **bundle release de producción** (`--dev false`) **exit 0**. Diff limitado a `checklist.utils.ts`.

## 1. Cambio (archivo+línea antes/después)

[`checklist.utils.ts` — `getVehicleOperationalStatus`](mobile/src/screens/checklist/checklist.utils.ts).

**Antes** (rama de la línea 101, el drift §5.3):
```ts
  if (sessionLog?.status === 'active') {
    return vehicle.delayMinutes > 0 ? 'delayed' : 'active';
  }

  if (ACTIVE_VEHICLE_STATUSES.has(String(vehicle.status || '').toLowerCase())) {  // ← eliminado
    return vehicle.delayMinutes > 0 ? 'delayed' : 'active';                       // ← eliminado
  }                                                                                // ← eliminado

  return 'available';
```

**Después:**
```ts
  if (sessionLog?.status === 'active') {
    return vehicle.delayMinutes > 0 ? 'delayed' : 'active';
  }

  return 'available';
```

La función queda con una sola cascada: **sessionLog** terminal/activo (completed/cancelled/delayed/active) → su valor; si no → **`available`** (el neutro que checklist ya tiene). No se creó estado "sin datos".

**Intacto (confirmado):**
- Fuente **sessionLog** (`getActiveLog`/historial): sin tocar — sigue produciendo completed/cancelled/delayed/active.
- **Blend externo `operationalState === 'on_route'`** ([:126-129](mobile/src/screens/checklist/checklist.utils.ts)): sin tocar.
- `vehicle.status` en el **tipo Vehicle**: intacto (map-screen, active-route lo siguen leyendo).
- El param `vehicle` sigue usado (`vehicle.delayMinutes` en la rama sessionLog-active).

## 2. Símbolo muerto colateral — `ACTIVE_VEHICLE_STATUSES` (desviación forzada, declarada)

`ACTIVE_VEHICLE_STATUSES` ([:31](mobile/src/screens/checklist/checklist.utils.ts)) tenía **exactamente 2 referencias** (grep tree-wide): su definición y la línea 101. Al quitar la 101 quedó **sin consumidor**.

**Tu instrucción decía "borrado aparte, no en este commit".** Pero verifiqué empíricamente: dejarlo produce `eslint error 31:7 'ACTIVE_VEHICLE_STATUSES' is assigned a value but never used (@typescript-eslint/no-unused-vars)` → **rompe la validación eslint que este mismo RC exige**. Como (a) grep prueba **cero** otros consumidores y (b) es un helper privado acoplado exclusivamente a la línea 101 (no un candidato "pendiente de cablear"), la disyuntiva "muerto vs pendiente" se resuelve inequívocamente en **muerto**. Lo eliminé junto con la línea 101. **Es la única desviación de tu instrucción literal, forzada por el requisito de eslint limpio; la señalo para que la valides.** Si prefieres revertir solo esa línea y dejar el eslint fallando, es trivial.

## 3. Ripple verificado (Q2) — ninguna rama rompe con el fallback `available`

El cambio hace que una unidad antes `'active'` (por `vehicle.status` crudo) pase a `'available'`. `available` es un estado **ya soportado** por todos los consumidores:

| Consumidor | Comportamiento con `available` | ¿Rompe? |
|---|---|---|
| Filtro `filterMode==='active'` ([checklist-screen:382](mobile/src/screens/checklist-screen.tsx)) `['active','delayed'].includes(status)` | `available` **no** está en la lista → la unidad sale del filtro "active" | No — es el comportamiento correcto (ya no está activa) |
| Ramas JSX ([:1078,1091-1095](mobile/src/screens/checklist-screen.tsx)) chequean completed/delayed/active | `available` cae al default (neutro) | No |
| `getStatusLabel('available')` → "Disponible" · `getStatusTone` → 'neutral' · `getStatusColor` → muted ([:151-171](mobile/src/screens/checklist/checklist.utils.ts)) | Rama else, ya existía | No |

Confirmado por lectura de código: `available` no introduce ningún caso no manejado; la unidad que deja de ser 'active' simplemente sale del filtro "active", como anticipaste.

## 4. Tabla de cambio de estado visible (mapeo lógico)

| Condición | Estado ANTES | Estado DESPUÉS | Nota |
|---|---|---|---|
| `operationalState === 'on_route'` | active / delayed | active / delayed | **sin cambio** (blend externo intacto) |
| sessionLog completed/cancelled/delayed/active | ese valor | ese valor | **sin cambio** (sessionLog intacto) |
| **`vehicle.status` ∈ {online,patrolling,on-route,active}, NO on_route, sin sessionLog activo** | **active** ("En ruta") | **available** ("Disponible") | **CAMBIA** — corrección del drift |
| resto (stopped/no_route/maintenance/unknown sin raw-active) | available | available | sin cambio (ya colapsaban a available) |

**Única clase de unidad que cambia:** las que el `vehicle.status` crudo marca activo (`online`/`patrolling`/`on-route`/`active`) pero cuyo `operationalState` **no** es `on_route` (p.ej. GPS vencido → `unknown`, con ruta pero lento → `stopped`, sin ruta → `no_route`) y sin sesión activa. Pasan de **"En ruta" → "Disponible"**. Es la corrección buscada: no afirmar movimiento sin que el snapshot lo confirme.

**Verificación por unidad real:** pendiente de uso (igual que portal) — requiere datos vivos. El mapeo lógico de arriba es lo verificable en análisis estático.

## 5. Validación

| Verificación | Resultado |
|---|---|
| Baseline `npm test` | 26/134 |
| `npm test` post-cambio | **26/26 suites, 134/134 — sin cambio.** El test que asserta `status==='active'` es para `operationalState:'on_route'` (rama intacta) → preservado. El otro test no assertea status. |
| `tsc --noEmit` | PASS (exit 0) — `vehicle` param sigue usado |
| ESLint (`checklist.utils.ts`) | PASS (exit 0) — tras quitar el const muerto (§2) |
| **Bundle release producción** (`--dev false`) | PASS (exit 0) |
| Diff | **1 archivo** (`checklist.utils.ts`, −5 líneas). Portal, backend, shared/ y demás mobile: **sin cambios de este RC** (lo demás en el árbol es de RCs previos + `App.tsx` admin ajeno). |

## 6. Archivos tocados (1)

`mobile/src/screens/checklist/checklist.utils.ts` (eliminada la rama línea 101 + el const muerto `ACTIVE_VEHICLE_STATUSES`).

## 7. Rollback

```
cd mobile && git checkout -- src/screens/checklist/checklist.utils.ts && cd .. && rm RC-MOBILE-CHECKLIST-STATUS-01.md
```

## 8. Notas / pendientes (no en este RC)

- **`ACTIVE_VEHICLE_STATUSES` eliminado** por necesidad de eslint (§2) — desviación forzada de "no en este commit", declarada para tu validación.
- Otros consumidores de `vehicle.status` (map-screen, active-route) **no tocados** — cada uno su propio RC si aplica.
- Sigue pendiente (threads aparte): punto 2 portal (route-unit-selector), §5.2-4º getAssignedDrivers, candidatos-a-eliminar del snapshot.
