# RC-PORTAL-01 — Modularización de portal-dashboard-screen.tsx

## Estado
✔ **Cerrado**

## Commits
| Hash | Descripción |
|------|-------------|
| `891d002` | refactor(ventas): modularize portal dashboard screen |

## Resumen
Se redujo `portal-dashboard-screen.tsx` de **2,333 → 599 líneas** (–74.3\%) extrayendo
tipos, constantes, utilidades, estilos y 5 componentes presentacionales a un nuevo
módulo `dashboard/`.

No se modificó lógica de negocio, UI, store, API, mapa, tiempo real, replay ni navegación.
Los componentes extraídos son presentacionales: reciben datos y callbacks por props.

## Archivos creados

### Foundation (`dashboard/`)
| Archivo | Líneas | Contenido |
|---------|--------|-----------|
| `dashboard.types.ts` | 38 | Tipos `SessionDetail`, `Filters`, `OperationsFilter`, `RouteInfo`, `JourneyState`, `SessionMetricsView` |
| `dashboard.constants.ts` | 15 | Constantes (`statusFilters`, `replaySpeeds`, `OPERATIONS_DETAIL_WIDTH`, etc.) |
| `dashboard.utils.ts` | 218 | 26 funciones helper (`formatSpeed`, `getRouteInfo`, `applyOperationalSnapshot`, etc.) |
| `dashboard.styles.ts` | 860 | `StyleSheet.create()` completo (~80+ propiedades) |

### Componentes (`dashboard/components/`)
| Archivo | Líneas | Componente exportado | Componentes privados |
|---------|--------|----------------------|----------------------|
| `dashboard-operational-unit-card.tsx` | 44 | `OperationalUnitCard` | — |
| `dashboard-vehicle-side-panel.tsx` | 230 | `VehicleSidePanel` | `DriverProfile`, `ProgressBar`, `Fact`, `QuickAction` |
| `dashboard-history-filters.tsx` | 103 | `HistoryFilters` | `FilterChip` |
| `dashboard-session-history-card.tsx` | 49 | `SessionHistoryCard` | — |
| `dashboard-session-detail.tsx` | 181 | `SessionDetailView` | `MapFallback`, `Fact`, `QuickAction` |

## Verificación
```bash
npm run typecheck  # sin errores
npm run build      # 560 módulos transformados, build exitoso
```
