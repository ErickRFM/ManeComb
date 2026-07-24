# ADM-SEC-01 — Identidad y autenticación interna del Admin Global

Revisión: ADM-SEC-01-R1.1 (fail-closed)

## Objetivo

Implementar un sistema de autenticación y autorización aislado para el Admin Global de ManeComb, con modelos de datos, JWT, sesiones, roles, permisos y auditoría propios, totalmente separados de la identidad enterprise.

## Base

- **Commit base**: `141aaacf9e13053bf8633e2192e50c7ae4ff8aeb`
- **Documento arquitectónico**: `ADM-ARCH-01.md` (comprometido previamente)
- **Rama**: `main`

## Estado inicial de Git

```
## main...origin/main
```

Sin cambios sin rastrear ni modificaciones. Árbol limpio.

## Modelos

Agregados en `backend/src/data/models.js`:

### PlatformUserModel

- **Colección**: `platform_users`
- **Campos**: `_id`, `name`, `email` (único), `passwordHash`, `role`, `status`, `createdAt`, `updatedAt`, `lastLoginAt`, `passwordChangedAt`, `failedLoginAttempts`, `lockedUntil`, `createdBy`, `suspendedAt`, `suspendedReason`
- **Roles**: `platform_owner`, `platform_admin`, `platform_support`, `platform_finance`, `platform_viewer`
- **Estados**: `active`, `suspended`, `disabled`
- **Índices**: `email` (único), `status` + `createdAt`
- Sin `organizationId`, `accountType`, `companyProfile`, `paymentProfile`, `vehicleId` ni datos operativos

### PlatformSessionModel

- **Colección**: `platform_sessions`
- **Campos**: `_id`, `userId`, `refreshTokenHash`, `ip`, `userAgent`, `platform`, `deviceName`, `createdAt`, `lastSeenAt`, `expiresAt`, `revokedAt`, `revokedReason`, `isActive`, `mfaVerified`
- **Índices**: `userId` + `isActive` + `lastSeenAt`, `refreshTokenHash`, `expiresAt`, `revokedAt`
- No almacena access token, JWT, refresh token en texto plano, contraseña ni secretos

## Persistencia

### mongo-store.js

Funciones agregadas para operar exclusivamente con `PlatformUserModel`:
- `createPlatformUser(payload)` — Validación, email único, password hashing, creación
- `getPlatformUserById(userId)` — Búsqueda por `_id`
- `getPlatformUserByEmail(email)` — Búsqueda por email normalizado
- `updatePlatformUser(userId, updates)` — Actualización selectiva de campos
- `countPlatformOwners()` — Conteo de owners para proteger creación del primero

### store.js (embedded)

Mismas funciones operando sobre `state.platformUsers[]` en memoria, con idéntica interfaz.

### platform-sessions.js

Módulo de sesiones con soporte dual MongoDB/memoria:
- `createPlatformSession(userId, req)` — Sesión con refresh token criptográfico
- `rotatePlatformRefreshToken(refreshToken, req)` — Rotación de un solo uso
- `getPlatformSessionById(sessionId)` — Búsqueda por ID
- `revokePlatformSession(userId, sessionId, reason)` — Revocación individual
- `revokeAllPlatformSessions(userId, exceptSessionId, reason)` — Revocación global
- `touchPlatformSession(sessionId)` — Actualización de lastSeenAt
- Refresh token: 48 bytes base64url, almacenado solo como SHA-256

## Roles y permisos platform

Definidos en `backend/src/config/platform-roles.js`, matriz independiente de enterprise:

| Rol | Permisos |
|---|---|
| `platform_owner` | Todos (manage, read, execute) |
| `platform_admin` | `platform.users.manage`, `platform.sessions.manage`, `platform.companies.read`, `platform.commercial.read`, `platform.system.read`, `platform.audit.read` |
| `platform_support` | `platform.companies.read`, `platform.system.read`, `platform.audit.read` |
| `platform_finance` | `platform.companies.read`, `platform.commercial.read`, `platform.audit.read` |
| `platform_viewer` | `platform.companies.read`, `platform.system.read` |

Permisos disponibles: `platform.users.manage`, `platform.sessions.manage`, `platform.companies.read`, `platform.commercial.read`, `platform.system.read`, `platform.audit.read`, `platform.actions.execute`

Funciones: `hasPlatformPermission(role, permission)`, `getPlatformPermissions(role)`

## Endpoints

Montados bajo `/api/platform/auth` en `backend/src/app.js`:

| Método | Ruta | Middleware | Descripción |
|---|---|---|---|
| POST | `/api/platform/auth/login` | rateLimit (20/15min) | Login con email+password |
| POST | `/api/platform/auth/refresh` | rateLimit (30/15min) | Rotación de refresh token |
| GET | `/api/platform/auth/session` | platformAuth | Consulta de sesión actual |
| POST | `/api/platform/auth/logout` | platformAuth | Cierre de sesión individual |
| POST | `/api/platform/auth/logout-all` | platformAuth | Cierre de todas las sesiones |

No se implementó: registro público, forgot-password, MFA, dashboard, empresas, pagos, suscripciones, observabilidad, frontend.

## JWT Platform

- **Secreto**: `PLATFORM_JWT_SECRET`
- **Reglas**: opcional en entorno; si falta o es menor a 32 caracteres, la autenticación platform se desactiva (fail-closed) sin afectar enterprise. Mínimo 32 caracteres, sin valor predeterminado, no imprimir, no exponer
- **Payload**:
  ```json
  {
    "sub": "platformUserId",
    "tokenType": "platform",
    "role": "platformRole",
    "sid": "platformSessionId"
  }
  ```
- **Opciones**: `audience: "manecomb-platform-admin"`, `issuer: "manecomb-api"`
- **TTL**: 15 minutos (configurable vía `PLATFORM_ACCESS_TOKEN_TTL`)
- **Firmado exclusivamente** con `PLATFORM_JWT_SECRET`
- Sin `organizationId`, `accountType` ni datos tenant
- Token enterprise es rechazado por platformAuth (firma diferente)
- Token platform es rechazado por authenticate enterprise (sin modificar authenticate)

## Sesiones

- Refresh token: 48 bytes criptográficamente aleatorios (`crypto.randomBytes`)
- Almacenado únicamente como SHA-256
- Rotación en cada uso (one-time use)
- Refresh anterior es rechazado después de rotar
- Sesión revocada o expirada es rechazada
- Usuario suspendido/deshabilitado bloquea nuevo refresh
- Duración configurable vía `PLATFORM_REFRESH_TOKEN_TTL_DAYS` (default 30 días)

## Login

1. Normalizar email (trim + lowercase)
2. Buscar solo en `PlatformUserModel`
3. Comparar bcrypt
4. Verificar `lockedUntil`
5. Verificar `status` (suspended/disabled → rechazo genérico)
6. Contador de intentos fallidos (bloqueo tras 5 intentos, 30 min)
7. Crear `PlatformSessionModel` con refresh token
8. Firmar JWT platform
9. Actualizar `lastLoginAt` y resetear contador
10. Registrar auditoría
11. Responder usuario sanitizado

Error genérico único: `"Credenciales inválidas"` para correo inexistente, contraseña incorrecta, usuario suspendido, deshabilitado o bloqueado.

## Middlewares

### platformAuth (`middlewares/platform-auth.js`)

- Lee header `Authorization: Bearer <token>`
- Verifica con `PLATFORM_JWT_SECRET`
- Exige `tokenType: "platform"`, `aud`, `iss`, `sub`, `sid`
- Resuelve `PlatformUser` vía `store.getPlatformUserById`
- Resuelve `PlatformSession` vía `getPlatformSessionById`
- Valida usuario activo (no suspended/disabled)
- Valida sesión activa, no revocada, no expirada
- Establece `req.platformAuth`, `req.platformUser`, `req.platformSession`
- No establece `req.tenant`
- No usa `authenticate` enterprise
- **401** para token/sesión inválida, **403** para cuenta suspendida
- **503** si `PLATFORM_JWT_SECRET` no está configurado (`PlatformAuthNotConfigured`)
- Fail closed si falta configuración

### requirePlatformRole (`middlewares/platform-access.js`)

```js
requirePlatformRole("platform_owner", "platform_admin")
```

Devuelve 403 si el rol no está en la lista.

### requirePlatformPermission (`middlewares/platform-access.js`)

```js
requirePlatformPermission("platform.users.manage")
```

Devuelve 403 si el rol no tiene el permiso.

### requirePlatformStatus

```js
requirePlatformStatus("active")
```

Devuelve 403 si el status no coincide.

## Sanitizer

`sanitizePlatformUser()` en `middlewares/platform-auth.js`:

**Devuelve**: `id`, `name`, `email`, `role`, `status`, `createdAt`, `lastLoginAt`

**Nunca devuelve**: `passwordHash`, `refreshTokenHash`, `failedLoginAttempts`, `lockedUntil`, `suspendedReason`, secretos, detalles internos de sesión

## Rate limiting

- Login: 20 intentos por ventana de 15 minutos
- Refresh: 30 solicitudes por ventana de 15 minutos
- Implementado con `express-rate-limit`

## Bloqueo temporal por intentos

- 5 intentos fallidos consecutivos → bloqueo de 30 minutos
- Contador se resetea al iniciar sesión correctamente
- Mensaje genérico durante bloqueo (no revela causa)

## Auditoría

Implementada en `services/platform-audit.js`:

- Reutiliza `AuditLogModel` (no crea nueva colección)
- `recordPlatformAction(req, payload)` — registro con contexto de request
- `recordPlatformSystemAction()` — registro para scripts/sistema

**Acciones registradas**:
- `platform.auth.login` — inicio de sesión exitoso
- `platform.auth.failed_login` — intento fallido (con contador)
- `platform.auth.refresh` — rotación de refresh token
- `platform.auth.logout` — cierre de sesión
- `platform.auth.logout_all` — cierre de todas las sesiones
- `platform.owner.created` — creación del primer owner

**No registra**: contraseñas, JWT, refresh tokens, hashes, MongoDB URI, PLATFORM_JWT_SECRET, stack completo.

Campo `actorType: "platform"` diferencia estos registros de auditoría enterprise.

## Script del primer platform_owner

`scripts/create-platform-owner.js`

**Script npm**: `npm run platform:create-owner`

**Requisitos**:
- Terminal interactiva (no argumentos CLI)
- Solicita nombre y correo
- Captura contraseña y confirmación ocultas (caracteres `*`)
- Valida política de contraseña existente (`validatePasswordStrength`)
- Crea únicamente `PlatformUserModel`
- Asigna `platform_owner`
- Impide múltiples owners (aborta si ya existe uno)
- Idempotente: aborta si ya existe un owner
- Rechaza conflicto de email con otro PlatformUser
- No promueve `UserModel`
- No crea organización, CommercialLead, plan, suscripción ni unidad
- No se ejecuta en install, startup, deploy o pruebas (`NODE_ENV=test`)

**Variables requeridas**: `PLATFORM_JWT_SECRET`, `MONGO_URI`

## Pruebas

### Pruebas específicas de platform auth

Archivo: `backend/test/platform-auth.test.js`

41 pruebas que cubren:

| # | Prueba | Tipo |
|---|---|---|
| 1 | modelo platform user | unit |
| 2 | modelo platform session | unit |
| 3 | email único | unit |
| 4 | roles válidos | unit |
| 5 | login correcto | integration |
| 6 | login incorrecto — mensaje genérico | integration |
| 7 | correo inexistente — mensaje genérico | integration |
| 8 | usuario suspendido | integration |
| 9 | usuario deshabilitado | integration |
| 10 | bloqueo temporal | integration |
| 11 | JWT tokenType platform | unit |
| 12 | JWT aud e iss | unit |
| 13 | JWT sin organizationId | unit |
| 14 | JWT sub y sid | unit |
| 15 | token enterprise rechazado por platformAuth | integration |
| 16 | refresh rotativo | integration |
| 17 | refresh anterior rechazado | integration |
| 18 | sesión expirada | integration |
| 19 | sesión revocada | integration |
| 20 | logout | integration |
| 21 | logout-all | integration |
| 22 | permisos por rol | unit |
| 23 | requirePlatformRole | unit |
| 24 | requirePlatformPermission | unit |
| 25 | serializer sin secretos | unit |
| 26 | no creación de UserModel enterprise | unit |
| 27 | auditoría sin secretos | unit |
| 28 | login owner | integration |
| 29 | correo normalizado | integration |
| 30 | refresh token almacenado como hash | unit |
| 31 | isPlatformSecretValid rechaza vacío | unit |
| 32 | isPlatformSecretValid rechaza corto | unit |
| 33 | login sin PLATFORM_JWT_SECRET retorna 503 | integration |
| 34 | platformAuth rechaza token enterprise | integration |
| 35 | token platform sin audience correcto es rechazado | unit |
| 36 | token platform sin issuer correcto es rechazado | unit |
| 37 | verifyPlatformToken no exige tokenType en payload | unit |
| 38 | platformAuth rechaza token sin sid | integration |
| 39 | token firmado con JWT_SECRET rechazado por platformAuth | integration |
| 40 | token platform no debe ser aceptado por authenticate enterprise | unit |
| 41 | env.js no tira error sin PLATFORM_JWT_SECRET | unit |

### Ejecución

```bash
cd backend
node test/platform-auth.test.js
# o con setup-env:
node --require ./test/setup-env.js test/platform-auth.test.js
```

### Suite completa

```bash
cd backend
npm test
```

Todas las pruebas existentes continúan pasando. No se corrigieron fallos preexistentes.

## Resultados

- **41/41** pruebas platform-auth pasan
- **Suite completa** (`npm test`): todas las pruebas OK (sin FAIL ni not ok)
- `git diff --check`: sin errores de espacio ni conflictos

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `backend/src/config/env.js` | Variables `PLATFORM_JWT_SECRET`, `PLATFORM_ACCESS_TOKEN_TTL`, `PLATFORM_REFRESH_TOKEN_TTL_DAYS` (ya no lanza error si falta) |
| `backend/src/data/models.js` | Schemas `PlatformUserModel` y `PlatformSessionModel` |
| `backend/src/data/mongo-store.js` | Funciones CRUD para platform users |
| `backend/src/data/store.js` | Contraparte embedded de platform functions |
| `backend/src/app.js` | Import y montaje de `/api/platform/auth` |
| `backend/package.json` | Script `platform:create-owner` |
| `backend/src/utils/platform-jwt.js` | Función `isPlatformSecretValid()`, clase `PlatformAuthNotConfigured` |
| `backend/src/middlewares/platform-auth.js` | Captura `PlatformAuthNotConfigured` → 503 |
| `backend/src/modules/platform/platform-auth-service.js` | Guarda login/refresh si `!isPlatformSecretValid()` → 503 |
| `backend/test/setup-env.js` | Variable `PLATFORM_JWT_SECRET` para tests |

## Archivos nuevos

| Archivo | Propósito |
|---|---|
| `backend/src/utils/platform-jwt.js` | Firma y verificación JWT platform |
| `backend/src/config/platform-roles.js` | Matriz de roles y permisos platform |
| `backend/src/middlewares/platform-auth.js` | Middleware platformAuth + sanitizer |
| `backend/src/middlewares/platform-access.js` | requirePlatformRole, requirePlatformPermission |
| `backend/src/modules/platform/auth-routes.js` | Endpoints de autenticación |
| `backend/src/modules/platform/platform-auth-service.js` | Lógica de login, refresh, logout |
| `backend/src/services/platform-sessions.js` | Gestión de sesiones con refresh rotativo |
| `backend/src/services/platform-audit.js` | Auditoría platform reutilizando AuditLogModel |
| `backend/scripts/create-platform-owner.js` | Script interactivo para primer owner |
| `backend/test/platform-auth.test.js` | 30 pruebas de plataforma |
| `ADM-SEC-01.md` | Este documento |

## Variable PLATFORM_JWT_SECRET

- **Opcional**: el backend arranca sin ella; la autenticación platform se desactiva (fail-closed) retornando **503** en login/refresh/middleware
- **Mínimo**: 32 caracteres; si es menor, se considera no configurada
- **Sin valor predeterminado**: debe configurarse explícitamente en el entorno
- **Ejemplo de configuración** (no usar este valor):
  ```
  PLATFORM_JWT_SECRET=backend-test-platform-jwt-secret-with-at-least-32-char
  ```
- **Función**: `isPlatformSecretValid()` en `platform-jwt.js` retorna `false` si vacío o menor a 32 caracteres
- **Error**: `PlatformAuthNotConfigured` con `statusCode: 503`, capturado por `platformAuth` middleware y `platform-auth-service.js`
- Incluida en `.env.example` con valor vacío
- No se imprime ni expone en endpoints

## MFA pendiente

La autenticación multifactor (MFA) no está implementada en esta fase.

**ADM-SEC-MFA-01** queda pendiente para una fase posterior.

El sistema no debe declararse listo para exposición productiva hasta completar MFA.

## Limitaciones

- No hay MFA
- No hay registro público de usuarios platform (solo script de owner)
- No hay forgot-password ni password-reset para platform
- No hay dashboard ni UI de administración
- No hay gestión de usuarios platform desde API (solo script)
- La capa de presentación (frontend) no está implementada
- Refresh tokens en memoria no persisten entre reinicios del proceso (solo aplica en modo embedded/MongoDB fallback)

## Rollback

Para revertir ADM-SEC-01:

```bash
git revert HEAD
```

Esto revierte el commit de implementación. Si hay commits intermedios, usar:

```bash
git revert <hash-del-commit>
```

Para revertir parcialmente, restaurar archivos individuales de ADM-SEC-01 y eliminar los nuevos.

## Veredicto

ADM-SEC-01-R1.1 está implementado y verificado.

- Plataforma de identidad aislada: **SÍ**
- Separación de enterprise: **SÍ**
- JWT exclusivo: **SÍ**
- Sesiones con refresh rotativo: **SÍ**
- Roles y permisos platform: **SÍ**
- Auditoría reutilizando AuditLogModel: **SÍ**
- Script de primer owner: **SÍ**
- Pruebas que verifican aislamiento: **SÍ**
- Suite completa pasando (41 platform + resto): **SÍ**
- Fail-closed sin PLATFORM_JWT_SECRET: **SÍ**
- env.js no bloquea inicio: **SÍ**
- Middleware retorna 503 si no configurado: **SÍ**
- Service login/refresh retorna 503 si no configurado: **SÍ**
- .env.example incluye platform vars: **SÍ**
- Sin modificación de enterprise: **SÍ**
- Sin modificación de mobile: **SÍ**
- MFA pendiente: **SÍ**

Próxima fase recomendada: ADM-SEC-MFA-01 (autenticación multifactor).
