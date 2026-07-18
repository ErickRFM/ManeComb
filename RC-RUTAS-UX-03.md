# RC-RUTAS-UX-03 — Pixel Perfect Final + Estabilidad

## Objetivo

Eliminar flicker, estabilizar el mapa de rutas, compactar tarjetas, normalizar estilos visuales y aplicar la identidad definitiva de ManeComb en el módulo de rutas del Portal.

## Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `ventas/features/portal/screens/portal-routes-screen.tsx` | Reestructuración del render para una sola ruta de retorno con mapa estable (P1); compactación de tarjetas, inputs y espacios verticales (P3-P5); hover/transiciones/glow ManeComb (P6-P7) |
| `ventas/features/portal/components/route-geometry-thumbnail.tsx` | Reescribir proyección con viewBox dinámico geográfico y padding proporcional (P2) |

## Detalle por prioridad

### P1 — Mapa NO debe desmontarse al cambiar modo (flicker)

**Problema original:** Dos return paths (`if (showRouteEditor) return <PortalLayout>A</PortalLayout>` / `return <PortalLayout>B</PortalLayout>`) provocaban que `RouteMap` se desmontara/remontara al alternar editor ↔ vista previa, causando parpadeo y recarga completa de Mapbox GL.

**Solución:**
- Crear `mapElement` (`<RouteMap key="stable-route-map">`) una sola vez, fuera de los condicionales.
- Unificar a un solo `return <PortalLayout>` que contiene `mapElement` en posición estable.
- `mapMode` (`'editor' | 'preview'`) controla solo las props del mapa (editablePoints, checkpoints, etc.), no su montaje.
- `Suspense` envuelve a `mapElement` en ambos modos, pero el elemento lazy nunca se desmonta.

### P2 — RouteGeometryThumbnail fitBounds automático

**Problema:** viewBox rígido `0 0 160 64` con padding fijo de 8px, sin adaptarse a la forma real de la ruta.

**Solución:**
- viewBox dinámico en coordenadas geográficas reales (lat/lng).
- Padding proporcional del 18% sobre el rango de datos.
- Eje Y invertido (`vpMaxLat + vpMinLat - latitude`) para que el norte quede arriba.
- Grosor de trazo y radio de círculos escalados proporcionalmente a la diagonal del viewBox.
- `preserveAspectRatio="xMidYMid meet"` para centrar y escalar correctamente.

### P3 — Reducir altura de tarjetas 20-25%

| Elemento | Antes | Después |
|----------|-------|---------|
| `unitCard` minHeight | 68 | 52 |
| `compactRouteCard` minHeight | 76 | 58 |
| `mapActionBar` minHeight | 76 | 58 |
| `unitIcon` size | 38×38 | 32×32 |
| `mapRouteIcon` size | 38×38 | 32×32 |
| `assignedCard` padding | 9 | 7 |

### P4 — Normalizar inputs y controles

| Elemento | Antes | Después |
|----------|-------|---------|
| `input` minHeight | 46 | 40 |
| `input` fontSize | 14 | 13 |
| `input` paddingHorizontal | 14 | 12 |
| `filterChip` paddingVertical | 7 | 5 |
| `filterChip` fontSize | 11 | 10 |
| `toolButton` minHeight | 42 | 36 |
| `secondaryButton` minHeight | 42 | 36 |
| `primaryButton` minHeight | 42 | 36 |
| `iconAction` size | 36×36 | 34×34 |

### P5 — Optimizar espacio vertical

| Elemento | Antes | Después |
|----------|-------|---------|
| `assignmentWorkspace` gap/minHeight | 10 / 610 | 8 / 560 |
| `previewColumn` minHeight | 610 | 550 |
| `previewMapShell` minHeight | 500 | 450 |
| `catalogList` maxHeight | 505 | 420 |
| `fullEditorShell` minHeight | 650 | 580 |
| `editorMap` minHeight | 650 | 580 |
| `pointList` maxHeight | 290 | 250 |
| `thumbnailWrap` flexBasis | 108 | 88 |

### P6 — Identidad visual ManeComb

- **Sombra/glow rojo**: activado en `unitCardActive`, `compactRouteCardActive`, `continuityBanner` usando `shadowColor: portalPalette.accent`/`portalPalette.info` con opacidad aumentada y shadowRadius 14-16px.
- **Transiciones suaves**: `transitionDuration: '0.2s'` con `transitionProperty` para `background-color, border-color, box-shadow, transform` en todas las tarjetas, botones y chips interactivos.
- **Hover**: pseudo-clase `:hover` para `unitCard` (background + border), `compactRouteCard`, `secondaryButton`, `toolButton`, `filterChip`, `sortChip`, `iconAction`.
- **Active press**: pseudo-clase `:active` con `transform: scale(0.96-0.98)` en elementos clickeables.

### P7 — Normalización de estilos

- Bordes y radios consistentes usando tokens de `AppTheme.radius`.
- Sombras unificadas en estados activos con `elevation` para compatibilidad Android.
- `compactRouteName` fontSize reducido de 11 a 10 para mejor jerarquía.
- `toolText` fontSize reducido de 12 a 11.
- `compactMetric`, `filterChipText`, `unitDriver`, `unitStatus` armonizados.

### P8 — Validación de estabilidad

- ✅ `tsc --noEmit` — 0 errores de tipo.
- ✅ `vite build` — construcción exitosa, 465 módulos transformados en 8.92s.
- ✅ `operations-map` (Mapbox GL) como chunk separado (lazy-loaded, 280 kB gzip).
- ✅ `portal-routes-screen` chunk de 34 kB (8.75 kB gzip).
- ✅ Sin advertencias de compilación ni errores de dependencia.

## Resumen de chunks producidos

| Chunk | Tamaño | Notas |
|-------|--------|-------|
| `operations-map` | 1000 kB (280 gzip) | Lazy — Mapbox GL v2.15.0 |
| `portal-routes-screen` | 34 kB (8.7 gzip) | Código de rutas compactado |
| `route-geometry-thumbnail` | 1.9 kB | Independiente, sin regresiones |
| Total app | ~565 kB (178 gzip) | Chunk principal |

## Lo que NO se modificó

- Backend, APIs, `RouteModel`, stores (`useAppStore`)
- Asignación de rutas ni contratos existentes
- `PortalLayout`, `OperationsMap` (solo se cambiaron props)
- Funcionalidad de editor (checkpoints, drag, insert, etc.)
- ConfirmModals, lógica de negocio
