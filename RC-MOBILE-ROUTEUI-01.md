# RC-MOBILE-ROUTEUI-01 — Fase 1 (read-only): marcadores mochos + paradas encimadas

> **Estado:** Fase 1 cerrada, **solo lectura, cero cambios de código** (diff vacío). Dos bugs diagnosticados **por separado**; causas raíz **distintas**, en **componentes/archivos/pantallas distintos**. → fixes **independientes** (detalle al final).

---

## Bug 1 — Pines numerados "mochos" (punta/fondo comido)

### 1. Quién renderiza los marcadores numerados
[`MapCanvas.tsx` → `SelectorMarkers`](mobile/src/screens/map/components/MapCanvas.tsx), stops numerados en **:286-297**:
```tsx
{stops.map((stop, index) => (
  <AppMapMarker key={stop.id} id={`stop-${stop.id}`} coordinate={...}>
    <View style={[
      styles.selectorStopMarker,
      SELECTOR_STOP_MARKER_OFFSETS[index % SELECTOR_STOP_MARKER_OFFSETS.length],  // :291
      { backgroundColor: theme.colors.warning },
    ]}>
      <Text style={styles.stopMarkerText}>{index + 1}</Text>
```
`AppMapMarker` **no** es `react-native-maps`: el mapa es **Mapbox** (`@rnmapbox/maps`). `AppMapMarker` envuelve el hijo en **`Mapbox.PointAnnotation`** ([app-map.native.tsx:316-326](mobile/src/components/app-map.native.tsx)):
```tsx
<Mapbox.PointAnnotation coordinate={...} id={...} ...>
  <View style={styles.markerHost}>{children}</View>   // :325  markerHost solo centra (:331-334)
</Mapbox.PointAnnotation>
```
**Clave:** `PointAnnotation` **rasteriza el View hijo a un bitmap del tamaño MEDIDO del hijo**. Todo lo que dibuje fuera de esa caja medida (sombra, elevation, `transform`) **se recorta** en el snapshot. (Es la limitación documentada de PointAnnotation; por eso @rnmapbox recomienda `MarkerView` para contenido que desborda.)

### 2. Cómo se renderizan SAL y FIN — mismo componente, **estilo distinto**
Mismo `SelectorMarkers`, mismo `AppMapMarker`/`PointAnnotation`, pero **otro estilo**:
- **SAL** ([MapCanvas:269-270](mobile/src/screens/map/components/MapCanvas.tsx)) y **FIN** ([:281-282](mobile/src/screens/map/components/MapCanvas.tsx)): `styles.selectorPointMarker`.
- **Numerados** ([:288-294](mobile/src/screens/map/components/MapCanvas.tsx)): `styles.selectorStopMarker` **+ `SELECTOR_STOP_MARKER_OFFSETS`**.

Ni SAL/FIN ni los numerados pasan `anchor`/`centerOffset` → **el anchor es idéntico (default center)**. El anchor **no** es la diferencia. La diferencia está **100% en el estilo**:

| Propiedad | `selectorPointMarker` (SAL/FIN, **completo**) | `selectorStopMarker` (numerados, **mocho**) |
|---|---|---|
| Ubicación | [map-styles.ts:253](mobile/src/screens/map/map-styles.ts) | [map-styles.ts:256-267](mobile/src/screens/map/map-styles.ts) |
| Tamaño | 42×30 | 30×30 |
| **Sombra / elevation** | **ninguna** | **`elevation: 4`, `shadowOpacity: 0.16`, `shadowRadius: 5`** |
| **`transform` extra** | **ninguno** | **`SELECTOR_STOP_MARKER_OFFSETS` → `translateY: ±8`** ([MapCanvas:13-19](mobile/src/screens/map/components/MapCanvas.tsx), aplicado :291) |

### 3. Causa concreta del corte
**No es anchor** (idéntico en ambos) **ni `overflow:hidden`** (`markerHost` no tiene overflow; solo centra). Es que **el estilo numerado dibuja fuera de la caja medida que `PointAnnotation` rasteriza**, por **dos** aportes que SAL/FIN no tienen:

1. **`elevation: 4` + `shadowRadius: 5` (factor SIEMPRE presente, explica que hasta el "1" salga mocho).** La sombra/elevation de Android se pinta por fuera del box de 30×30; el bitmap de `PointAnnotation` se acota al box del hijo → la sombra y el borde inferior se comen ⇒ el círculo queda con el fondo plano/cortado. `SELECTOR_STOP_MARKER_OFFSETS[0]` es `translateY:0` (sin desplazamiento), así que el ítem #1 **no** tiene transform y aun así sale mocho → el culpable común es la sombra/elevation.
2. **`transform: translateY(±8)` (agrava en los índices 1-4).** Los transforms en RN **no** cambian el layout: el box medido sigue siendo 30×30 centrado, pero el contenido se pinta desplazado ±8px → la parte desplazada cae **fuera** del box rasterizado y se recorta. Por eso los ítems 2-5 se ven peor que el 1.

**SAL/FIN** (`selectorPointMarker`): sin sombra ni transform → nada sale del box → snapshot completo.

> **Causa raíz Bug 1:** los marcadores numerados usan `selectorStopMarker` con **elevation/sombra** (siempre) **y** `transform: translateY(±8)` (índices 1-4), y ambos pintan fuera de la caja medida que **`Mapbox.PointAnnotation` rasteriza y recorta**; SAL/FIN usan `selectorPointMarker` sin sombra ni transform y por eso quedan enteros. Diferencia exacta: [map-styles.ts:253 vs :256-267](mobile/src/screens/map/map-styles.ts) + el offset [MapCanvas:13-19/:291](mobile/src/screens/map/components/MapCanvas.tsx).

*(Confirmación final es por dispositivo — coherente con tu captura en real; el mecanismo está anclado en el código + el comportamiento documentado de PointAnnotation.)*

---

## Bug 2 — Lista de paradas encimada/cortada en "Editando ruta"

### 4. Qué componente es la lista
[`checklist-screen.tsx:1305-1339`](mobile/src/screens/checklist-screen.tsx) — panel `configCard` "Editando ruta" (:1281). La lista es un **`map()` de `<View>`**, NO `FlatList` ni `ScrollView`:
```tsx
{waypointCount ? (
  <View style={styles.compactStopsList}>                 // :1306
    {tracker.pointStops.map((stop, index) => (
      <View key={stop.id} style={styles.stopRow}>        // :1308  fila
        <View style={styles.waypointNumber}>...          // :1309  número 28×28
```

### 5. Estados de altura / scroll (con archivo+línea)
- `compactStopsList` ([styles:653-658](mobile/src/screens/checklist/checklist-screen.styles.ts)): `gap:10, borderTopWidth, paddingTop:10` — **sin `maxHeight`, sin `overflow`, sin scroll propio**. Crece con el contenido.
- `stopRow` ([styles:594-598](mobile/src/screens/checklist/checklist-screen.styles.ts)): `flexDirection:'row', alignItems:'center', gap:12` — **sin `height`/`minHeight`/`paddingVertical`**. Altura de fila = hijo más alto (`waypointNumber` 28px).
- Las filas **no** se solapan por sí mismas: gaps positivos (lista 10, fila 12), sin `position:absolute` ni márgenes negativos. El "encimado" percibido = la **cola de la lista recortada** por el borde inferior del panel (ver §6).

### 6. ¿El panel es scrolleable? — **No efectivamente. Ésta es la causa raíz.**
El `configCard` "Editando ruta" está dentro de:
`<Modal>` ([:1169](mobile/src/screens/checklist-screen.tsx)) → `modalCard` → `<ScrollView style={modalScroll}>` ([:1198](mobile/src/screens/checklist-screen.tsx)).

- `modalCard` ([styles:208-217](mobile/src/screens/checklist/checklist-screen.styles.ts)): **`maxHeight: '96%'`** (no altura fija) — se ajusta al contenido hasta el 96%.
- `modalScroll` ([styles:270-272](mobile/src/screens/checklist/checklist-screen.styles.ts)): **`{ flexGrow: 0 }`**.

**El defecto:** en RN el `flexShrink` por defecto es **0** (a diferencia de web). Con `flexGrow:0` **y** `flexShrink:0`, el `ScrollView` toma **la altura natural de su contenido** y **nunca recibe un viewport acotado** dentro del `modalCard`. Como `modalCard` es `maxHeight` (no altura fija), mientras el contenido cabe, todo bien; pero cuando el card "Editando ruta" (nombre + origen/destino + **N filas de parada** + mensaje + fila de acciones Cancelar/Guardar, [:1342+](mobile/src/screens/checklist-screen.tsx)) **supera el 96% de la pantalla**, el `ScrollView` sigue midiendo la altura del contenido (no encoge) y el `modalCard` **recorta** la cola por el techo del 96% — **sin desplazamiento disponible**. Es el bug clásico de RN "ScrollView dentro de un modal `maxHeight` no scrollea porque le falta `flex:1`/`flexShrink:1`".

> **Causa raíz Bug 2:** [`modalScroll: { flexGrow: 0 }`](mobile/src/screens/checklist/checklist-screen.styles.ts) (styles:270-272) dentro de un `modalCard` con `maxHeight:'96%'` (styles:208) y sin `flexShrink`: el `ScrollView` se dimensiona al contenido y no obtiene un viewport acotado que scrollear; al exceder el 96%, las últimas filas de parada + los botones de acción se **recortan** por el borde del panel sin scroll. La lista (`compactStopsList`/`stopRow`) no tiene altura ni scroll propios y depende por completo de ese ScrollView que no scrollea.

---

## Recomendación de alcance para Fase 2 — **fixes INDEPENDIENTES**

| | Bug 1 (marcadores mochos) | Bug 2 (paradas cortadas) |
|---|---|---|
| Pantalla | mapa de creación de ruta (`SelectorMarkers`) | modal "Editando ruta" (`configCard`) |
| Componente | [MapCanvas.tsx](mobile/src/screens/map/components/MapCanvas.tsx) + [map-styles.ts](mobile/src/screens/map/map-styles.ts) | [checklist-screen.tsx](mobile/src/screens/checklist-screen.tsx) + [checklist-screen.styles.ts](mobile/src/screens/checklist/checklist-screen.styles.ts) |
| Mecanismo | rasterización de `Mapbox.PointAnnotation` recorta sombra/`transform` fuera del box | `ScrollView flexGrow:0`/sin `flexShrink` no scrollea en modal `maxHeight` |
| Causa compartida | **No** | **No** |

**No comparten causa ni componente.** Son **dos fixes separados**, cada uno en su archivo, sin solape. Se pueden abordar en RCs de Fase 2 distintos (o en uno solo con dos commits claramente separados), sin riesgo de que uno toque el otro.

**PROHIBIDO en esta fase (respetado):** cero cambios de código; no propuse el fix; no asumí causa compartida (la descarté con evidencia); no toqué portal, threads de snapshot, ni App.tsx admin. Diff vacío.

---

# Fase 2 — Ejecutado (dos commits separados)

> **Estado:** Cerrado. Dos fixes independientes en dos commits limpios en rama `rc-mobile-routeui-01`. Diseño preservado en Bug 1 (no aplanado); lista con scroll sin romper el resto del modal en Bug 2.
>
> **Validación:** typecheck **exit 0**, eslint (3 archivos) **exit 0**, suite **26/134** (baseline intacto), **bundle release `--dev false`** **exit 0**.

## Commit 1 — `539ff2f` Bug 1 (pines numerados mochos)
**Enfoque: preservar el diseño, agrandar la caja rasterizada.** No se eliminó ni la sombra ni el `transform` (offset anti-solapamiento intencional); se envolvió el pin en un host transparente con padding para que la caja que `PointAnnotation` rasteriza contenga ambos.

**A. [map-styles.ts](mobile/src/screens/map/map-styles.ts) — nuevo host (tras `selectorStopMarker`):**
```ts
selectorStopMarkerHost: {
  padding: 16,               // ≥ 8 (transform ±8) + ~5 (sombra/elevation)
  alignItems: 'center',
  justifyContent: 'center',
},
```
**B. [MapCanvas.tsx:286-299](mobile/src/screens/map/components/MapCanvas.tsx) — wrap del pin numerado:**
- **Antes:** `<AppMapMarker>` → `<View style={[selectorStopMarker, OFFSET, {bg}]}>` (la sombra + `translateY/X ±8` se pintaban fuera del box de 30×30 → recorte).
- **Después:** `<AppMapMarker>` → **`<View style={selectorStopMarkerHost}>`** → `<View style={[selectorStopMarker, OFFSET, {bg}]}>`. El host mide 62×62; el pin (30×30) + su sombra + el desplazamiento ±8 caen dentro → sin recorte.

**Por qué preserva el look:** `SELECTOR_STOP_MARKER_OFFSETS` (transform) y `elevation/shadow` **intactos**. El anchor de `PointAnnotation` (center) centra el host de 62×62 sobre la coordenada; el pin sigue desplazado ±8 respecto al centro → **misma posición visual y mismo efecto anti-solapamiento**, solo que ahora la caja lo contiene.

**Por qué arregla #1 Y 2-5:**
- **#1** (`OFFSET[0] = translateY:0`, sin transform): el único desborde era la **sombra/elevation**; el padding 16 la incluye → completo.
- **2-5** (`translateY/X ±8` + sombra): el padding cubre `8 + ~5 = 13 ≤ 16` en cada eje → completos.

Cálculo de holgura (host 62×62, pin centrado en 16..46): peor caso lejano `16+30+8+5 = 59 ≤ 62`; peor caso cercano `16−8−5 = 3 ≥ 0`. Ambos dentro con margen. **SAL/FIN (`selectorPointMarker`) no se tocaron.**

## Commit 2 — `5d52f82` Bug 2 (paradas cortadas en "Editando ruta")
**[checklist-screen.styles.ts:270-277](mobile/src/screens/checklist/checklist-screen.styles.ts):**
- **Antes:** `modalScroll: { flexGrow: 0 }`
- **Después:** `modalScroll: { flexGrow: 0, flexShrink: 1 }`

`flexGrow:0` conserva el "abrazar contenido" cuando es corto; `flexShrink:1` (el default de RN es 0) deja que el `ScrollView` ceda ante el `maxHeight:'96%'` del `modalCard` y scrollee cuando el contenido excede. Solo estilo; el `map()` de la lista no cambió.

**Qué más vive en `modalScroll` (verificado) — el fix no rompe nada de eso:**
El `ScrollView` (:1198) contiene **un solo `configCard` a la vez**, gated por `routeUiState` (mutuamente excluyentes):

| Estado | Línea | Contenido |
|---|---|---|
| `empty` / library | :1200 | rutas guardadas |
| **`editing`** | :1281 | nombre + origen/destino + **lista de paradas** + acciones ← Bug 2 |
| `ready` | :1407 | resumen de ruta lista |
| `navigation` / `paused` | :1481 | progreso de navegación |

`flexShrink:1` **no encoge el contenido** (vive en `contentContainer` a tamaño natural; solo se acota el *viewport* del ScrollView, que entonces scrollea). El nombre de ruta, endpoints y acciones conservan su tamaño y scrollean como bloque. En los otros estados el efecto es idéntico (cualquier card alto ahora scrollea) → **mejora, sin regresión**. Cuando el contenido es corto, sin overflow, no hay shrink → el card sigue abrazando el contenido.

## Validación
| Verificación | Resultado |
|---|---|
| `tsc --noEmit` | **exit 0** |
| ESLint (MapCanvas.tsx, map-styles.ts, checklist-screen.styles.ts) | **exit 0** |
| `npm test` | **26/26 suites, 134/134** — baseline intacto (checklist-screen.test.ts PASS) |
| **Bundle release `--dev false`** | **exit 0** (`Done writing bundle output`) |
| Diff commit 1 | `MapCanvas.tsx` (+9/−7), `map-styles.ts` (+9) |
| Diff commit 2 | `checklist-screen.styles.ts` (+4) |
| Fuera de alcance | portal, otras pantallas, App.tsx admin: **sin tocar** |

**Verificación visual por dispositivo:** pendiente (igual que las capturas originales fueron en real). El razonamiento de contención de la caja (Bug 1) y de scroll acotado (Bug 2) es lo verificable en estático + build; ambos fixes son deterministas por layout.

## Rollback
```
git checkout main   # los dos commits viven en la rama rc-mobile-routeui-01
```
o revertir commits puntuales: `git revert 5d52f82` (Bug 2) / `git revert 539ff2f` (Bug 1).
