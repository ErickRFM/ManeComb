# RC-MOBILE-APP-CENTER-04: Panel de Administración del Mobile App Center

## Resumen

Se implementó el panel de administración para la sección "App Móvil" del portal, permitiendo a usuarios con rol owner/admin modificar la información de la aplicación ManeComb sin necesidad de editar código ni archivos del backend.

## Cambios realizados

### Backend

| Archivo | Cambio |
|---------|--------|
| `backend/src/data/seedData.js` | Se agregó `appConfig` al seed state con campos: name, version, status, apkUrl, androidMin, size, releaseDate, releaseNotes, versionHistory (3 versiones semilla, cada una con `archived: false`) |
| `backend/src/data/store.js` | Se agregaron funciones `getAppConfig()` y `updateAppConfig(data)` al embedded store, exportadas en el return |
| `backend/src/data/mongo-store.js` | Se agregaron funciones `getAppConfig()` y `updateAppConfig(data)` al mongo store (en memoria, con seed como inicial), exportadas en el return |
| `backend/src/modules/app/routes.js` | Se modificó `GET /api/app/info` para leer desde el store (con fallback a datos hardcodeados). Se agregó `PATCH /api/app/info` con autenticación JWT + middleware `requireAdmin` + auditoría via `recordAuditLog` |

### Frontend

| Archivo | Cambio |
|---------|--------|
| `ventas/src/types/app.ts` | `PortalAppInfo` ahora incluye `status?: string`. `PortalAppVersion` ahora incluye `archived?: boolean` |
| `ventas/src/lib/api.ts` | Se agregó `updateAppInfoRequest(payload)` → `PATCH /app/info` |
| `ventas/features/portal/api.ts` | Se re-exportó `updateAppInfoRequest` |
| `ventas/features/portal/store/use-portal-store.ts` | Se agregó `updateAppInfo` action (`PortalActionResult`), import de `PortalAppVersion`, import de `updateAppInfoRequest` |
| `ventas/features/portal/components/portal-app-admin.tsx` | **Nuevo** componente completo del panel de administración |
| `ventas/features/portal/screens/portal-app-movil-screen.tsx` | Se agregó sistema de tabs (Información / Historial / Administración). Se integró `PortalAppAdmin`. El badge de estado del héroe ahora lee de `appInfo.status` |

## Funcionalidades del panel de administración

### Información general
- Edición inline de: versión, estado, android mínimo, tamaño, fecha de publicación, URL del APK
- Validación de tipos en backend

### Notas de publicación (releaseNotes)
- Agregar notas (campo + botón o tecla Enter)
- Editar inline
- Eliminar individualmente

### Historial de versiones (versionHistory)
- Agregar nuevas versiones (se insertan al inicio del array)
- Editar todos los campos: versión, fecha, androidMin, tamaño
- Editar notas por versión (agregar, editar, eliminar)
- Marcar como actual (desmarca automáticamente las demás)
- Archivar / Restaurar
- Eliminar

### Persistencia
- Botón "Guardar" con indicador de cambios pendientes (punto amarillo + texto)
- Confirmación modal antes de guardar
- Estado "Guardando..." deshabilita el botón
- Feedback visual "Guardado correctamente" por 3 segundos

### Control de acceso
- Usuarios sin rol owner/admin ven un mensaje "Acceso restringido"
- Backend valida con `requireAdmin` middleware

## Reglas cumplidas

- ✅ Sin nuevas rutas (PATCH en endpoint existente)
- ✅ Sin nuevos módulos (tab dentro de la misma pantalla)
- ✅ Sin new dependencies
- ✅ Sin modificar archivos no contemplados en el scope
- ✅ Persistencia vía store (embedded + mongo) sin archivos
- ✅ Reutiliza Portal Store existente
- ✅ Reutiliza layout, design system, tipografía
- ✅ Reutiliza autenticación y roles (JWT + requireAdmin)
- ✅ Auditoría via recordAuditLog existente
- ✅ Backward compatible — GET /api/app/info retorna mismo formato
- ✅ TypeScript typecheck y build pasan sin errores
