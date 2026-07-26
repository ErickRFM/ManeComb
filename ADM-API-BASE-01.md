# ADM-API-BASE-01 — Protected Platform API Foundation

## Revisión

ADM-API-BASE-01-R1.1

## Objetivo

Agregar infraestructura de API protegida para el panel de administración global,
reutilizando los middlewares de auth, MFA y permisos existentes. Incluye dos endpoints
(`/api/platform/capabilities` y `/api/platform/overview`) que usan fuentes de datos reales
y no dependen de GPS.

## Commit base

| Concepto | Valor |
|---|---|
| HEAD | `44e8d87` refactor(admin-ui): separate global admin from sales |
| Working tree | sucio (archivos RC-PORTAL-ROUTEUNITSELECTOR-01 y ADM-API-BASE-01) |

## Correcciones R1.1

### Eliminación de platform:admin

Se eliminó todo uso de `platform:admin` y `PlatformRole.ADMIN`. Ahora los permisos se
derivan exclusivamente de `backend/src/config/platform-roles.js` vía `getPlatformPermissions(role)`.

### Eliminación de capabilities paginadas

`GET /api/platform/capabilities` ya no devuelve una lista paginada. Ahora retorna el
usuario sanitizado, sus permisos reales y los módulos derivados de permisos.

### Corrección de modelos inventados

No existen modelos `Company.js`, `Driver.js`, `Unit.js` separados. Las empresas se
derivan de `organizationId` en `UserModel`/`state.users`. Los conductores son usuarios
enterprise con role `"driver"`. Los vehículos son `VehicleModel`/`state.vehicles`.

### Confirmación de fuentes reales

- **Vehículos**: `VehicleModel` en Mongo, `state.vehicles` en embedded
- **Usuarios enterprise**: `UserModel` en Mongo, `state.users` en embedded
- **Órdenes comerciales**: `CommercialLeadModel` en Mongo, `state.commercialOrders` en embedded
- **Empresas**: derivadas de `organizationId` única en usuarios
- **Estados de vehículos**: `on-route`, `on_route`, `maintenance`, `idle` (el resto)

### Confirmación de no GPS

`store.countVehiclesByStatus()` no llama a `getLiveLocations()` en ninguna implementación.
Test GPS spy verifica que `getLiveLocations` nunca se invoca durante overview.

### Helpers conservados

| Helper | Archivo | Razón |
|---|---|---|
| `PlatformError` hierarchy | `platform-errors.js` | Errores tipados con statusCode |
| `sanitizeText/sanitizeEnum/sanitizeDate/sanitizeBoolean/rejectMongoOperators` | `platform-filters.js` | Sanitización de inputs |
| `parsePagination/buildPaginationMeta` | `platform-pagination.js` | Infraestructura para próximas listas |
| `serializePaginationMeta/serializeError` | `platform-serializers.js` | Serialización de paginación y errores |

### Helpers eliminados de serializers

Se eliminaron `serializeCapabilities` y `serializeOverview` porque el handler ahora
construye la respuesta directamente sin delegar en un serializer intermedio.

### Pruebas añadidas

Se agregaron 48 tests que cubren:

- **Filters (8)**: texto normalizado, longitud máxima, enum permitido, fecha ISO,
  booleano explícito, $ keys, anidados, no-objects
- **Pagination (7)**: defaults, inválidos, max limit, sort allowlist, order,
  metadata cero, varias páginas
- **Serializers (3)**: pagination meta, error con/sin detalles
- **PlatformError (2)**: error handler sanitizado, statusCode
- **Security (5)**: no token, challenge token, MFA false, sesión revocada,
  usuario suspendido
- **Capabilities (8)**: usuario sanitizado, permisos reales, módulos derivados,
  sin paginación, todas las roles (viewer, owner, support, finance)
- **Overview (7)**: modelos reales, GPS spy, unidad sin GPS, generatedAt,
  permisos, sin datos personales, counts con commercial
- **Audit (2)**: ambas rutas generan auditoría con metadata limpia
- **Mount (4)**: capabilities via createApp, overview via createApp,
  login montado, MFA routes montadas

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `backend/src/app.js` | Sin cambios (ya monta `/api/platform/auth` y `/api/platform`) |
| `backend/src/data/store.js` | `countVehiclesByStatus()` con estados reales |
| `backend/src/data/mongo-store.js` | `countVehiclesByStatus()` con `VehicleModel.countDocuments` |
| `backend/src/utils/platform-filters.js` | `rejectMongoOperators` recursivo para anidados |

## Archivos nuevos/modificados en R1.1

| Archivo | Cambio |
|---|---|
| `backend/src/modules/platform/index.js` | Rewrite: capabilities sin paginación, overview con generatedAt y secciones por permisos |
| `backend/src/utils/platform-serializers.js` | Eliminados `serializeCapabilities` y `serializeOverview` (solo quedan `serializePaginationMeta` y `serializeError`) |
| `backend/test/platform-api-base.test.js` | Reescribir completo: 48 tests de seguridad, capabilities, overview, helpers, audit, mount |

## Stack

- Node.js con Express, supertest
- Middlewares existentes reutilizados: `platformAuth`, `requirePlatformPermission`, `readLimiter`, `errorHandler`
- Stores: embedded (estado en memoria) y mongo (Mongoose)

## Endpoints

### GET /api/platform/capabilities

Auth: `platformAuth`
Rate limit: `readLimiter` (60 req/min)

```json
{
  "ok": true,
  "data": {
    "user": {
      "id": "...",
      "name": "...",
      "email": "...",
      "role": "platform_admin",
      "status": "active",
      "createdAt": "...",
      "lastLoginAt": null,
      "mfaEnabled": true,
      "mfaEnrollmentRequired": false
    },
    "permissions": [
      "platform.users.manage",
      "platform.sessions.manage",
      "platform.companies.read",
      "platform.commercial.read",
      "platform.system.read",
      "platform.audit.read"
    ],
    "modules": {
      "users": true,
      "sessions": true,
      "companies": true,
      "commercial": true,
      "system": true,
      "audit": true,
      "actions": false
    }
  }
}
```

### GET /api/platform/overview

Auth: `platformAuth`
Permission: `platform.companies.read`
Rate limit: `readLimiter` (60 req/min)

Secciones condicionales según permisos del usuario autenticado:

- `commercialOrders` solo si el usuario tiene `platform.commercial.read`
- `system` y `audit` reservados para expansión futura

```json
{
  "ok": true,
  "data": {
    "generatedAt": "2026-07-26T04:28:11.560Z",
    "companies": { "total": 3 },
    "users": {
      "total": 15,
      "byStatus": {
        "active": 10,
        "pending": 3,
        "suspended": 2
      }
    },
    "vehicles": {
      "total": 25,
      "byStatus": {
        "on_route": 10,
        "maintenance": 3,
        "idle": 2
      }
    }
  }
}
```

## Permisos reales usados

| Endpoint | Permiso | Origen |
|---|---|---|
| `/api/platform/capabilities` | Solo `platformAuth` | `platform-auth.js` |
| `/api/platform/overview` | `platform.companies.read` | `requirePlatformPermission` |
| Sección commercial | `platform.commercial.read` | Condicional en handler |

## Módulos derivados

Los módulos en capabilities se derivan de permisos vía `getPlatformPermissions(role)`:

| Módulo | Permiso requerido |
|---|---|
| `users` | `platform.users.manage` |
| `sessions` | `platform.sessions.manage` |
| `companies` | `platform.companies.read` |
| `commercial` | `platform.commercial.read` |
| `system` | `platform.system.read` |
| `audit` | `platform.audit.read` |
| `actions` | `platform.actions.execute` |

## Fuentes reales de overview

| Métrica | Fuente embedded | Fuente Mongo |
|---|---|---|
| `companies.total` | `new Set(state.users.filter(u => u.organizationId).map(u => u.organizationId)).size` | `UserModel.distinct("organizationId")` |
| `users.total` | `state.users.length` | `UserModel.countDocuments()` |
| `users.byStatus` | Filtro por `userStatus` | `UserModel.countDocuments({ userStatus })` |
| `vehicles.total` | `state.vehicles.length` | `VehicleModel.countDocuments()` |
| `vehicles.byStatus` | `countVehiclesByStatus()` | `countVehiclesByStatus()` |
| `commercialOrders` | `state.commercialOrders` (solo con permiso) | `CommercialLeadModel` (solo con permiso) |

## Modelos reales

| Concepto | Modelo Mongo | Store embedded |
|---|---|---|
| Empresa/organización | No hay modelo separado (`organizationId` en UserModel) | No hay entidad separada |
| Usuario enterprise | `UserModel` (schema `userSchema`) | `state.users` |
| Conductor | Usuario con `role: "driver"` | `state.users` filtrado |
| Vehículo | `VehicleModel` (schema `vehicleSchema`) | `state.vehicles` |
| Órdenes comerciales | `CommercialLeadModel` | `state.commercialOrders` |

## Estrategia Mongo

`countVehiclesByStatus()` usa `VehicleModel.countDocuments()` con filtros por status.
No carga documentos completos. Usa `$in` para `on-route`/`on_route`.

## Estrategia embedded

`countVehiclesByStatus()` filtra `state.vehicles` por `status`. No carga ni clona
documentos completos.

## Confirmación de no GPS

- `getLiveLocations()` nunca se llama desde capabilities ni overview
- `countVehiclesByStatus()` no depende de ubicaciones
- Test GPS spy: `store.getLiveLocations` es reemplazada por espía que falla si se invoca
- Unidad sin GPS (location=null) se cuenta correctamente
- Ubicación GPS sin unidad registrada no se cuenta

## Auditoría

Ambos endpoints registran mediante `recordPlatformAction()`:

| Ruta | Acción | Metadata |
|---|---|---|
| `/api/platform/capabilities` | `platform.capabilities.read` | `{ role }` |
| `/api/platform/overview` | `platform.overview.read` | `{ companies, users, vehicles, orders? }` |

No se incluyen tokens, Authorization header, respuesta completa ni secretos.

## Rate limit

`readLimiter` está definido localmente en `backend/src/modules/platform/index.js`:

```js
const readLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: "Demasiadas solicitudes. Intenta de nuevo mas tarde." }
});
```

Aplica únicamente a `/api/platform/capabilities` y `/api/platform/overview`.
No afecta auth, Portal, GPS ni comercial.

## Matriz de reutilización

| Componente | Archivo | Uso |
|---|---|---|
| `platformAuth` | `middlewares/platform-auth.js` | Auth de capabilities y overview |
| `requirePlatformPermission` | `middlewares/platform-access.js` | Permission gate en overview |
| `sanitizePlatformUser` | `middlewares/platform-auth.js` | Sanitiza usuario en capabilities |
| `recordPlatformAction` | `services/platform-audit.js` | Auditoría en ambos endpoints |
| `getPlatformPermissions` | `config/platform-roles.js` | Permisos reales por rol |
| `createPlatformSession` | `services/platform-sessions.js` | Sesiones en tests |
| `signPlatformToken` | `utils/platform-jwt.js` | Tokens en tests |
| `VehicleModel`/`UserModel`/`CommercialLeadModel` | `data/models.js` | Modelos reales |

## Pruebas

```
# platform-api-base.test.js — 48/48 tests
All filters (8), pagination (7), serializers (3), PlatformError (2)
Security (5), Capabilities (8), Overview (7), Audit (2), Mount (4)

# platform-auth.test.js — 43/43 passed (no regresión)
# platform-mfa.test.js — 59/59 passed (no regresión)
# npm test — exit 0 (suite completa)
```

## Archivos no incluidos

Los siguientes archivos están en el working tree pero NO pertenecen a este commit:

| Archivo | Fase |
|---|---|
| `ventas/features/portal/routes/components/route-unit-selector.tsx` | RC-PORTAL-ROUTEUNITSELECTOR-01 |
| `ventas/features/portal/screens/portal-routes-screen.tsx` | RC-PORTAL-ROUTEUNITSELECTOR-01 |
| `ADM-UI-RELOCATE-01.md` | CLOSED (typo pendiente) |

## Rollback

```bash
git revert <commit-hash> --no-edit
```

## Veredicto

**CLOSED**

ADM-API-BASE-01-R1.1 corrige contratos, permisos y fuentes reales. Los endpoints
usan exclusivamente permisos de `platform-roles.js`, modelos reales sin inventar,
sin GPS, con auditoría, rate limiting, sanitización, y 48 tests de cobertura.
