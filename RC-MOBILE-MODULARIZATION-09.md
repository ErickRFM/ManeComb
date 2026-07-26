# RC-MOBILE-MODULARIZATION-09 — Estado vacío compartido, reintento post-estandarización

> **Estado:** Cerrado — **resultado: sigue sin migrar ninguna pantalla; no se crea componente.** La estandarización (UI-01..05) convergió **un solo** valor (la alineación de users); el resto sigue divergiendo igual que en RC-08.
>
> **Rama:** `main`
>
> **Estado Git inicial:** trabajo paralelo commiteado presente (suite 26/134). **Esta fase no modificó ningún archivo de código.**

## 1. Objetivo y resultado

Reintento de la Fase 3.2 (RC-08 concluyó no migrar por divergencia alta), ahora que UI-01..05 unificó radios, tipografía de títulos, alineación del vacío de users y breakpoints. Rehíce el inventario value-by-value con los valores actuales. **Conclusión: la única convergencia relevante fue la alineación de users (`flex-start`→`center`, hecha en UI-02); las diferencias estructurales que impedían deduplicar en RC-08 (caja sólida vs punteada vs sin caja, fondo sí/no, icon-shell sí/no, radio 20/18/16/14, minHeight, tipografía de título) permanecen intactas.** Bajo la misma regla estricta, **ninguna pantalla migra** y no se crea componente (sin consumidores válidos = código muerto).

## 2. Por qué la estandarización NO acercó estos valores (clave)

- **Radios**: UI-01/03 fue **value-preserving** (literal→token idéntico). users sigue `md`=**20**, chat-card `sm`=**16**, checklist `sm2`=**18**, AlertState **14** (literal; alerts fue diferido en UI-03). Los números **no cambiaron** — solo se tokenizaron. La divergencia de radio es idéntica a RC-08.
- **Tipografía de títulos**: UI-04 unificó **hero** (30/900) y **título de sección** (20/900). Los títulos de estado vacío son **otro rol** (`emptyTitle`/`stateTitle`/`sectionSubtitle`) que UI-04 **no tocó**. Siguen divergiendo (18 / 20 / 17-900 / 16-900 / 14-800 / 12-700 / sectionSubtitle).
- **Breakpoints**: no afectan la forma del estado vacío.
- **Lo único que convergió**: la alineación de users pasó de `flex-start` a `center` (UI-02 item 4). Ahora users centra como los demás — pero sigue siendo la **única** caja con borde **sólido + fondo**, así que no iguala a ninguna otra.

## 3. Inventario comparativo actualizado (valores actuales)

| # | Impl | Layout | Borde | Fondo | Radio | minHeight | gap | padding | Icono | Título |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **users** ([users-screen.tsx:276](mobile/src/screens/users-screen.tsx)) | col **center** | sólido 1 | surfaceAlt | md=**20** | — | 10 | 16 | 26, muted | `sectionSubtitle` |
| 2 | **radio** ([radio-screen.styles.ts:690](mobile/src/screens/radio/radio-screen.styles.ts)) | col center | **ninguno** | ninguno | — | — | 12 | V44/H18 | **shell 64×64** r22 | display 18 |
| 3a | **chat `emptyStateCard`** ([chat-screen.styles.ts:450](mobile/src/screens/chat/chat-screen.styles.ts)) | **row** | sólido 1 | surfaceAlt | sm=**16** | — | 10 | 12 | 20, muted | body 14/800 |
| 3b | **chat `emptyState`** ([chat-screen.styles.ts:1389](mobile/src/screens/chat/chat-screen.styles.ts)) | col center | ninguno | ninguno | — | flex1 | 8 | H18/V32 | 28, muted | display 20 |
| 4 | **checklist** ([checklist-screen.styles.ts:203](mobile/src/screens/checklist/checklist-screen.styles.ts)) | col center | **punteado** | ninguno | sm2=**18** | 170 | 8 | 22 | 28, muted | display 17/900 |
| 5 | **BottomTrackingPanel** ([map-styles.ts:189](mobile/src/screens/map/map-styles.ts)) | **row inline** | ninguno | ninguno | — | 36 | 8 | H4 | 18, muted | body 12/700 |
| 6 | **AlertState** ([alerts.styles.ts:411](mobile/src/screens/alerts/alerts.styles.ts)) | col center | **punteado** | ninguno | **14** | 160 | 8 | 18 | 27, muted | display 16/900 + subtítulo + **lógica cargando/vacío** |

## 4. Comparación contra RC-08 — qué convergió

| Dimensión | RC-08 | Ahora | ¿Convergió? |
|---|---|---|---|
| Alineación de users | flex-start (única izq.) | **center** | ✅ Sí (UI-02) — pero no la iguala a nadie (única sólida+fondo) |
| Radios (20/18/16/14) | 20/18/16/14 | 20/18/16/14 (tokenizados, mismo valor) | ❌ No |
| Estilo de caja (sólida/punteada/ninguna) | 3 variantes | 3 variantes | ❌ No |
| Fondo (surfaceAlt/ninguno) | mixto | mixto | ❌ No |
| Icon-shell (solo radio) | solo radio | solo radio | ❌ No |
| minHeight (—/170/160/36) | 4 valores | 4 valores | ❌ No |
| Tipografía de título | 6+ tratamientos | 6+ tratamientos | ❌ No (rol no tocado por UI-04) |
| Layout (col/row) | col×5, row×2 | col×5, row×2 | ❌ No |

**Par más cercano** (checklist ↔ AlertState, ambas cajas punteadas centradas, título display negrita): siguen difiriendo en **cuatro** valores — minHeight **170 vs 160**, radio **18 vs 14**, padding **22 vs 18**, fontSize título **17 vs 16** — más el subtítulo y la lógica de AlertState. Exactamente la misma brecha que en RC-08; nada la cerró.

## 5. Decisión migra / no-migra (todas: NO MIGRA)

| Pantalla | Decisión | Motivo |
|---|---|---|
| users | **No migra** | Única caja **sólida + fondo** en columna; radio 20; título `sectionSubtitle`. No iguala a nadie. |
| radio | **No migra** | Único con **icon-shell 64×64**; sin caja; padV 44; título 18. |
| chat `emptyStateCard` | **No migra** | **Layout horizontal** (row) con copy al lado — otra estructura (§4). |
| chat `emptyState` | **No migra** | Sin caja, título 20, padV 32. Difiere de radio (shell/18/44) y de las cajas. |
| checklist | **No migra** | Caja punteada minHeight 170, radio 18, padding 22, título 17/900. |
| BottomTrackingPanel | **No migra** | **Pista inline horizontal** (minHeight 36, row, padH 4) — otro rol, no una caja de estado vacío (§4). |
| AlertState | **No migra / permanece** | Caja punteada 160/14/18/16-900 + subtítulo **+ lógica propia** (spinner "Cargando" vs vacío). No se toca ni se rompe (§4). |

Ninguna diferencia es un "bug trivial" declarable: son diseños deliberados por pantalla. Ante la duda (regla RC-08), no se migra.

## 6. Qué se creó / cambió

**Nada.** Cero archivos de código modificados, cero componentes creados. Un compartido con cero consumidores idénticos sería código muerto (lo mismo que concluyó RC-08 y lo que la Fase 3.1 eliminó). Único artefacto nuevo: este RC.

## 7. Validaciones

| Verificación | Resultado |
|---|---|
| Línea base `npm test` | 26/26 suites, 134/134 tests PASS |
| Cambios de código en esta fase | **Ninguno** |
| `npm run typecheck` | PASS (exit 0) — confirma que la inspección no alteró el árbol |
| ESLint / bundle release | No re-ejecutados: sin cambios de código; el estado verde de UI-05 sigue vigente por construcción |

La evidencia de "cero cambio visual" es, otra vez, la **ausencia de migración**: al no tocar ninguna pantalla, ninguna cambia.

## 8. Recomendación (sin cambio respecto a RC-08)

Deduplicar estos estados vacíos **sigue requiriendo una decisión de diseño**: elegir un aspecto canónico (p. ej. la caja punteada centrada de AlertState/checklist como base, unificando minHeight/radio/padding/fontSize/subtítulo) y aceptar que 4–5 pantallas **cambiarán** para adoptarlo. Eso es rediseño, fuera del alcance de "dedup sin cambio visual". La estandarización UI-01..05 acercó el lenguaje visual global pero **no igualó** estas cajas, porque sus diferencias no eran literales-vs-token (que se resolvieron) sino de **estructura y escala** (caja/shell/minHeight/tipografía), que requieren decisión.

## 9. Rollback

No aplica a código. Para descartar el informe:

```
rm RC-MOBILE-MODULARIZATION-09.md
```
