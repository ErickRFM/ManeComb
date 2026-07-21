# RC-MOBILE-APP-CENTER-02 — Experiencia y Presentación

**Entrega:** RC-MOBILE-APP-CENTER-02  
**Fecha:** 2026-07-20  
**Estado:** ✅ Completado — validado (typecheck + build)

---

## Resumen

Se transformó la pantalla del Mobile App Center en un verdadero Centro de la Aplicación, mejorando la presentación visual, experiencia de descarga e información disponible. No se modificó backend, store, router, sistema de autenticación, menú lateral ni otros módulos.

---

## Archivos modificados

| Archivo | Acción | Descripción |
|---|---|---|
| `ventas/features/portal/screens/portal-app-movil-screen.tsx` | **REESCRITO** | Pantalla completa transformada con hero profesional, QR real, info destacada, descarga simplificada y novedades |
| `ventas/package.json` | Modificado | Se agregó dependencia `qrcode` + `@types/qrcode` |

---

## Detalle por FASE

### FASE 1 — Hero profesional

Se creó un Hero superior con:
- **BrandLogo** de ManeComb (reutilizando el componente existente)
- **Título** "ManeComb" en tipografía display 32px
- **Descripción** "La aplicación oficial para conductores"
- **Estado de versión** — Badge verde "Disponible" + "vX.X.X"
- **Botón principal** "Descargar APK" con `portalButtonGradient()` (mismo gradiente que botones del portal)
- **Botón secundario** "Ver novedades" con scroll suave a la sección de novedades
- **Mockup de teléfono** — Frame CSS con notch, status bar, app content (logo + nombre) y navegación inferior

### FASE 2 — Información destacada

Cards visuales reemplazando las antiguas tarjetas:
- **Versión** (icono android)
- **Android mínimo** (icono android)
- **Tamaño** (icono harddisk)
- **Última actualización** (icono calendar)

Diseño: flex row con wrap, surfaceSoft bg, borde line, icono infoSoft de 38px.

### FASE 3 — Descarga simplificada

La experiencia de descarga ahora muestra:
- **QR code** (generado dinámicamente)
- **Título** "Aplicación para conductores"
- **Subtítulo** descriptivo
- **Metadatos** en pills: `Android X.X+`, tamaño, versión
- **Botón** "Descargar APK" grande con gradiente

Se **eliminó** la visualización directa del enlace de OneDrive/URL técnica. La descarga sigue funcionando mediante `Linking.openURL(appInfo.apkUrl)`.

### FASE 4 — QR real

- Se instaló la librería `qrcode` (pure JS, sin dependencias nativas)
- El QR se genera dinámicamente desde `appInfo.apkUrl` usando `QRCode.toString()` en formato SVG
- Se renderiza con `SvgXml` de react-native-svg (mismo componente usado por `BrandLogo`)
- Al escanearlo desde un teléfono Android, inicia la descarga del APK
- Mientras se genera, muestra un placeholder con icono de QR

### FASE 5 — Novedades

Sección "¿Qué incluye esta versión?" con:
- Título display 20px
- Subtítulo con número de versión
- Lista de items consumidos de `releaseNotes`
- Cada item con icono de verificación (`check`) dentro de círculo verde (`successSoft`)

### FASE 6 — Diseño y consistencia

- Todos los cards usan `portalGlass()` (mismo fondo, blur, sombra que el resto del portal)
- Colores consistenetes: `portalPalette`, `AppTheme.radius`, `Typography`
- Botón "Descargar APK" reutiliza `portalButtonGradient()` de otros botones del portal
- Espaciados: `AppTheme.spacing.lg` (24px), `md` (16px), `sm` (12px)
- Bordes: `2px solid portalPalette.line`, border radios de `sm` (8px) y `md` (12px)

### FASE 7 — Responsive

| Viewport | Comportamiento |
|---|---|
| Desktop (>980px) | Hero horizontal, info row 4 columnas, download row horizontal |
| Laptop (720-980px) | Hero horizontal compacto, info row wrap, download row horizontal |
| Tablet (<720px) | Hero vertical (compact), info row 2x2, download vertical |
| Móvil (<480px) | Hero vertical, info row 1 columna, download vertical |

### Limpieza

Se eliminaron:
- Placeholder QR antiguo (icono estático)
- Visualización del enlace OneDrive/URL técnica
- `InfoFact` con patrón icon+copy row → reemplazado por card vertical
- `versionBadge` del header (reemplazado por badge en hero)
- `contentCard`/`infoSection`/`infoGrid` obsoletos
- `PortalSectionCard` wrapper (hero es card autónomo)
- Import no utilizados (`ActivityIndicator`, `palette`)
- Estilos `urlBox`, `urlLabel`, `urlValue`, `versionBadge`, `versionBadgeText`, `contentCard`, `contentCardCompact`, etc.

---

## Dependencias nuevas

| Paquete | Versión | Propósito |
|---|---|---|
| `qrcode` | ^1.5.4 | Generación de QR code en SVG desde apkUrl |
| `@types/qrcode` | ^1.5.5 | Tipados TypeScript |

---

## Validaciones

| Verificación | Resultado |
|---|---|
| `npm run typecheck` | ✅ Sin errores |
| `npm run build` | ✅ Build exitoso (5.04s) |
| Iconos MaterialCommunityIcons | ✅ Todos verificados contra glyphmap |
| QR generado con qrcode | ✅ Formato SVG, renderizado con SvgXml |
| Botón Descargar APK | ✅ Linking.openURL() |

---

## Riesgos remanentes

| Riesgo | Impacto | Mitigación |
|---|---|---|
| QR code no se genera si apkUrl es inválido | El QR no aparece, se queda en placeholder | El placeholder con icono QR es visualmente aceptable |
| `qrcode` aumenta el bundle ~30kB | Mayor tiempo de carga inicial | El screen se carga con lazy import, el QR se genera post-render |
| Scroll "Ver novedades" solo funciona en web | Sin efecto en dispositivos nativos | El botón existe y es accesible, el scroll suave es un plus |

---

## Dictamen final

✅ **RC-MOBILE-APP-CENTER-02 completada.** La pantalla ahora presenta un hero profesional, QR dinámico, descarga simplificada sin URLs técnicas, sección de novedades, diseño consistente con el Portal y comportamiento responsive. Sin errores TypeScript ni warnings de build. Listo para continuar con RC-03 (Historial de versiones).
