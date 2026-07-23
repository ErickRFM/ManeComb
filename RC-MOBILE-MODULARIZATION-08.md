# RC-MOBILE-MODULARIZATION-08 — Estado vacío compartido: inventario y decisión (Fase 3.2 móvil)

> **Estado:** Cerrado — **resultado: no se migra ninguna pantalla; no se crea componente. Se entrega el inventario que lo justifica.**
>
> **Rama:** `main`
>
> **Commit base:** `6c3e1ac` (Fases 1–2 y la limpieza 3.1 —RC-07— en el árbol sin commit, verificadas en verde)
>
> **Estado Git inicial:** sin revert/rebase/merge/cherry-pick. Cambios sin commit presentes en el árbol: los de la Fase 3.1 (`package.json`, `incidents-screen.tsx`, `users-screen.tsx`) y ajenos en `backend/`. **Esta fase no modificó ningún archivo de código.**

## 1. Objetivo y resultado

El encargo: crear un estado vacío compartido y migrar las implementaciones locales **visualmente equivalentes**, con la regla central de que cada pantalla migrada debe verse **idéntica** (un cambio de un padding, color o tamaño de icono = fallo).

**Resultado tras el inventario value-by-value: las 6 implementaciones (7 contando los dos patrones distintos de chat) divergen entre sí en casi todos los valores concretos — alineación, borde, fondo, tamaño de icono y tipografía del título difieren en cada una.** Bajo la regla estricta del propio encargo ("si migrar una cambiaría cualquier valor visual… esa pantalla no migra" + "Ante la duda, no migres"), **ninguna califica para migrar**. Por tanto no se crea un componente compartido (sería código muerto sin consumidor válido, en contra del espíritu de limpieza de la Fase 3.1) ni se migra pantalla alguna. Se documenta el diseño que *sí* funcionaría si el equipo primero acuerda un aspecto canónico — pero eso es una decisión de diseño (rediseño), explícitamente fuera del alcance de "deduplicación sin cambio visual".

**Discrepancia con la auditoría declarada:** la auditoría clasificó estas implementaciones como "divergencia baja". El inventario con valores concretos muestra lo contrario: **divergencia alta**. Ese era justo el paso que el encargo puso primero ("Este paso decide… cuáles migran") y su conclusión es que no migra ninguna.

## 2. Inventario comparativo (valores resueltos)

Tokens resueltos: `AppTheme.spacing.md` = 16, `AppTheme.radius.md` = 20. Todos los colores vienen de `theme.colors`.

| # | Pantalla / sitio | Layout contenedor | Borde | Fondo | Icono | Icon shell | Título | Subtítulo |
|---|---|---|---|---|---|---|---|---|
| 1 | `users-screen.tsx:148` (estilo `:276`) | **flex-start**, gap 10, padding **16** | **sólido** 1, radius **20** | **surfaceAlt** | account-search-outline, **26**, muted | — | `sectionSubtitle` (body ~13–14, muted) | — |
| 2 | `radio-audios-page.tsx:79` (estilo `radio-screen.styles.ts:689`) | center, gap 12, **padV 44** / padH 18 | **ninguno** | **ninguno** | radio-handheld, **28**, muted | **64×64**, radius 22, borde, bg | display, **18**, muted, center | — (estilo `emptyText` existe pero no se usa aquí) |
| 3a | `chat-screen-view.tsx:281` `emptyStateCard` (estilo `:448`) | **row**, flex-start, padding 12, gap 10 | **sólido** 1, radius 16 | **surfaceAlt** | message-badge-outline, **20**, muted | — | body, **14**, **w800** | — (copy solo título) |
| 3b | `chat-screen-view.tsx:636` y `:660` `emptyState` (estilo `:1387`) | flex 1, center, gap 8, padH 18 / **padV 32** | **ninguno** | **ninguno** | 28, muted | — | display, **20**, center | — |
| 4 | `checklist-screen.tsx:1162` (estilo `checklist-screen.styles.ts:203`) | **minHeight 170**, center, gap 8, padding **22** | **punteado** 1, radius **18** | **ninguno** | clipboard-check-outline, **28**, muted | — | display, **17**, **w900** | — (estilo `emptyBody` existe, no usado aquí) |
| 5 | `BottomTrackingPanel.tsx:578` (estilo `map-styles.ts:189`) | **minHeight 36**, **row**, gap 8, padH 4 | **ninguno** | **ninguno** | bus-clock, **18**, muted | — | body, **12**, **w700** | — |
| 6 | `alerts/components/AlertState.tsx` (estilo `alerts.styles.ts:411`) | **minHeight 160**, center, gap 8, padding **18** | **punteado** 1, radius **14** | **ninguno** | 27 (condicional), muted | — | display, **16**, **w900**, center | `stateBody` (muted 12) + **lógica propia** cargando/vacío |

## 3. Clasificación migra / no-migra (todas: NO MIGRA)

| Pantalla | Decisión | Motivo (valor que cambiaría) |
|---|---|---|
| users-screen | **No migra** | Única con `alignItems: flex-start` (izquierda), fondo sólido y sin título dedicado (usa `sectionSubtitle`). Estructural y visualmente única. |
| radio | **No migra** | Única con icon shell 64×64; padV 44; título display 18. Nada más comparte el shell. |
| chat `emptyStateCard` | **No migra** | Layout **horizontal** (row) con copy a la derecha; título body 14 w800. Estructura distinta a todas las verticales. |
| chat `emptyState` (×2) | **No migra** | Sin caja, título display 20, padV 32. Difiere de radio (18/44) y de las cajas. Los dos usos ya comparten su estilo local; no hay dedup entre archivos. |
| checklist | **No migra** | Caja punteada minHeight 170, radius 18, padding 22, título display 17 w900. |
| BottomTrackingPanel | **No migra** | Pista **inline horizontal** (minHeight 36, row, padH 4), título body 12 w700. Es una pista, no un estado vacío en caja. |
| AlertState | **No migra / permanece** | Caja punteada minHeight 160, radius 14, padding 18, título display 16 w900 + subtítulo. **Además tiene lógica propia** (spinner "Cargando" vs. vacío, icono/textos condicionales por `hasIncidents`). Por el encargo, **permanece separado y no se rompe.** |

**Par más cercano, para dejar constancia del umbral:** checklist ↔ AlertState (ambas cajas punteadas, centradas, título display en negrita). Aun así difieren en **cuatro** valores — minHeight 170≠160, radius 18≠14, padding 22≠18, fontSize 17≠16 — y AlertState suma subtítulo + lógica. Migrar cualquiera cambiaría ≥4 valores visuales → prohibido por la regla estricta. Ninguna diferencia es un "bug trivial" declarable: son diseños deliberados por pantalla (el shell de radio, la caja punteada de checklist, la caja sólida izquierda de users).

## 4. Diseño propuesto (documentado, **no** construido)

Si en el futuro el equipo decide un aspecto **canónico** único para los estados vacíos verticales (una decisión de diseño, no de dedup), el compartido sería:

```tsx
// src/components/empty-state.tsx  (NO creado en esta fase)
export function EmptyState({ icon, iconSize = 28, title, subtitle, tone }: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  iconSize?: number;
  title: string;
  subtitle?: string;
  tone?: 'boxed-dashed' | 'plain-centered'; // variantes canónicas acordadas
}) { /* View centrado > Icon > Text título > Text subtítulo? */ }
```

No se construye ahora porque: (a) ninguna pantalla actual coincide con un aspecto canónico único, así que tendría **cero consumidores válidos** (código muerto, justo lo que la Fase 3.1 eliminó); y (b) alternativamente, un componente que reciba todos los estilos por props preservaría el aspecto pero **no eliminaría ningún estilo local** (cada pantalla seguiría definiendo y pasando los suyos), con lo que el paso 4 del encargo —"elimina los estilos locales que quedan sin uso"— no produciría nada: no habría dedup real, solo indirección.

## 5. Qué se eliminó / cambió

**Nada.** Cero archivos de código modificados, cero estilos eliminados, cero componentes creados. El único artefacto nuevo es este RC.

## 6. Validaciones

| Verificación | Resultado |
|---|---|
| Línea base `npm test` (inicio de fase) | 25/25 suites, 126/126 tests PASS |
| Cambios de código en esta fase | **Ninguno** (`git status` de `mobile/` solo muestra los archivos de la Fase 3.1, previos a esta fase) |
| `npm run typecheck` (`tsc --noEmit`) | PASS (exit 0) — confirma que la inspección no alteró el árbol |
| `npm test` (post-inspección) | 25/25 suites, 126/126 tests — idéntico al baseline |
| bundle release | No re-ejecutado: no hubo cambios de módulo; el bundle verde de la Fase 3.1 (RC-07) sigue vigente por construcción |

La evidencia de "no cambio visual" es, en este caso, la **ausencia de migración**: al no tocar ninguna pantalla, ninguna cambia de aspecto — que es exactamente el resultado seguro que la regla central exige cuando nada es equivalente.

## 7. Recomendación

Consolidar estos estados vacíos **requiere primero una decisión de diseño**: elegir un aspecto canónico (p. ej. la caja punteada centrada de AlertState/checklist como base, unificando minHeight/radius/padding/fontSize) y aceptar que 4–5 pantallas **cambiarán ligeramente** para adoptarlo. Eso es rediseño, explícitamente fuera del alcance de esta fase ("No es rediseño; es deduplicación sin cambio visual"). Queda a decisión del usuario si se abre esa tarea por separado; hasta entonces, las implementaciones locales permanecen como están.

## 8. Rollback

No aplica a código (no hubo cambios). Para descartar solo el informe:

```
rm RC-MOBILE-MODULARIZATION-08.md
```
