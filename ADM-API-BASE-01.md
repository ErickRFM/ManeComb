# ADM-API-BASE-01 — Protected Platform API Foundation

## Revisión

ADM-API-BASE-01-R1.0

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

El árbol de trabajo incluye archivos de la fase ADM-API-BASE-01 y de RC-PORTAL-ROUTEUNITSELECTOR-01.
Este commit solo toca backend; los archivos de portal no se modifican ni revierten.

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `backend/src/app.js` | Monta `/api/platform/auth` y `/api/platform` con orden correcto |
| `backend/src/data/store.js` | Agrega `countVehiclesByStatus()` |
| `backend/src/data/mongo-store.js` | Agrega `countVehiclesByStatus()` con `VehicleModel.countDocuments` |

## Archivos nuevos

| Archivo | Propósito |
|---|---|
| `backend/src/modules/platform/index.js` | Routes `/api/platform`: `capabilities` y `overview` con handlers |
| `backend/src/utils/platform-errors.js` | `PlatformError` hierarchy con código, status, mensaje |
| `backend/src/utils/platform-filters.js` | Funciones de sanitización: `sanitizeText`, `sanitizeEnum`, `sanitizeDate`, `sanitizeBoolean`, `rejectMongoOperators` |
| `backend/src/utils/platform-pagination.js` | `parsePagination` y `buildPaginationMeta` |
| `backend/src/utils/platform-serializers.js` | `serializeCapabilities`, `serializeOverview`, `serializePaginationMeta`, `serializeError` |
| `backend/test/platform-api-base.test.js` | Tests para capabilities, overview, GPS spy, PlatformError |

## Stack

- Node.js con Express, supertest
- Middlewares existentes reutilizados: `platformAuth`, `requirePlatformPermission`, `readLimiter`, `errorHandler`
- Stores: embedded (estado en memoria) y mongo (Mongoose)

## Endpoints

| Ruta | Método | Auth | Permiso | Rate Limit | Descripción |
|---|---|---|---|---|---|
| `/api/platform/capabilities` | GET | platformAuth | `platform:admin` | readLimiter | Lista capacidades del sistema con paginación |
| `/api/platform/overview` | GET | platformAuth | `platform:admin` | readLimiter | Resumen: empresas, conductores, unidades, vehículos por estado |

### GET /api/platform/capabilities

Query params: `page` (default 1), `limit` (default 20, max 100).

Respuesta:
```json
{
  "data": [
    {
      "id": "vehicles",
      "name": "Gestión de Vehículos",
      "description": "Administración del parque automotor",
      "enabled": true
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 6,
    "pages": 1
  }
}
```

### GET /api/platform/overview

Query params: `page`, `limit` (ignorados — respuesta siempre única).

Respuesta:
```json
{
  "data": {
    "totalCompanies": 3,
    "totalDrivers": 15,
    "totalUnits": 25,
    "vehiclesByStatus": {
      "active": 10,
      "maintenance": 3,
      "inactive": 2
    }
  },
  "pagination": {
    "page": 1,
    "limit": 1,
    "total": 1,
    "pages": 1
  }
}
```

## GPS violation fix

El handler de `overview` originalmente llamaba `store.getLiveLocations()` para contar vehículos,
lo que constituye una violación de la regla que prohíbe el uso de datos GPS en este proyecto.

**Fix**: Se reemplazó `getLiveLocations()` por `store.countVehiclesByStatus()`, un método nuevo
que cuenta vehículos por estado (`active`, `maintenance`, `inactive`) sin involucrar ubicaciones GPS.

### Implementación de `countVehiclesByStatus()`

- **Embedded store** (`store.js`): filtra `state.vehicles` y cuenta por `status`
- **Mongo store** (`mongo-store.js`): usa `VehicleModel.countDocuments()` con filtro por `status`

### GPS spy test

El test `overview does not call getLiveLocations` en `platform-api-base.test.js` espía
`store.getLiveLocations` y verifica que nunca sea invocada durante un request a `/api/platform/overview`.

## Matriz de reutilización

| Componente | Origen | Uso |
|---|---|---|
| `platformAuth` | `backend/src/middlewares/platform-auth.js` | Auth de todos los endpoints platform |
| `requirePlatformPermission('platform:admin')` | `backend/src/middlewares/platform-access.js` | Permiso admin |
| `requireMfa` | `backend/src/middlewares/platform-access.js` | Exigencia MFA (disponible, no usado en estos endpoints) |
| `readLimiter` | `backend/src/middlewares/enterprise-rate-limit.js` | Rate limiting 100 req/min |
| `errorHandler` | `backend/src/middlewares/error-handler.js` | Error handling global |
| `PlatformRole.ADMIN` | `backend/src/config/platform-roles.js` | Constante de rol |
| `PlatformUser` | `backend/src/data/models/PlatformUser.js` | Modelo de usuario |
| `Company` | `backend/src/data/models/Company.js` | Modelo de empresa |
| `Driver` | `backend/src/data/models/Driver.js` | Modelo de conductor |
| `Unit` | `backend/src/data/models/Unit.js` | Modelo de unidad |
| `Vehicle` | `backend/src/data/models/Vehicle.js` | Modelo de vehículo |

## Seguridad

1. **MFA**: `platformAuth` ya verifica `session.mfaVerified` en línea 63. No se duplica.
2. **Permisos**: `requirePlatformPermission('platform:admin')` reutiliza la lógica existente.
3. **Sanitización**: `platform-filters.js` previene inyección NoSQL (MongoDB operators) y XSS.
4. **Rate limiting**: `readLimiter` (100 req/min) aplicado a ambos endpoints.
5. **Errores**: `PlatformError` se serializa con `serializeError` que oculta stack traces y detalles internos.
6. **JWT**: Los tokens se validan con `platform-jwt.js` (middleware existente).

## Tests

```
# platform-api-base.test.js
All 12/12 platform-api-base tests passed

# platform-auth.test.js (no regresión)
All 43/43 platform-auth tests passed

# platform-mfa.test.js (no regresión)
All 59/59 platform-mfa tests passed
```

### Cobertura de tests

1. **GET /api/platform/capabilities** — returns capabilities list with pagination
2. **GET /api/platform/capabilities** — supports custom page and limit
3. **GET /api/platform/capabilities** — enforces max limit (100)
4. **GET /api/platform/capabilities** — requires authentication
5. **GET /api/platform/capabilities** — requires platform:admin permission
6. **GET /api/platform/capabilities** — respects rate limiter
7. **GET /api/platform/overview** — returns overview with all counts
8. **GET /api/platform/overview** — requires authentication
9. **GET /api/platform/overview** — requires platform:admin permission
10. **GET /api/platform/overview** — respects rate limiter
11. **overview does not call getLiveLocations** — GPS spy
12. **PlatformError** — 404 status, message, traceId, sanitized envelope

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

O, para revertir manualmente:

```bash
git rm --cached \
  backend/src/modules/platform/index.js \
  backend/src/utils/platform-errors.js \
  backend/src/utils/platform-filters.js \
  backend/src/utils/platform-pagination.js \
  backend/src/utils/platform-serializers.js \
  backend/test/platform-api-base.test.js
git checkout -- \
  backend/src/app.js \
  backend/src/data/store.js \
  backend/src/data/mongo-store.js
```

## Veredicto

**CLOSED**

La API base de platform queda operativa con dos endpoints protegidos, autenticación,
MFA, permisos, rate limiting, sanitización, y tests completos. No se usa GPS.
