# RC-RUTAS-UX-01 — Inventario técnico

## Fuente de verdad existente

- `RouteModel` y el store embebido ya persisten nombre, código, color, origen, destino, paradas, geometría, distancia y duración.
- `Vehicle.assignedRoute` y `vehicle.routeId` ya representan la asignación vigente; no se introduce un segundo modelo.
- `POST /navigation/routes`, `PATCH /navigation/routes/:routeId` y `DELETE /navigation/routes/:routeId` ya crean, actualizan y eliminan rutas, incluyendo la actualización de snapshots asignados.
- `POST /navigation/assign` y `DELETE /navigation/assign/:vehicleId` siguen siendo el único flujo de asignación y liberación.
- `POST /navigation/plan`, búsqueda y geocodificación ya resuelven geometría y puntos; el editor debe consumirlos, no duplicar routing.
- Las sesiones, eventos, posiciones, visitas a checkpoints, métricas, replay y sockets ya dependen de la asignación actual y permanecen sin cambios.
- Los permisos `canManageRoutes`, aislamiento por organización y `requireOperationalAccess` ya protegen los contratos.

## Reutilización de frontend

- `useAppStore` conserva carga de unidades, `assignRoute`, `clearRouteAssignment`, estado de envío y actualización de Zustand.
- `OperationsMap` ya dibuja polylines, checkpoints, unidades y estados sin crear otro motor de mapas.
- `PortalLayout`, `PortalSectionCard`, `StatusBadge`, `EmptyState` y `ConfirmModal` mantienen el sistema visual y accesibilidad del portal.
- Los tipos `GeoPoint`, `NavigationStop`, `NavigationRouteOption`, `AssignedRoute` y `Vehicle` siguen siendo los contratos base.

## Única capacidad de infraestructura faltante

- El backend persistía rutas pero no exponía una lectura autenticada del catálogo. Se añade `GET /navigation/routes`, respaldado por `listRoutes`, con el mismo aislamiento de organización. No cambia ningún contrato existente.

## UI nueva

- Modo asignación: unidad → ruta guardada → vista previa no editable → asignar.
- Modo editor: reemplazo de vista, mapa dominante y paneles de herramientas/detalles.
- Tarjetas y miniaturas del catálogo, selección, hover/foco y continuidad inmediata tras guardar.

## Invariantes

- No se crean modelos, stores de dominio, endpoints de asignación ni persistencias paralelas.
- Operaciones, seguimiento, sockets, sesiones, historial y replay continúan consumiendo la asignación existente.

## Auditoría final — iteración de producto

- Reutilización: edición y vista previa usan `OperationsMap`; el recálculo usa `POST /navigation/plan`; crear, editar, eliminar y asignar usan los contratos existentes.
- Ausencia de duplicación: no se añadieron modelos, stores de dominio, motores de routing ni persistencias paralelas.
- Editor: origen/destino y checkpoints son seleccionables y arrastrables; se eliminan individualmente, se insertan puntos y la lista permite reordenar checkpoints por drag & drop.
- Miniaturas: SVG liviano generado directamente desde `polyline` y `stops`; no usa imágenes, screenshots ni instancias adicionales de Mapbox.
- Rendimiento: recálculo con debounce de 320 ms; mapa cargado de forma lazy; miniaturas vectoriales memoizadas.
- Microinteracciones: hover, glow, elevación, selección, drag y eliminación entre 180–220 ms, respetando `prefers-reduced-motion`.
- Catálogo: búsqueda local, filtro asignadas/sin uso y orden por reciente, nombre o distancia.
- Responsive: paneles flexibles con wrap, mínimos seguros y catálogo fluido.
- Accesibilidad básica: roles, labels, estado seleccionado, foco visible y reducción de movimiento.
- TypeScript: `tsc --noEmit` aprobado.
- Build: `vite build` aprobado; mantiene la advertencia preexistente de chunks grandes de Mapbox.
- Lint: el paquete `ventas` no define script ni configuración de lint; no se declara como validado.
- Validación visual automatizada: no disponible en la sesión actual; pendiente únicamente la inspección renderizada manual, no la funcionalidad ni compilación.
