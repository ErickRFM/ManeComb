# RC-MOBILE-MODULARIZATION-10 — Inventario de los dos compartidos restantes

> **Estado:** Cerrado — **resultado: ninguno de los dos candidatos procede.** Inventario de solo lectura; **no se modificó ningún archivo.**
>
> **Rama:** `main`
>
> Cierra el catálogo de compartidos anotado en la auditoría original (junto con RC-08/RC-09).

## 1. Resumen

| Candidato | Clasificación | Motivo en una línea |
|---|---|---|
| `Field` ↔ `AuthField` | **No procede** | Estructura, estado, origen de estilos y config de input distintos; unificar forzaría a `auth` (light-only, fuera del sistema) a consumir un componente del sistema de tokens |
| `InfoTile` ↔ `DetailItem` ↔ métricas `BottomTrackingPanel` | **No procede** | Divergencia a tres bandas: icono (shell / ninguno / desnudo), radio (18/20/12), tipografía de label/value y modelo de ancho, todos distintos |

Umbral aplicado (igual que fases anteriores): unificar no debe cambiar **ningún** valor visual ni comportamiento. Ninguno lo cumple, ni siquiera parcialmente.

## 2. Candidato 1 — `Field` ([profile-edit](mobile/src/screens/profile-edit/components/field.tsx)) ↔ `AuthField` ([auth](mobile/src/screens/auth/components/auth-field.tsx))

### 2.1 Comparativa

| Dimensión | `Field` | `AuthField` |
|---|---|---|
| **Estructura** | plana: `<View><Text label/><TextInput/></View>` | `<View><Text label/><View inputShell [borde de foco]><TextInput/>[toggle ojo]</View></View>` |
| **Wrapper de input** | ninguno (input directo) | `inputShell` (View contenedora con borde) |
| **Estado interno** | ninguno | `focused`, `passwordVisible` (2 `useState`) |
| **Comportamiento** | — | borde cambia a `accent` al enfocar; ojo de mostrar/ocultar contraseña |
| **Props** | 7 (label, value, onChangeText, placeholder, keyboardType?, autoCapitalize?, secureTextEntry?) | 12 (+ inputRef, onBlur, onSubmitEditing, returnKeyType, textContentType, autoComplete) |
| **Origen de estilos** | `createStyles(theme)` — **sistema de tokens** | `styles` estático de auth — **light-only, paleta propia** (`#333333` hardcodeado en el ojo) |
| **Config de input** | fuerza `submitBehavior: 'blurAndSubmit'`, `returnKeyType: 'done'`; `autoComplete` derivado de `secureTextEntry` | `returnKeyType`/`autoComplete`/`textContentType` por prop; sin `submitBehavior` |
| **Específico web** | ninguno | `webInputStyle` (quita outline en web) |
| **Hooks** | `useAppTheme`, `useMemo(createStyles)` | `useAppTheme`, 2× `useState` |

### 2.2 Clasificación: **No procede**

Cuatro bloqueos independientes, cada uno suficiente:

1. **Estructura distinta**: `AuthField` envuelve el input en un `inputShell` con borde de foco; `Field` no. Unificar cambiaría el DOM/visual de uno de los dos.
2. **Comportamiento distinto**: `AuthField` tiene foco-con-borde y ojo de contraseña; `Field` no tiene ninguno. No es un superset limpio (Field no aporta refs/foco/toggle; AuthField no aporta submitBehavior).
3. **Origen de estilos incompatible**: `Field` consume el sistema de tokens (`createStyles(theme)`); `AuthField` usa la paleta estática de auth (light-only, `#333333`). Un componente único tendría que elegir uno, cambiando el aspecto del otro.
4. **`auth` está fuera del sistema por decisión** (declarado en RC-MOBILE-UI-01/04): unificar obligaría a `auth` a consumir un componente del sistema de tokens, contradiciendo ese estado (implicaría dark mode / migración de paleta — trabajo aparte, no dedup). El propio encargo lo señala.

No hay subconjunto viable: lo único común es el esqueleto "label + input", que no justifica un compartido dado que todo lo demás (estructura, estilos, comportamiento) diverge.

## 3. Candidato 2 — `InfoTile` ([profile](mobile/src/screens/profile/components/info-tile.tsx)) ↔ `DetailItem` ([users](mobile/src/screens/users-screen.tsx)) ↔ métricas `BottomTrackingPanel` ([map](mobile/src/screens/map/components/BottomTrackingPanel.tsx))

Valores resueltos (`AppTheme.radius`: md=20, sm2=18, xs2=12, xs3=14; `spacing.sm`=10).

| Dimensión | `InfoTile` | `DetailItem` | métrica `metricCard` |
|---|---|---|---|
| **Icono** | **shell 42×42** (bg accentSoft, radio xs3=14), icono size 20 accent | **ninguno** | **desnudo** (sin shell), size 16 accent |
| **Estructura** | icon-shell + (label / value) | label / value | icono + label + value |
| **Fondo contenedor** | surfaceAlt | **card** | surfaceAlt |
| **Borde** | `line` (sí) | **ninguno** | ninguno |
| **Radio** | **sm2 = 18** | **md = 20** | **xs2 = 12** |
| **Ancho** | flex 1, minWidth 220 | flex 1, minWidth **150** | **width 48%** (grid fijo) |
| **minHeight** | — | — | **66** |
| **gap** | **8** | **6** | **2** |
| **padding** | **13** | sm = **10** | **9** |
| **Label** | 11 / **900** / uppercase / letterSpacing 0.7 | 12 / **800** | 10 / **700** |
| **Value** | 14 / 800 / flexShrink | 13–14 / 800 | 13 / **900** |
| **Props** | icon, label, value, styles, theme | label, value | (inline en el `.map`) |

### 3.1 Clasificación: **No procede**

Divergencia a tres bandas en casi todas las dimensiones, ninguna reconciliable sin cambio visual:

- **Icono**: shell (InfoTile) / ninguno (DetailItem) / desnudo (metricCard) — tres tratamientos estructuralmente distintos. Un compartido no puede tener las tres formas sin props que reintroduzcan toda la variación.
- **Radio**: 18 / 20 / 12 — tres valores.
- **Fondo/borde**: surfaceAlt+borde / card+sin-borde / surfaceAlt+sin-borde.
- **Tipografía de label**: 11-uppercase-900 / 12-800 / 10-700 — tres tamaños, tres pesos, uppercase solo en uno.
- **gap** 8/6/2, **padding** 13/10/9, **modelo de ancho** flex+minWidth220 / flex+minWidth150 / grid-48%-fijo.

Ni siquiera hay subconjunto de dos: el par que más comparte (InfoTile ↔ metricCard, ambos con icono y fondo surfaceAlt) difiere en icono (shell vs desnudo), radio (18 vs 12), gap (8 vs 2), label (11-uppercase-900 vs 10-700) y ancho (flex vs grid-48%). Son tres "celdas de valor etiquetado" hechas a medida para su contexto (ficha de perfil con icono, celda de directorio sin icono, tarjeta de métrica en grid del mapa).

## 4. Verificación

Inventario de solo lectura. **Cero archivos modificados.** No aplican typecheck/eslint/suite/bundle (sin cambios); el árbol queda como en RC-MOBILE-UI-05 (suite 26/134). Único artefacto nuevo: este RC.

## 5. Cierre del catálogo de compartidos

Con RC-08 (estado vacío), RC-09 (reintento post-estandarización) y este RC-10 (Field/AuthField e InfoTile/DetailItem/métricas), **el catálogo de compartidos de la auditoría original queda cerrado: ninguno procedió.** El motivo transversal: lo que la auditoría llamó "duplicados de baja divergencia" resultó, al medir value-by-value, divergencia estructural y de escala real (icono/caja/borde/radio/tipografía por contexto), no literales-vs-token — que sí se resolvieron en la estandarización UI-01..05 sin necesidad de componentes.

## 6. Propuesta (si en el futuro se decide unificar)

Ninguno procede como dedup sin cambio visual. Cualquier unificación futura sería **rediseño** y requeriría decisión de diseño previa:
- **Field/AuthField**: solo tras integrar `auth` al sistema de tokens (con dark mode) — proyecto aparte.
- **InfoTile/DetailItem/métricas**: elegir un aspecto canónico de "celda de valor" (icono sí/no, radio, tipografía) y aceptar que 2–3 pantallas cambien.

No se ejecuta nada; se entrega y espera.

## 7. Rollback

No aplica a código. Para descartar el informe:

```
rm RC-MOBILE-MODULARIZATION-10.md
```

---

**Nota de alcance:** con esto la modularización móvil queda cerrada. Lo pendiente (doble `useLocationSync`, `root-store`, CI rojo) son tickets de **lógica**, no de modularización, y merecen tratamiento propio.
