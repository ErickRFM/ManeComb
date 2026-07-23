# RC-MOBILE-UI-01 — Estandarización visual de bajo riesgo (grupo 1)

> **Estado:** Cerrado
>
> **Rama:** `main`
>
> **Commit base:** `6c3e1ac` (Fases 1–2, limpieza 3.1 y auditoría UI en el árbol sin commit)
>
> **Estado Git inicial:** sin revert/rebase/merge/cherry-pick. Cambios previos sin commit presentes (fases anteriores + ajenos en `backend/`).

## 1. Objetivo y resultado

Tres ítems derivados de [RC-MOBILE-UI-AUDIT-01](RC-MOBILE-UI-AUDIT-01.md): (1) radios literales → token idéntico (invisible), (2) corregir el rojo del login, (3) unificar dos icon-shells de radio. Resultado: **24 swaps de radio + 8 correcciones de color + 1 unificación de shell**, con typecheck/eslint/suite idénticos a la base. Se **difirieron 3** swaps (alerts) y se **excluyó 1** (círculo de map) con motivo verificado, según se explica.

**Criterio de namespace declarado (ítem 1):** cada hoja usa el namespace de radio que ya referencia; si no referencia radio pero sí otros tokens, ese; si no usa ninguno, **`AppTheme.radius.*`** (nombres de escala pura `xs/sm/md/lg`, que **no** afirman semántica del elemento — evita rotular una card como "control"). Nunca se introduce un segundo namespace de radio en una hoja que ya usa otro.

## 2. Ítem 1 — Radios literales → token idéntico

### 2.1 Prueba de equivalencia (valor resuelto en `constants/theme.ts`)

| Literal | Token aplicado | Valor resuelto del token | ¿Idéntico? |
|---|---|---|---|
| `16` | `AppTheme.radius.sm` | `baseRadius.sm` = **16** | ✔ |
| `20` | `AppTheme.radius.md` | `baseRadius.md` = **20** | ✔ |
| `28` | `AppTheme.radius.lg` | `baseRadius.lg` = **28** | ✔ |
| `10` | `AppTheme.radius.xs` | `baseRadius.xs` = **10** | ✔ |

Los cuatro tokens resuelven al mismo número → **cero cambio visual** por construcción.

### 2.2 Swaps aplicados (24), por archivo

| Archivo | Líneas (originales) | Literal → token | # |
|---|---|---|---|
| [chat-screen.styles.ts](mobile/src/screens/chat/chat-screen.styles.ts) | 288,316,449,742,757,772,871,888,894,921,1291 | `16` → `radius.sm` | 11 |
| chat-screen.styles.ts | 638,671,1146,1355 | `20` → `radius.md` | 4 |
| chat-screen.styles.ts | 1424 | `10` → `radius.xs` | 1 |
| [checklist-screen.styles.ts](mobile/src/screens/checklist/checklist-screen.styles.ts) | 361,433,700 | `16` → `radius.sm` | 3 |
| checklist-screen.styles.ts | 505 | `20` → `radius.md` | 1 |
| checklist-screen.styles.ts | 40 | `28` → `radius.lg` | 1 |
| [profile-screen.styles.ts](mobile/src/screens/profile/profile-screen.styles.ts) | 112 (`themeRow`) | `16` → `radius.sm` | 1 |
| [radio-screen.styles.ts](mobile/src/screens/radio/radio-screen.styles.ts) | 426 (`heroCard`) | `28` → `radius.lg` | 1 |
| [map-styles.ts](mobile/src/screens/map/map-styles.ts) | 279 | `20` → `radius.md` | 1 |
| **Total** | | | **24** |

**Imports añadidos** (2 archivos que solo importaban `Typography`): checklist-screen.styles.ts y map-styles.ts pasan a `import { AppTheme, Typography } from '@/constants/theme';`. chat/profile/radio ya importaban `AppTheme`. No hay dependencia nueva.

### 2.3 Diferido — alerts (3 swaps), con motivo

[alerts.styles.ts](mobile/src/screens/alerts/alerts.styles.ts) es la **única hoja que ya usa `DesignSystem.radius`** (línea 126, `radius.input`). Para no mezclar namespaces, sus swaps tendrían que usar nombres semánticos de `DesignSystem`, que **no encajan con estos elementos**:

| Línea | Elemento | Valor | Único token DS con ese valor | Problema |
|---|---|---|---|---|
| 97 | `formCard` | 16 | `radius.control` (16) — `radius.card` es **20** | Rotularía una card como "control" |
| 166 | `timelinePanel` | 16 | `radius.control` (16) | Ídem, es un panel |
| 248 | `errorBanner` | 10 | `radius.icon` (10) | Rotularía un banner como "icon" |

Usar `AppTheme.radius` (escala pura) en alerts mezclaría dos namespaces de radio en la hoja (contra el criterio). Como tokenizar aquí **adjuntaría un nombre semántico engañoso** sin ganancia, se **defiere** a la decisión futura sobre la escala de radios. Valor idéntico, pero el token "correcto en número" es "incorrecto en nombre".

### 2.4 Excluido — círculo de map (1), con motivo

[map-styles.ts:255](mobile/src/screens/map/map-styles.ts) `userMarker: { width: 20, height: 20, borderRadius: 10 }` es un **círculo geométrico** (radio = mitad del lado). Aunque `10` = `radius.xs`, es una geometría, no un radio de esquina de diseño; tokenizar solo el radio (dejando `width/height: 20` como literales) acopla la redondez a la escala de radios y es semánticamente incorrecto. Se **excluye** y se reporta. (Es el único `borderRadius: 10` de map; el `20` de la línea 279 sí se tokenizó.)

**Tampoco se tocaron** los 86 radios fuera de escala (12/14/18/13/8/22/9/11/24/7/26) ni los `fontSize` literales — fuera de fase por instrucción.

## 3. Ítem 2 — Rojo de marca del login

Sustituidas las **8** apariciones de `#EA1F23` por el token accent `#E31E24` (mantenido como **literal**; auth sigue siendo light-only con paleta propia — no se migró a `theme.colors`):

| Archivo | Apariciones |
|---|---|
| [auth/customer-auth-screen.styles.ts](mobile/src/screens/auth/customer-auth-screen.styles.ts) | 7 |
| [auth/components/unit-selector.tsx](mobile/src/screens/auth/components/unit-selector.tsx) | 1 |

Verificado: **0** `#EA1F23` restantes en `src/`. Este ítem **sí cambia el aspecto** (mínimamente): el rojo del login pasa de `#EA1F23` al rojo de marca `#E31E24` — resultado buscado.

## 4. Ítem 3 — Icon-shell de radio

Verificado que **ambos shells son 38×38**: `channelAvatar` (borderRadius 13) y `operationalIcon` (borderRadius 14) en [radio-screen.styles.ts](mobile/src/screens/radio/radio-screen.styles.ts). Unificado `channelAvatar` a **14** (valor mayoritario en shells del rango: menu 40×40 r14, infoIcon 42×42 r14). Cambio de 1px de radio en un solo shell — corrige la incoherencia interna. `operationalIcon` intacto. **Sí cambia el aspecto** mínimamente (channelAvatar 1px más de radio), declarado.

## 5. Validaciones

| Verificación | Resultado |
|---|---|
| Línea base `npm test` | 25/25 suites, 126/126 tests PASS |
| `npm run typecheck` (`tsc --noEmit`) | PASS (exit 0) |
| ESLint (7 archivos tocados) | PASS (exit 0) |
| `npm test` post-cambio | **25/25 suites, 126/126 — idéntico a la base** |
| Bundle release Metro (`--dev false`, a directorio temporal) | PASS (exit 0) |
| Diff | 7 archivos, 35 ins / 35 del (balanceado: swaps 1:1 + 2 imports editados in-place) |

**Evidencia de "cero cambio visual" (ítem 1):** §2.1 prueba que cada token resuelve al mismo número que el literal que reemplaza. Los ítems 2 y 3 sí cambian el aspecto, mínimamente y por diseño (declarado). Runtime real no ejercitado (sin sesión); la evidencia es la equivalencia de valores + suite + bundle.

## 6. Rollback

```
cd mobile && git checkout -- src/screens/chat/chat-screen.styles.ts src/screens/checklist/checklist-screen.styles.ts src/screens/profile/profile-screen.styles.ts src/screens/radio/radio-screen.styles.ts src/screens/map/map-styles.ts src/screens/auth/customer-auth-screen.styles.ts src/screens/auth/components/unit-selector.tsx && cd .. && rm RC-MOBILE-UI-01.md
```

## 7. Pendiente (no ejecutado — espera de decisión)

- **alerts (3 swaps)** y **círculo de map (1)**: diferidos/excluidos arriba, a la decisión sobre la escala de radios.
- **Grupo 2** (handles de sheet, chips, alineación, breakpoints, títulos): no iniciado, según instrucción.
