# RC-MOBILE-UI-03 — Ampliación de la escala de radios (cero cambio visual)

> **Estado:** Cerrado
>
> **Rama:** `main`
>
> **Commit base:** `6c3e1ac` (fases previas + auditoría UI + RC-MOBILE-UI-01/02 en el árbol sin commit)
>
> **Estado Git inicial:** sin revert/rebase/merge/cherry-pick. Cambios previos sin commit presentes.

## 1. Objetivo y resultado

La auditoría encontró que la app usa de facto una escala de radios más densa que los tokens (que saltan 10→16→20→28). Se **amplió `AppTheme.radius`** con los tres valores dominantes (12/14/18) y se **tokenizaron 44 usos literales** cuyo valor es idéntico al nuevo token → **cero cambio visual**. Se difirieron 7 (alerts + auth) y se excluyeron 4 (círculos), con motivo. Suite/typecheck/eslint idénticos a la base; bundle release OK.

## 2. Naming propuesto y justificación (confirmado)

Los tres valores caen **entre** tokens existentes (12 y 14 entre `xs`=10 y `sm`=16; 18 entre `sm`=16 y `md`=20). Propuse dos esquemas y **se eligió el sufijo t-shirt** (coherente con la escala existente, intercalado), sobre claves numéricas:

```ts
const baseRadius = {
  xs: 10,
  xs2: 12,   // nuevo
  xs3: 14,   // nuevo
  sm: 16,
  sm2: 18,   // nuevo
  md: 20,
  lg: 28, xl: 34, pill: 999,
} as const;
```

**Justificación:** mantiene los nombres t-shirt existentes sin renombrarlos (cero ruptura), e intercala con un sufijo numérico que indica la posición dentro de la banda. La escala completa lee natural y ordena sola: `xs`(10) → `xs2`(12) → `xs3`(14) → `sm`(16) → `sm2`(18) → `md`(20) → `lg`(28) → `xl`(34). Se añadieron a `baseRadius` (que alimenta `AppTheme.radius`); `DesignSystem.radius` (semántico: control/card/…) no se tocó — estos valores no tienen rol semántico único.

**No se añadieron los marginales** (13, 8, 22, 9, 11, 24, 7, 26 — entre 2 y 7 usos cada uno): un token por cada uno convertiría la escala en ruido. Quedan como literales, **pendientes** (§6).

## 3. Prueba de equivalencia (cero cambio visual)

| Literal | Token aplicado | Valor resuelto | ¿Idéntico? |
|---|---|---|---|
| `12` | `AppTheme.radius.xs2` | `baseRadius.xs2` = **12** | ✔ |
| `14` | `AppTheme.radius.xs3` | `baseRadius.xs3` = **14** | ✔ |
| `18` | `AppTheme.radius.sm2` | `baseRadius.sm2` = **18** | ✔ |

Cada token resuelve al mismo número que el literal → ningún píxel cambia.

## 4. Sustituciones aplicadas (44)

| Archivo | 12→`xs2` | 14→`xs3` | 18→`sm2` | Total | Namespace |
|---|---|---|---|---|---|
| [chat-screen.styles.ts](mobile/src/screens/chat/chat-screen.styles.ts) | 1 (441) | 1 (41) | 1 (836) | 3 | AppTheme (ya) |
| [profile-screen.styles.ts](mobile/src/screens/profile/profile-screen.styles.ts) | 1 (152) | 4 (87,142,177,205) | 1 (76) | 6 | AppTheme (ya) |
| [checklist-screen.styles.ts](mobile/src/screens/checklist/checklist-screen.styles.ts) | 1 (189) | 7 (141,287,303,488,548,560,570) | 3 (104,205,452) | 11 | AppTheme (ya) |
| [radio-screen.styles.ts](mobile/src/screens/radio/radio-screen.styles.ts) | 3 (183,208,362) | 4 (117,329,416,491) | 6 (145,235,252,300,385,480) | 13 | AppTheme (ya) |
| [map-styles.ts](mobile/src/screens/map/map-styles.ts) | 3 (40,65,135) | 3 (156,305,318) | 3 (26,105,119) | 9 | AppTheme (ya) |
| [radio-transmission-card.tsx](mobile/src/screens/radio/components/radio-transmission-card.tsx) | 1 (275) | — | 1 (237) | 2 | **AppTheme (import añadido)** |
| **Total** | 10 | 19 | 15 | **44** | |

**Criterio de namespace (RC-MOBILE-UI-01):** todas estas hojas ya usaban `AppTheme.radius` (los tokens nuevos viven ahí), salvo `radio-transmission-card.tsx` que solo importaba `Typography` → se añadió `import { AppTheme, Typography }`. Ninguna mezcla `DesignSystem.radius`.

**Edits dirigidos (no `replace_all`) donde un mismo valor coexiste con un círculo excluido en el archivo:** chat r18 (solo `messageBubble`, no `headerBackButton`), checklist r12 (solo `miniAction`, no `miniMapMarker`), map r12 (`selectorStepBadge`/`selectorEditChip`/`metricCard`, no los dos markers). El resto por `replace_all` seguro.

## 5. Excluido y diferido (11), con motivo

**Círculos excluidos (4)** — geometría, no radio de esquina (mismo criterio que `userMarker` en RC-MOBILE-UI-01: `borderRadius` = mitad del lado):

| Elemento | Archivo:línea | Dimensión | Radio |
|---|---|---|---|
| `vehicleMarker` | [map-styles.ts:202](mobile/src/screens/map/map-styles.ts) | 24×24 | 12 (=mitad) |
| `incidentMarker` | [map-styles.ts:252](mobile/src/screens/map/map-styles.ts) | 24×24 | 12 |
| `miniMapMarker` | [checklist-screen.styles.ts:324](mobile/src/screens/checklist/checklist-screen.styles.ts) | 24×24 | 12 |
| `headerBackButton` | [chat-screen.styles.ts:495](mobile/src/screens/chat/chat-screen.styles.ts) | 36×36 | 18 |

Tokenizarlos sería value-idéntico (sin cambio visual) pero acoplaría la redondez a la escala de radios y se rompería si el token cambiara. Quedan como literales.

**Diferidos por namespace/sistema (7):**
- **alerts (5)**: 12 en líneas 42,66,224,298; 14 en 413. La hoja usa `DesignSystem.radius`; los tokens nuevos viven en `AppTheme.radius`; usarlos mezclaría namespaces (contra el criterio), y `DesignSystem.radius` no tiene 12/14. Diferido (igual que en RC-MOBILE-UI-01).
- **auth (2)**: 18 en 187, 12 en 240. `customer-auth-screen.styles.ts` es light-only con paleta propia y **0 tokens** por decisión previa (RC-MOBILE-UI-01 §2); introducir `AppTheme.radius` ahí contradice ese estado. Diferido.

## 6. Validaciones

| Verificación | Resultado |
|---|---|
| Línea base `npm test` | 25/25 suites, 126/126 tests PASS |
| `npm run typecheck` (`tsc --noEmit`) | PASS (exit 0) — los tres tokens `as const` resuelven bien |
| ESLint (7 archivos tocados) | PASS (exit 0) |
| `npm test` post-cambio | **25/25 suites, 126/126 — idéntico a la base** |
| Bundle release Metro (`--dev false`, a directorio temporal) | PASS (exit 0) |
| Literales 12/14/18 restantes | **exactamente 11** (4 círculos + alerts 5 + auth 2) — verificado por grep |
| Tokens nuevos aplicados | **44** — verificado por grep |

## 7. Archivos tocados (7)

`constants/theme.ts` (3 tokens nuevos), + 5 hojas de estilo y 1 componente con las 44 sustituciones.

## 8. Rollback

```
cd mobile && git checkout -- constants/theme.ts src/screens/chat/chat-screen.styles.ts src/screens/profile/profile-screen.styles.ts src/screens/checklist/checklist-screen.styles.ts src/screens/radio/radio-screen.styles.ts src/screens/radio/components/radio-transmission-card.tsx src/screens/map/map-styles.ts && cd .. && rm RC-MOBILE-UI-03.md
```

## 9. Pendiente de decisión (no ejecutado)

- **Radios marginales** (13, 8, 22, 9, 11, 24, 7, 26): sin token, quedan literales. Decidir si alguno merece token o se dejan.
- **alerts (5) y auth (2)**: diferidos arriba — decidir si tokenizar alerts aceptando namespace/nombres, y si auth entra al sistema de tokens (trabajo aparte, implica dark mode).
- **Círculos**: se dejan como geometría literal por criterio establecido.
- **Pendientes de auditoría aún abiertos**: títulos de página/sección (hero 30/32/34/36; sección 16–22) y breakpoints (phone 600/640/720, compact 1040/1080/1120).
