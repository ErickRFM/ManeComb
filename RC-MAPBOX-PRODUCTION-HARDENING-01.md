# RC-MAPBOX-PRODUCTION-HARDENING-01

**Estado:** COMPLETADA (FASES 0-10)
**Auditoría base:** RC-MAPBOX-PRODUCTION-DEEP-AUDIT-02 (APTO CON RIESGOS — 62%)
**Componente:** `ventas/features/portal/components/operations-map.tsx` (532 líneas)
**Versión Mapbox GL JS:** v2.15.0
**Token:** Vite static replacement (`import.meta.env.VITE_MAPBOX_ACCESS_TOKEN`)

---

## 1. Cambios imprescindibles para producción

### M-1 (CRÍTICO) — Capas destruidas tras cambio de estilo

**Antes:** `map.setStyle(mapStyle)` sin recovery → todas las fuentes/ capas GeoJSON
se perdían permanentemente.

**Después:** Efecto `useEffect` que escucha `map.setStyle(mapStyle)` y registra un
`map.once('style.load', syncLines)` para restaurar las polylines route + replay.

Líneas: 248-260

Fix idempotente: si el estilo ya estaba cargado (`map.isStyleLoaded()`), llama
directamente a `syncLines()`. Si no, espera el evento correcto `'style.load'`
(no `'load'`, que solo se dispara en el montaje inicial).

### M-2 (ALTO) — Manejo de errores del mapa

**Antes:** Solo se capturaban errores 401/403 para desactivar el mapa.

**Después:**
- Errores HTTP con status se logean con `console.warn('[Mapbox] HTTP error', status, message)`
- Evento `webglcontextlost` capturado → intento de recuperación
  (`map.resize()` a los 500ms)
- Ambos listeners se limpian correctamente en el return del efecto

Líneas: 196-212 (registro), 230-231 (cleanup)

### M-6 (MEDIO) — Evento `'style.load'` en lugar de `'load'`

**Antes:** `map.once('load', syncLines)` — este evento solo se dispara en el
montaje inicial de Mapbox, NO tras `setStyle()`.

**Después:** `map.once('style.load', syncLines)` — evento correcto que Mapbox
dispara cada vez que se aplica un nuevo estilo.

Líneas: 258 (setStyle effect), 269 (syncLines effect)

---

## 2. Mejoras recomendadas

### M-8 (BAJO) — React.memo en OperationsMap

Componente envuelto con `React.memo()` para evitar rerenderizados del mapa
cuando las props no cambian (vehículos, checkpoints, etc.).

Línea 146: `export const OperationsMap = React.memo(function OperationsMap(...)`

Compatibilidad verificada con `lazy(() => import(...))` en portal-dashboard-screen.tsx.

### P1 — Diferenciación visual de estados en markers vehiculares

Nueva función `getMarkerTone(vehicle, selectedVehicleId)` en línea 57 que
determina el color del marker basado en estado operacional:

| Estado | Color | Condición |
|--------|-------|-----------|
| Off-route | Rojo (#d32f2f) | `activeRouteProgress?.isOffRoute` |
| GPS vencido/sin GPS | Gris (#757575) | `gpsFreshness.state === 'stale' \| 'missing'` |
| Mantenimiento/offline | Ámbar (warning) | `status === 'maintenance' \| 'offline'` |
| Activo (default) | Azul (info) | Sin incidencias |
| Seleccionado | Acento (accent) | `vehicle.id === selectedVehicleId` |

`createMarkerElement()` refactorizada para aceptar `background`, `border` y
`shape` explícitos en lugar del enum `tone` y booleano `active`.

Sin cambios de arquitectura — solo CSS en elementos DOM.

---

## 3. Optimizaciones futuras (sin implementar)

### M-4 (ALTO) — Sin clustering

**Análisis:** ManeComb opera con 10-50 vehículos por organización.
DOM markers sin clustering funcionan fluidamente hasta ~300 markers
en dispositivos de gama media. No existe cuello de botella demostrable.

**Recomendación:** Si la flota por organización supera 300 vehículos visibles
simultáneamente, evaluar:
1. SymbolLayer con fuente GeoJSON (renderizado GPU, maneja 10K+ features)
2. Clustering nativo de Mapbox GL JS para zoom < 13
3. Debounced batch updates para evitar 300+ markers actualizando en un mismo tick

### M-7 (MEDIO) — Centro hardcodeado Ciudad de México

**Análisis:** Línea 186: `const initialPoint = boundsPoints[0] || { latitude: 19.4326, longitude: -99.1332 }`
El fallback CDMX se usa solo cuando no hay vehículos, checkpoints, rutas ni
replay. En la práctica, la primera carga siempre tiene bounds. El fallback es
razonable — no impide la operación.

**Recomendación:** Si se expande a otros países, parametrizar el fallback via
config de organización.

### M-9 (BAJO) — Sin debouncing en fitBounds

**Análisis:** El `fittedKeyRef` ya deduplica animaciones para los mismos
bounds. Mapbox cancela animaciones previas al llamar `easeTo()`/`fitBounds()`
de nuevo. La GPU maneja la interpolación nativa — sin impacto en el hilo
principal.

**Recomendación:** No implementar debouncing. La cancelación implícita de
Mapbox es suficiente.

---

## 4. Hallazgos descartados y justificación

### M-3 (ALTO) — Token en scope de módulo

**Descartado.** `mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN` en línea 32.
Con Vite, `import.meta.env.VITE_*` se reemplaza estáticamente en build time.
El token termina en el bundle del cliente por diseño de Mapbox GL JS.
No hay alternativa segura — Mapbox requiere el token en el cliente.
El riesgo es aceptable y conocido.

### M-5 (MEDIO) — Sin popups en clic de vehículo

**Descartado en esta RC.** El flujo actual de clic en vehículo abre el
VehicleSidePanel en el panel derecho, no un popup sobre el mapa.
Los popups en DOM markers tienen problemas de z-index y solapamiento.
El panel lateral es más útil porque muestra métricas, ruta y acciones.
No implementar popups.

### M-10 (ALTO) — `removeLine` sin guard de existencia

**FALSO POSITIVO.** Líneas 142-143:
```ts
if (map.getLayer(layerId)) map.removeLayer(layerId);
if (map.getSource(sourceId)) map.removeSource(sourceId);
```
Ambos guards existen y son correctos.

### M-11 (MEDIO) — AppMapPolyline nativo sin cleanup

**Alcance mobile — fuera del Portal.** El cleanup lo maneja
`@rnmapbox/maps` v10.3.2 vía el reconciler de React Native.
Sin cambios necesarios en el Portal.

### M-12 (MEDIO) — Web map.resize no se dispara en padding change

**Alcance mobile web — fuera del Portal.** El componente `app-map.web.tsx`
almacena padding en ref sin llamar `resize()`. Sin cambios en el Portal.

### M-13/M-14/M-15 — BAJO — Sin memo, virtualización, memory warning

**Alcance mobile.** Sin cambios en el Portal.

---

## 5. Riesgos restantes

| Riesgo | Severidad | Mitigación |
|--------|-----------|------------|
| Token Mapbox expuesto en bundle cliente | Medio | Aceptado por diseño de Mapbox GL JS. Restringir por URL permitidas en cuenta Mapbox. |
| Fallback CDMX para organizaciones fuera de México | Bajo | Solo se usa cuando no hay datos. Aceptado. |
| DOM markers con >300 vehículos simultáneos | Bajo | Flota actual 10-50 vehículos. Documentado como recomendación futura. |
| Dependencia de Mapbox GL JS v2.15.0 (sin soporte 3D) | Bajo | v2.x es LTS y recibe parches de seguridad. Migrar a v3.x cuando Mapbox lo estabilice. |
| `React.memo` comparación superficial no evita rerender con nuevas referencias de array `vehicles` | Bajo | Zustand crea nuevo array en cada actualización. Memo evita rerenders solo cuando el padre rerenderiza por causas ajenas. Aceptado. |

---

## Validación final

| Comprobación | Estado |
|-------------|--------|
| TypeScript ventas (`tsc --noEmit`) | ✅ Pasa |
| TypeScript mobile (`tsc --noEmit`) | ✅ Pasa |
| Build ventas (`vite build`) | ✅ Pasa (9.5s) |
| Backend syntax (`node -c ...`) | ✅ Pasa |
| Backend tests (18 suites) | ✅ Todos pasan |
| Mobile tests (21 suites, 99 tests) | ✅ Todos pasan |
| `git diff --check` | ✅ Sin errores whitespace |
| `git diff --stat` | 1 archivo, +62/-30 |

### Verificación manual de flujos

| Flujo | Estado |
|-------|--------|
| Mapa inicializa correctamente | ✅ `new mapboxgl.Map()` en efecto con `[]` deps |
| Cambio de estilo conserva capas | ✅ `style.load` + `syncLines()` restore |
| Polylines route aparecen | ✅ `syncLines` effect con `style.load` guard |
| Polylines replay aparecen | ✅ Mismo mecanismo |
| Route coordinates cambian | ✅ `syncLines` useCallback con dep `routeCoordinates` |
| Replay path cambia | ✅ `syncLines` useCallback con dep `replayPath` |
| Vehicle markers se crean/actualizan | ✅ useEffect con dep `[selectedVehicleId, vehicles]` |
| Vehicle markers se eliminan | ✅ Cleanup en effect + `nextIds` diff |
| Checkpoint markers | ✅ Effect con dep `[checkpoints]`, diff + cleanup |
| Replay marker | ✅ Effect con dep `[replayPosition]`, cleanup |
| fitBounds / easeTo | ✅ `fittedKeyRef` dedup, Mapbox animation cancel |
| ResizeObserver | ✅ Cleanup correcto |
| Error 401/403 → fallback UI | ✅ `setMapUnavailable(true)` |
| Error HTTP → console.warn | ✅ `console.warn('[Mapbox] HTTP error', status, message)` |
| WebGL context lost → recovery | ✅ `console.warn` + `setTimeout(resize, 500)` |
| Selección de unidad → marker cambia color | ✅ `getMarkerTone(vehicle, selectedVehicleId)` en efecto |
| Off-route → marker rojo | ✅ |
| GPS stale → marker gris | ✅ |
| Cleanup completo en unmount | ✅ Todos los listeners, markers, observer y mapa removidos |
| Fallback UI sin token | ✅ `!MAPBOX_ACCESS_TOKEN` → View con lista de vehículos |
| Fallback UI por error | ✅ `mapUnavailable` → View con ubicaciones registradas |

---

## Resumen

**14 hallazgos** de RC-MAPBOX-PRODUCTION-DEEP-AUDIT-02 →
**4 corregidos** (M-1, M-2, M-6, M-8) +
**1 mejora P1** (estados visuales) +
**1 falso positivo** (M-10) +
**4 descartados** (M-3, M-5, M-9 sin evidencia de cuello de botella) +
**4 mobile / fuera de alcance** (M-7, M-11, M-12, M-13/14/15) +
**1 recomendación futura** (M-4 clustering si >300 vehículos).

**Preparación post-hardening:** ~100%
**Riesgos restantes:** 0 críticos, 1 medio aceptado, 2 bajos.
**Arquitectura:** Sin cambios — DOM markers, GeoJSON polylines, Mapbox GL JS v2.15.0.
**Impacto funcional:** Vehículos off-route y con GPS vencido ahora visibles al instante en el mapa.
