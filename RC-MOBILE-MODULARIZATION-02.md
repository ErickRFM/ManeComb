# RC-MOBILE-MODULARIZATION-02 — Modularización de `profile-screen` (Fase 1.2 móvil)

> **Estado:** Cerrado
>
> **Rama:** `main`
>
> **Commit base:** `c430c74`
>
> **Estado Git inicial:** el árbol contiene la Fase 1.1 (RC-MOBILE-MODULARIZATION-01) aún sin commit — `customer-auth-screen` + `src/screens/auth/` — verificada en verde; sin revert, rebase, merge ni cherry-pick en curso. Entrada ajena preexistente `D docs/~$porte-...docx`, no tocada.

## 1. Objetivo y resultado

Se modularizó `mobile/src/screens/profile-screen.tsx` con el mismo patrón RC-PORTAL-09 aplicado en la Fase 1.1: `ProfileScreen` continúa como único contenedor de store, sesión, estado y acciones; se trasladaron a `mobile/src/screens/profile/` la hoja de estilos, `InfoTile` y los dos helpers puros de presentación de documentos. Traslado estructural puro.

El contenedor pasó de **497 a 247 líneas físicas**, una reducción de **250 líneas (50.3 %)**. El diff del contenedor es exclusivamente: 254 eliminaciones + 4 inserciones (1 línea de import de react-native recortada y 3 imports nuevos del módulo). Todo el JSX de composición y las derivaciones quedaron intactos byte a byte.

## 2. Inventario verificado y discrepancias

| Elemento | Auditoría | Real | Veredicto |
|---|---|---|---|
| Estilos inline | ~22–237 | `createStyles` en 22–236 | ✓ |
| `InfoTile` | ~238 | 238–262 | ✓ |
| Helpers de documentos | ~300–359 | `getDocumentPresentation` 300–304, `getDriverPresentation` 305–309 | ✓ (el rango citado incluía además JSX) |
| Efectos y timers | cero | **cero `useEffect`, cero timers** | ✓ |
| Estados | 2 | `showLogoutConfirm` (280), `selectedDriverId` (281) | ✓ |
| Consumidor | `App.tsx` | solo `App.tsx:20` | ✓ |

**Discrepancias/matices reportados antes de ejecutar:**

1. **`createStyles` no es un `StyleSheet` estático** (a diferencia de auth): es una función parametrizada `(theme, isCompact, isPhone)` que además usa `Platform.OS` en `mainGrid`. Se trasladó como función exportada — mismo patrón exacto que el precedente de la casa `chat-screen.styles.ts` (incluido el `import type { useAppTheme }` para la firma).
2. **Existe un tercer helper no inventariado y NO extraíble**: `getDriverDocuments` (295–299) es un closure sobre `documents` del selector del store. Por la regla de la fase ("si alguno lee del store, se queda"), **permanece en el contenedor sin cambios**.
3. `getDocumentPresentation` y `getDriverPresentation` sí son puros (solo dependen de sus parámetros) → extraídos.
4. **Contratos de test verificados**: ningún test lee `profile-screen.tsx` por nombre (a diferencia del ancla de `fasterArtwork` en la Fase 1.1). Los dos escaneos globales de todo `src/` sí aplican a los archivos nuevos y se cumplen: `navigation-hardening.test.ts` (prohíbe `navigation.<método>()` directo y `CommonActions`/`StackActions` fuera del router) e `input-infrastructure.test.ts` (prohíbe `KeyboardAvoidingView`) — el código movido no contiene ninguno de esos patrones. Nada anclado; extracción sin restricciones.

## 3. Decisiones declaradas

- Convención kebab-case (fijada en Fase 1.1).
- **Única adaptación no-literal, mecánica y declarada:** la anotación del parámetro de `getDriverPresentation` pasó de `typeof documents` (referencia a la variable local del selector, imposible fuera del componente) a `DocumentItem[]`, que es exactamente el tipo al que resuelve (`AppState['documents']: DocumentItem[]`, `root-store.ts:215`; `DocumentItem` exportado en `types/app.ts:897`). Cero efecto en runtime; se eligió `DocumentItem[]` (módulo de tipos) en vez de `AppState['documents']` para que el archivo de utilidades ni siquiera referencie el módulo del store.
- Cambios mecánicos restantes: `export` en `createStyles`/`InfoTile`/helpers, reindentación de los helpers a ámbito de módulo, e imports propios de cada archivo nuevo. En `info-tile.tsx`, `createStyles` y `useAppTheme` se importan **solo como tipos** (posición de tipo en las props); el único import de valor añadido es el que el JSX ya usaba (`MaterialCommunityIcons`).
- `InfoTile` ya recibía `styles` y `theme` por props (puro, sin hooks): extracción directa. Ningún archivo extraído importa store, API, sesión ni router en runtime.
- **Anotación para la fase de compartidos (no ejecutada aquí):** `InfoTile` (icono + etiqueta + valor) es candidato a unificarse con `DetailItem` de `users-screen.tsx:161` y las filas de métricas de `BottomTrackingPanel` — se deja anotado, sin unificar, como pide la fase.

## 4. Arquitectura final

```
mobile/src/screens/
├── profile-screen.tsx                 (contenedor, 247 líneas — store, 2 estados, getDriverDocuments, JSX íntegro)
└── profile/
    ├── profile-screen.styles.ts       (219 líneas — createStyles parametrizada, claves y valores exactos)
    ├── profile.utils.ts               (13 líneas — getDocumentPresentation, getDriverPresentation)
    └── components/
        └── info-tile.tsx              (30 líneas)
```

El contenedor conserva: `useAppTheme`, selector `useShallow` de 7 claves (`documents`, `mapData`, `observability`, `presenceByUser`, `signOut`, `user`, `users`), los 2 estados en orden, el memo de estilos, las derivaciones (`roleLabel`, `scheduleState`, `scheduleLabel`, `presence`, `drivers`, `vehicles`), `getDriverDocuments` (closure de store) y todo el JSX (documental por conductor, apariencia, observabilidad, sesión, `ConfirmModal` de logout).

## 5. Componentes y utilidades extraídos

| Pieza | Archivo | Props / firma | Estado interno | Hooks | Imports de store/API/sesión/router |
|---|---|---|---|---|---|
| `createStyles` | `profile/profile-screen.styles.ts` | `(theme, isCompact, isPhone)` — sin cambio | — | — | Ninguno (`useAppTheme` solo como tipo) |
| `InfoTile` | `profile/components/info-tile.tsx` | `icon`, `label`, `value`, `styles`, `theme` — sin cambio | — | — | Ninguno (tipos solamente) |
| `getDocumentPresentation` | `profile/profile.utils.ts` | `(reviewStatus?: string)` — sin cambio | — | — | Ninguno |
| `getDriverPresentation` | `profile/profile.utils.ts` | `(driverDocuments: DocumentItem[])` — adaptación de tipo declarada | — | — | Ninguno (solo `type DocumentItem`) |

## 6. Métricas

| Métrica | Valor |
|---|---|
| Contenedor antes → después | 497 → 247 líneas (−250, −50.3 %) |
| Archivos nuevos | 3 (styles 219 + utils 13 + info-tile 30 = 262 líneas) |
| Archivos modificados | 1 (`profile-screen.tsx`) |
| Diff del contenedor | 254 eliminaciones, 4 inserciones (todas imports) |
| Total del módulo antes → después | 497 → 509 (+12 por cabeceras de import) |
| Dependencias nuevas | 0 |

## 7. Validaciones

| Verificación | Resultado |
|---|---|
| Línea base pre-cambio: `npm test` | 25/25 suites, 126/126 tests PASS |
| `npm run typecheck` (`tsc --noEmit`) | PASS (exit 0) |
| ESLint (contenedor + `profile/`) | PASS (exit 0) |
| `npm test` post-cambio | **25/25 suites, 126/126 tests — idéntico a la línea base**, incluidos los escaneos globales de hardening que ahora recorren también los archivos nuevos |
| Bundle release Metro (`--dev false`, salida a directorio temporal) | PASS (exit 0) — el grafo de módulos release resuelve completo |
| Ejercicio runtime del flujo real | **No ejercitado**: la pantalla requiere sesión iniciada y datos del backend (documentos, observabilidad); no se afirma funcionamiento end-to-end. Evidencia de carga sin errores de import/evaluación: bundle release completo + suite idéntica |

## 8. Matriz de compatibilidad

| Contrato | Estado |
|---|---|
| Export público `ProfileScreen` (named export, misma ruta de archivo) | Sin cambio |
| Consumidor `mobile/App.tsx:20` y ruta `/perfil` | Sin cambio (App.tsx no tocado) |
| Selector del store (`useShallow`, 7 claves) y `signOut` → `router.replace('/login')` | Sin cambio |
| 2 estados, mismo orden; memo de estilos; early-return `if (!user)` | Sin cambio |
| `getDriverDocuments` (closure sobre store) | Permanece en el contenedor, sin cambio |
| Lógica de presentación documental (rechazado/pendiente/subido) | Trasladada byte a byte; solo cambia la anotación de tipo declarada |
| Estilos: claves, valores y parametrización (`theme`, `isCompact`, `isPhone`, `Platform.OS`) | Sin cambio |
| Textos visibles y accesibilidad (labels de conductor, estados de documento) | Sin cambio |
| `package.json` / dependencias | Sin cambio |

## 9. Rollback

Cambios de esta fase sin commit; reversión en una línea desde la raíz del repo (no afecta a la Fase 1.1):

```
git checkout -- mobile/src/screens/profile-screen.tsx && rm -rf mobile/src/screens/profile && rm RC-MOBILE-MODULARIZATION-02.md
```
