# RC-MOBILE-MODULARIZATION-04 — Modularización de `AlertsScreen` (Fase 1.4 móvil — cierre de Fase 1)

> **Estado:** Cerrado
>
> **Rama:** `main`
>
> **Commit base:** `c430c74`
>
> **Estado Git inicial:** el árbol contiene las Fases 1.1–1.3 (RC-MOBILE-MODULARIZATION-01/02/03) sin commit, verificadas en verde; sin revert, rebase, merge ni cherry-pick en curso. Entrada ajena preexistente `D docs/~$porte-...docx`, no tocada.

## 1. Objetivo y resultado

Se terminó la extracción de `mobile/src/screens/alerts/AlertsScreen.tsx`, la pantalla que ya tenía el patrón iniciado (`components/` con 7 piezas, `constants/`, `utils/`). `AlertsScreen` continúa como único contenedor de store, estado, RBAC, hápticos y acciones (`handleCreate`, `handleQuickSos`, `updateIncidentStatus`, `router.push`); se extrajeron la hoja de estilos (~434 líneas) y la tarjeta de incidente del timeline (`AlertCard`).

El contenedor pasó de **825 a 296 líneas físicas**, una reducción de **529 líneas (64.1 %)**. Diff del contenedor: 548 eliminaciones + 19 inserciones — los imports ajustados, `type TextInput`, y **la única sustitución no-eliminación de la fase**: el cuerpo del map de incidentes reemplazado por la invocación `<AlertCard …/>` con props mecánicas (mandatada por la fase; ver §3).

## 2. Inventario verificado y discrepancias

| Elemento | Auditoría | Real | Veredicto |
|---|---|---|---|
| `createStyles` inline | ~50–488 | 50–483 | ✓ |
| Helper de estilos | no inventariado | **`orderedPanelMinHeight` (485–487), usado por `createStyles` en la línea 306** — viajó con la hoja de estilos, no exportado, mismo orden relativo | discrepancia declarada |
| Tarjetas de incidente | ~597–825 | JSX total 597–825; el map por incidente es 692–794 | ✓ |
| Efectos y timers | cero | cero `useEffect`, cero timers | ✓ |
| Estados | 7 + 1 ref | `title`, `description`, `type`, `severity`, `activeFilter`, `search`, `showAllEvents` + `descriptionInputRef` | ✓ |
| `handleCreate`/`handleQuickSos` con hápticos | ✓ | 567–595, intactos en el contenedor | ✓ |
| Anclas de test por nombre | verificar | **ninguna** (consumo vía re-export `incidents-screen.tsx` → `App.tsx:13`); escaneos globales aplican y pasan | ✓ |
| Import sin uso preexistente | anotado en auditoría | `SEVERITIES` solo aparecía en el import también en HEAD (verificado con `git show HEAD:…`); solo lo consume `AlertForm` con import propio | ver §3 |

**Detalle crítico del inventario de la tarjeta:** el JSX de la tarjeta contenía `router.push` (abrir mapa), `updateIncidentStatus` (resolver) y RBAC (`canResolve` desde `user.role`). Los tres permanecen en el contenedor y fluyen a la tarjeta como props/callbacks (`onOpenMap`, `onResolve`, `canResolve`) — mismo contrato que ya usan `AlertsHeader`/`AlertForm` (`onPanic`, `onCreate`).

## 3. Decisiones declaradas

- **Convención local PascalCase para `AlertCard.tsx`** y nombre `alerts.styles.ts` para la hoja (siguiendo el par existente `alerts.constants.ts`/`alerts.utils.ts`). Es coherencia interna de la carpeta `alerts/`; no contradice la convención global kebab-case fijada en la Fase 1.1 para carpetas nuevas.
- **La hoja de estilos se generó por copia mecánica** (`sed` del rango 50–487 del original + `export`): byte a byte por construcción, incluida la firma original `theme: any`.
- **`AlertCard` sigue el contrato local existente** (`styles: any; theme: any` por props, sin hooks): recibe `canResolve`, `incident`, `onOpenMap`, `onResolve`, `showConnector`, `styles`, `theme`. Internamente deriva `typeStyle`/`severityStyle`/`statusStyle` con las constants/utils **puras del propio módulo** (trasladadas verbatim desde el map) y reutiliza `AlertBadge` existente sin modificarlo. Renombre mecánico único dentro del JSX movido: `screenStyles.` → `styles.` (exigido por el contrato de props local).
- **Sustitución mandatada en el contenedor:** el cuerpo del map (derivaciones visuales + ~94 líneas de JSX) se reemplazó por `<AlertCard …/>` (16 líneas). `canResolve` (RBAC) se calcula en el contenedor dentro del map; `router.push` y `updateIncidentStatus` quedaron en el contenedor dentro de los callbacks. `showConnector={index < visibleIncidents.length - 1}` conserva la expresión original del conector.
- **Única eliminación fuera del traslado, declarada:** el import sin uso preexistente `SEVERITIES` (verificado contra HEAD que ya estaba muerto). ESLint lo marca como error (`no-unused-vars`) y bloqueaba la validación de la fase; las fases anteriores no lo detectaron porque nunca se había lintado esta carpeta en ellas.
- **No se creó otro estado vacío**: el contenedor sigue usando `AlertState` existente en sus dos ramas (cargando / sin resultados), sin cambios.
- Reutilización observada y anotada (sin refactor): la tarjeta reutiliza `AlertBadge`; no se detectó otra reimplementación del contenedor duplicando piezas ya extraídas.

## 4. Arquitectura final

```
mobile/src/screens/alerts/
├── AlertsScreen.tsx          (contenedor, 296 líneas — store, 7 estados, RBAC, hápticos, acciones, navegación)
├── alerts.styles.ts          (441 líneas — createStyles + orderedPanelMinHeight)
├── components/
│   ├── AlertBadge.tsx        (existente, sin cambios)
│   ├── AlertCard.tsx         (nuevo, 126 líneas — tarjeta + timeline dot/conector)
│   ├── AlertFilters.tsx      (existente, sin cambios)
│   ├── AlertForm.tsx         (existente, sin cambios)
│   ├── AlertSearch.tsx       (existente, sin cambios)
│   ├── AlertState.tsx        (existente, sin cambios)
│   ├── AlertSummary.tsx      (existente, sin cambios)
│   └── AlertsHeader.tsx      (existente, sin cambios)
├── constants/alerts.constants.ts (sin cambios)
└── utils/alerts.utils.ts     (sin cambios)
```

## 5. Componentes extraídos

| Pieza | Archivo | Props | Estado interno | Hooks | Imports de store/API/sesión/router |
|---|---|---|---|---|---|
| `AlertCard` | `alerts/components/AlertCard.tsx` | `canResolve`, `incident`, `onOpenMap`, `onResolve`, `showConnector`, `styles`, `theme` | — | — | Ninguno (solo `type Incident`, utils/constants puras del módulo, `AlertBadge`, `formatRelativeTime`) |
| `createStyles` + `orderedPanelMinHeight` | `alerts/alerts.styles.ts` | `(theme: any, isCompact, isPhone)` — sin cambio | — | — | Ninguno |

## 6. Métricas

| Métrica | Valor |
|---|---|
| Contenedor antes → después | 825 → 296 líneas (−529, −64.1 %) |
| Archivos nuevos | 2 (alerts.styles 441 + AlertCard 126 = 567 líneas) |
| Archivos modificados | 1 (`AlertsScreen.tsx`); las 7 piezas existentes de `components/`, constants y utils quedaron intactas |
| Diff del contenedor | 548 eliminaciones, 19 inserciones (imports + `type TextInput` + invocación `<AlertCard/>` de 16 líneas) |
| Total del módulo antes → después | 825 → 863 (+38 por cabeceras y contrato de props de la tarjeta) |
| Dependencias nuevas | 0 |

## 7. Validaciones

| Verificación | Resultado |
|---|---|
| Línea base pre-cambio: `npm test` | 25/25 suites, 126/126 tests PASS |
| `npm run typecheck` (`tsc --noEmit`) | PASS (exit 0) |
| ESLint (`src/screens/alerts` completo) | PASS (exit 0) tras retirar el import muerto preexistente `SEVERITIES` (primer intento falló exactamente por él; declarado en §3) |
| `npm test` post-cambio | **25/25 suites, 126/126 tests — idéntico a la línea base**, incluidos navigation-hardening (recorre `AlertCard.tsx`/`alerts.styles.ts`; no contienen `navigation.*` ni `CommonActions`/`StackActions`) e input-infrastructure (sin `KeyboardAvoidingView`) |
| Bundle release Metro (`--dev false`, a directorio temporal) | PASS (exit 0) |
| Ejercicio runtime del flujo real | **No ejercitado**: crear alerta, SOS con hápticos, resolver y abrir mapa requieren sesión y backend; ningún test importa esta pantalla. Evidencia: bundle release completo + suite idéntica |

## 8. Matriz de compatibilidad

| Contrato | Estado |
|---|---|
| Export público `AlertsScreen` + re-export `IncidentsScreen` (`incidents-screen.tsx`) y consumidor `App.tsx:13` | Sin cambio |
| Selector del store (10 claves) y acciones `createIncident`/`updateIncidentStatus`/`refreshAll` | Sin cambio |
| 7 estados + 1 ref, mismo orden; memos `summary`/`orderedIncidents`/`filteredIncidents`; param `?incidentId` | Sin cambio |
| `handleCreate`/`handleQuickSos` con hápticos (Medium/Heavy) y textos de SOS | Sin cambio, byte a byte |
| RBAC `canResolve` (admin/supervisor/owner ∧ incidente activo) | Sin cambio, en el contenedor |
| Navegación `router.push('/mapa', focusLatitude/focusLongitude)` | Sin cambio, en el contenedor (callback) |
| Tarjeta: textos, accesibilidad (`Abrir ubicacion de…`, `Marcar resuelta…`), badges, estados GPS (fresco/vencido/sin ubicación) | Trasladados byte a byte |
| Estilos: claves y valores exactos (copia mecánica), incluida la parametrización `isCompact`/`isPhone` | Sin cambio |
| Piezas existentes de `alerts/components`, constants y utils | Intactas (0 modificaciones) |
| `package.json` / dependencias | Sin cambio |

## 9. Rollback

Cambios de esta fase sin commit; reversión desde la raíz del repo (no afecta Fases 1.1–1.3):

```
git checkout -- mobile/src/screens/alerts/AlertsScreen.tsx && rm mobile/src/screens/alerts/alerts.styles.ts mobile/src/screens/alerts/components/AlertCard.tsx && rm RC-MOBILE-MODULARIZATION-04.md
```

---

## 10. Cierre de Fase 1 — estado global

| Fase | Pantalla | Contenedor antes → después | Reducción | RC |
|---|---|---|---|---|
| 1.1 | `customer-auth-screen` | 1,089 → 583 | −506 (−46.5 %) | RC-MOBILE-MODULARIZATION-01 |
| 1.2 | `profile-screen` | 497 → 247 | −250 (−50.3 %) | RC-MOBILE-MODULARIZATION-02 |
| 1.3 | `profile-edit-screen` | 919 → 659 | −260 (−28.3 %) | RC-MOBILE-MODULARIZATION-03 |
| 1.4 | `AlertsScreen` | 825 → 296 | −529 (−64.1 %) | RC-MOBILE-MODULARIZATION-04 |
| **Total** | 4 pantallas | **3,330 → 1,785** | **−1,545 (−46.4 %)** | — |

Validación transversal en cada fase: línea base y suite post-cambio idénticas (25/25 suites, 126/126 tests), typecheck y ESLint en verde, bundle release de Metro completo; en la Fase 1.1 además APK+AAB release reales (`BUILD SUCCESSFUL`). Cero dependencias nuevas, cero cambios en `package.json`, App.tsx intocado en las cuatro fases.

**Pendiente acumulado para verificación final en device (ninguna fase lo ejercitó end-to-end; ningún test importa estas pantallas):**
1. Login, recuperación en dos etapas y activación de conductor con selección de unidad (1.1).
2. Perfil: estado documental por conductor expandible y logout con confirmación (1.2).
3. Edición de perfil: guardado completo (`updateProfile` con companyProfile/paymentProfile/horario), scroll a sección vía `?section` (efecto con `setTimeout`), foto (1.3).
4. Alertas: crear, SOS con hápticos, resolver (RBAC), abrir ubicación en mapa, filtros/búsqueda/paginación (1.4).

**Pendiente acumulado para la fase de compartidos (anotado, sin unificar):**
1. `Field` (profile-edit) ↔ `AuthField` (auth) — forma etiqueta+input, divergencias reales de foco/ojo/refs.
2. `InfoTile` (profile) ↔ `DetailItem` (users-screen) ↔ filas de métricas de `BottomTrackingPanel`.
3. Array de métodos de pago inline en el JSX de profile-edit (candidato a constante cuando se toque ese JSX).
4. Del catálogo de la auditoría general: estado vacío compartido, encabezado de sección de tarjeta, tipo `Tone` importable desde `status-pill`.

**Hallazgos preexistentes gestionados:** import muerto `SEVERITIES` eliminado aquí (verificado contra HEAD); re-export huérfano `getIncidentContext` en `incidents-screen.tsx:2` sigue anotado de la auditoría, intocado.
