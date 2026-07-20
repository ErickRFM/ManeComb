# RC-OPERATIONS-UNIT-TABS-SPACING-01

## Alcance

Ajuste visual del espaciado horizontal del selector de unidades del panel de Operaciones, más el desplazamiento automático de la pestaña seleccionada. No se modificaron las dimensiones de las pestañas, la tipografía, los colores, el estado seleccionado, la lógica de selección, el Bottom Sheet, el mapa ni el Operational Snapshot.

## Causa raíz encontrada

El selector se renderiza mediante un `ScrollView` horizontal en `BottomTrackingPanel.tsx`, que es hijo directo de `styles.followCard`:

```ts
followCard: { borderRadius: 18, borderWidth: 1, paddingHorizontal: 12, ... }
```

El card ya aporta `12 dp` de padding lateral a todo su contenido. El `contentContainerStyle` original no reponía nada al inicio y solo `2 px` al final:

```ts
trackList: { gap: 8, paddingRight: 2 }
```

Resultado: la primera pestaña arrancaba exactamente en el límite útil del card y la última terminaba casi contra el borde del scroll, sin espacio de respiro al desplazar.

### Por qué el primer intento no se percibió

El primer ajuste aplicó `paddingHorizontal: 16` sobre el `contentContainerStyle` sin tocar el `ScrollView`. Como el card ya aportaba `12 dp`, las pestañas quedaban a `28 dp` del borde del panel —**más indentadas que las tarjetas KPI, el encabezado y los botones**, que siguen a `12 dp`. Eso rompía la Fase 6 (consistencia visual) en lugar de resolverla, y no generaba la sensación de "aire" buscada porque el `ScrollView` seguía recortado dentro del padding del card: el contenido nunca podía desplazarse hasta el borde real del panel.

## Componentes involucrados

- `mobile/src/screens/map/components/BottomTrackingPanel.tsx`: contiene los dos `ScrollView` horizontales del selector (rama multi-unidad y rama de unidad única).
- `mobile/src/screens/map/map-styles.ts`: define `followCard`, `trackScroller`, `trackList` y `trackChip`.

## Estilos modificados

```diff
+ // El scroller sangra el padding del card (12) para poder desplazarse de borde a borde,
+ // y el contenido lo repone para que las pestanas queden alineadas con el resto del panel.
+ trackScroller: { marginHorizontal: -12, flexGrow: 0 },
- trackList: { gap: 8, paddingRight: 2 },
+ trackList: { gap: 8, paddingHorizontal: 12 },
```

El patrón es el estándar para un scroller horizontal dentro de un contenedor con padding:

1. `marginHorizontal: -12` cancela el padding del card, de modo que el viewport del scroll llega al borde real del panel.
2. `paddingHorizontal: 12` en el contenido repone ese espacio **dentro** del área desplazable.

Con esto la primera y la última pestaña quedan alineadas exactamente con las tarjetas KPI y el encabezado, y el padding permanece visible tanto al inicio como al final del recorrido del scroll, porque pertenece al contenido y no al contenedor.

`gap`, `trackChip`, tipografía, colores y altura permanecen intactos.

## Fase 4 — Selección visible

La iteración anterior omitió deliberadamente esta fase, que sin embargo es un criterio de certificación. Se implementó con refs, sin estado ni listeners de scroll:

```ts
const trackScrollRef = useRef<ScrollView | null>(null);
const trackViewportWidthRef = useRef(0);
const trackChipLayoutRef = useRef<Record<string, { x: number; width: number }>>({});
```

- El `onLayout` del `ScrollView` guarda el ancho del viewport en un ref.
- El `onLayout` de cada pestaña guarda su `x` y `width` en un ref.
- Un `useEffect` con dependencia `[selectedUnitId]` centra la pestaña seleccionada mediante `scrollTo`, con `Math.max(0, …)` para no sobredesplazar al inicio; React Native acota el extremo final.

Ninguna de estas medidas provoca re-render: todo se escribe en refs. El efecto solo corre cuando cambia la unidad seleccionada.

## Comparativa antes/después

| Aspecto | Original | Primer intento | Actual |
| --- | --- | --- | --- |
| Inicio del scroll | `0` (borde útil del card) | `28 dp` desde el borde del panel | `12 dp`, alineado con KPI y encabezado |
| Final del scroll | `2 px` | `28 dp` | `12 dp` |
| Viewport del scroll | Recortado al padding del card | Recortado al padding del card | Borde a borde del panel |
| Alineación con tarjetas KPI | Coincidente | **Desalineado (+16 dp)** | Coincidente |
| Separación entre pestañas | `8 px` | `8 px` | `8 px`, sin cambios |
| Pestaña seleccionada fuera de viewport | No se desplazaba | No se desplazaba | Se centra automáticamente |
| Tamaño de pestañas | — | Sin cambios | Sin cambios |
| Lógica de selección | — | Sin cambios | Sin cambios |

## Validaciones realizadas

| Validación | Resultado |
| --- | --- |
| TypeScript (`npm run typecheck`) | Aprobado, sin salida de error |
| ESLint (`npm run lint`) | Aprobado, sin hallazgos |
| `git diff --check` | Aprobado, sin errores de whitespace |
| Auditoría de alcance | Aprobado: dos estilos y el cableado del scroller |
| Build Android | **No ejecutado** |
| Validación visual en dispositivo | **No ejecutada** |

## Fase 5 — Responsive

El espaciado usa el mismo token de `12 dp` que el `paddingHorizontal` de `followCard`, por lo que el selector escala igual que el resto del panel en teléfono pequeño, teléfono grande y tablet. No se introdujeron anchos fijos ni cálculos por breakpoint. El centrado de la Fase 4 se deriva del ancho real medido en `onLayout`, así que se adapta solo a cualquier viewport.

## Fase 7 — Rendimiento

No se añadieron listeners de scroll, cálculos continuos, animaciones ni estado nuevo. Se agregaron tres refs y dos callbacks de `onLayout`, que en React Native ya se disparan de forma nativa durante el layout. El `useEffect` de centrado corre únicamente al cambiar `selectedUnitId`.

## Riesgos remanentes

- **Sin verificación visual ni build Android.** Este es el riesgo principal. Los cambios son de estilo y de layout, y no puedo ejecutar la app; la certificación de las Fases 3, 5 y 6 depende de una prueba manual en dispositivo.
- El `marginHorizontal: -12` depende de que `followCard.paddingHorizontal` siga siendo `12`. Si ese padding cambia en el futuro, el scroller quedará desalineado. La relación está documentada en el comentario junto a `trackScroller`, pero no está atada por código.
- El centrado de la Fase 4 depende de que `onLayout` haya corrido antes de la selección. En el primer render, si el efecto se dispara antes del layout, la guarda `viewportWidth <= 0` lo omite silenciosamente en vez de desplazar a una posición incorrecta.

## Dictamen final

**Implementación completada; certificación visual pendiente.**

La causa raíz real era doble: el `contentContainerStyle` sin padding lateral **y** el viewport del scroll recortado por el padding del card. El primer intento trató solo la mitad del problema y, al hacerlo, desalineó las pestañas respecto al resto del panel —motivo por el cual el ajuste no se percibió como una mejora. El patrón de sangrado negativo más padding de contenido corrige ambas cosas y deja las pestañas alineadas con las tarjetas KPI y el encabezado, con espacio conservado en los dos extremos del scroll.

La RC no puede certificarse hasta que una ejecución en dispositivo confirme el resultado en teléfono y tablet con una flota de varias unidades.
