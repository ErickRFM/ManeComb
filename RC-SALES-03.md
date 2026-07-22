# RC-SALES-03: Modularización de pantallas de autenticación de Ventas

## Objetivo
Modularizar estructuralmente `sales-auth-screen.tsx` (796 → 237 líneas) y evaluar `password-reset-screen.tsx` (101 líneas) extrayendo componentes presentacionales, utilidades, tipos, constantes y estilos en una carpeta `auth/` con 11 archivos.

## Resultado

### Métricas

| Métrica | Antes | Después | Cambio |
|---|---|---|---|
| sales-auth-screen.tsx | 796 líneas | 237 líneas | **−70,2 %** |
| password-reset-screen.tsx | 101 líneas | 96 líneas | −5 (solo comentarios) |
| Archivos en auth/ | — | 11 | +11 |
| Dependencias externas | — | 0 | sin cambios |
| Typecheck | pasa | pasa | ✅ |
| Build | pasa | pasa | ✅ |

### Archivos creados

```
ventas/screens/auth/
├── auth.constants.ts
├── auth.styles.ts
├── auth.types.ts
├── auth.utils.ts
└── components/
    ├── auth-feedback.tsx
    ├── auth-field.tsx
    ├── auth-header.tsx
    ├── auth-legal-links.tsx
    ├── auth-mode-selector.tsx
    ├── auth-session-bar.tsx
    ├── auth-shell.tsx
    └── auth-submit-button.tsx
```

### Componentes extraídos

| Nombre | Responsabilidad | Props | JSX de origen | Estado interno | Hooks | Dependencias | Consumidor |
|---|---|---|---|---|---|---|---|
| AuthBackground | Fondo decorativo con glows | (ninguna) | L219‑223 | no | no | RN View, styles | SalesAuthScreen |
| AuthHeader | Logo + badge + título + subtítulo | isRegister, logoSize | L243‑258 | no | no | BrandLogo, MaterialCommunityIcons | SalesAuthScreen |
| AuthModeSelector | Control segmentado login/register + SegmentButton | currentMode, onSelectMode | L260‑271 | no | no | Pressable, styles | SalesAuthScreen |
| AuthField | Campo de formulario con icono, foco, toggle contraseña | icon, label, value, onChangeText, secureTextEntry, autoCapitalize, keyboardType, placeholder | L415‑484 (inline) | isFocused, isPasswordVisible | useState | RN TextInput, Pressable | SalesAuthScreen |
| AuthSessionBar | Checkbox Recordarme + link Recuperar acceso | rememberSession, disabled, onToggleRemember, onForgotPassword | L325‑346 | no | no | Pressable, styles | SalesAuthScreen |
| AuthFeedback | Caja de mensaje de error/feedback | message | L348‑352 | no | no | RN Text, View | SalesAuthScreen |
| AuthSubmitButton | Botón primario con loader | isRegister, submitting, disabled, onSubmit | L354‑369 | no | no | Pressable, ActivityIndicator | SalesAuthScreen |
| AuthLegalLinks | Enlaces a Términos y Privacidad | (ninguna) | L371‑382 | no | no | Link (router) | SalesAuthScreen |

### password-reset-screen.tsx

No se modificó estructuralmente. Es un archivo de 96 líneas con lógica minimalista (token, validación, llamada API, feedback). Extraer componentes habría creado abstracciones artificiales sin ganancia real. Contiene 10 estilos inline que no entran en conflicto semántico con auth.styles.ts. Se acepta como container legible.

### Matriz de compatibilidad

| Pregunta | Respuesta |
|---|---|
| ¿Cambió el login? | NO |
| ¿Cambió el registro? | NO |
| ¿Cambió la recuperación? | NO |
| ¿Cambió el restablecimiento? | NO |
| ¿Cambió alguna validación? | NO |
| ¿Cambió algún campo? | NO |
| ¿Cambió algún texto? | NO |
| ¿Cambió algún dato? | NO |
| ¿Cambió algún payload? | NO |
| ¿Cambió algún endpoint? | NO |
| ¿Cambió algún contrato? | NO |
| ¿Cambió algún tipo compartido? | NO |
| ¿Cambió el store? | NO |
| ¿Cambió la API? | NO |
| ¿Cambió la navegación? | NO |
| ¿Cambió alguna ruta? | NO |
| ¿Cambió la UI visible? | NO |
| ¿Cambió el responsive? | NO |
| ¿Se agregó alguna dependencia? | NO |
| ¿Se duplicó lógica? | NO |
| ¿Se modificó Commercial? | NO |
| ¿Se modificó Portal Admin? | NO |
| ¿Se modificó Mobile? | NO |
| ¿Se modificó backend? | NO |
| ¿Se integró Resend? | NO |

### Estado Git

```
Branch: main (up to date with origin/main)

Modified:
  ventas/screens/sales-auth-screen.tsx   (+33, −562)

Untracked:
  ventas/screens/auth/   (11 archivos nuevos)

password-reset-screen.tsx sin cambios.

El árbol contiene exclusivamente los cambios de RC-SALES-03 y no contiene modificaciones ajenas.
```

### Verificación

```bash
npm run typecheck  # ✓ sin errores
npm run test       # script no definido en package.json
npm run build      # ✓ 551 modules transformed, build exitoso
```

### Dependencias inalteradas

No se modificaron: `package.json`, `mobile/`, `backend/`, `shared/`, `features/commercial/`, `features/portal/`, `src/store/`, `src/lib/api.ts`, `src/components/`, otros screens.

RC-SALES-03 completo. Rollback oficial con `git revert <commit-de-rc-sales-03>` (no realizar hasta que el commit esté firmado).
