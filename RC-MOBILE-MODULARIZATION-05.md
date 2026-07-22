# RC-MOBILE-MODULARIZATION-05 — Modularización de `checklist-screen`, solo capa segura (Fase 2.1 móvil)

> **Estado:** Cerrado
>
> **Rama:** `main`
>
> **Commit base:** `6c3e1ac` (Fase 1 commiteada; árbol limpio al iniciar)
>
> **Estado Git inicial:** sin revert, rebase, merge ni cherry-pick en curso.

## 1. Objetivo y resultado

Se extrajo **únicamente la capa segura** de `mobile/src/screens/checklist-screen.tsx` (2,827 líneas): la hoja de estilos, el componente presentacional `RoutePreview` y los helpers puros. Toda la lógica viva —efecto de params checklist⇄selector de mapa, escrituras `useAppStore.setState`, CRUD de rutas guardadas, `usePointToPointTracker`, modal-sheet con `PanGestureHandler`, historial y biblioteca— permaneció **byte a byte** en el contenedor.

El contenedor pasó de **2,827 a 1,514 líneas físicas**, una reducción de **1,313 líneas (46.4 %)**. Diff del contenedor: 1,339 eliminaciones + 26 inserciones, y la auditoría del diff confirma **cero inserciones que no sean imports o el re-export del contrato de test** — el cuerpo de `ChecklistScreen` no tiene ni una línea cambiada.

## 2. Inventario verificado y discrepancias

| Elemento | Auditoría | Real | Veredicto |
|---|---|---|---|
| Helpers puros | ~75–474 | 75–474 (22 funciones) + tipos `OperationalStatus` (54) / `OperationalRecord` (58–71) + consts (72–73) | ✓ |
| `RoutePreview` | ~476–633 | 476–632 | ✓ |
| `createStyles` | ~634–1386 | 634–1386 (**ya venía exportado** en el original) | ✓ |
| Contenedor | 1388+ | `ChecklistScreen` en 1388–2827 | ✓ |
| Efecto de params | ~2114–2279 | firma `processedMapSelectionRef.current === incomingSelectionKey` confirmada | ✓ intacto |
| `setState` directos | ~1480, ~2058 | 2 ocurrencias (`loadSessionHistory`, borrado de ruta) | ✓ intactos |
| CRUD rutas | ~1956/~2026/~2051 | `saveAssignedRoute`/`assignSavedRoute`/`confirmDeleteSavedRoute` | ✓ intactos |
| Test por nombre | `checklist-screen.test.ts` importa `ChecklistScreen`, `buildOperationalRecord`, `createStyles`, `getActiveLog`, `getLatestLog` de `@/src/screens/checklist-screen` | confirmado (línea 5 del test) | resuelto con re-export, test **sin editar** |

**Verificación individual de pureza de los 22 helpers (requisito de la fase):** todos puros — ninguno lee store, sesión ni API, ni dispara acciones. Detalle: `formatDuration`, `formatDistance`, `getLogTimestamp`, `getLatestLog`, `getActiveLog`, `getVehicleOperationalStatus` (usa solo la const de módulo `ACTIVE_VEHICLE_STATUSES`), `buildOperationalRecord` (usa `driverLabel`/`routeLabel` de `@shared`, puros), `getStatusLabel`, `getStatusTone`, `getStatusColor` (**recibe `theme` por parámetro**, no invoca el hook), `parseRoutePolylineParam`, `parseStopsParam`, `getPointSignature`, `looksLikeCoordinates`, `getPlaceLabel`, `getSafeLabel`, `getStopLabel`, `getStopsSignature`, `getRouteSignature`, `buildAssignedRouteSelection` (usa `normalizeAssignedRoute`, util puro), `buildSavedRouteSelection`, `buildRouteStops`. **Ninguno quedó excluido por impureza.**

**`RoutePreview` (punto 4 del encargo):** no lee el store — sus props son `onPress`, `points`, `route`, `vehicle`. Internamente usa `useAppTheme` + `createStyles` (mismo mecanismo estándar declarado para `AuthField`/`Field` en Fase 1) y tiene un `useEffect` propio de encuadre/animación del mapa: es contenido del componente y viajó con él sin alterarse — no es uno de los efectos del contenedor, que quedaron intactos. Sus 3 call sites del JSX ya eran invocaciones `<RoutePreview …/>`, así que **no hizo falta sustitución tipo `AlertCard`**: la extracción fue eliminación pura + import.

## 3. Decisiones declaradas

- **Contrato del test resuelto con re-export:** el contenedor añade `export { buildOperationalRecord, createStyles, getActiveLog, getLatestLog };` (línea 69) tras importarlos del módulo nuevo. `checklist-screen.test.ts` sigue resolviendo desde `@/src/screens/checklist-screen` y pasa **5/5 sin editarlo**.
- **Copias mecánicas:** cuerpos de helpers (75–474) y `createStyles` (634–1386) trasladados con `sed` desde el original — byte a byte por construcción. Cambios mecánicos: `export` añadido a los 15 helpers que el contenedor consume, a `OperationalRecord` (el contenedor lo usa como tipo) y a `MANECOMB_ROUTE_COLOR` (lo consumen la hoja de estilos y `RoutePreview`); quedan privados en utils `getLogTimestamp`, `getVehicleOperationalStatus`, `getPointSignature`, `looksLikeCoordinates` y `ACTIVE_VEHICLE_STATUSES`, exactamente como eran privados antes.
- **Partición de tipos declarada:** `OperationalStatus` y `OperationalRecord` se mudaron a utils (dominio de los helpers; `OperationalStatus` conserva su `export`, sin importadores externos verificado); `FilterMode`, `PointRole`, `MapPointRole`, `RouteUiState` permanecen en el contenedor (tipos de UI usados solo por él).
- Imports del contenedor recortados solo a lo que su cuerpo usa (verificado por conteo): pierde `StyleSheet`, `Typography`, `AppMap*`, `routeLabel`, `OperationalUnitSnapshot`, `GeoPoint`, `NavigationRouteOption`, `NavigationStop`; conserva `Animated`/`Easing` (sheet), `driverLabel`, `normalizeAssignedRoute`, `formatTime`, gesture-handler, API requests, tracker y store.
- Sin unificaciones con compartidos; cero dependencias nuevas.

## 4. Arquitectura final

```
mobile/src/screens/
├── checklist-screen.tsx                  (contenedor, 1,514 líneas — store, 12 estados, tracker,
│                                          efecto de params, CRUD, sheet/gestos, historial, biblioteca;
│                                          re-exporta el contrato del test)
└── checklist/
    ├── checklist.utils.ts                (433 líneas — tipos, MANECOMB_ROUTE_COLOR, 22 helpers puros)
    ├── checklist-screen.styles.ts        (758 líneas — createStyles(theme, isCompact, isPhone))
    └── components/
        └── route-preview.tsx             (166 líneas — RoutePreview con AppMap)
```

## 5. Piezas extraídas

| Pieza | Archivo | Contrato | Hooks | Imports de store/API/sesión/router |
|---|---|---|---|---|
| 22 helpers + 2 tipos + 2 consts | `checklist/checklist.utils.ts` | firmas sin cambio | — | Ninguno (`useAppTheme` solo como tipo; `@shared` y `navigation-data` son puros) |
| `createStyles` | `checklist/checklist-screen.styles.ts` | `(theme, isCompact, isPhone)` sin cambio | — | Ninguno |
| `RoutePreview` | `checklist/components/route-preview.tsx` | props `onPress?`, `points`, `route`, `vehicle` sin cambio | `useAppTheme`, `useMemo`, `useRef`, `useEffect` propio (encuadre) | Ninguno |

## 6. Métricas

| Métrica | Valor |
|---|---|
| Contenedor antes → después | 2,827 → 1,514 líneas (−1,313, −46.4 %) |
| Archivos nuevos | 3 (utils 433 + styles 758 + route-preview 166 = 1,357 líneas) |
| Archivos modificados | 1 (`checklist-screen.tsx`); el test **no se tocó** |
| Diff del contenedor | 1,339 eliminaciones, 26 inserciones (imports + re-export); auditoría del diff: cero inserciones fuera de eso |
| Total del módulo antes → después | 2,827 → 2,871 (+44 por cabeceras) |
| Dependencias nuevas | 0 |

## 7. Validaciones

| Verificación | Resultado |
|---|---|
| Línea base pre-cambio: `npm test` | 25/25 suites, 126/126 tests PASS |
| `npm run typecheck` (`tsc --noEmit`) | PASS (exit 0) |
| ESLint (contenedor + `checklist/`) | PASS (exit 0) |
| **`checklist-screen.test.ts` (ejercita los helpers movidos)** | **PASS 5/5 sin editar el test** — `buildOperationalRecord`, `getActiveLog`, `getLatestLog`, `createStyles` y el render de `ChecklistScreen` resuelven vía el re-export |
| `npm test` post-cambio | 25/25 suites, 126/126 tests — idéntico a la línea base; escaneos globales (navigation-hardening, input-infrastructure) recorren los 3 archivos nuevos y pasan |
| Bundle release Metro (`--dev false`, a directorio temporal) | PASS (exit 0) |
| Ejercicio runtime del flujo real | **No ejercitado**: crear/editar/asignar rutas y el selector de mapa requieren sesión y backend. Evidencia: test de render + suite idéntica + bundle release completo |

## 8. Matriz de compatibilidad

| Contrato | Estado |
|---|---|
| Export público `ChecklistScreen` + re-exports `buildOperationalRecord`/`createStyles`/`getActiveLog`/`getLatestLog` (contrato del test) | Sin cambio de ruta ni de nombres; test pasa sin editarse |
| **Efecto de reconstrucción del borrador desde params (contrato checklist⇄selector de mapa)** | **Intacto, byte a byte** (firma verificada en el contenedor tras el traslado) |
| **Escrituras directas `useAppStore.setState`** | **Intactas** (2 ocurrencias, mismas ubicaciones relativas) |
| **CRUD de rutas guardadas (`saveAssignedRoute`, `assignSavedRoute`, `confirmDeleteSavedRoute`)** | **Intacto** (líneas 643/713/738 del contenedor nuevo) |
| **`usePointToPointTracker` y su integración** | **Intacto** (línea 187) |
| **Modal-sheet con `PanGestureHandler`, historial y biblioteca de rutas** | **Intactos** (gestos, animación `Animated`/`Easing` y JSX sin cambios) |
| Selector del store (7 claves), 12 estados y refs, mismo orden | Sin cambio |
| Helpers: firmas y semántica (incl. `getStatusColor(theme, status)` por parámetro) | Sin cambio |
| `RoutePreview`: props y comportamiento (encuadre, marcadores, polilíneas, vacío) | Sin cambio |
| Estilos: claves y valores exactos (copia mecánica), breakpoints 1120/640 | Sin cambio |
| `package.json` / dependencias | Sin cambio |

## 9. Rollback

Cambios de esta fase sin commit (Fase 1 ya commiteada en `6c3e1ac`); reversión desde la raíz del repo:

```
git checkout -- mobile/src/screens/checklist-screen.tsx && rm -rf mobile/src/screens/checklist && rm RC-MOBILE-MODULARIZATION-05.md
```
