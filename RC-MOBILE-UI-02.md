# RC-MOBILE-UI-02 — Estandarización visual (grupo 2, sí cambia el aspecto)

> **Estado:** Cerrado
>
> **Rama:** `main`
>
> **Commit base:** `6c3e1ac` (fases previas + auditoría UI + RC-MOBILE-UI-01 en el árbol sin commit)
>
> **Estado Git inicial:** sin revert/rebase/merge/cherry-pick. Cambios previos sin commit presentes (fases anteriores + ajenos en `backend/`).

## 1. Objetivo y resultado

Cuatro correcciones de incoherencia visual entre pantallas que hacen lo mismo. A diferencia del grupo 1, **estos cambios sí alteran el aspecto** — ese es el objetivo: unificar valores que debieron ser el mismo. Suite/typecheck/eslint idénticos a la base; bundle release OK.

**Hallazgo relevante:** el ítem 1 mencionaba dos handles de sheet; encontré **un tercero** (`chat sheetHandle`), incluido y reportado abajo.

## 2. Ítem 1 — Handle de bottom-sheet → 40×4, `borderRadius: 999`

**Verificación previa:** busqué todos los handles de sheet en `src/`. Hay **tres**, no dos:

| Handle | Archivo:línea | Antes (an×al, radio) | Después |
|---|---|---|---|
| `modalDragHandle` | [checklist-screen.styles.ts:248](mobile/src/screens/checklist/checklist-screen.styles.ts) | 38×4, r999 | **40**×4, r999 |
| `panelHandle` | [map-styles.ts:122](mobile/src/screens/map/map-styles.ts) | 42×4, **r2** | **40**×4, **r999** |
| `sheetHandle` **(tercero, no citado en el prompt)** | [chat-screen.styles.ts:1251](mobile/src/screens/chat/chat-screen.styles.ts) | 36×4, r999 | **40**×4, r999 |

Los tres convergen a **ancho 40, alto 4, `borderRadius: 999`** (pill). Cambios de aspecto: el handle del mapa pasa de barra casi recta (r2) a pill; los tres anchos (36/38/42) se igualan a 40. Alturas ya eran 4. Se mantiene `borderRadius: 999` como literal (es el valor del token `radius.pill`, pero un handle-pill es forma geométrica, no radio de esquina; coherente con no tokenizar el círculo en RC-MOBILE-UI-01).

## 3. Ítem 2 — Radio superior de bottom-sheet → 28

**Verificación previa:** confirmado que ambos radios aplican **solo a las esquinas superiores** (`borderTopLeftRadius`/`borderTopRightRadius`), no al contenedor completo — la base del sheet no se redondea.

| Sheet | Archivo:línea | Antes | Después |
|---|---|---|---|
| `modalCard` | [checklist-screen.styles.ts:234-235](mobile/src/screens/checklist/checklist-screen.styles.ts) | 26 | **28** (`AppTheme.radius.lg`) |
| `historyCard` | [map-styles.ts:192](mobile/src/screens/map/map-styles.ts) | 22 | **28** (`AppTheme.radius.lg`) |

**Namespace declarado:** el prompt pedía usar `DesignSystem.radius.sheet` (=28) **si la hoja ya referencia `DesignSystem.radius`**. Verifiqué: **ni checklist ni map usan `DesignSystem`** (0 referencias en ambas); tras RC-MOBILE-UI-01 ambas usan `AppTheme.radius`. Por el criterio de no mezclar namespaces, usé **`AppTheme.radius.lg`** en las dos, cuyo valor resuelto (`baseRadius.lg` = **28**) es idéntico a `DesignSystem.radius.sheet`. Cambio de aspecto: checklist 26→28 (+2), mapa 22→28 (+6), esquinas superiores algo más redondeadas.

## 4. Ítem 3 — Alto de chip de filtro pill → 34 / padH 12

| Chip | Archivo | Antes | Después |
|---|---|---|---|
| `filterChip` alerts | [alerts.styles.ts:199-200](mobile/src/screens/alerts/alerts.styles.ts) | minHeight **31**, padH **10** | minHeight **34**, padH **12** |
| `filterChip` radio | [radio-screen.styles.ts](mobile/src/screens/radio/radio-screen.styles.ts) | minHeight 34, padH 12 | **sin cambio** (ya es el objetivo) |

Solo alerts se movió (converge al valor de radio, más cómodo como área táctil): sus chips de filtro crecen ligeramente (+3 de alto, +2 de padding). `borderRadius: 999` de ambos intacto.

**No tocados** (declarado): `methodChip` de profile-edit (42, es un toggle de otro rol), y los chips rectangulares `deviceChip`/`trackChip` (radios 12/11, forma distinta). Solo los dos chips pill de filtro entraban.

## 5. Ítem 4 — Alineación del estado vacío de users → center

| Elemento | Archivo:línea | Antes | Después |
|---|---|---|---|
| `emptyState` `alignItems` | [users-screen.tsx:277](mobile/src/screens/users-screen.tsx) | `'flex-start'` | `'center'` |

Cambia solo la alineación (izquierda → centro), la única diferencia estructural de users frente a radio/chat/checklist/AlertState (que ya centran). **El resto de valores de users permanece** (fondo `surfaceAlt` sólido, borde 1, radius, gap 10, padding, tipografía) — no se unifica el componente (RC-MOBILE-MODULARIZATION-08 documentó que divergen en muchos valores); solo se corrige la alineación.

## 6. Validaciones

| Verificación | Resultado |
|---|---|
| Línea base `npm test` | 25/25 suites, 126/126 tests PASS |
| `npm run typecheck` (`tsc --noEmit`) | PASS (exit 0) |
| ESLint (5 archivos tocados) | PASS (exit 0) |
| `npm test` post-cambio | **25/25 suites, 126/126 — idéntico a la base** |
| Bundle release Metro (`--dev false`, a directorio temporal) | PASS (exit 0) |

**Evidencia de cambio de aspecto controlado:** las tablas antes/después de §2–§5 documentan cada valor de origen y su convergencia. Los tests no cubren estilos, por lo que su invariancia solo confirma que no se rompió lógica; la corrección visual se sustenta en la equivalencia de valores mostrada. Runtime real no ejercitado (sin sesión).

## 7. Archivos tocados (5)

`checklist-screen.styles.ts` (handle 38→40, top 26→lg), `map-styles.ts` (handle 42→40 + r2→999, top 22→lg), `chat-screen.styles.ts` (handle 36→40), `alerts.styles.ts` (filterChip 31→34, 10→12), `users-screen.tsx` (alignItems center).

## 8. Rollback

```
cd mobile && git checkout -- src/screens/checklist/checklist-screen.styles.ts src/screens/map/map-styles.ts src/screens/chat/chat-screen.styles.ts src/screens/alerts/alerts.styles.ts src/screens/users-screen.tsx && cd .. && rm RC-MOBILE-UI-02.md
```

## 9. Pendiente de decisión (no ejecutado — según instrucción)

- **Escala de radios**: los 86 radios fuera de escala (12/14/18/13/8/22/9/11/24/7/26) — decidir si ampliar la escala de tokens o snappear.
- **Títulos de página y de sección**: 4–6 tamaños distintos por rol (hero 30/32/34/36; sección 16–22).
- **Breakpoints**: phone 600/640/720, compact 1040/1080/1120.
- **Diferidos de RC-MOBILE-UI-01**: 3 swaps de alerts (nombres semánticos de DesignSystem que no encajan) y el círculo de `userMarker`.
