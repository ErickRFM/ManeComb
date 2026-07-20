# RC-AUTH-BRANDING-POLISH-01

## Alcance

Pulido visual de la identidad ManeComb en la pantalla de acceso y el Drawer operacional. No se modificaron autenticación, navegación, validaciones, formulario, botones, inputs, ilustración, animaciones ni Design System.

## Auditoría de usos del logotipo

La búsqueda abarcó componentes, pantallas, assets SVG/PNG, Splash y posibles pantallas de Onboarding.

| Ubicación | Implementación encontrada | Resultado de auditoría |
| --- | --- | --- |
| Login/registro | `BrandLogo`, variante `tone="dark"`, sin contenedor decorativo | Correcta para fondo blanco: “Mane” rojo y “Comb” negro. |
| Drawer operacional | `BrandLogo` sin `tone` explícito | Incorrecta en tema claro: el valor predeterminado renderizaba “Comb” blanco. |
| Splash | `assets/images/splash-icon.png` y copias Android generadas | Contiene únicamente la ilustración de la combi; no representa el wordmark ManeComb. |
| Onboarding | No se encontró una pantalla o encabezado de Onboarding que renderice el logotipo | Sin uso que corregir. |
| Otros encabezados | No se encontraron otras instancias de `BrandLogo` | Sin variantes inconsistentes adicionales. |

## Assets y variantes encontradas

- `brand-logo.tsx` contiene un único SVG vectorial embebido y reutilizable.
- Variante para fondo oscuro: “Mane” rojo y “Comb” blanco (`lightLogoXml`).
- Variante para fondo claro: “Mane” rojo y “Comb” grafito `#25282F` (`darkLogoXml`).
- `faster.png` y `splash-icon.png` corresponden a la ilustración de la combi, no a variantes del wordmark.
- Los archivos `drawable-*/splashscreen_logo.png` son recursos Android derivados del Splash.

No se creó, duplicó ni sustituyó ningún asset.

## Variante seleccionada

El Drawer ahora selecciona la variante existente según su superficie:

```tsx
tone={theme.mode === 'light' ? 'dark' : 'light'}
```

De este modo, en tema claro se muestra “Comb” en grafito y en tema oscuro se conserva la variante blanca prevista para contraste.

## Archivos modificados

- `mobile/src/components/operational-menu-drawer.tsx`
- `mobile/src/screens/customer-auth-screen.tsx`

## Comparativa antes/después

| Elemento | Antes | Después |
| --- | --- | --- |
| Logo del Drawer claro | “Comb” blanco sobre superficie clara | “Comb” grafito sobre superficie clara |
| Logo del Drawer oscuro | Variante predeterminada blanca | Variante blanca seleccionada explícitamente |
| Separación logo-ilustración | `14 px` | `8 px` |
| Separación eslogan-formulario | `18 px` | `12 px` |
| Eslogan | 11 px, peso normal, línea de 16 px | 13 px, peso 700, línea de 19 px |
| Formulario y controles | Diseño existente | Sin cambios |

La reducción acumulada de `12 px` elimina espacio muerto entre los bloques de marca sin comprimir el formulario. Se conservaron el centrado flexible y los breakpoints existentes; no se añadieron posiciones absolutas.

## Evidencia visual

No se ejecutó la aplicación por indicación expresa del usuario. Por tanto, no se fabricó una captura posterior y la evidencia visual en dispositivo queda pendiente.

La evidencia estática verificable es:

- selección explícita de la variante contrastante del SVG en el Drawer;
- reutilización del mismo componente `BrandLogo` empleado por el login;
- cambios limitados a márgenes y tipografía del eslogan;
- ausencia de cambios en el asset de la combi y en el formulario.

## Validaciones realizadas

- TypeScript (`npm.cmd run typecheck`): aprobado.
- ESLint (`npm.cmd run lint`): aprobado.
- `git diff --check` sobre los archivos modificados: aprobado.
- Revisión estática de usos y assets del logo: aprobada.
- Build Android: no ejecutado; el usuario realizará la app.
- Validación visual en teléfonos y tablets: pendiente del usuario.

## Riesgos remanentes

- Confirmar visualmente el balance vertical en teléfonos pequeños, grandes y tablets.
- Confirmar el contraste del Drawer en ambos temas dentro de la aplicación ejecutada.
- El Splash no incluye el wordmark; no se alteró porque la RC prohíbe sustituir branding o crear assets y el recurso actual es únicamente la ilustración institucional.

## Dictamen final

**Implementación completada; certificación visual pendiente.**

El Drawer reutiliza la variante correcta del logo según el fondo y el login presenta una jerarquía más compacta y legible. No existen cambios funcionales ni assets nuevos. La certificación definitiva requiere únicamente la prueba visual y el build Android que realizará el usuario.
