# RC-MOBILE-MODULARIZATION-01 — Modularización de `customer-auth-screen` (Fase 1.1 móvil)

> **Estado:** Cerrado
>
> **Rama:** `main`
>
> **Commit base:** `c430c74`
>
> **Estado Git inicial:** árbol limpio en `mobile/` (única entrada previa ajena: `D docs/~$porte-integral-...docx`, no relacionada y no tocada); sin revert, rebase, merge ni cherry-pick en curso.

## 1. Objetivo y resultado

Se modularizó `mobile/src/screens/customer-auth-screen.tsx` espejando el patrón RC-PORTAL-09 del portal ventas: `CustomerAuthScreen` continúa como único contenedor de store, sesión, estado, validación, navegación y acciones; se trasladaron a `mobile/src/screens/auth/` los tres componentes de presentación y la hoja de estilos. Traslado estructural puro: cero cambios de comportamiento, lógica, textos, estilos o contratos.

El contenedor pasó de **1,089 a 583 líneas físicas**, una reducción de **506 líneas (46.5 %)**. El diff del contenedor es exclusivamente: ajuste del bloque de imports + eliminación de los bloques movidos (512 líneas eliminadas, 6 insertadas, todas imports). Ninguna línea entre `type CustomerAuthScreenProps` y el cierre del componente cambió.

## 2. Inventario inicial verificado

Confirmado leyendo el archivo completo antes de mover nada:

| Elemento | Verificación |
|---|---|
| Tamaño | 1,089 líneas ✓ |
| `SegmentButton` | líneas 587–607 ✓ (inventario decía ~587) |
| `UnitSelector` | líneas 609–690 ✓ (~609) |
| `AuthField` | líneas 700–784 ✓ (~700) |
| `StyleSheet` estático | líneas 786–1089 ✓ (sin función de tema; colores hardcodeados) |
| `validateActivationKey` | línea 138 ✓ |
| `handleSubmit` | línea 205 ✓ |
| Efectos y timers | **cero `useEffect`, cero `setInterval`/`setTimeout` en todo el archivo** ✓ |
| Export público | `CustomerAuthScreen({ mode })`, consumido solo por `mobile/App.tsx:10` ✓ |

**Discrepancias con el inventario previo (reportadas antes de ejecutar):**

1. El contenedor tiene **20** `useState` (líneas 83–103), no 21. Los otros 3 `useState` del archivo pertenecen a los subcomponentes de presentación: `isOpen` (`UnitSelector`, 620) y `focused`/`passwordVisible` (`AuthField`, 730–731). Total del archivo: 23. Acción: los 20 del contenedor se conservan en su orden exacto; los 3 de presentación viajan intactos con sus componentes.
2. Existe un helper puro no inventariado: `formatActivationUnit` (692–698), usado solo por `UnitSelector`; se trasladó junto con él.
3. Hallazgo de contrato que condicionó la extracción: `mobile/src/navigation/input-infrastructure.test.ts:57-61` lee el **código fuente** de `customer-auth-screen.tsx` y exige que contenga literalmente `require('../../assets/images/faster.png')` y `source={fasterArtwork}`. En consecuencia, **la constante `fasterArtwork` NO se extrajo** (moverla habría obligado a editar ese test de contrato, fuera del alcance). Al no haber ninguna otra constante visual o de opciones, **no se creó archivo de constantes**.

## 3. Decisiones declaradas

- **Convención de nombres: kebab-case.** Es la predominante en `mobile/` (todas las pantallas de primer nivel, los módulos `chat/` y `radio/` — el espejo directo del patrón —, todo `src/components`, hooks, utils) y coincide con los archivos extraídos en ventas por RC-PORTAL-09 (`portal-incidents-list.tsx`, etc.). PascalCase solo existe en `map/components` y `alerts/`, minoritario.
- **Cambios imprescindibles (únicos no-traslados, todos mecánicos):** `export` en `styles` y en los tres componentes; los imports propios de cada archivo nuevo; en el contenedor, `TextInput` pasa a `type TextInput` (solo se usa como tipo en los 4 refs) y se retira `type Ref` (solo lo usaba `AuthField`); en la hoja de estilos, los imports `StyleSheet` y `DesignSystem, Typography` que el bloque ya consumía.
- `AuthField` conserva **sin alterar** su hook `useAppTheme` y `getTextInputProps` (mismo mecanismo de theming que usan los componentes de presentación compartidos existentes, p. ej. `user-avatar.tsx`). No importa store, API, sesión ni router directamente; sus props son datos y callbacks.
- No se unificó nada con componentes compartidos del proyecto: extracción local, como pide la fase.

## 4. Arquitectura final

```
mobile/src/screens/
├── customer-auth-screen.tsx            (contenedor, 583 líneas — dueño único de store/estado/acciones)
└── auth/
    ├── customer-auth-screen.styles.ts  (307 líneas — StyleSheet íntegro)
    └── components/
        ├── auth-field.tsx              (99 líneas)
        ├── segment-button.tsx          (24 líneas)
        └── unit-selector.tsx           (96 líneas — incluye formatActivationUnit)
```

El contenedor conserva: tipos `CustomerAuthScreenProps`/`AuthIdentity`, `fasterArtwork` (anclado por contrato de test), `normalizeIdentity` (dominio), selector `useShallow` de 7 claves del store, los 20 estados en el mismo orden, los 4 refs de inputs, el memo `sizing`, `goToMode`, `validateActivationKey`, `handleActivationKeyBlur`, `handleActivationKeyChange`, `handleSubmit`, `handleRecovery` y todo el JSX de composición.

## 5. Componentes extraídos

| Componente | Archivo | Props | Estado interno | Hooks | Imports de store/API/sesión/router |
|---|---|---|---|---|---|
| `SegmentButton` | `auth/components/segment-button.tsx` | `active`, `label`, `onPress` | — | — | Ninguno |
| `UnitSelector` | `auth/components/unit-selector.tsx` | `isLoading`, `onSelect`, `selectedUnitId`, `units` | `isOpen` (trasladado tal cual) | `useState` | Ninguno (solo iconos y tipo `DriverActivationUnit`) |
| `AuthField` | `auth/components/auth-field.tsx` | `autoComplete`, `autoCapitalize`, `inputRef`, `keyboardType`, `label`, `onBlur`, `onChangeText`, `onSubmitEditing`, `placeholder`, `returnKeyType`, `secureTextEntry`, `textContentType`, `value` | `focused`, `passwordVisible` (trasladados tal cual) | `useState`, `useAppTheme` (theming estándar preexistente) | Ninguno directo |
| `styles` | `auth/customer-auth-screen.styles.ts` | — | — | — | Ninguno |

Ningún componente recibió props nuevas ni cambió las existentes. La hoja de estilos conserva **todas** las claves con sus valores exactos, incluidas las dos sin consumidor detectadas (`flex`, `legalLine`), y el comentario original sobre la fuente Magneto en `slogan`.

## 6. Métricas

| Métrica | Valor |
|---|---|
| Contenedor antes → después | 1,089 → 583 líneas (−506, −46.5 %) |
| Archivos nuevos | 4 (styles 307 + auth-field 99 + unit-selector 96 + segment-button 24 = 526 líneas) |
| Archivos modificados | 1 (`customer-auth-screen.tsx`) |
| Diff del contenedor | 512 eliminaciones, 6 inserciones (todas en el bloque de imports) |
| Total del módulo antes → después | 1,089 → 1,109 (+20 líneas por cabeceras de import de los archivos nuevos) |
| Dependencias nuevas | 0 |

## 7. Validaciones

| Verificación | Resultado |
|---|---|
| Línea base pre-cambio: `npm test` | 25/25 suites, 126/126 tests PASS |
| `npm run typecheck` (`tsc --noEmit`) | PASS (exit 0, sin errores) |
| `npx eslint` sobre contenedor + `auth/` | PASS (exit 0) |
| `npm test` post-cambio | **25/25 suites, 126/126 tests PASS — idéntico a la línea base**, incluido `input-infrastructure.test.ts` que valida el contrato del asset sobre este archivo |
| Bundle de release Metro (`react-native bundle --platform android --dev false`, salida a directorio temporal) | PASS (exit 0; bundle de 3.8 MB + 23 assets). Prueba que el grafo de módulos release resuelve completo — la clase de fallo que históricamente rompió el build de release. Dos WARN preexistentes de `@noble/hashes` y `react-native-webrtc`, ajenos al cambio |
| `npm run build` (APK release, gradle) | PASS — `BUILD SUCCESSFUL in 54s` (721 tareas); `dist/app-release.apk` (95.6 MB) y `dist/app-release.aab` (61.2 MB) regenerados con el código modularizado. Nota de entorno: en la sesión sandbox hubo que retirar la variable `NoDefaultCurrentDirectoryInExePath=1` (inyectada por la sandbox, no existe en el entorno normal del proyecto) porque impide que cmd resuelva `gradlew.bat` desde `android/`; no es un problema del proyecto ni del cambio |
| Ejercicio runtime del flujo real | **No ejercitado**: login/activación requieren credenciales y backend; no se afirma funcionamiento end-to-end. La evidencia de carga sin errores de import/evaluación es el bundle release completo + la suite (que evalúa módulos hermanos por el mismo resolver) |

## 8. Matriz de compatibilidad

| Contrato | Estado |
|---|---|
| Export público `CustomerAuthScreen` (named export, misma ruta de archivo) | Sin cambio |
| Consumidor `mobile/App.tsx:10` y rutas `/login`, `/registro` | Sin cambio (App.tsx no tocado) |
| Flujo de autenticación (`signIn`, `activateDriverWithKey`, `forgotPassword`, `resetPassword`) y sus payloads | Sin cambio (bloques intactos byte a byte) |
| Validación de key de activación (`validateDriverActivationKeyRequest`, `getApiErrorMessage`, `API_URL`) | Sin cambio |
| 20 estados del contenedor, mismo orden; 4 refs; memo `sizing` | Sin cambio |
| 3 estados de presentación (`isOpen`, `focused`, `passwordVisible`) | Trasladados dentro de sus componentes, sin cambio |
| Estilos: claves, valores y comentarios (incl. `flex` y `legalLine` sin consumidor) | Sin cambio |
| Selector del store (`useShallow`, 7 claves) | Sin cambio |
| Contrato de test `input-infrastructure.test.ts` (require del asset en el contenedor) | Sin cambio (motivo por el que `fasterArtwork` no se extrajo) |
| Textos visibles y accesibilidad | Sin cambio |
| `package.json` / dependencias | Sin cambio |

## 9. Rollback

Cambios aún sin commit; reversión completa en una línea desde la raíz del repo:

```
git checkout -- mobile/src/screens/customer-auth-screen.tsx && rm -rf mobile/src/screens/auth && rm RC-MOBILE-MODULARIZATION-01.md
```
