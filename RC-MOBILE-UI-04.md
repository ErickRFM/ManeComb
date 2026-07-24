# RC-MOBILE-UI-04 — Unificación de tipografía de títulos (sí cambia el aspecto)

> **Estado:** Cerrado
>
> **Rama:** `main`
>
> **Estado Git inicial:** el árbol contiene trabajo paralelo ya commiteado (`141aaac Documentos en el chofer`: feature de documentos del chofer + suites de test nuevas). Por eso la suite es **26/134** en esta fase (vs 25/126 en fases previas). **No toqué nada de ese trabajo** (`profile.utils.ts` y sus tests quedaron intactos).

## 1. Objetivo y resultado

El mismo rol tipográfico tenía 4–6 tamaños. Se unificó **título de página a 30/900** (token `DesignSystem.typography.hero`) y **título de sección a 20/900**. **Sí cambia el aspecto** — es el objetivo. Antes de cada cambio verifiqué el rol real del elemento; **excluí legal** (usa la paleta de auth, fuera del sistema) y confirmé que checklist/profile ya eran canónicos. Suite/typecheck/eslint verdes; bundle release OK.

**Nota de tokens:** ninguna de estas pantallas consumía el token `DesignSystem.typography.hero`/`.subtitle` (todas usan literales de `fontSize`). Mantuve el patrón de literales con el valor canónico (30/20); no forcé migración al token (la restricción "si usa el token, actualiza para que consuma el token" no aplica: ninguna lo usaba).

## 2. Título de página (hero) → 30 / peso 900

| Pantalla | Antes (phone/desktop, peso) | Después | Nota |
|---|---|---|---|
| **chat** | 26/32, sin peso, lineHeight 31/38 | 26/**30**, **900**, lineHeight 31/**36** | desktop 32→30; +peso 900; lineHeight proporcional |
| **profile** | 26/32, 900 | 26/**30**, 900 | solo desktop 32→30 |
| **checklist** | 26/36, 900, lineHeight 32/42 | 26/**30**, 900, lineHeight 32/**36** | desktop 36→30; lineHeight proporcional |
| **profile-edit** | **34 fijo**, sin peso, sin responsive | **26/30** responsive, **900** | +escala responsive (ver §5) |
| **gate** | 28 fijo, 800 | **30** fijo, **900** | sin infra responsive → queda fijo a 30/900 |

**No modificadas** (ya en desktop 30, fuera de la lista del encargo): alerts (24/30, 900), users (24/30, 900), radio (25/30, sin peso). **Discrepancias reportadas, no tocadas:** radio hero no tiene peso 900 explícito, y **legal** hero es 30/**800** — legal usa `getAuthPalette` (paleta propia light-only, como auth) → excluido del sistema, igual que auth.

## 3. Título de sección → 20 / peso 900

Verifiqué el **rol real** de cada uno leyendo su uso en JSX antes de tocar:

| Pantalla | Estilo | Antes | Después | Rol verificado (texto) |
|---|---|---|---|---|
| **chat** | `sectionTitle` | 16, sin peso | **20**, **900** | "Conversaciones" ✓ (mayor salto, +4) |
| **alerts** | `panelTitle` | 18, 900 | **20**, 900 | "Historial de alertas" ✓ |
| **users** | `sectionTitle` | 19/22 (responsive), 900 | **20**, 900 | "Personal operativo" ✓ (quita responsive) |
| **radio** | `sectionTitle` | 20, sin peso | 20, **900** | "Canales"/"Directo rápido"/"Audios" ✓ (solo +peso) |
| **profile-edit** | `sectionHeading` | 22, 800 | **20**, **900** | "Acceso base"/"Empresa y facturacion"/… ✓ |
| checklist | `sectionTitle` | 20/900 | — | ya canónico, sin cambio |
| profile | `cardTitle` | 20/900 | — | ya canónico, sin cambio |

**Excluido con motivo (discrepancia de rol):** **legal** `sectionTitle` (17, peso 800, **fuente body**). legal usa `getAuthPalette` (fuera del sistema, como auth) y su título de sección es fuente **body** —los demás son **display**— con tratamiento propio de pantalla de texto legal. Subirlo a 20/900 display chocaría con su layout documental. No se cambió; se reporta.

## 4. Verificación de rol (requisito del encargo)

Ningún elemento cambiado resultó ser un subtítulo disfrazado: los cinco section-titles modificados encabezan secciones/paneles reales (verificado por su texto en JSX). El único que era sospechoso por tamaño (chat 16) resultó ser un section-title genuino ("Conversaciones"). El único que NO encajaba (legal, fuente body + paleta auth) se excluyó.

## 5. profile-edit: escala responsive añadida

profile-edit era 34 fijo sin infraestructura responsive (`createStyles(theme)` de un solo parámetro). Para darle la escala 26/30 como las demás:

- `createStyles(theme)` → `createStyles(theme, isPhone = false)` (parámetro con default).
- Contenedor [profile-edit-screen.tsx](mobile/src/screens/profile-edit-screen.tsx): añadido `useWindowDimensions` + `const isPhone = width < 640` (mismo breakpoint que profile) y pasado a `createStyles`.
- El subcomponente `Field` sigue llamando `createStyles(theme)` → usa el default `isPhone = false` (desktop), no se rompe; `Field` no usa el título.

Es el único cambio estructural (una firma + un hook), contenido y sin efecto en `Field`.

## 6. Validaciones

| Verificación | Resultado |
|---|---|
| Línea base `npm test` (inicio de fase) | PASS (exit 0) |
| `npm run typecheck` (`tsc --noEmit`) | PASS (exit 0) |
| ESLint (9 archivos tocados) | PASS (exit 0) |
| `npm test` post-cambio | **26/26 suites, 134/134 tests PASS** — idéntico a la base de esta fase (el conteo 26/134 viene del trabajo paralelo `141aaac`, no de mis cambios; no toqué tests ni `package.json`) |
| Bundle release Metro (`--dev false`, a directorio temporal) | PASS (exit 0) |

**Evidencia de cambio controlado:** las tablas antes/después de §2 y §3 documentan cada valor de origen y su convergencia. Los tests no cubren valores de estilo; su invariancia confirma que no rompí lógica (incl. `checklist-screen.test.ts`, que instancia `createStyles`). Runtime real no ejercitado (sin sesión).

## 7. Archivos tocados (9)

hero: chat-screen.styles.ts, profile-screen.styles.ts, checklist-screen.styles.ts, mobile-account-gate-screen.tsx, profile-edit-screen.styles.ts (+ profile-edit-screen.tsx wiring). sección: chat-screen.styles.ts, alerts.styles.ts, users-screen.tsx, radio-screen.styles.ts, profile-edit-screen.styles.ts.

## 8. Rollback

```
cd mobile && git checkout -- src/screens/chat/chat-screen.styles.ts src/screens/profile/profile-screen.styles.ts src/screens/checklist/checklist-screen.styles.ts src/screens/mobile-account-gate-screen.tsx src/screens/alerts/alerts.styles.ts src/screens/users-screen.tsx src/screens/radio/radio-screen.styles.ts src/screens/profile-edit/profile-edit-screen.styles.ts src/screens/profile-edit-screen.tsx && cd .. && rm RC-MOBILE-UI-04.md
```

## 9. Pendiente de decisión (no ejecutado)

- **legal**: excluido (paleta auth, fuera del sistema). Si se quiere integrarlo, es trabajo aparte (implica dark mode / migración de paleta), como auth.
- **Discrepancias hero fuera de lista**: radio hero sin peso 900, legal hero 800 — no tocadas por no estar en la lista del encargo.
- **Breakpoints** (phone 600/640/720, compact 1040/1080/1120): siguen pendientes de la auditoría, sin ejecutar.
