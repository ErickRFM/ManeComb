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
