# RC-PORTAL-02 — Modularización de portal-routes-screen.tsx

## Estado

Cerrado

## Commit de implementación

```
7922118
```

## Objetivo

Modularización estructural de `portal-routes-screen.tsx` (1,120 → 778 líneas, −30.5 %) extrayendo componentes presentacionales, estilos, tipos y utilidades a `routes/`, conservando exactamente el comportamiento actual y sin cambiar datos, lógica, UI, mapa, store, API, navegación, validaciones, CRUD ni geometrías.

## Archivos creados (9)

```
ventas/features/portal/routes/routes.types.ts
ventas/features/portal/routes/routes.utils.ts
ventas/features/portal/routes/routes.styles.ts
ventas/features/portal/routes/components/route-unit-selector.tsx
ventas/features/portal/routes/components/route-catalog-panel.tsx
ventas/features/portal/routes/components/route-preview-panel.tsx
ventas/features/portal/routes/components/route-editor-toolbar.tsx
ventas/features/portal/routes/components/route-editor-details.tsx
ventas/features/portal/routes/components/route-assigned-panel.tsx
```

## Archivo modificado (1)

```
ventas/features/portal/screens/portal-routes-screen.tsx
```

**Total: 10 archivos afectados** (852 inserciones, 479 eliminaciones).

## Componentes extraídos

| Componente | Responsabilidad |
|---|---|
| `RouteUnitSelector` | Lista de unidades con selección activa |
| `RouteCatalogPanel` | Catálogo con búsqueda, filtros, ordenamiento y lista |
| `RoutePreviewPanel` | Vista previa de ruta con mapa y barra de acciones |
| `RouteEditorToolbar` | Herramientas del editor (seleccionar, checkpoint, insertar, eliminar) |
| `RouteEditorDetails` | Detalles del editor (nombre, labels, métricas, lista de puntos con drag & drop) |
| `RouteAssignedPanel` | Panel de ruta asignada a la unidad seleccionada |

## Foundation

| Archivo | Contenido |
|---|---|
| `routes.types.ts` | Tipo `RouteEditor` y factory `createBlankEditor` |
| `routes.utils.ts` | Funciones puras: `parseCoordinate`, `getRouteGeometry`, `getDriverName`, `getRouteLabel` |
| `routes.styles.ts` | Todos los estilos extraídos (~120 entradas) |

No se creó `routes.constants.ts` porque no fue necesario.

## Funciones en routes.utils.ts

Las cuatro funciones (`parseCoordinate`, `getRouteGeometry`, `getDriverName`, `getRouteLabel`) son **puras**:

- No acceden al store (`useAppStore`, `usePortalStore`)
- No llaman API (`axios`)
- No navegan (`router`)
- No usan sockets
- No ejecutan timers (`setTimeout`, `setInterval`)
- No usan `localStorage`
- No mutan estado global
- No ejecutan setters de React

Reciben datos por parámetros y devuelven valores transformados.

## Compatibilidad

No cambiaron los siguientes aspectos respecto al estado previo a la modularización:

- CRUD (create, read, update, delete de rutas)
- Validaciones (longitud de nombres, rangos de coordenadas, duplicados)
- Datos y payloads enviados a la API
- Endpoints consumidos
- Store (`useAppStore`)
- Navegación (`router.push`)
- Geometrías y polilíneas
- Orden de paradas y checkpoints
- Mapas (`OperationsMap`, `RouteGeometryThumbnail`)
- Diseño visual (colores, fuentes, espaciados, bordes, sombras)
- Textos visibles para el usuario
- Dependencias (`package.json` sin cambios)

## Métricas

| Métrica | Valor |
|---|---|
| Líneas originales (commit padre `cdf68d2`) | 1,120 |
| Líneas finales | 778 |
| Reducción absoluta | 342 |
| Reducción porcentual | 30.5 % |
| Archivos nuevos | 9 |
| Archivos afectados totales | 10 |

## Validaciones posteriores al rebase

| Validación | Resultado |
|---|---|
| `tsc --noEmit` (typecheck) | Sin errores |
| `vite build` (build) | Éxito (569 módulos transformados) |
| `npm run test` | No disponible — el script `test` no está definido en `package.json` |
| `git diff --check` | Sin errores de whitespace |
| `git status --short` | Árbol limpio |

## Rollback

```bash
git revert 7922118
```

No ejecutar a menos que sea necesario.
