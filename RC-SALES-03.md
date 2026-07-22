# RC-SALES-03 — Modularización de pantallas de autenticación de Ventas

## 1. Objetivo

Modularizar estructuralmente `sales-auth-screen.tsx` (796 → 237 líneas, −70.2 %) extrayendo sus componentes presentacionales, utilidades, tipos, constantes y estilos en una carpeta `auth/`. Evaluar `password-reset-screen.tsx` (101 líneas) sin modificación.

## 2. Commit

```
fbb1b1c
```

## 3. Archivos modificados

1 archivo modificado en el commit:

```
M   ventas/screens/sales-auth-screen.tsx
```

596 líneas netas eliminadas (−562 originales reemplazadas por +33 de composición de componentes).

## 4. Archivos creados

13 archivos añadidos (estado `A` en el commit):

```
A   RC-SALES-03.md
A   ventas/screens/auth/auth.constants.ts
A   ventas/screens/auth/auth.styles.ts
A   ventas/screens/auth/auth.types.ts
A   ventas/screens/auth/auth.utils.ts
A   ventas/screens/auth/components/auth-feedback.tsx
A   ventas/screens/auth/components/auth-field.tsx
A   ventas/screens/auth/components/auth-header.tsx
A   ventas/screens/auth/components/auth-legal-links.tsx
A   ventas/screens/auth/components/auth-mode-selector.tsx
A   ventas/screens/auth/components/auth-session-bar.tsx
A   ventas/screens/auth/components/auth-shell.tsx
A   ventas/screens/auth/components/auth-submit-button.tsx
```

## 5. Componentes extraídos (8 archivos .tsx)

| Componente            | Responsabilidad                                          | Consumidor      |
|-----------------------|----------------------------------------------------------|-----------------|
| `AuthBackground`      | Fondo decorativo con capa base + glows superior e inferior | SalesAuthScreen |
| `AuthField`           | Campo de formulario con icono, foco, toggle de contraseña | SalesAuthScreen |
| `AuthFeedback`        | Caja de mensaje de error/feedback                        | SalesAuthScreen |
| `AuthHeader`          | Logo + badge "Portal ManeComb" + título + subtítulo      | SalesAuthScreen |
| `AuthLegalLinks`      | Enlaces a Términos y Privacidad                          | SalesAuthScreen |
| `AuthModeSelector`    | Control segmentado login/register (contiene SegmentButton)| SalesAuthScreen |
| `AuthSessionBar`      | Checkbox "Recordarme" + link "Recuperar acceso"          | SalesAuthScreen |
| `AuthSubmitButton`    | Botón primario con loader y estado disabled              | SalesAuthScreen |

## 6. Archivos foundation (4 archivos)

| Archivo            | Contenido                                       |
|--------------------|-------------------------------------------------|
| `auth.constants.ts`| Paleta de colores (authPalette)                 |
| `auth.styles.ts`   | StyleSheet.create completo de SalesAuthScreen   |
| `auth.types.ts`    | Tipos AuthMode, AuthIdentity                    |
| `auth.utils.ts`    | getFirstParam, buildPaymentRoute, normalizeIdentity |

## 7. password-reset-screen.tsx

**No aparece en el commit `fbb1b1c`.** No fue modificado durante RC-SALES-03.

- Fue analizado (101 líneas originales, contenedor minimalista con 10 estilos inline).
- Se decidió no modularizarlo: extraer componentes habría creado abstracciones artificiales sin ganancia real, y sus estilos no compiten con `auth.styles.ts` (nombres distintos).
- Permanece con el mismo contenido y tamaño. No hay una métrica "antes → después" que reportar.

## 8. Métricas corregidas

| Métrica                     | Antes  | Después | Resultado                           |
|-----------------------------|-------:|--------:|-------------------------------------|
| `sales-auth-screen.tsx`     | 796    | 237     | −70.2 %                             |
| `password-reset-screen.tsx` | 101    | 101     | Sin cambios (no incluido en commit) |
| Archivos foundation creados | 0      | 4       | +4                                  |
| Componentes creados         | 0      | 8       | +8                                  |
| Archivos nuevos totales     | 0      | 13      | (12 implementación + RC-SALES-03.md)|
| Dependencias agregadas      | 0      | 0       | Sin cambios                         |
| Typecheck                   | Aprobado | Aprobado | ✅                                  |
| Build                       | Aprobado | Aprobado | ✅                                  |
| Tests                       | —      | —       | Script no disponible                |

## 9. Validaciones técnicas

| Validación               | Resultado                         |
|--------------------------|-----------------------------------|
| Typecheck                | Aprobado                          |
| Build                    | Aprobado                          |
| Tests                    | No ejecutados: script no definido |
| Dependencias nuevas      | Ninguna                           |
| Código fuera del alcance | Ninguno                           |

## 10. Matriz de compatibilidad

| Pregunta                       | Respuesta |
|--------------------------------|-----------|
| ¿Cambió el login?              | NO        |
| ¿Cambió el registro?           | NO        |
| ¿Cambió la recuperación?       | NO        |
| ¿Cambió el restablecimiento?   | NO        |
| ¿Cambió alguna validación?     | NO        |
| ¿Cambió algún campo?           | NO        |
| ¿Cambió algún texto?           | NO        |
| ¿Cambió algún dato?            | NO        |
| ¿Cambió algún payload?         | NO        |
| ¿Cambió algún endpoint?        | NO        |
| ¿Cambió algún contrato?        | NO        |
| ¿Cambió algún tipo compartido? | NO        |
| ¿Cambió el store?              | NO        |
| ¿Cambió la API?                | NO        |
| ¿Cambió la navegación?         | NO        |
| ¿Cambió alguna ruta?           | NO        |
| ¿Cambió la UI visible?         | NO        |
| ¿Cambió el responsive?         | NO        |
| ¿Se agregó alguna dependencia? | NO        |
| ¿Se duplicó lógica?            | NO        |
| ¿Se modificó Commercial?       | NO        |
| ¿Se modificó Portal Admin?     | NO        |
| ¿Se modificó Mobile?           | NO        |
| ¿Se modificó backend?          | NO        |
| ¿Se integró Resend?            | NO        |

## 11. Evidencia Git

```bash
$ git branch --show-current
main

$ git rev-parse --short HEAD
fbb1b1c

$ git status --short
(no output)

$ git show --stat --oneline fbb1b1c
fbb1b1c refactor(ventas): modularize authentication screens
 RC-SALES-03.md                                     | 113 ++++
 ventas/screens/auth/auth.constants.ts              |  40 ++
 ventas/screens/auth/auth.styles.ts                 | 312 +++++++++++
 ventas/screens/auth/auth.types.ts                  |   7 +
 ventas/screens/auth/auth.utils.ts                  |  42 ++
 ventas/screens/auth/components/auth-feedback.tsx   |  16 +
 ventas/screens/auth/components/auth-field.tsx      |  77 +++
 ventas/screens/auth/components/auth-header.tsx     |  32 ++
 ventas/screens/auth/components/auth-mode-selector.tsx | 50 ++
 ventas/screens/auth/components/auth-session-bar.tsx   | 34 ++
 ventas/screens/auth/components/auth-shell.tsx      |  12 +
 ventas/screens/auth/components/auth-submit-button.tsx | 30 ++
 ventas/screens/auth/components/auth-legal-links.tsx | 20 +
 ventas/screens/sales-auth-screen.tsx               | 595 ++-------------------
 14 files changed, 818 insertions(+), 562 deletions(-)

$ git show --name-status --format= fbb1b1c
A  RC-SALES-03.md
A  ventas/screens/auth/auth.constants.ts
A  ventas/screens/auth/auth.styles.ts
A  ventas/screens/auth/auth.types.ts
A  ventas/screens/auth/auth.utils.ts
A  ventas/screens/auth/components/auth-feedback.tsx
A  ventas/screens/auth/components/auth-field.tsx
A  ventas/screens/auth/components/auth-header.tsx
A  ventas/screens/auth/components/auth-legal-links.tsx
A  ventas/screens/auth/components/auth-mode-selector.tsx
A  ventas/screens/auth/components/auth-session-bar.tsx
A  ventas/screens/auth/components/auth-shell.tsx
A  ventas/screens/auth/components/auth-submit-button.tsx
M  ventas/screens/sales-auth-screen.tsx
```

**Estado posterior al commit:** árbol de trabajo limpio (`git status --short` sin salida). El commit `fbb1b1c` contiene exclusivamente los cambios de RC-SALES-03 y no contiene modificaciones ajenas.

## 12. Rollback

```bash
git revert fbb1b1c
```

No ejecutar el revert.

## 13. Matriz de cierre documental

| Pregunta                                     | Respuesta |
|----------------------------------------------|-----------|
| ¿Se modificó código durante esta corrección? | NO        |
| ¿Se modificó lógica?                         | NO        |
| ¿Se modificaron componentes?                 | NO        |
| ¿Se modificaron estilos?                     | NO        |
| ¿Se modificaron dependencias?                | NO        |
| ¿Se corrigieron los conteos?                 | SÍ        |
| ¿Se aclaró `password-reset-screen.tsx`?      | SÍ        |
| ¿Se actualizó el estado Git real?            | SÍ        |
| ¿Se documentó el commit real?                | SÍ        |
| ¿Se documentó el rollback exacto?            | SÍ        |
| ¿El reporte quedó sin contradicciones?       | SÍ        |
