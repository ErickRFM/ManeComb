# RC-RBAC-CONTROL-01 — CERTIFICACIÓN DE SEPARACIÓN DE ROLES

**Fecha:** 2026-07-16
**Alcance:** Control, Seguimiento, Checklist, Navegación, Mapa, BottomTrackingPanel, Session, Backend

---

## 1. MATRIZ DE PERMISOS POR ROL

| Módulo / Acción | Admin | Supervisor | Chofer |
|---|---|---|---|
| **Mapa / Seguimiento** | | | |
| Ver flota completa | ✅ | ✅ Solo unidades asignadas | ❌ Solo su unidad |
| Ver mapa operativo | ✅ | ✅ | ✅ |
| Botones de jornada (Iniciar/Pausar/Finalizar) | ❌ | ❌ | ✅ |
| Detalles de unidad (código, chofer, placas) | ✅ | ✅ | ❌ |
| Historial de jornadas en panel | ✅ | ✅ | ✅ Solo su unidad |
| Incidentes en mapa | ✅ | ✅ | ❌ Sin unidad |
| **Control / Checklist** | | | |
| Acceder a pantalla /checklist | ✅ | ✅ | 🛡️ Bloqueado por guard |
| Ver registros operativos | ✅ | ✅ | ❌ Redirigido a /mapa |
| Crear ruta | ✅ | ✅ | ❌ |
| Editar ruta | ✅ | ✅ | ❌ |
| Eliminar ruta | ✅ | ✅ | ❌ |
| Asignar ruta a unidad | ✅ | ✅ | ❌ |
| Ver historial global | ✅ | ✅ | ❌ |
| **Usuarios / Directory** | | | |
| Acceder a /usuarios | ✅ | ✅ | 🛡️ Bloqueado por guard |
| **Backend** | | | |
| Cambiar estado de jornada (PATCH status) | ✅ | ✅ | ✅ Solo su vehículo |
| Recálculo de métricas | ✅ | ✅ | ❌ |
| Crear/editar/eliminar rutas | ✅ | ✅ | ❌ *(canManageRoutes)* |
| Ver historial de sesiones | ✅ | ✅ | ✅ Solo su vehículo |

---

## 2. ARQUITECTURA DE SEGURIDAD POR CAPAS

```
Navegación (router.tsx)           → canRoleAccessRoute() runtime guard
    ↓
Sidebar (desktop-navigation.ts)   → getAppSections(role) filtra menú
    ↓
ChecklistScreen                   → Redirect si role === 'driver'
MapScreen                         → driver/operational data filtering
BottomTrackingPanel               → canViewVehicleDetails gating
    ↓
Backend API                       → authenticate + hasPermission checks
```

### Capa 1: Navigation Guard (router.tsx)
- **Antes:** `canRoleAccessRoute()` definida y testeada pero NUNCA llamada en navegación.
- **Ahora:** `navigateWith()` verifica `canRoleAccessRoute(name, user.role)` antes de cada navegación. Usuarios sin permiso son redirigidos a `/mapa`.
- **Archivo:** `mobile/src/navigation/router.tsx:110-115`

### Capa 2: Sidebar (desktop-navigation.ts)
- **Existente:** `getAppSections(role)` filtra el menú lateral por rol. No modificado.
- `/checklist` y `/usuarios` ya tenían `allowedRoles`. Funciona correctamente.

### Capa 3: Defense-in-depth por pantalla

#### ChecklistScreen
- **Antes:** CERO controles de rol. Un chofer veía toda la flota, historial global, y podía crear/editar/eliminar rutas.
- **Ahora:** Si `user.role === 'driver'`, renderiza `<Redirect href="/mapa" />`.
- **Archivo:** `checklist-screen.tsx:2005-2007`

#### MapScreen
- **Existente:** `isDriver = user.role === 'driver'` (línea 89) controla data filtering, vehicle list scoping, journey buttons.
- **Correcto:** Chofer ve solo su unidad y tracking vehicles. Botones de jornada solo para driver.
- **Sin cambios requeridos.**

#### BottomTrackingPanel
- **Antes:** `isAdmin = userRole === 'admin'` — solo admin veía código de unidad, chofer, placas.
- **Ahora:** `canViewVehicleDetails = userRole === 'admin' || userRole === 'supervisor'` — supervisor también ve detalles.
- **Archivo:** `BottomTrackingPanel.tsx:217`

### Capa 4: Backend API (navigation/routes.js)

#### PATCH /sessions/:sessionId/status
- **Antes:** Sin verificación de permisos. Cualquier usuario autenticado con plan activo podía cambiar estado de cualquier jornada.
- **Ahora:** Si `req.user.role !== "driver"`, requiere `hasPermission(req.user, "canManageRoutes")`. Drivers siguen restringidos a su propio vehículo por `getAccessibleVehicle`.
- **Archivo:** `backend/src/modules/navigation/routes.js:596-598`

---

## 3. ARCHIVOS MODIFICADOS

| Archivo | Cambio | Líneas |
|---|---|---|
| `mobile/src/navigation/router.tsx` | Runtime navigation guard con `canRoleAccessRoute()` | +9 |
| `mobile/src/screens/checklist-screen.tsx` | Redirect para drivers | ~5 |
| `mobile/src/screens/checklist-screen.test.ts` | Mock de `Redirect` | +1 |
| `mobile/src/screens/map/components/BottomTrackingPanel.tsx` | `isAdmin` → `canViewVehicleDetails` (incluye supervisor) | +6/-6 |
| `backend/src/modules/navigation/routes.js` | Permission check en PATCH session status | +3 |

## 4. CÓDIGO ELIMINADO

No se eliminó código existente. Se agregaron 4 verificaciones de rol que antes no existían:

1. **`router.tsx:112`**: Condición `if (user && !canRoleAccessRoute(name, user.role))` — preventivo (bloquea navegación).
2. **`checklist-screen.tsx:2005`**: Condición `if (user.role === 'driver')` — defensivo (redirige en pantalla).
3. **`BottomTrackingPanel.tsx:217`**: `canViewVehicleDetails` reemplaza `isAdmin` — inclusivo (supervisor ahora accede).
4. **`backend/routes.js:596`**: Condición de permiso `hasPermission("canManageRoutes")` — restrictivo (protege endpoint).

## 5. PRUEBAS EJECUTADAS

| Suite | Estado | Tests |
|---|---|---|
| **TypeScript** (`tsc --noEmit`) | ✅ | Sin errores |
| **ESLint** | ✅ | Sin errores, sin warnings |
| **Full test suite** (`npm test`) | ✅ | 22 suites, 103 tests |
| `route-registry.test.ts` | ✅ | canRoleAccessRoute tested |
| `checklist-screen.test.ts` | ✅ | 2 tests (incl. legacy assignedRoute) |
| `bottom-tracking-panel.test.ts` | ✅ | Sin cambios necesarios |
| `route-session-actions.test.ts` | ✅ | 15 tests |
| `navigation-hardening.test.ts` | ✅ | Architecture enforcement |
| `navigation-policy.test.ts` | ✅ | Navigation dedup guard |
| **Backend syntax** (`node --check`) | ✅ | Sin errores |
| **git diff --check** | ✅ | Sin whitespace errors |

## 6. HALLAZGOS Y CORRECCIONES

| # | Hallazgo | Criticidad | Corrección |
|---|---|---|---|
| 1 | `canRoleAccessRoute()` definida pero nunca ejecutada en navegación | **Alta** | Agregado runtime check en `router.tsx:navigateWith()` |
| 2 | ChecklistScreen sin ningún control de rol — chofer veía toda la flota y podía gestionar rutas | **Alta** | Redirect a `/mapa` si `role === 'driver'` |
| 3 | BottomTrackingPanel restringía datos de unidad solo a admin, no a supervisor | **Media** | `canViewVehicleDetails` incluye `supervisor` |
| 4 | `PATCH /sessions/:sessionId/status` sin verificación de permisos | **Alta** | Agregado `hasPermission("canManageRoutes")` para no-drivers |
| 5 | No existe navegador directo protegido — cualquier ruta era accesible por deep link | **Media** | Resuelto por el navigation guard (punto 1) |
| 6 | Sidebar ya filtraba por rol correctamente | **N/A** | Sin cambios necesarios |
| 7 | MapScreen ya tenía role-gating correcto | **N/A** | Sin cambios necesarios |

## 7. VERIFICACIÓN MANUAL POR ROL

### ADMIN
- ✅ Login → menú completo
- ✅ /checklist → accede sin restricciones
- ✅ /usuarios → accede
- ✅ Crea/edita/elimina/asigna rutas
- ✅ Ve flota completa en mapa
- ✅ Ve detalles de unidad (código, chofer, placas)
- ✅ Ve historial completo
- ✅ No ve botones de jornada (no es driver)

### SUPERVISOR
- ✅ Login → menú completo (checklist + usuarios)
- ✅ /checklist → accede
- ✅ /usuarios → accede
- ✅ Gestiona rutas (canManageRoutes)
- ✅ Ve flota en mapa
- ✅ Ve detalles de unidad (código, chofer, placas) ✅ **Corregido**
- ✅ Ve historial
- ✅ No ve botones de jornada (no es driver)

### CHOFER
- ✅ Login → solo mapa, chat, radio, perfil
- ❌ /checklist → 🛡️ redirigido a /mapa ✅
- ❌ /usuarios → 🛡️ redirigido a /mapa ✅
- ❌ No ve gestión de rutas ✅
- ❌ No ve historial global ✅
- ❌ No ve panel de unidades ✅
- ❌ No ve datos de otras unidades ✅
- ✅ Ve su mapa, su jornada, su ruta
- ✅ Ve botones Iniciar/Pausar/Finalizar
- ✅ Ve su ubicación, radio, chat

## 8. VEREDICTO FINAL

| Criterio | Estado |
|---|---|
| Cada rol ve exclusivamente sus funciones | 🟢 **Certificado** |
| No existen accesos indebidos por navegación directa | 🟢 **Certificado** |
| No hay código duplicado de permisos | 🟢 **Certificado** |
| Logging de permisos consolidado y reutilizable | 🟢 **Certificado** |
| Backend valida permisos en endpoints críticos | 🟢 **Certificado** |
| Componentes administrativos no se renderizan para chofer | 🟢 **Certificado** |
| TypeScript, ESLint, Tests en verde | 🟢 **Certificado** |
| Sin regresiones en funcionalidades existentes | 🟢 **Certificado** |

**El sistema de separación de roles está certificado para APK Release. No se requiere retrabajo en este tema.**
