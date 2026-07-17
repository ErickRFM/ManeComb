# RC-OPERATIONS-UI-MASTER-01

## 1. Análisis previo del módulo

La pantalla de Operaciones está implementada en `ventas/features/portal/screens/portal-dashboard-screen.tsx` y se monta desde la ruta existente `/portal` en `ventas/src/App.tsx`.

El módulo ya concentraba toda la funcionalidad requerida:

- `useAppStore` aporta vehículos, conductores, actualización de conductor y señales de actualización de jornadas.
- Las consultas existentes obtienen historial, métricas, eventos, checkpoints y posiciones GPS.
- `OperationsMap` conserva Mapbox, marcadores, rutas, checkpoints, cámara, zoom, tráfico, selección y replay.
- El estado local existente conserva filtros, selección de unidad y jornada, caché de detalle, paginación de posiciones y controles de replay.
- `VehicleSidePanel`, `SessionHistoryCard` y `SessionDetailView` ya representaban la información operacional, el historial y el detalle.

No se modificaron Backend, APIs, Socket.IO, GPS Engine, stores, hooks compartidos, modelos, servicios, permisos ni contratos.

## 2. Componentes reutilizados

- `PortalLayout`
- `PortalSectionCard`
- `OperationsMap`
- `VehicleSidePanel`
- `OperationalUnitCard`
- `SessionHistoryCard`
- `SessionDetailView`
- `HistoryFilters`
- `DriverProfile`
- `ProgressBar`
- `Fact`
- `QuickAction`
- `StatusBadge`

## 3. Componentes reorganizados

- El lienzo principal muestra exclusivamente el mapa y el panel operacional derecho.
- El mapa ocupa aproximadamente 70% del ancho y el panel 30%.
- La lista de unidades se presenta una sola vez como overlay compacto del mapa.
- El panel derecho mantiene el orden Unidad, Estado, Ruta, Conductor, Métricas, Eventos recientes y Acciones.
- Los eventos existentes se muestran como timeline compacto con línea, estado y fecha.
- Historial y Detalle se renderizan como vistas independientes del mismo módulo mediante `?view=history` y `?view=detail`.
- Los enlaces conservan los identificadores existentes de vehículo y jornada.
- Las métricas operacionales útiles permanecen en el panel lateral y no se duplican como fila de KPIs.

## 4. Integridad de la lógica

La navegación entre vistas usa el router ya implementado. No se añadieron rutas de aplicación, stores, consultas ni cachés. Historial y Detalle reutilizan el mismo estado, las mismas funciones `loadHistory`, `openSession` y `loadMorePositions`, y el mismo `detailCache`.

La selección de una unidad conserva el comportamiento anterior: actualiza la unidad seleccionada, focaliza su ruta y carga la jornada disponible. El cambio de conductor mantiene `updateUser`, seguido por las recargas ya existentes.

## 5. Funcionalidad del mapa

`OperationsMap` no fue modificado. Permanecen intactos:

- Mapbox y su estilo nocturno.
- Marcadores de vehículos y checkpoints.
- Polilínea de ruta y replay.
- Selección desde marcador.
- Cámara, auto-fit, zoom, escala y tráfico.
- Posición y orientación durante replay.
- Fallback cuando Mapbox no está disponible.

## 6. Comparativa visual

| Referencia | Implementación |
| --- | --- |
| Mapa protagonista | Columna izquierda de aproximadamente 70% |
| Panel siempre a la derecha | Columna fija de aproximadamente 30%, sin wrap |
| Unidades sobre el mapa | Overlay inferior compacto y único |
| Panel operacional compacto | Secciones jerárquicas con densidad reducida |
| Estado, ruta y conductor | Datos existentes agrupados en ese orden |
| Timeline de eventos | Tres eventos recientes con línea vertical y fecha |
| Acciones al final | Acciones existentes agrupadas al pie del panel |
| Historial fuera del mapa | Vista `?view=history` |
| Detalle fuera del mapa | Vista `?view=detail` con replay existente |
| Sin fila inferior de dashboard | Métricas reubicadas dentro del contexto de unidad |

## 7. TypeScript

Comando: `npm.cmd run typecheck`

Resultado: correcto, sin errores (`tsc --noEmit`).

## 8. ESLint

No ejecutable en el paquete `ventas`: `package.json` no declara script `lint` ni dependencia de ESLint. `npm.cmd run lint` devuelve `Missing script: "lint"`. No se instaló tooling nuevo para respetar el alcance del RC.

## 9. Vite Build

Comando: `npm.cmd run build`

Resultado: correcto. Vite transformó 464 módulos y generó el bundle de producción. Permanece la advertencia informativa de chunks mayores a 500 kB, sin error de compilación.

## 10. git diff --check

Comando: `git diff --check -- ventas/features/portal/screens/portal-dashboard-screen.tsx`

Resultado: correcto, sin errores de whitespace. Git únicamente informa la conversión futura LF/CRLF propia del entorno Windows.

## Validación visual y funcional pendiente de entorno

La inspección automatizada del DOM en el navegador integrado no pudo completarse porque el servidor local de Vite no permaneció accesible (`ERR_CONNECTION_REFUSED`). La validación estática contra la referencia, TypeScript y producción sí se completó. La comprobación autenticada de datos reales, interacciones y los cuatro viewports deberá ejecutarse con el Portal local disponible y una sesión válida.

