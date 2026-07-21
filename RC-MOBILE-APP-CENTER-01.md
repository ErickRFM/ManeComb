# RC-MOBILE-APP-CENTER-01 — Módulo Mobile App Center

**Entrega:** RC-MOBILE-APP-CENTER-01  
**Fecha:** 2026-07-20  
**Estado:** ✅ Completado — validado (typecheck + build + tests backend)

---

## Resumen

Se implementó el **Mobile App Center** en el Portal Administrativo de ManeComb. La funcionalidad permite a los administradores consultar la información de la aplicación móvil para conductores, visualizar la versión disponible y acceder al enlace de descarga del APK.

---

## Archivos modificados/creados

### Backend (nuevo endpoint)

| Archivo | Acción | Descripción |
|---|---|---|
| `backend/src/modules/app/routes.js` | **CREADO** | Endpoint `GET /api/app/info` que retorna metadatos de la app móvil (nombre, versión, apkUrl, androidMin, size, releaseDate, releaseNotes) |
| `backend/src/app.js` | Modificado | Se importa y monta `appRoutes` en `/api/app` |

### Frontend (Portal Administrativo)

| Archivo | Acción | Descripción |
|---|---|---|
| `ventas/src/types/app.ts` | Modificado | Se agrega el tipo `PortalAppInfo` |
| `ventas/features/portal/types.ts` | Modificado | Se re-exporta `PortalAppInfo` |
| `ventas/src/lib/api.ts` | Modificado | Se agrega `getAppInfoRequest()` y se importa `PortalAppInfo` |
| `ventas/features/portal/api.ts` | Modificado | Se re-exporta `getAppInfoRequest` |
| `ventas/features/portal/store/use-portal-store.ts` | Modificado | Se agrega `appInfo` al estado, `loadAppInfo` action |
| `ventas/features/portal/screens/portal-app-movil-screen.tsx` | **CREADO** | Pantalla completa del Mobile App Center |
| `ventas/features/portal/components/portal-layout.tsx` | Modificado | Se agrega ítem "App Móvil" en sección "Ayuda" del menú lateral |
| `ventas/src/App.tsx` | Modificado | Se agrega `lazy` import, permiso público y route case para `/portal/app-movil` |

---

## Detalle de implementación

### Backend: `GET /api/app/info`

Endpoint público (sin autenticación requerida) que retorna:

```json
{
  "ok": true,
  "data": {
    "name": "ManeComb",
    "version": "1.0.0",
    "apkUrl": "https://1drv.ms/u/s!Aq6TgxRWNbScgQah2wPwI8wZGn3L?e=JCh8cX",
    "androidMin": "8.0",
    "size": "45 MB",
    "releaseDate": "2026-07-15",
    "releaseNotes": []
  }
}
```

### Frontend: Pantalla PortalAppMovilScreen

La pantalla incluye:

1. **Loading state** — Skeleton mientras se obtienen datos.
2. **Error state** — EmptyState con mensaje de error y botón "Reintentar".
3. **Empty state** — Cuando no hay datos.
4. **Info cards** con:
   - Versión de la app (badge)
   - Android mínimo, tamaño, fecha de publicación
   - QR visual (placeholder) + botón "Descargar APK" (abre enlace externo)
   - URL de descarga seleccionable
   - Notas de la versión (si existieran)
5. **Diseño responsive** — Se adapta a `compact` (< 720px) con disposición vertical.

### Navegación

- Ruta: `/portal/app-movil`
- Menú lateral: sección **Ayuda** → "App Móvil" (icono `cellphone-arrow-down`)
- Sin permiso requerido (disponible para todos los usuarios del portal)

---

## Validaciones

| Verificación | Resultado |
|---|---|
| `npm run typecheck` (ventas) | ✅ Sin errores |
| `npm run build` (ventas) | ✅ Build exitoso (6.46s) |
| `npm test` (backend) | ✅ Todos los tests pasan |

---

## Próximos pasos sugeridos

1. **Ampliar releaseNotes dinámicos** con notas reales de cada versión.
2. **Generar QR real** con librería `qrcode` cuando se requiera escaneo nativo.
3. **Integrar analytics** para medir clics en "Descargar APK".
4. **Agregar notificación** cuando haya una nueva versión disponible.
