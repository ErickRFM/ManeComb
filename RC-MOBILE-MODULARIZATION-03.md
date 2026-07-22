# RC-MOBILE-MODULARIZATION-03 — Modularización de `profile-edit-screen` (Fase 1.3 móvil)

> **Estado:** Cerrado
>
> **Rama:** `main`
>
> **Commit base:** `c430c74`
>
> **Estado Git inicial:** el árbol contiene las Fases 1.1 y 1.2 (RC-MOBILE-MODULARIZATION-01/02) sin commit, ambas verificadas en verde; sin revert, rebase, merge ni cherry-pick en curso. Entrada ajena preexistente `D docs/~$porte-...docx`, no tocada.

## 1. Objetivo y resultado

Se modularizó `mobile/src/screens/profile-edit-screen.tsx` con el patrón RC-PORTAL-09: `ProfileEditScreen` continúa como único contenedor de store, estado del formulario, **efectos y timer**, validación y acciones; se trasladaron a `mobile/src/screens/profile-edit/` el componente `Field`, la hoja de estilos y la constante de opciones `DAY_OPTIONS`. Traslado estructural puro.

El contenedor pasó de **919 a 659 líneas físicas**, una reducción de **260 líneas (28.3 %)**. El diff del contenedor es exclusivamente: 264 eliminaciones + 4 inserciones (1 línea de import de react-native recortada y 3 imports nuevos del módulo). **Los dos efectos y el `setTimeout` quedaron intactos en el contenedor, sin mover ni envolver.**

## 2. Inventario verificado y discrepancias

| Elemento | Auditoría | Real | Veredicto |
|---|---|---|---|
| `Field` | ~680 | `FieldProps` 670–678 + función 680–712 | ✓ (el bloque completo inicia en 670 con su tipo) |
| `createStyles` | ~714–919 | 714–919, parametrizada solo por `theme` | ✓ exacto |
| `DAY_OPTIONS` | citada | 49–57 | ✓ |
| Toggle de días | ~178–186 | `toggleScheduleDay` 176–188 | ✓ |
| Fuerza de contraseña | ✓ | import línea 15; memo 106–109; validación en `handleProfileSave` 246–251 | ✓ |
| Foto vía image-picker | ✓ | `handlePhotoUpload` 190–238 (con rama web `FileReader`) | ✓ |
| `updateProfile` | ✓ | `handleProfileSave` 240–308 | ✓ |
| Efectos | 2, uno con `setTimeout` | **Exacto**: (1) sincronización del form desde `user` (112–143); (2) scroll a sección por param `?section` con `setTimeout` de 300 ms y `clearTimeout` en cleanup (145–162) | ✓ |
| Estados/refs | — | 3 `useState` (`helperMessage`, `helperTone`, `profileForm`) + 2 refs (`scrollRef`, `sectionsRef`) | inventariado |
| `KeyboardAvoidingView` | prohibido por input-infrastructure | **el archivo no lo usa y no se introdujo** (el teclado va por `AppShell`/keyboard-controller) | ✓ |
| Anclas de test por nombre | verificar | **ninguna**: ningún test lee `profile-edit-screen.tsx`; único consumidor `App.tsx:19` | ✓ sin restricciones tipo `fasterArtwork` |

**Piezas de módulo no inventariadas, clasificadas y conservadas en el contenedor por ser dominio (no presentación):** `type ProfileForm` (24–47), `createProfileForm()` (59–84, fábrica del estado inicial), `isValidScheduleTime()` (86–88, validación usada por el guardado).

## 3. Decisiones declaradas

- **Efectos y timer: intactos en el contenedor** (regla explícita de la fase). Ningún test los ejercita directamente (ninguno importa la pantalla), así que la suite no puede degradarse por ellos; se declara en vez de afirmarse cobertura.
- **Bloques declarados como no separables limpiamente — permanecen en el contenedor:** el editor de horario (chips de días + toggle + pills de estado, entretejidos con `toggleScheduleDay`/`profileForm`), el selector de método de pago (su array de opciones `[{ id: 'spei'... }]` está **inline en el JSX** — extraerlo exigiría editar líneas de JSX y rompería la regla de diff solo-eliminaciones; queda anotado como candidato futuro), el helper visual de fuerza de contraseña (consume el memo del contenedor) y el flujo de foto (side effects de ImagePicker/FileReader). Lo puro sí extraído: `Field`, `createStyles`, `DAY_OPTIONS`.
- `Field` se trasladó **sin alterar**: conserva sus hooks internos `useAppTheme` + `createStyles` + `getTextInputProps` (mismo caso declarado que `AuthField` en la Fase 1.1; mecanismo estándar de theming, sin import directo de store/API/sesión/router). Sus 7 props no cambian.
- Cambios mecánicos únicos: `export` en `Field`/`createStyles`/`DAY_OPTIONS`; imports propios de cada archivo nuevo; en el contenedor `ScrollView` pasa a `type ScrollView` (solo se usa como tipo del ref) y se retiran `StyleSheet`, `TextInput`, `AppTheme/DesignSystem/Typography` y `getTextInputProps` (ya solo los usaban los bloques movidos).
- Estilos trasladados con claves y valores exactos; **no se detectaron claves sin consumidor** en esta hoja (todas tienen uso).
- **Anotación para la fase de compartidos (sin unificar):** `Field` ↔ `AuthField` (Fase 1.1) comparten forma etiqueta+input pero divergen en foco/ojo de contraseña/refs (`AuthField`) vs. `submitBehavior`/estilos de tema (`Field`).

## 4. Arquitectura final

```
mobile/src/screens/
├── profile-edit-screen.tsx                  (contenedor, 659 líneas — store, form, 2 efectos + setTimeout, validación, acciones, JSX íntegro)
└── profile-edit/
    ├── constants.ts                         (9 líneas — DAY_OPTIONS)
    ├── profile-edit-screen.styles.ts        (210 líneas — createStyles(theme))
    └── components/
        └── field.tsx                        (49 líneas — FieldProps + Field)
```

## 5. Componentes y constantes extraídos

| Pieza | Archivo | Props / firma | Estado interno | Hooks | Imports de store/API/sesión/router |
|---|---|---|---|---|---|
| `Field` | `profile-edit/components/field.tsx` | `label`, `value`, `onChangeText`, `placeholder`, `keyboardType?`, `autoCapitalize?`, `secureTextEntry?` — sin cambio | — | `useMemo`, `useAppTheme` (theming estándar preexistente) | Ninguno directo |
| `createStyles` | `profile-edit/profile-edit-screen.styles.ts` | `(theme)` — sin cambio | — | — | Ninguno (`useAppTheme` solo como tipo) |
| `DAY_OPTIONS` | `profile-edit/constants.ts` | 7 opciones Lun–Dom, ids 1–6 y 0 — sin cambio | — | — | Ninguno |

## 6. Métricas

| Métrica | Valor |
|---|---|
| Contenedor antes → después | 919 → 659 líneas (−260, −28.3 %) |
| Archivos nuevos | 3 (constants 9 + styles 210 + field 49 = 268 líneas) |
| Archivos modificados | 1 (`profile-edit-screen.tsx`) |
| Diff del contenedor | 264 eliminaciones, 4 inserciones (todas imports) |
| Total del módulo antes → después | 919 → 927 (+8 por cabeceras de import) |
| Dependencias nuevas | 0 |

## 7. Validaciones

| Verificación | Resultado |
|---|---|
| Línea base pre-cambio: `npm test` | 25/25 suites, 126/126 tests PASS |
| `npm run typecheck` (`tsc --noEmit`) | PASS (exit 0) |
| ESLint (contenedor + `profile-edit/`) | PASS (exit 0) |
| `npm test` post-cambio | **25/25 suites, 126/126 tests — idéntico a la línea base**, incluidos los escaneos globales (navigation-hardening, input-infrastructure) que recorren los archivos nuevos |
| Cobertura de los efectos/`setTimeout` | **Ningún test importa esta pantalla**, por lo que la suite no ejercita esos efectos ni antes ni después; quedaron intactos en el contenedor (verificado por diff: solo imports cambiaron) |
| Bundle release Metro (`--dev false`, a directorio temporal) | PASS (exit 0) — grafo de módulos release completo |
| Ejercicio runtime del flujo real | **No ejercitado**: la pantalla requiere sesión (form se llena desde `user`) y backend para `updateProfile`; no se afirma funcionamiento end-to-end |

## 8. Matriz de compatibilidad

| Contrato | Estado |
|---|---|
| Export público `ProfileEditScreen` (named export, misma ruta) | Sin cambio |
| Consumidor `mobile/App.tsx:19` y ruta `/perfil-editar` (param `?section`) | Sin cambio |
| Selector del store (`isSubmitting`, `updateProfile`, `user`) y payload completo de `updateProfile` (companyProfile, paymentProfile, operationalSchedule, password condicional) | Sin cambio, byte a byte |
| 3 estados y 2 refs, mismo orden; memos de `passwordStrength` y estilos | Sin cambio |
| Efecto de sincronización del form y efecto de scroll con `setTimeout(300)`/`clearTimeout` | Sin cambio, en el contenedor |
| Validaciones (obligatorios, contraseña fuerte, formato HH:mm) y textos de mensajes | Sin cambio |
| `Field`: 7 props y comportamiento del input | Sin cambio |
| Estilos: claves y valores exactos | Sin cambio |
| `KeyboardAvoidingView` | No se usa ni se introdujo (guard de input-infrastructure respetado) |
| `package.json` / dependencias | Sin cambio |

## 9. Rollback

Cambios de esta fase sin commit; reversión en una línea desde la raíz del repo (no afecta Fases 1.1 y 1.2):

```
git checkout -- mobile/src/screens/profile-edit-screen.tsx && rm -rf mobile/src/screens/profile-edit && rm RC-MOBILE-MODULARIZATION-03.md
```
