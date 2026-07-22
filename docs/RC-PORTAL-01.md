# RC-PORTAL-01 — Modularización de portal-dashboard-screen.tsx

## Estado
✔ **Cerrado**

## Commits
| Hash | Descripción |
|------|-------------|
| `891d002` | refactor(ventas): modularize portal dashboard screen |
| `fa857ac` | docs(ventas): update RC-PORTAL-01 report with final commit hash |

## Resumen
Se redujo `portal-dashboard-screen.tsx` de **2,333 → 599 líneas** (–74.3%) extrayendo
tipos, constantes, utilidades, estilos y 5 componentes presentacionales a un nuevo
módulo `dashboard/`.

No se modificó lógica de negocio, UI, store, API, mapa, tiempo real, replay ni navegación.
Los componentes extraídos son presentacionales: reciben datos y callbacks por props.

## Archivos creados

**9 archivos** dentro de `dashboard/` (4 foundation + 5 componentes) + 1 documento aparte:

### Foundation (`dashboard/`)
| Archivo | Líneas | Contenido |
|---------|--------|-----------|
| `dashboard.types.ts` | 44 | Tipos `SessionDetail`, `Filters`, `OperationsFilter`, `RouteInfo`, `JourneyState`, `SessionMetricsView` |
| `dashboard.constants.ts` | 16 | Constantes (`statusFilters`, `replaySpeeds`, `OPERATIONS_DETAIL_WIDTH`, etc.) |
| `dashboard.utils.ts` | 245 | 26 funciones helper (`formatSpeed`, `getRouteInfo`, `applyOperationalSnapshot`, etc.) |
| `dashboard.styles.ts` | 861 | `StyleSheet.create()` completo (~80+ propiedades) |

### Componentes (`dashboard/components/`)
| Archivo | Líneas | Componente exportado | Componentes privados |
|---------|--------|----------------------|----------------------|
| `dashboard-operational-unit-card.tsx` | 45 | `OperationalUnitCard` | — |
| `dashboard-vehicle-side-panel.tsx` | 236 | `VehicleSidePanel` | `DriverProfile`, `ProgressBar`, `Fact`, `QuickAction` |
| `dashboard-history-filters.tsx` | 105 | `HistoryFilters` | `FilterChip` |
| `dashboard-session-history-card.tsx` | 51 | `SessionHistoryCard` | — |
| `dashboard-session-detail.tsx` | 188 | `SessionDetailView` | `MapFallback`, `Fact`, `QuickAction` |

## Pureza de `dashboard.utils.ts`

Las 26 funciones en `dashboard.utils.ts` son **puras**: no acceden a stores, API,
navegación, sockets, timers ni setters.

```bash
git grep -n "setState\|useAppStore\|usePortalStore\|axios\|router\|socket\|setTimeout\|setInterval" -- ventas/features/portal/dashboard/dashboard.utils.ts
# (sin resultados)
```

### `applyOperationalSnapshot` (línea 172)
- Recibe `vehicle: Vehicle` y `unit?: OperationalUnitSnapshot`
- Si `unit` es falsy, retorna el vehículo sin cambios
- Retorna un **nuevo objeto** (`{ ...vehicle, ... }`) — nunca muta el original
- Es pura: solo transforma y retorna datos, sin mutar estado ni llamar stores/api/router/sockets

## Rollback
```bash
git revert fa857ac
git revert 891d002
```
(No ejecutado — solo documentado.)

## Verificación final
```bash
git status --short              # sin output — árbol limpio
npm run typecheck               # sin errores
npm run build                   # 560 módulos transformados, build exitoso
```

## Evidencia
```
git show --stat --oneline 891d002
 11 files changed, 1869 insertions(+), 1743 deletions(-)

git show --stat --oneline fa857ac
  1 file changed, 1 insertion(+), 1 deletion(-)

git show --name-status --format= 891d002
  A docs/RC-PORTAL-01.md
  A ventas/features/portal/dashboard/components/dashboard-history-filters.tsx
  A ventas/features/portal/dashboard/components/dashboard-operational-unit-card.tsx
  A ventas/features/portal/dashboard/components/dashboard-session-detail.tsx
  A ventas/features/portal/dashboard/components/dashboard-session-history-card.tsx
  A ventas/features/portal/dashboard/components/dashboard-vehicle-side-panel.tsx
  A ventas/features/portal/dashboard/dashboard.constants.ts
  A ventas/features/portal/dashboard/dashboard.styles.ts
  A ventas/features/portal/dashboard/dashboard.types.ts
  A ventas/features/portal/dashboard/dashboard.utils.ts
  M ventas/features/portal/screens/portal-dashboard-screen.tsx
```
