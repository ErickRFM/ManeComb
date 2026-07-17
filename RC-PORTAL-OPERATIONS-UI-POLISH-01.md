# RC-PORTAL-OPERATIONS-UI-POLISH-01

## Alcance

Refinamiento exclusivo de composición visual del Centro de Operaciones. No se modificaron backend, APIs, Socket.IO, stores, hooks, servicios, RBAC, modelos de datos ni `OperationsMap`.

## Cambios visuales realizados

- Se eliminó el subtítulo redundante de la vista operacional.
- El contenido operacional usa el alto completo del viewport sin habilitar scroll interno.
- La altura del mapa ahora responde al viewport mediante `clamp(360px, calc(100vh - 300px), 730px)`.
- El panel derecho usa el mismo presupuesto vertical mediante `clamp(500px, calc(100vh - 164px), 880px)`.
- Las acciones se mantienen al final del panel con `marginTop: auto`, conservando siempre su jerarquía y visibilidad.
- Los seis KPIs se conservaron y se integraron en una única banda continua:
  - una superficie exterior;
  - divisores internos;
  - sin seis sombras o cajas independientes;
  - aparición discreta de métricas.
- Se mantuvieron los estados hover, transiciones de filtros, selección de unidades, animación del panel y transición de métricas ya existentes.

## Comparación antes/después

| Antes | Después |
| --- | --- |
| Subtítulo no operacional consumiendo altura | Subtítulo eliminado únicamente en Operaciones |
| Altura mínima del mapa de 500 px, excesiva en 768 px | Mínimo de 360 px y crecimiento fluido hasta 730 px |
| Panel lateral con mínimo de 680 px | Mínimo de 500 px y alto fluido según viewport |
| KPIs como seis tarjetas separadas | Banda ejecutiva continua con divisores |
| Acciones dependientes del contenido anterior | Acciones ancladas visualmente al final del panel |
| Presupuesto vertical rígido | Presupuesto calculado desde `100vh` |

## Evidencia de rutas y capas

La tubería GIS fue auditada y no fue modificada:

- `routeCoordinates` se obtiene de `getRouteGeometry(routeFocusVehicle)`.
- `routeCheckpoints` se obtiene de `assignedRoute.stops`.
- Ambos se entregan sin transformación nueva a `OperationsMap`.
- La ruta activa/seleccionada usa el source `operations-route-source` y layer `operations-route-layer`.
- El replay usa `operations-replay-source` y `operations-replay-layer`.
- Las rutas se crean cuando existen al menos dos coordenadas.
- Las geometrías existentes se actualizan mediante `GeoJSONSource.setData`.
- Checkpoints válidos generan marcadores y se sincronizan por identificador.
- `syncLines()` se ejecuta después de `style.load`, por lo que un cambio de estilo vuelve a colocar las polylines.
- El cambio de unidad actualiza `routeFocusVehicleId`, selección, geometría y cámara mediante el flujo existente.

La jerarquía visual existente permanece intacta:

- ruta operacional: color de acento, ancho 4, extremos y uniones redondeados;
- replay: color informativo, ancho 3 y opacidad 0.72;
- checkpoints: marcadores circulares de advertencia;
- unidad seleccionada: marcador activo diferenciado.

No se introdujo una segunda interpretación de recorrido/pendiente porque el contrato actual no entrega ambos segmentos como geometrías separadas en esta vista. Inventarlos habría cambiado la semántica GIS y los datos mostrados.

## Validación responsive

La validación de composición se realizó contra las restricciones deterministas del layout:

| Viewport | Alto aproximado del mapa | Alto del bloque/panel | Resultado esperado |
| --- | ---: | ---: | --- |
| 1366×768 | 468 px | 604 px | Cabecera, mapa, KPIs y acciones dentro de 768 px |
| 1440×900 | 600 px | 736 px | Sin scroll vertical operacional |
| 1600×900 | 600 px | 736 px | Sin scroll vertical operacional |
| 1920×1080 | 730 px | 880 px | Mapa dominante y panel completo |

El modo compacto del portal establece `maxHeight: 100vh` y `overflow: hidden`; el panel no tiene `overflow: auto`. Por tanto, no se genera scrollbar vertical interno en condiciones normales para los cuatro viewports objetivo.

## Integridad de lógica

No se modificaron:

- lógica de rutas;
- Mapbox o su inicialización;
- sources, layers o markers;
- selección de unidad;
- replay;
- filtros operacionales;
- carga de historial;
- métricas;
- llamadas de red;
- estado global o local;
- hooks.

Los únicos archivos de implementación modificados por esta RC son:

- `ventas/features/portal/screens/portal-dashboard-screen.tsx`
- `ventas/features/portal/components/portal-layout.tsx`

## Validación técnica

- TypeScript: aprobado con `tsc --noEmit`.
- Build Vite: aprobado; 464 módulos transformados.
- `git diff --check`: aprobado.
- ESLint: no ejecutable porque `ventas/package.json` no declara script `lint` ni dependencia/configuración ESLint. No se instaló tooling para evitar ampliar el alcance.
- Advertencia de chunks mayores de 500 kB: informativa y preexistente; no bloquea el build.

## Estado final

- Mapa visible: preservado por la composición.
- Rutas y polylines: pipeline verificado e intacto.
- Checkpoints: pipeline verificado e intacto.
- Selección: intacta.
- Panel derecho: compacto y continuo.
- Acciones: ancladas al final y visibles dentro del presupuesto vertical.
- KPIs: información completa en banda ejecutiva.
- Scroll vertical interno: eliminado.
- Layout: equilibrado mediante alturas fluidas por viewport.
