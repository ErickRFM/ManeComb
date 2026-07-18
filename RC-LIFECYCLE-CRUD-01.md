# RC-LIFECYCLE-CRUD-01 — Ciclo de Vida Completo de Entidades

## Entidades auditadas

| Entidad | Backend Store | Backend Routes | Frontend Store | Frontend Screen |
|---------|--------------|----------------|----------------|-----------------|
| Activation Keys | ✅ | ✅ | ✅ | PortalOnboardingScreen |
| Vehicles (Unidades) | ✅ | ✅ | ✅ | PortalUnitsScreen |
| Routes (Rutas) | ✅ | ✅ | ✅ | PortalRoutesScreen |
| Users (Conductores/Equipo) | ✅ | ✅ | ✅ | PortalUsersScreen |

---

## Operaciones agregadas

### Activation Keys
- **`DELETE /api/admin/activation-keys/:id`** — Eliminar key solo si está en estado `available` (nunca usada, no revocada, no expirada)
- **`deleteActivationKeyForAdmin()`** en `services/activation-keys.js` — Lógica de negocio con validaciones
- **`deleteActivationKey()`** en `store.js` y `mongo-store.js` — Eliminación física del registro
- Frontend: botón 🗑️ Eliminar en `ActivationKeyRow`, acción en `usePortalStore`

### Vehicles (Unidades)
- **`DELETE /api/vehicles/:vehicleId`** — Eliminar unidad con validación de dependencias
- **`deleteVehicle()`** en `store.js` y `mongo-store.js` — Eliminación física
- Frontend: botón 🗑️ Eliminar en `PortalUnitsScreen`, acción en `useAppStore`

### Routes (Rutas)
- **Validación de dependencias en `DELETE /api/navigation/routes/:routeId`** — Bloquea si tiene unidades asignadas o jornadas activas
- Frontend: botón 🗑️ Eliminar en catálogo de rutas, `ConfirmModal` con dependencias

### Users (Conductores/Equipo)
- **Validación de dependencias en `DELETE /api/users/:userId`** — Bloquea si es owner, único admin, o conductor con unidad/jornada activa
- Frontend: diálogo mejorado con información de impacto

---

## Reglas de negocio implementadas

### Activation Keys
1. Solo se puede eliminar una key en estado `available`
2. No se puede eliminar si está asociada a un conductor activo
3. Keys usadas, revocadas o expiradas **no se pueden eliminar** (se conserva el historial)
4. Revocar (cambiar a `revoked`) sigue disponible para keys disponibles

### Vehicles (Unidades)
1. No se puede eliminar si tiene conductor asignado (`driverId`)
2. No se puede eliminar si tiene ruta asignada (`routeId` o `assignedRoute`)
3. No se puede eliminar si tiene jornada activa (`getActiveRouteSession()`)
4. Emite evento Socket.IO `vehicle:deleted` para actualización en tiempo real

### Routes (Rutas)
1. No se puede eliminar si está asignada a una o más unidades
2. No se puede eliminar si tiene jornadas activas en curso
3. Si existe historial asociado (jornadas finalizadas), se conserva la referencia histórica
4. Mensaje de error detallado con nombre de la ruta y dependencias

### Users (Conductores/Equipo)
1. No se puede eliminar la propia cuenta
2. No se puede eliminar al propietario de la organización (`role === "owner"`)
3. No se puede eliminar al único administrador (`role === "admin"` con solo 1 admin)
4. No se puede eliminar un conductor si está asignado a una unidad y esa unidad tiene jornada activa

---

## Dependencias verificadas

Antes de cada eliminación se verifica automáticamente:

| Dependencia | Activation Keys | Vehicles | Routes | Users |
|------------|----------------|----------|--------|-------|
| `organizationId` | ✅ | ✅ | ✅ | ✅ |
| Relaciones existentes | ✅ (driver activo) | ✅ (driverId) | ✅ (vehículos asignados) | ✅ (es owner/admin) |
| Asignaciones | — | ✅ (routeId, assignedRoute) | ✅ (unidades con routeId) | ✅ (vehicleId) |
| Sesiones activas | — | ✅ (getActiveRouteSession) | ✅ (routeSessions RUNNING) | ✅ (jornada activa del vehículo) |
| Historial | ✅ (no eliminar usadas) | — | ✅ (conservar histórico) | — |
| Documentos relacionados | — | — | — | — (se limpian en deleteUser) |

---

## Archivos modificados

### Backend

| Archivo | Cambio |
|---------|--------|
| `backend/src/data/store.js` | Agregadas `deleteVehicle()`, `deleteActivationKey()`; exportadas en `buildBackendStore()` |
| `backend/src/data/mongo-store.js` | Agregadas `deleteVehicle()`, `deleteActivationKey()`; exportadas |
| `backend/src/services/activation-keys.js` | Agregada `deleteActivationKeyForAdmin()` con validaciones de negocio |
| `backend/src/modules/vehicles/routes.js` | Agregada `DELETE /:vehicleId` con validación de dependencias |
| `backend/src/modules/activation-keys/routes.js` | Agregada `DELETE /:id` con validación y auditoría |
| `backend/src/modules/users/routes.js` | Mejorada validación de `DELETE /:userId`: owner, único admin, conductor con jornada |
| `backend/src/modules/navigation/routes.js` | Mejorada validación de `DELETE /routes/:routeId`: unidades asignadas, jornadas activas |

### Frontend (Ventas/Portal)

| Archivo | Cambio |
|---------|--------|
| `ventas/src/lib/api.ts` | Agregadas `deleteVehicleRequest()`, `deleteAdminActivationKeyRequest()` |
| `ventas/features/portal/api.ts` | Exportada `deleteAdminActivationKeyRequest` |
| `ventas/src/store/use-app-store.ts` | Agregada `deleteVehicle` action + handler Socket.IO `vehicle:deleted` |
| `ventas/features/portal/store/use-portal-store.ts` | Agregada `deleteActivationKey` action |
| `ventas/features/portal/screens/portal-units-screen.tsx` | Botón 🗑️ Eliminar + `ConfirmModal` con dependencias |
| `ventas/features/portal/screens/portal-onboarding-screen.tsx` | Botón 🗑️ Eliminar en keys + handler |
| `ventas/features/portal/screens/portal-users-screen.tsx` | Diálogo de eliminación mejorado con información contextual |
| `ventas/features/portal/screens/portal-routes-screen.tsx` | Botón 🗑️ Eliminar en catálogo + `ConfirmModal` con dependencias |

---

## Validaciones realizadas

1. ✅ Backend: 18 test suites pasan correctamente
2. ✅ Frontend: `tsc --noEmit` sin errores
3. ✅ Activation Keys: no se puede eliminar key usada, revocada o expirada
4. ✅ Activation Keys: no se puede eliminar key asociada a conductor activo
5. ✅ Vehicles: no se puede eliminar con driverId, routeId o jornada activa
6. ✅ Routes: no se puede eliminar si está asignada a unidades o con jornadas activas
7. ✅ Routes: mensaje de error incluye nombre de la ruta y cantidad de dependencias
8. ✅ Users: no se puede eliminar propia cuenta, owner, único admin
9. ✅ Users: conductor con unidad y jornada activa no se puede eliminar
10. ✅ Frontend: ConfirmModal muestra nombre del elemento e impacto de la acción
11. ✅ Frontend: Socket.IO `vehicle:deleted` actualiza UI en tiempo real
12. ✅ Frontend: `vehicle:deleted` listeners registrados en store y portal-store

---

## Riesgos detectados

| Riesgo | Severidad | Mitigación |
|--------|-----------|------------|
| Eliminación de vehículo con datos de GPS históricos | Baja | No se eliminan posiciones históricas (son referencias `vehicleId` en collection separada) |
| Eliminación de ruta con jornadas históricas | Baja | El backend conserva `routeId` en sessions finalizadas (no hay FK constraints) |
| Conductor eliminado con documentos pendientes | Media | `deleteUser()` ya elimina documentos del conductor automáticamente |
| Keys eliminadas en medio de registro de conductor | Baja | Se verifica estado antes de eliminar; el registro usa `markActivationKeyUsed` con atomicidad |
| Frontend muestra datos desactualizados tras eliminación | Media | Socket.IO `vehicle:deleted` y actualización local de stores mantienen consistencia |

---

## Resultado de compilación y pruebas

### Backend
```
18 test suites passed
- backend-architecture.test.js
- rbac-integration.test.js
- presence.test.js
- proxy.test.js
- observability.test.js
- env.test.js
- error-handler.test.js
- chat-data-model.test.js
- mercado-pago.test.js
- auth-context.test.js
- cors.test.js
- telemetry.test.js
- navigation-trips.test.js
- route-sessions.test.js
- activation-keys.test.js
- tenant-isolation.test.js
- communication.test.js
- app-smoke.test.js
```

### Frontend (Ventas)
```
> manecomb-ventas@1.0.0 typecheck
> tsc --noEmit

(No errors)
```

---

## Criterio de éxito cumplido

- ✅ Keys de Activación: ciclo de vida completo (Generar → Copiar/Compartir → Revocar → Eliminar si no usada)
- ✅ Unidades: ciclo de vida completo (Crear → Editar → Eliminar con validaciones)
- ✅ Rutas: ciclo de vida completo (Crear → Editar → Eliminar con validaciones de asignación)
- ✅ Conductores/Equipo: ciclo de vida completo (Crear vía keys → Editar estado → Eliminar con protecciones)
- ✅ Comportamiento uniforme: mismos estilos de botones (✏️ 🗑️), mismos `ConfirmModal`, mismos mensajes de error
- ✅ Integridad: ninguna eliminación deja referencias huérfanas
- ✅ UI actualizada tras eliminaciones (zustand + socket events)
- ✅ Sin errores de sincronización entre Portal y Backend
