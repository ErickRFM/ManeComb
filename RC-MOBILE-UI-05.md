# RC-MOBILE-UI-05 — Unificación de breakpoints (cambia el layout en tablet)

> **Estado:** Cerrado
>
> **Rama:** `main`
>
> **Estado Git inicial:** el árbol contiene trabajo paralelo commiteado (feature de documentos del chofer; suite 26/134). No lo toqué.

## 1. Objetivo y resultado

La app cambiaba de layout a anchos distintos según la pantalla. Se definió **un único origen** de breakpoints (`DesignSystem.breakpoints = { phone: 640, compact: 1080 }`) y **7 pantallas lo consumen** en vez de declarar su número. `auth` queda fuera (eje propio). Suite 26/134 idéntica a la base; typecheck/bundle OK. ESLint reporta 2 hallazgos **preexistentes ajenos** (ver §5). **Ningún caso resultó riesgoso** tras el análisis de §4.

## 2. Origen único de breakpoints

Se añadió a `DesignSystem` en [constants/theme.ts](mobile/constants/theme.ts) (donde viven los tokens; radio ya importaba `DesignSystem`):

```ts
breakpoints: {
  phone: 640,
  compact: 1080,
},
```

No existía ningún sitio previo de constantes de layout (verificado). Cada pantalla ahora usa `width < DesignSystem.breakpoints.phone` / `.compact` (o `>=` en radio).

## 3. Antes / después por pantalla

| Pantalla | isPhone antes→después | isCompact/isDesktop antes→después | Consumo |
|---|---|---|---|
| **alerts** | 600 → **640** | 1040 → **1080** | `DesignSystem.breakpoints.*` (import añadido) |
| **chat** | 720 → **640** | 1080 → 1080 (sin cambio de valor) | ídem (import añadido) |
| **checklist** | 640 → 640 (sin cambio) | 1120 → **1080** | ídem (import añadido) |
| **users** | 640 → 640 (sin cambio) | — | ídem (import extendido) |
| **profile** | 640 → 640 (sin cambio) | 1040 → **1080** | ídem (import extendido) |
| **radio** | 720 → **640** | isDesktop `>=1080` → `>=1080` (sin cambio) | ídem (ya importaba `DesignSystem`) |
| **profile-edit** | 640 → 640 (sin cambio) | — | ídem (import añadido) — 7ª pantalla, por consistencia |
| **auth** | `isNarrow` 390 (width) + `isShortViewport` (height) | — | **NO tocada** (eje propio) |

Cambios de comportamiento reales (coinciden con el encargo): alerts 600→640 y 1040→1080; chat y radio 720→640; checklist 1120→1080; profile 1040→1080.

## 4. Verificación de riesgo — qué layout aplica en cada rango (§4 del encargo)

Antes de aplicar, verifiqué en cada pantalla qué gobierna el umbral. **Ninguno resultó riesgoso:**

| Cambio | Qué controla el flag | Efecto del cambio | Riesgo |
|---|---|---|---|
| **chat isPhone 720→640** | Solo dimensiona (avatares 36/40, iconos 19/22, burbujas). El split de paneles es `isCompact` (1080), **no** isPhone. | Anchos 640–719: estilo desktop (fuentes/tamaños algo mayores), misma estructura de panel único. | Cosmético, seguro |
| **radio isPhone 720→640** | Solo `createStyles` + diámetro del PTT wave (244/284) e icono (50/58). El pager de 3 páginas y el device-bar los gobierna `isDesktop` (1080). | Anchos 640–719: PTT wave/icono variante desktop. Pager intacto. | Cosmético, seguro |
| **alerts isPhone 600→640** | Layout de una columna (form + timeline). | Anchos 600–639: pasan a variante phone (una columna). Es el fallback seguro. | Seguro (widening) |
| **alerts isCompact 1040→1080** | `contentLayout: isCompact ? columna : fila`. | Anchos 1040–1079: fila → **columna** (form y timeline apilados). Columna es el fallback. | Seguro (widening) |
| **profile isCompact 1040→1080** | `mainGrid: web && !isCompact ? fila : columna`. | Anchos 1040–1079: fila → columna. Fallback seguro. | Seguro (widening) |
| **checklist isCompact 1120→1080** | **`isCompact` se declara y se pasa a `createStyles`, pero NO se usa** en ningún estilo ni JSX. | **Ningún efecto visual** (flag inerte). | Sin efecto (ver nota) |

**Nota declarada — checklist isCompact inerte:** el flag se computa y se pasa a `createStyles(theme, isCompact, isPhone)`, pero el parámetro `isCompact` no se consume en ninguna regla de estilo ni en el JSX del contenedor. Por tanto el cambio 1120→1080 en checklist **no altera el aspecto** hoy. Lo unifiqué igual (consume la constante) para que, si algún día se usa, quede al umbral canónico; no lo eliminé (fuera de scope). Los demás cambios sí alteran el layout en los rangos indicados.

## 5. ESLint — hallazgos preexistentes ajenos (NO introducidos por este cambio)

`eslint` sobre los archivos tocados sale con código 1 por **2 hallazgos que ya existen en HEAD** y no tienen relación con breakpoints. Lo verifiqué lintando la versión commiteada (`git show HEAD:… | eslint --stdin`):

| Archivo:línea | Regla | Origen | ¿Mío? |
|---|---|---|---|
| profile-screen.tsx:101 | `react-hooks/exhaustive-deps` (falta dep `user`) | `useEffect` de carga de documentos — **feature paralela** (documentos del chofer) | **No** — confirmado presente en HEAD |
| use-chat-controller.ts:177/178 | `@typescript-eslint/no-shadow` (`socket`) | Código RTC existente del chat | **No** — confirmado presente en HEAD |

Mi diff en ambos archivos es **solo** el import de `DesignSystem` + las declaraciones de breakpoint (verificado). No toqué esos `useEffect`/`socket`. **No los corregí**: no son de mi tarea y modificar deps de un hook o renombrar `socket` podría alterar comportamiento (carga de documentos / señalización RTC). Se reportan para que el autor del trabajo paralelo decida.

## 6. Validaciones

| Verificación | Resultado |
|---|---|
| Línea base `npm test` | PASS (26/134) |
| `npm run typecheck` (`tsc --noEmit`) | PASS (exit 0) |
| ESLint sobre mis cambios (import + breakpoints) | Limpio; el exit 1 es por 2 hallazgos preexistentes ajenos (§5) |
| `npm test` post-cambio | **26/26 suites, 134/134 tests PASS** — idéntico a la base |
| Bundle release Metro (`--dev false`, a directorio temporal) | PASS (exit 0) |
| Literales de breakpoint restantes en isPhone/isCompact/isDesktop | **0** (verificado por grep); auth (390, y su `isShortViewport` sobre `height`) intacto |

## 7. Archivos tocados (8)

`constants/theme.ts` (token `breakpoints`), + 7 contenedores: alerts/AlertsScreen.tsx, chat/hooks/use-chat-controller.ts, checklist-screen.tsx, users-screen.tsx, profile-screen.tsx, radio/radio-screen-view.tsx, profile-edit-screen.tsx.

## 8. Rollback

```
cd mobile && git checkout -- constants/theme.ts src/screens/alerts/AlertsScreen.tsx src/screens/chat/hooks/use-chat-controller.ts src/screens/checklist-screen.tsx src/screens/users-screen.tsx src/screens/profile-screen.tsx src/screens/radio/radio-screen-view.tsx src/screens/profile-edit-screen.tsx && cd .. && rm RC-MOBILE-UI-05.md
```

---

## 9. Estado de la estandarización visual completa

| RC | Tema | Resultado |
|---|---|---|
| UI-AUDIT-01 | Auditoría | Mapa de inconsistencias con valores concretos |
| UI-01 | Radios literal→token idéntico + rojo login + icon-shell radio | 24 swaps (cero visual) + `#EA1F23`→`#E31E24` + channelAvatar 13→14 |
| UI-02 | Handles de sheet, radio superior, filterChip, alineación vacío | 4 ítems (sí cambian aspecto), un 3.er handle hallado |
| UI-03 | Escala de radios | +xs2/xs3/sm2 (12/14/18); 44 tokenizados; círculos/alerts/auth diferidos |
| UI-04 | Tipografía de títulos | hero→30/900, sección→20/900; legal excluido |
| **UI-05** | **Breakpoints** | **phone 640 / compact 1080 unificados; 7 pantallas; auth fuera** |

**Pendiente de decisión (no ejecutado):**
- **Radios marginales** (13, 8, 22, 9, 11, 24, 7, 26): sin token, quedan literales.
- **Diferidos**: alerts (5 radios, usa `DesignSystem.radius`), auth (radios + integración al sistema = trabajo aparte con dark mode), legal (tipografía + paleta, como auth), círculos (geometría), checklist `isCompact` inerte.
- **Discrepancias hero fuera de lista**: radio hero sin peso 900, legal hero 800.
- **Ajeno (no de estandarización):** 2 hallazgos eslint preexistentes en trabajo paralelo/RTC (§5) — a decisión de sus autores.
