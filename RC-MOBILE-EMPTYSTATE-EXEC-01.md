# RC-MOBILE-EMPTYSTATE-EXEC-01 — `EmptyStateBox` + migración del par barato

> **Estado:** Cerrado. Cierra definitivamente el thread de estado vacío (RC-08/09/10/DESIGN-01 → opción 4, win barato).
>
> **Rama:** `main`. Baseline y post-cambio: **26/134**, typecheck verde. Validado contra **bundle release de producción** (no dev server).

## 1. Resultado

Creado `EmptyStateBox` (caja punteada compartida) y migrados **2 consumidores** (checklist, AlertState). **5 pantallas no tocadas** (users, radio, chat `emptyState`, chat `emptyStateCard`, BottomTrackingPanel), confirmado. Eliminados **6 símbolos muertos**, cada uno grep-confirmado sin consumidor antes de borrar. Cero cambio de copy/texto.

Las tres resoluciones aprobadas se aplicaron tal cual:
- **(a)** Subtítulo = **12 / lineHeight 18 / maxWidth 420** (valores reales de AlertState), NO 13/360 en papel.
- **(b)** `emptyBody` borrado, grep-confirmado muerto.
- **(c)** Limpieza asociada aplicada (stateBox/stateTitle/stateBody + prop `styles` de AlertState), cada símbolo grep-confirmado.
- **(d)** Componente en `src/components/empty-state-box.tsx`, `useAppTheme()`, props `{ icon?, leading?, title, subtitle? }`, slot `leading` para el spinner.

## 2. Componente creado — [src/components/empty-state-box.tsx](mobile/src/components/empty-state-box.tsx)

Self-contained (`useAppTheme()`), props `{ icon?, leading?, title, subtitle? }`. Valores canónicos:

| Propiedad | Valor |
|---|---|
| Caja | columna, `alignItems`/`justifyContent: center`, borde 1px **punteado** `theme.colors.line`, fondo transparente, radio `AppTheme.radius.sm`=**16**, minHeight **160**, gap **8**, padding **18** |
| Icono | desnudo, size **28**, `theme.colors.muted` (o slot `leading` si se pasa) |
| Título | `display` **16 / 900**, center, `theme.colors.text` |
| Subtítulo | `body` **12 / lineHeight 18**, muted, center, maxWidth **420** (resolución a) |

`leading ?? (icon ? <Icon/> : null)` — el slot `leading` gana sobre `icon`; así la rama cargando de AlertState pasa el spinner y la lógica de branching se queda en AlertState.

## 3. Consumidores migrados (2)

### 3.1 checklist — [checklist-screen.tsx:1163](mobile/src/screens/checklist-screen.tsx)
Antes: `<View emptyState><Icon 28/><Text emptyTitle>Sin registros</Text></View>`.
Después: `<EmptyStateBox icon="clipboard-check-outline" title="Sin registros" />`.
Diff visual (aprobado): radio 18→16, minHeight 170→160, padding 22→18, título 17→16. Icono 28 y texto sin cambio.

### 3.2 AlertState — [AlertState.tsx](mobile/src/screens/alerts/components/AlertState.tsx)
El branching cargando/vacío **se conserva**; solo la caja se comparte:
- Rama cargando → `<EmptyStateBox leading={<ActivityIndicator color={theme.colors.accent}/>} title="Cargando" />`.
- Rama vacío → `<EmptyStateBox icon={...} title={...} subtitle={...} />`.
Firma: se quitó la prop `styles` (ya no usa estilos locales); se conserva `theme` (accent del spinner). Textos sin cambio.
Diff visual (aprobado): radio 14→16, icono 27→28. minHeight/padding/gap/título/subtítulo sin cambio (subtítulo preservado a 12/18/420).
Call sites actualizados: [AlertsScreen.tsx:237](mobile/src/screens/alerts/AlertsScreen.tsx) y [:286](mobile/src/screens/alerts/AlertsScreen.tsx) — quitada `styles={screenStyles}`.

## 4. Símbolos muertos eliminados — cada uno con grep de evidencia

Grep tree-wide (mobile + ventas, `--include=*.ts/*.tsx`) **antes** de borrar. Un match = solo su propia definición ⇒ muerto.

| Símbolo | Archivo:línea (def) | Grep de evidencia (tree-wide) | Veredicto |
|---|---|---|---|
| `emptyBody` | [checklist-screen.styles.ts:220](mobile/src/screens/checklist/checklist-screen.styles.ts) | **1 match**: solo la def. Cero consumidores en todo el árbol | Muerto pre-existente → borrado |
| `emptyState` (checklist) | checklist-screen.styles.ts:203 | Consumidor único era checklist-screen.tsx:1163 (migrado). Otros matches (`emptyState` en radio:690/users:276/chat:1389 y `emptyStateCard/Copy/Title/Body` en chat) son **llaves de otros archivos**, no de checklist | Muerto tras migración → borrado |
| `emptyTitle` (checklist) | checklist-screen.styles.ts:214 | Consumidor único era checklist-screen.tsx:1165 (migrado). Otros matches son de chat:1397/radio:707/ventas — llaves ajenas | Muerto tras migración → borrado |
| `stateBox` | [alerts.styles.ts:411](mobile/src/screens/alerts/alerts.styles.ts) | **1 match**: solo la def (AlertState ya no lo referencia tras migrar) | Muerto tras migración → borrado |
| `stateTitle` | alerts.styles.ts:422 | **1 match**: solo la def | Muerto tras migración → borrado |
| `stateBody` | alerts.styles.ts:429 | **1 match**: solo la def | Muerto tras migración → borrado |

Además, verificado: [checklist-screen.test.ts](mobile/src/screens/checklist-screen.test.ts) **no referencia** `emptyState/emptyTitle/emptyBody` (importa `createStyles` pero no toca esas llaves) → borrarlas no rompe el test. Ningún consumidor por string dinámico, re-export ni acceso indirecto.

## 5. 5 pantallas NO tocadas — confirmado intactas

| Pantalla | Estado vacío propio (valores intactos, verificados) |
|---|---|
| users | `emptyState` center, bg surfaceAlt, radio md, gap 10, padding md — sin cambio |
| radio | `emptyState` gap 12, padV 44 + `emptyIconShell` 64×64 — sin cambio |
| chat `emptyState` | título 20 — sin cambio |
| chat `emptyStateCard` | `flexDirection: row`, título 14/800 — sin cambio |
| BottomTrackingPanel | `emptyTrackState` minHeight 36, row — sin cambio |

Ninguno de estos 5 archivos aparece entre los que este cambio tocó. Los 6 archivos de este cambio: `empty-state-box.tsx` (nuevo), `checklist-screen.tsx`, `checklist-screen.styles.ts`, `AlertState.tsx`, `AlertsScreen.tsx`, `alerts.styles.ts`.

## 6. Validación

| Verificación | Resultado |
|---|---|
| Baseline `npm test` (inicio) | 26/134 PASS |
| `npm run typecheck` (`tsc --noEmit`) | PASS (exit 0) |
| ESLint (6 archivos) | PASS (exit 0) |
| `npm test` post-cambio | **26/26 suites, 134/134 — idéntico a la base** |
| **Bundle release de producción** (`--dev false`) | PASS (exit 0) |
| Diff en los 5 no tocados | vacío (no figuran entre los archivos cambiados) |

Neto: **−62 líneas** (76 borradas − 14 añadidas) en los 5 archivos tracked, + el componente nuevo. Menos código, dos consumidores compartiendo una caja, cinco pantallas intactas.

## 7. Rollback

```
cd mobile && git checkout -- src/screens/checklist-screen.tsx src/screens/checklist/checklist-screen.styles.ts src/screens/alerts/components/AlertState.tsx src/screens/alerts/AlertsScreen.tsx src/screens/alerts/alerts.styles.ts && rm src/components/empty-state-box.tsx && cd .. && rm RC-MOBILE-EMPTYSTATE-EXEC-01.md
```

## 8. Cierre

El thread de estado vacío queda **cerrado definitivamente**. No se reabre salvo petición explícita por rediseño real. users/radio/chat mantienen su tratamiento propio por decisión (DESIGN-01); solo el par de cajas punteadas (checklist + AlertState) convergió, que era la única victoria sin regresión.
