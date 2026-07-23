# RC-MOBILE-UI-AUDIT-01 — Auditoría de consistencia visual (móvil, solo lectura)

> **Estado:** Entregada. **No se modificó ningún archivo.**
>
> **Alcance:** `mobile/src/screens` + `mobile/src/components`, contra el sistema de tokens de `mobile/constants/theme.ts`.
>
> **Método:** valores resueltos al número final (no nombres de token). Los conteos vienen de barridos sobre `src/screens`/`src/components`; donde no pude resolver un valor leyendo el código, lo digo.

## 0. Sistema de tokens (la vara de medir)

De [constants/theme.ts](mobile/constants/theme.ts):

- **spacing** (`AppTheme.spacing` / `DesignSystem.spacing`): xs **6**, sm **10**, md **16**, lg **22**, xl **28**, xxl **40**.
- **radius** (`AppTheme.radius`): xs **10**, sm **16**, md **20**, lg **28**, xl **34**, pill **999**. `DesignSystem.radius`: control=16, card=20, sheet=28, input=16, chip=999, icon=10.
- **typography** (`DesignSystem.typography`): hero **30**/900, title **22**/900, subtitle **16**/800, body **14**/600, caption **12**/700, overline **11**/800.
- **icon** (`DesignSystem.icon`): xs 14, sm 18, md 22, lg 28, xl 34.
- **control** (alturas): sm **40**, md **46**, lg **52**, touch **44**.
- **colores semánticos** (`theme.colors`, light/dark): accent `#E31E24`/`#E31E24`, muted `#71788A`/`#A8B1C2`, text `#171A20`/`#F4F7FB`, line `#E8EBF0`/`rgba(255,255,255,0.08)`, success/warning/danger/info con sus `*Soft`.

Componentes compartidos canónicos y sus valores: **StatusPill** (radius 999, padH 11, padV 5, label 11/w800), **PrimaryButton** (minHeight 46, radius 16, label 14/w600), **AppCard** (radius 20, padding 12, gap 8).

---

## 1. Tokens vs. literales

### 1.1 Colores hardcodeados por archivo (hex/rgba, incluye `#FFFFFF`; 206 apariciones totales en `src/screens`)

| Archivo | Literales no-blancos | ¿Usa `theme.colors`? | Nota |
|---|---|---|---|
| [auth/customer-auth-screen.styles.ts](mobile/src/screens/auth/customer-auth-screen.styles.ts) | **31** | **0** | Login **light-only totalmente hardcodeado** |
| [chat/chat-screen.styles.ts](mobile/src/screens/chat/chat-screen.styles.ts) | 29 | 161 | Theme-aware pero mezcla literales (sombras rgba, overlays, un ámbar) |
| [alerts/constants/alerts.constants.ts](mobile/src/screens/alerts/constants/alerts.constants.ts) | 16 | — | Mapa de estilos de tipo/severidad de incidencia |
| [checklist/checklist-screen.styles.ts](mobile/src/screens/checklist/checklist-screen.styles.ts) | 10 | sí | |
| [map/map-styles.ts](mobile/src/screens/map/map-styles.ts) | 8 | sí | |
| [radio/radio-screen.styles.ts](mobile/src/screens/radio/radio-screen.styles.ts) | 6 | sí | |
| [chat/components/message-media.tsx](mobile/src/screens/chat/components/message-media.tsx) | 5 | sí | |
| Otros 7 archivos | 1–2 c/u | — | FloatingControls, unit-selector, AlertsHeader, MapCanvas, BottomTrackingPanel, legal, route-preview |

**Hallazgo destacado — dos rojos de marca distintos.** `auth` usa `#EA1F23` como su rojo primario (8 usos, en [customer-auth-screen.styles.ts](mobile/src/screens/auth/customer-auth-screen.styles.ts) y [unit-selector.tsx](mobile/src/screens/auth/components/unit-selector.tsx)), **≠ token accent `#E31E24`** que usa el resto de la app (y `MANECOMB_ROUTE_COLOR = '#E31E24'` en checklist). La diferencia es sutil (~3 pts de matiz) pero real: la pantalla de login tiene un rojo ligeramente distinto al de la app.

**Auth es un caso aparte declarado:** 0 usos de `theme.colors`, paleta propia (`#333333` texto, `#71788A` muted —este sí coincide con el token—, `#2F2F2F`/`#D8D2C8` bordes, `#EA1F23` rojo). Es un login light-only deliberado. Migrarlo a tokens cambiaría su aspecto (dark mode, rojo) → **decisión de producto, no swap trivial**.

### 1.2 Radios literales — tokenizables vs. fuera de escala

| ¿Coincide con token? | Valores | Usos | Riesgo |
|---|---|---|---|
| **Sí, idéntico** | 16 (=sm, 17×), 20 (=md, 6×), 28 (=lg, 2×), 10 (=xs, 3×) | **28** | **Bajo**: literal→token sin cambio visual |
| **No (fuera de escala)** | 12 (18×), 14 (19×), 18 (17×), 13 (7×), 8 (5×), 22 (5×), 9 (4×), 11 (4×), 24 (3×), 7 (2×), 26 (2×) | **86** | Snapping cambia el aspecto → **decisión** |

Lectura: existe **una segunda escala de facto** (12/14/18 = 54 usos) que la app usa mucho para cards/chips/shells pero que **no está en los tokens** (los tokens saltan 10→16→20→28). No es "literal en vez de token"; es que el token idéntico no existe.

### 1.3 fontSize literales (equivalen al número de un token pero se escriben a mano)

`fontSize: 12` → 49 usos, `14` → 36, `11` → 32, `16` → 5, `22` → 2, `30` → 2. Los números 11/12/14 (overline/caption/body) recurren como literales por toda la app. Nota: el token tipográfico implica también lineHeight/weight, así que el swap solo es "idéntico" para el número de tamaño.

---

## 2. Familias de elementos

### 2.1 Cards / paneles — radio de borde y padding

| Elemento | Pantalla | Radius | Padding | Borde | ¿Token? |
|---|---|---|---|---|---|
| **AppCard** (canónico) | compartido | **20** | 12 | sólido 1 | ✔ card |
| timelinePanel | alerts | 16 | 12/14 | sólido | literal (=sm) |
| incidentCard | alerts | **12** | 11/10 | sólido | fuera |
| heroCard | radio | **28** | 12/16 | sólido | =lg (literal) |
| channelCard | radio | 18 | 10 | sólido | fuera |
| infoTile | profile | 18 | 13 | sólido | fuera |
| formGrid | profile-edit | 28 | 16 | sólido | ✔ (usa `radius.lg`,`spacing.md`) |
| userRow | users | 20 | 10/16 | sólido | =md (literal) |
| emptyState (caja) | checklist | 18 | 22 | **punteado** | fuera |
| stateBox | alerts (AlertState) | 14 | 18 | **punteado** | fuera |

**Discrepancia:** radios de card van de **12 a 28** (12,14,16,18,20,28). Solo `formGrid` usa tokens explícitos. Padding va de 10 a 22. Dos cards usan borde **punteado** (checklist emptyState, AlertState) y el resto sólido — coherente con su rol (estado vacío), no un bug.

### 2.2 Badges / pills de estado — **buena noticia: mayormente canónico**

Los estados que preguntaste (`En jornada`, `Asignada`, `Detenida`, `Disponible`, `Listo`, `En ruta`, `Finalizado`…) se renderizan con el componente compartido **`StatusPill`** en las cuatro superficies principales:

| Pantalla | Etiquetas | Render | ¿Canónico? |
|---|---|---|---|
| checklist | En ruta/Finalizado/Cancelado/Retraso/Disponible | `<StatusPill tone={getStatusTone(...)}>` ([checklist-screen.tsx:1115](mobile/src/screens/checklist-screen.tsx)) | ✔ |
| map BottomTrackingPanel | Asignada/En jornada/Detenida | `<StatusPill tone={statusTone}>` ([BottomTrackingPanel.tsx:397](mobile/src/screens/map/components/BottomTrackingPanel.tsx)) | ✔ |
| radio | Transmitiendo/Listo/Canal ocupado… | `<StatusPill tone={liveStatus.tone}>` | ✔ |
| alerts | tipo/estado/severidad | `AlertBadge` (local, no StatusPill) — ver nota | ✖ |

**Matices:**
- **`AlertBadge`** ([alerts/components/AlertBadge.tsx]) es un badge **local** distinto de StatusPill: usa `visualStyle` con color/fondo del mapa `alerts.constants.ts` (16 literales de color). No es tono semántico; es una paleta propia por tipo de incidencia. Decisión: es intencional (colores por tipo), no un StatusPill mal hecho.
- **Color crudo paralelo:** checklist usa además `getStatusColor(theme, status)` ([checklist-screen.tsx:1073](mobile/src/screens/checklist-screen.tsx)) para un punto/acento de color **fuera** del pill. Consistente con los tonos del pill (mismos colores semánticos), pero es una segunda ruta de color.

Conclusión: la familia de badges de estado **ya está bastante unificada** vía StatusPill. La única superficie que no lo usa (alerts/AlertBadge) lo hace a propósito.

### 2.3 Icon-shells (cuadros redondeados con icono)

| Shell | Pantalla | Tamaño | Radius | Ratio r/lado | Fondo |
|---|---|---|---|---|---|
| typeIconShell | alerts | 30×30 | 9 | 0.30 | por tipo |
| notificationIcon | profile | 36×36 | 12 | 0.33 | — |
| channelAvatar | radio | 38×38 | **13** | 0.34 | rgba(255,255,255,0.06) |
| operationalIcon | radio | 38×38 | **14** | 0.37 | — |
| menu icon | drawer | 40×40 | 14 | 0.35 | — |
| infoIcon | profile | 42×42 | 14 | 0.33 | accentSoft |
| emptyIconShell | radio | 64×64 | 22 | 0.34 | surfaceAlt |
| callTileIconShell | chat | 72×72 | 24 | 0.33 | accent |

**Discrepancia interna en radio:** dos shells del **mismo tamaño (38×38)** con **radio distinto** (channelAvatar **13** vs operationalIcon **14**) — inconsistencia dentro de una misma pantalla. En general los shells siguen un ratio ~⅓ (cuadro redondeado) pero cada uno elige su radio a mano; **ninguno usa `radius.icon`=10** (que daría un cuadro mucho menos redondeado — de hecho el token icon no encaja con el ratio ⅓ que la app usa de facto). Los tamaños (30/36/38/40/42/64/72) son por rol distinto, no comparables entre sí.

Contraste con **iconos sueltos sin shell**: las métricas de checklist y las filas de `BottomTrackingPanel` ([map-styles.ts:189](mobile/src/screens/map/map-styles.ts), `emptyTrackState` row, icon 18 suelto) no envuelven el icono — decisión de densidad, coherente.

### 2.4 Tipografía por rol

**Título de página (hero)** — el título grande arriba de cada pantalla:

| Pantalla | phone / desktop | Peso | vs token hero (30/900) |
|---|---|---|---|
| alerts | 24 / **30** | 900 | ✔ desktop |
| users | 24 / **30** | 900 | ✔ desktop |
| radio | 25 / **30** | — | ✔ desktop |
| chat | 26 / **32** | — | +2 |
| profile | 26 / **32** | — | +2 |
| checklist | 26 / **36** | — | +6 |
| profile-edit | **34** (fijo) | — | +4, sin responsive |
| gate | 28 | 800 | −2 |
| legal | 30 | — | ✔ |

Máximos: **30, 30, 30, 32, 32, 34, 36** — el mismo rol "título de pantalla" tiene 4 tamaños distintos en desktop.

**Título de sección/tarjeta** (dentro de card/panel):

| Pantalla | fontSize | Peso |
|---|---|---|
| chat sectionTitle | **16** | (subtitle) |
| legal sectionTitle | 17 | 800 |
| alerts panelTitle | 18 | 900 |
| users sectionTitle | 19 / 22 | 900 |
| checklist / profile / radio | **20** | 900 / 900 / — |
| profile-edit sectionHeading | **22** | 800 |

El rol "título de sección" oscila entre **16 y 22** (los tokens subtitle=16 y title=22 son justo los extremos), con pesos mezclados 800/900. **6 tamaños distintos** para el mismo rol.

### 2.5 Botones — `PrimaryButton` usado en solo 2 pantallas

`<PrimaryButton>` aparece **solo en 2 archivos**: [AlertForm.tsx](mobile/src/screens/alerts/components/AlertForm.tsx) y [profile-edit-screen.tsx](mobile/src/screens/profile-edit-screen.tsx). El resto tiene botón primario **local**:

| Botón | Pantalla | minHeight | Radius | Fondo | vs PrimaryButton (46/16) |
|---|---|---|---|---|---|
| **PrimaryButton** | canónico | 46 | 16 | accent | — |
| primaryButton | auth | 40 | **7** | #EA1F23 | −6 alto, radio ⅓ |
| primaryButton | gate | **52** | 8 | accent | +6 alto |
| sosBtn | alerts | 46/50 | 12 | danger | radio +? |
| logoutBtn | profile | 46 | 14 | ghost | borde 1.5 |
| pttButton | radio | (grande, circular) | — | por fase | especial |
| quickActionCard | radio/chat | — | — | accent | CTA-card |

El botón de acción primaria aparece con radius **7, 8, 12, 14, 16** y alturas **40, 46, 50, 52**. auth (radio 7) y gate (radio 8, alto 52) son los más alejados del canónico. `pttButton` es un caso especial (botón circular de consola) — no comparable.

### 2.6 Bottom-sheets — **handles visualmente distintos**

| Sheet | Handle (an×al) | Handle radius | Radio superior | Padding |
|---|---|---|---|---|
| checklist route sheet | 38×4 | **999** (pill) | 26 | — |
| map history/panel | 42×4 | **2** (casi recto) | 22 | 16 |

**Discrepancia clara:** el handle de arrastre es un **pill redondo** en checklist (radius 999) y una **barra casi rectangular** en el mapa (radius 2) — se ven distintos. Anchos 38 vs 42. Radio superior del sheet 26 vs 22; **ninguno usa `radius.sheet`=28**. ([checklist-screen.styles.ts:234](mobile/src/screens/checklist/checklist-screen.styles.ts) top radius 26; [map-styles.ts:122](mobile/src/screens/map/map-styles.ts) `panelHandle` 42×4 r2, `historyCard` top 22).

### 2.7 Chips de selección (filtro/método/dispositivo)

| Chip | Pantalla | minHeight | padH | Radius | Forma |
|---|---|---|---|---|---|
| filterChip | alerts | **31** | 10 | 999 | pill |
| filterChip | radio | **34** | 12 | 999 | pill |
| methodChip | profile-edit | 42 | 16 | 999 | pill (toggle) |
| deviceChip | radio | — | 12/8 | **12** | rect |
| trackChip | map | 36 | 13/8 | 11 | rect |

El chip de filtro pill difiere en alto: alerts **31** vs radio **34** (+3) y padH 10 vs 12. Mismo rol, valores distintos.

---

## 3. Responsividad — breakpoints divergentes (confirmado)

| Pantalla | isCompact / isDesktop | isPhone |
|---|---|---|
| alerts | **1040** | **600** |
| profile | **1040** | 640 |
| chat | **1080** | **720** |
| radio | **1080** (isDesktop `>=`) | **720** |
| checklist | **1120** | 640 |
| users | — | 640 |
| auth | isNarrow **390** | (height 720) |

- **isPhone**: **600 / 640 / 720** — tres umbrales. A un ancho de **620px** (tablet chica), alerts ya es "no-phone" pero checklist/profile/users siguen en layout phone, y chat/radio también. A **700px**, chat/radio siguen en phone mientras el resto ya no.
- **isCompact**: **1040 / 1080 / 1120** — tres umbrales para "columna vs. fila".

Consecuencia real: en tablet, distintas pantallas cambian de layout a anchos distintos — la app no tiene una escala de breakpoints única. (auth usa su propio eje: `isNarrow` 390 y `isShortViewport` por altura.)

---

## 4. Espaciado y alineación

- **Alineación de estado vacío:** users-screen usa `alignItems: 'flex-start'` (izquierda) mientras radio/chat/checklist/AlertState usan `center`. Mismo tipo de elemento, alineación distinta. (Detallado en RC-08.)
- **Gaps** en cards/listas: 8 (AppCard), 10 (users userRow, chat emptyStateCard), 12 (radio empty), 14 (varios) — sin escala fija, aunque 8/10/12 ≈ spacing sm(10)±2.
- **Padding de card:** 10/11/12/13/14/16/22 (§2.1) — no sigue `spacing` salvo profile-edit.
- Los valores de spacing **sí** suelen caer cerca de la escala (6/10/16/22) pero escritos como literales (8, 12, 13, 14 son los intrusos frecuentes que no están en la escala spacing 6/10/16/22/28/40).

---

## 5. Lista priorizada de estandarizaciones

### 5.1 Bajo riesgo — literal→token con **valor idéntico** (cero cambio visual)

| # | Estandarización | Valor canónico | Pantallas / usos | Cambio visual |
|---|---|---|---|---|
| A | `borderRadius: 16` → `DesignSystem.radius.control`/`.sm` | 16 | ~17 usos, varias | **Ninguno** |
| B | `borderRadius: 20` → `radius.card`/`.md` | 20 | 6 usos | **Ninguno** |
| C | `borderRadius: 28` → `radius.sheet`/`.lg` | 28 | 2 usos (radio heroCard, formGrid ya lo usa) | **Ninguno** |
| D | `borderRadius: 10` → `radius.xs` | 10 | 3 usos | **Ninguno** |
| E | `fontSize: 12/14/11` → `DesignSystem.typography.caption/body/overline.size` | igual | 117 usos (solo el número) | **Ninguno** (solo si se toca el size; no tocar weight/lineHeight) |

Los ítems A–D son puramente semánticos (mismo número, nombre de token) y no cambian un píxel. E es igual pero de altísimo volumen — conviene acotarlo a hojas de estilo concretas, no masivo.

### 5.2 Requieren tu decisión — cambian el aspecto de alguna pantalla

| # | Inconsistencia | Valores actuales | Canónico sugerido | Pantallas que tocaría |
|---|---|---|---|---|
| F | **Rojo de marca del login** | auth `#EA1F23` vs token `#E31E24` | `#E31E24` (token) | 1 (auth) — cambia el rojo del login |
| G | **Handle de bottom-sheet** | checklist pill (r999, 38) vs map barra (r2, 42) | un solo handle (p.ej. 40×4 r999) | 2 (checklist, map) |
| H | **Radio superior de sheet** | 26 vs 22 | `radius.sheet`=28 | 2 |
| I | **Título de página (hero)** | max 30/32/34/36 | 30 (token hero) | 4 (chat 32, profile 32, checklist 36, profile-edit 34) |
| J | **Título de sección** | 16/17/18/19/20/22, pesos 800/900 | 20/900 (o token title 22) | 5–6 |
| K | **Breakpoint isPhone** | 600 / 640 / 720 | uno (p.ej. 640) | 3 (alerts 600, chat 720, radio 720) — **altera layouts en tablet** |
| L | **Breakpoint isCompact** | 1040 / 1080 / 1120 | uno (p.ej. 1080) | 3 (alerts/profile 1040, checklist 1120) |
| M | **Radio de icon-shell 38×38** | radio 13 vs 14 | uno de los dos | 1 (radio, interno) |
| N | **filterChip alto** | alerts 31 vs radio 34 | uno (p.ej. 34) | 2 |
| O | **Radio de card fuera de escala** | 12/14/18 (54 usos) | requiere ampliar tokens o snap a 16/20 | muchas — **decisión de escala** |
| P | **Alineación estado vacío** | users flex-start vs center | center | 1 (users) |
| Q | **Card radius/padding no-token** | 12–28 / 10–22 | AppCard (20/12) donde aplique | varias (riesgo alto: cambia densidad) |

**Nota sobre O/Q:** la app usa de facto una escala de radios (12/14/18) que no está en los tokens. Estandarizar aquí es una **decisión de diseño** (ampliar la escala de tokens para incluir 12/14/18, o forzar snap a 16/20 aceptando el cambio visual), no un swap trivial. Igual que con los estados vacíos: el mapa lo levanta, la decisión es tuya.

---

## 6. Lo que no pude resolver leyendo el código

- **Aspecto renderizado real**: sin sesión ni runtime no puedo confirmar cómo se ven; esta auditoría compara **valores de estilo**, que es donde está la respuesta al "por qué se ve distinto". Cualquier diferencia percibida en capturas debe cruzarse con estas tablas.
- **Colores dependientes de estado en `alerts.constants.ts`** (16 literales por tipo/severidad): son una paleta intencional por categoría de incidencia; no los evalué como "literal en vez de token" porque no hay token semántico por-tipo-de-incidencia.
- No inventarié exhaustivamente **cada** literal de spacing/gap de todas las pantallas (son cientos); reporté los patrones y los conteos por familia, que es lo que decide la estandarización.

---

## 7. Resumen ejecutivo

La app **sí tiene un lenguaje visual coherente** y las piezas más visibles ya están unificadas: **badges de estado vía `StatusPill`** (4 superficies), `AppCard`, `getToneColors`. Lo que diverge:

1. **Auth vive fuera del sistema** (0 tokens, rojo propio `#EA1F23`) — decisión de producto.
2. **Radios de card/chip/shell usan una escala de facto (12/14/18) que no está en tokens** — 86 usos fuera de escala vs 28 que ya coinciden con token.
3. **Título de página y de sección**: mismo rol, 4–6 tamaños distintos.
4. **Breakpoints sin unificar** (phone 600/640/720; compact 1040/1080/1120) — afecta tablets.
5. **Handles de sheet visualmente distintos** (pill vs barra).
6. **`PrimaryButton` infrautilizado** (2 de ~7 pantallas con botón primario).

Lo **seguro hoy** (§5.1): 28 swaps de radio literal→token idénticos, cero cambio visual. Todo lo demás (§5.2) mueve algún valor visible y es **decisión tuya**, pantalla por pantalla, como acordamos con los estados vacíos. No propongo ejecución todavía.
