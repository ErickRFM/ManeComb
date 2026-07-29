# RC-MOBILE-ROUTEUI-02 — Fase 1 (read-only): re-diagnóstico de los fixes fallidos de RC-01

> **Estado:** Fase 1 cerrada, **solo lectura, cero cambios** (diff vacío). Ambos fixes de RC-MOBILE-ROUTEUI-01 (`539ff2f` mochos, `5d52f82` scroll) **fallaron en dispositivo**. Este RC confirma **por qué falló cada uno** y da la causa/fix real.
>
> **Entorno (confirmado):** `@rnmapbox/maps` **10.3.2** (`mobile/package.json:36`, instalada 10.3.2), `react-native` **0.81.5** (`:40`), **New Architecture / Fabric ACTIVADA** (`android/gradle.properties:45` `newArchEnabled=true`, `:49` `hermesEnabled=true`).

---

## Bug 1 — Pines mochos: por qué `padding:16` NO funcionó + A vs B

### Por qué falló el fix de RC-01
`AppMapMarker` renderiza **`Mapbox.PointAnnotation`** ([app-map.native.tsx:316-326](mobile/src/components/app-map.native.tsx)) — y **SAL/FIN y los numerados usan el MISMO wrapper** (`SelectorMarkers`, [MapCanvas.tsx:263/275/287](mobile/src/screens/map/components/MapCanvas.tsx)). La diferencia sigue siendo solo el estilo (transform + sombra en los numerados).

`PointAnnotation` **rasteriza los hijos a un bitmap** midiendo con `MeasureSpec.EXACTLY` (issue @rnmapbox **#3769**): en Android, todo lo pintado **fuera de los bounds medidos se recorta** (en iOS no — coincide con "todos mochos" en el dispositivo real). El `padding:16` del host ([map-styles.ts:256-267 `selectorStopMarkerHost`](mobile/src/screens/map/map-styles.ts), commit `539ff2f`) **asumió que agrandar el View medido agranda la caja rasterizada — y NO lo hace**: la rasterización de `PointAnnotation` mide/recorta por su propio mecanismo, no por el padding transparente del host. Por eso:
- El **`transform: translateY/X(±8)`** (`SELECTOR_STOP_MARKER_OFFSETS`, [MapCanvas.tsx:13-19](mobile/src/screens/map/components/MapCanvas.tsx)) empuja contenido fuera de los bounds → recortado. **RC-01 lo preservó a propósito; es parte de la causa, no algo a conservar.**
- La **sombra/elevation** (`elevation:4`, `shadowRadius:5`) se pinta fuera del box **siempre**, incluso con `translateY:0` (índice 0) → por eso el "1" también sale mocho ("todos por igual").

**Conclusión:** el recorte es una **limitación de rasterización de `PointAnnotation`**, no un bug del código ni algo que el padding pueda resolver. La doc oficial dice textualmente que `PointAnnotation` pinta los hijos sobre un bitmap y recomienda **`MarkerView`** para vistas no estáticas.

### Los dos caminos (evaluados contra el código real)

**Camino A — Migrar los numerados a `MarkerView`** (recomendado):
- **Disponible en 10.3.2:** `Mapbox.MarkerView` exportado ([node_modules/@rnmapbox/maps/src/Mapbox.native.ts:71](mobile/node_modules/@rnmapbox/maps/src/Mapbox.native.ts)); hay **codegen Fabric** (`RNMBXMarkerViewComponentDescriptor` en los artefactos generados) → **compatible con New Arch**.
- **No rasteriza:** doc oficial — "implemented with **view annotations** on Android/iOS". Renderiza views RN reales → **no `MeasureSpec.EXACTLY`, no recorte**. Ataca la causa raíz.
- **Separación de pines cercanos sin transform:** `MarkerView` tiene **`allowOverlap`** (props `MarkerView.d.ts:19-23`): con `allowOverlap={true}` todos los marcadores cercanos se muestran (default `false` = colapsan y solo se ve uno). **Reemplaza al hack del `translateY`** por el mecanismo nativo — se puede **eliminar el transform** y mantener la sombra (que ya no se recorta).
- **onPress/drag:** `MarkerView` **no soporta `draggable`** ni `onSelected` (los gestos van por los children Pressable). Los **numerados no tienen ni drag ni onPress** ([MapCanvas.tsx:287-296](mobile/src/screens/map/components/MapCanvas.tsx)) → migran sin pérdida. **SAL/FIN SÍ son `draggable`** ([:266-268, :278-280](mobile/src/screens/map/components/MapCanvas.tsx)) → **se quedan en `PointAnnotation`** (no las toca este fix, y se ven bien).
- **Límite de rendimiento (~100 MarkerViews, guía Mapbox):** los waypoints de una ruta de combi son **pocos** (una a dos docenas; el array de offsets tiene 5 entradas, pensado para pocos) → **cae holgado**. *(Fase 2 debe confirmar el máximo real de `tracker.pointStops`/`stops`.)*

**Camino B — Mantener `PointAnnotation`, quitar transform, que todo quepa dentro de bounds:**
- `PointAnnotation` **tiene `anchor`** (props `PointAnnotation.d.ts:44-56`): se podría reemplazar el `translateY` por un `anchor` por-índice para separar sin empujar contenido fuera del box (el anchor reubica el bitmap respecto a la coord, no recorta).
- **PERO** la sombra se pinta fuera del box **siempre** → para que el "1" deje de salir mocho hay que **quitar la sombra (aplanar)** — justo lo que RC-01 quiso evitar. B **degrada el diseño** y **sigue peleando contra el rasterizador**.

### Recomendación: **Camino A (`MarkerView`)**
Ataca la causa (la rasterización), **conserva sombra y separación** (vía `allowOverlap`, sin transform), no recorta, y el trade-off de rendimiento es nulo con tan pocos waypoints. B es un parche que aplana y sigue en el subsistema frágil. Alcance de A en Fase 2: **solo los numerados** (`SelectorMarkers` stops) → `MarkerView` con `allowOverlap`, sin `transform`, sombra conservada; **SAL/FIN intactos en `PointAnnotation`**.

---

## Bug 2 — Scroll de paradas: por qué `flexShrink:1` NO funcionó + fix real

### La cadena de altura completa (con archivo+línea)
```
<Modal transparent>                                       checklist-screen.tsx:1169
 └ <GestureHandlerRootView style={modalBackdrop}>         :1170  → flex:1, justifyContent:'flex-end'  (styles:203-207)
    └ <KeyboardSafeView style={modalKeyboard}>            :1171-1173 → flex:1, justifyContent:'flex-end' (styles:232-234)
       └ <Animated.View style={[modalCard, {transform}]}> :1174  → maxHeight:'96%', SIN height/flex    (styles:208-217)
          ├ header (PanGestureHandler / drag area)        :1175-1196
          └ <ScrollView style={modalScroll}                :1198  → flexGrow:0, flexShrink:1 (RC-01)     (styles:270-277)
                    contentContainerStyle={modalScrollContent}>   → gap:16, paddingBottom:12            (styles:273-276)
```
`KeyboardSafeView` = **`KeyboardControllerAvoidingView`** de `react-native-keyboard-controller`, `behavior='padding'` ([keyboard-safe-layout.tsx:11-24](mobile/src/components/keyboard-safe-layout.tsx)).

### Por qué `flexShrink:1` fue un no-op
Un `ScrollView` **solo scrollea si un ancestro le da una altura DEFINIDA y acotada menor que su contenido**. En esta cadena **nadie se la da**:
- `modalCard` **no tiene `height` ni `flex`** — solo `maxHeight:'96%'`, es decir **se ajusta a su contenido** (hug-content) con un techo. Un contenedor hug-content **no reparte una altura acotada** a un hijo.
- RC-01 agregó `flexShrink:1` al ScrollView, pero **`flexShrink` no puede encoger un hijo por debajo de su tamaño de contenido dentro de un padre hug-content**: sin una altura definida que repartir (y con el `min-height:auto` implícito del flex-item que lo ancla a su contenido), el ScrollView conserva la altura de su contenido → el `modalCard` lo **recorta** por el techo del 96% (overflow hidden) en vez de darle un viewport scrolleable. Resultado: **exactamente el mismo corte que antes**.
- El intermediario **`KeyboardControllerAvoidingView`** (tercero, con padding dinámico en New Arch) entre el backdrop full-screen y el card no ayuda a propagar una altura definida limpia.

**En una frase:** `flexShrink:1` no crea un viewport acotado cuando el contenedor (`modalCard`) es hug-content (`maxHeight` sin `height`/`flex`); el ScrollView nunca recibe una altura definida y el card lo recorta.

### Fix real (concreto y DISTINTO al que falló)
Darle al `ScrollView` una **altura acotada propia**, independiente de la cadena frágil de flex, preservando el "abrazar contenido cuando es corto":
- **Opción recomendada:** `modalScroll` con **`maxHeight` propio definido** (p.ej. un valor relativo a la pantalla vía `Dimensions`/`useWindowDimensions`, no porcentaje sobre un padre indefinido). Así el ScrollView scrollea cuando su contenido supera ese techo, y el `modalCard` sigue abrazando el contenido corto. **No repite el approach fallido** (no es más `flexShrink`).
- **Alternativa:** dar a `modalCard` una **altura definida** (`height` en vez de solo `maxHeight`) y al `modalScroll` **`flex:1`** — funciona pero el panel siempre ocuparía la altura fija (pierde el hug-content).
- **Complemento defensivo:** añadir `minHeight:0` al `modalScroll` (levanta el piso `min-height:auto` del flex-item), pero **por sí solo no basta** con un padre hug-content — por eso el eje del fix es la **altura acotada propia del ScrollView**.

**Lección de RC-01 (crítica):** el fix anterior se validó solo con build/typecheck, no en el APK real, y falló. **Fase 2 debe verificarse en el dispositivo/APK release**, no asumir el modelo de flex.

---

## ¿A y B siguen siendo independientes? — **Sí**
Bug 1 = subsistema de marcadores Mapbox (`MapCanvas.tsx` + `map-styles.ts`, migración a `MarkerView`). Bug 2 = cadena de altura del modal (`checklist-screen.styles.ts`, altura acotada del ScrollView). Cero solape. Dos commits separados en Fase 2.

---

## Entregable
- **Bug 1 — por qué falló:** el padding del host no expande la caja que `PointAnnotation` rasteriza (`MeasureSpec.EXACTLY`, issue #3769); el transform (y la sombra, siempre) pintan fuera → Android recorta. **Recomendación: Camino A — migrar los numerados a `MarkerView`** (disponible y Fabric-compatible en 10.3.2; no rasteriza; `allowOverlap` reemplaza el transform; SAL/FIN se quedan en `PointAnnotation` por el drag). B aplana y es inferior.
- **Bug 2 — por qué falló:** `flexShrink:1` no acota el ScrollView dentro de un `modalCard` hug-content (`maxHeight` sin `height`/`flex`); el ScrollView nunca recibe altura definida → el card lo recorta. **Fix real: darle al `modalScroll` una altura acotada propia (`maxHeight` relativo a pantalla)**, distinto al `flexShrink` fallido; verificar en el APK real.
- **Independientes:** sí.

**PROHIBIDO en esta fase (respetado):** cero cambios; no repetí los approaches fallidos (padding / solo flexShrink); Bug 1 fundamentado en doc/issues + versión real; Bug 2 en la cadena de altura real; no toqué SAL/FIN, portal, ni otra pantalla. Diff vacío.
