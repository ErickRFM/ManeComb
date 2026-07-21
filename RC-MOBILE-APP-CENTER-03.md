# RC-MOBILE-APP-CENTER-03 — Gestión de Versiones y Publicaciones

**Entrega:** RC-MOBILE-APP-CENTER-03  
**Fecha:** 2026-07-20  
**Estado:** ✅ Completado — validado (typecheck + build + backend tests)

---

## Resumen

Se agregó el **Historial de Versiones** al Centro de la Aplicación del Portal Administrativo. Sin romper RC-01 ni RC-02. Sin nuevos endpoints. Sin modificar store, router, menú lateral, ni otros módulos del Portal.

---

## Arquitectura

```
GET /api/app/info  ← único endpoint (sin cambios de ruta)
       │
       ├── name, version, apkUrl, ... (RC-01)
       ├── releaseNotes (RC-02)
       └── versionHistory[]  ← NUEVO (RC-03)
               ├── version, date, current, size, androidMin
               └── notes[]
```

---

## Archivos modificados

| Archivo | Acción | Descripción |
|---|---|---|
| `backend/src/modules/app/routes.js` | Modificado | Se agregó `versionHistory` con 3 versiones de ejemplo al response |
| `ventas/src/types/app.ts` | Modificado | Se agregó tipo `PortalAppVersion` y campo `versionHistory?: PortalAppVersion[]` en `PortalAppInfo` |
| `ventas/features/portal/types.ts` | Modificado | Se re-exporta `PortalAppVersion` |
| `ventas/features/portal/screens/portal-app-movil-screen.tsx` | Modificado | Se agregó timeline de versiones, expand/collapse, badge ACTUAL, descarga solo versión actual |

---

## Detalle por FASE

### FASE 1 — Contrato Backend

Extensión backward-compatible de `GET /api/app/info`. El campo `versionHistory` es opcional (tipo `?:`). Clientes sin actualizar ignoran el nuevo campo.

### FASE 2 — Timeline

Nueva sección "**Historial de versiones**" después de la sección de novedades. Diseño de línea de tiempo elegante con:
- **Línea vertical** conectora entre versiones
- **Dot** de color accent (versión actual) o mutedSoft (versiones anteriores)
- Versión `vX.X.X` + fecha en formato ISO `YYYY-MM-DD`
- Android mínimo + tamaño en pills

### FASE 3 — Release Notes expandibles

Cada versión tiene un botón de expandir/contraer (chevron). Al expandir:
- Las notas se muestran inline (sin modal, sin nueva página)
- Cada nota con icono `check-circle-outline` verde
- Fondo `surfaceSoft` para diferenciar del contenido principal

### FASE 4 — Indicadores

- La versión actual (`current: true`) muestra un badge **`StatusBadge`** con `tone="positive"` y label **"ACTUAL"**
- Las versiones anteriores no muestran badge

### FASE 5 — Descargas

- Solo la versión actual muestra botón "**Descargar APK**" con `portalButtonGradient()`
- Versiones anteriores solo informativas (estructura preparada para descarga futura mediante prop `onDownload?: () => void`)

### FASE 6 — UX

- Si `versionHistory.length <= 1`, la sección del timeline **se oculta automáticamente**
- No se muestran espacios vacíos ni líneas sin contenido

### FASE 7 — Responsive

| Viewport | Timeline |
|---|---|
| Desktop (>980px) | Linea vertical completa, dot + contenido horizontal |
| Laptop | Misma estructura, flex wrap según contenedor |
| Tablet (<720px) | `compact` reduce padding inferior entre items |
| Móvil | Timeline vertical fluido, sin desbordamiento |

---

## Validaciones

| Verificación | Resultado |
|---|---|
| `npm run typecheck` (ventas) | ✅ Sin errores |
| `npm run build` (ventas) | ✅ Build exitoso (5.06s) |
| `npm test` (backend) | ✅ Todos los tests pasan (smoke incluido) |
| RC-01 compatibilidad | ✅ Endpoint único, store intacto |
| RC-02 compatibilidad | ✅ Hero, QR, info, novedades intactos |
| Iconos verificados | ✅ `check-circle-outline`, `chevron-up`, `chevron-down` existen en glyphmap |

---

## Riesgos remanentes

| Riesgo | Impacto | Mitigación |
|---|---|---|
| `versionHistory` vacío o ausente | Timeline no se renderiza | Guard condicional `versionHistory?.length > 1` |
| Versión actual sin `apkUrl` | Botón Descargar no aparece | `onDownload` solo se pasa si `ver.current && handleDownload` definida |
| `versionHistory` no ordenado | Timeline muestra orden del backend | El backend define el orden (más reciente primero) |

---

## Criterios de certificación

| Criterio | Estado |
|---|---|
| No rompe RC-01 | ✅ |
| No rompe RC-02 | ✅ |
| Mantiene un único endpoint | ✅ (`GET /api/app/info`) |
| No introduce rutas nuevas | ✅ |
| Reutiliza completamente el Store existente | ✅ |
| Timeline responsive | ✅ |
| Módulo sigue siendo fuente oficial de distribución | ✅ |

---

## Dictamen final

✅ **RC-MOBILE-APP-CENTER-03 completada.** El Centro de la Aplicación ahora muestra el historial completo de versiones con timeline visual, release notes expandibles, badge "ACTUAL" en la versión vigente y descarga restringida a la versión actual. Sin romper funcionalidad previa. Sin TypeScript errors. Build exitoso.

**Hoja de ruta actualizada:**
- ✅ RC-01: Infraestructura
- ✅ RC-02: Experiencia visual
- ✅ RC-03: Gestión de Versiones
- 🚧 RC-04: Panel de administración (actualizar versión, APK, notas)
- ⏳ RC-05: Comentarios, calificaciones y estadísticas
