# ADM-UI-AUTH-01 — Frontend Admin Authentication & MFA UI

## Revisión

ADM-UI-AUTH-01-R1.1

> **Nota de reubicación (ADM-UI-RELOCATE-01):** El código documentado en este archivo
> fue migrado de `ventas/features/admin/` a `admin-global/features/auth/` como aplicación
> independiente. Ver `ADM-UI-RELOCATE-01.md` para detalles. La ubicación actual es
> `admin-global/features/auth/`; el contenido de este documento sigue siendo válido
> para el módulo reubicado.

## Objetivo

Verificar y cerrar el flujo real de autenticación frontend Platform:

- login, enrolamiento, confirmación MFA, recovery codes, verificación TOTP,
  recuperación, sesión, refresh, logout, guards, almacenamiento,
  contratos con backend, pruebas, documentación, commit limpio.

## Commit base

| Concepto | Valor |
|---|---|
| HEAD | `e083912` fix(ci): restore mobile and ventas checks |
| Commit UI original | `2fae9f7` feat: add admin MFA UI and align operational states |
| Commit corrección | *(este commit)* fix(admin-ui): close platform authentication flow |
| Working tree | limpio |

### Contenido real de f95cb8b

`f95cb8b` docs(admin): close ADM-SEC-MFA-01-R1.1 with final documentation
→ Solo modificó `ADM-SEC-MFA-01.md` (57 inserciones, 2 eliminaciones).
→ No contiene cambios de código. Es documentación de cierre del backend MFA.

### Contenido real de 2fae9f7

`2fae9f7` feat: add admin MFA UI and align operational states
→ 32 archivos, 2542 inserciones, 103 eliminaciones.
→ Incluye `ventas/features/admin/` (admin UI), archivos mobile RC y cambios de portal.

## Ubicación del módulo

`ventas/features/admin/`

```
ventas/features/admin/
├── api.ts                         # Cliente HTTP Platform (axios)
├── store.ts                       # Zustand store (useAdminStore)
├── types.ts                       # Tipos compartidos
├── screens/
│   ├── admin-login-screen.tsx     # Login email/password
│   ├── admin-mfa-setup-screen.tsx # QR + TOTP + backup codes
│   ├── admin-mfa-verify-screen.tsx# TOTP verify + recovery
│   └── admin-placeholder-screen.tsx # Panel placeholder autenticado
└── components/
    ├── admin-auth-layout.tsx      # Shell visual para auth
    └── admin-route-guard.tsx      # Guards: login, enroll, challenge, protected
```

## Rutas

| Ruta | Componente | Guard |
|---|---|---|
| `/admin/login` | AdminLoginScreen | AdminLoginGuard |
| `/admin/mfa/setup` | AdminMfaSetupScreen | AdminMfaEnrollGuard |
| `/admin/mfa` | AdminMfaVerifyScreen | AdminMfaChallengeGuard |
| `/admin` | AdminPlaceholderScreen | AdminProtectedRoute |

## Contratos backend (ninguno modificado)

| Endpoint | Método | Request | Headers | Response success | Códigos error |
|---|---|---|---|---|---|
| `/api/platform/auth/login` | POST | `{ email, password }` | — | `{ ok, data: { token?, refreshToken, session, user?, mfaRequired?, mfaNeedsSetup?, challengeToken? } }` | 400, 401, 503 |
| `/api/platform/auth/refresh` | POST | `{ refreshToken }` | — | `{ ok, data: { token, refreshToken, session } }` | 400, 401, 403, 503 |
| `/api/platform/auth/session` | GET | — | `Authorization: Bearer <token>` | `{ ok, data: { user, session } }` | 401, 403, 503 |
| `/api/platform/auth/logout` | POST | — | `Authorization: Bearer <token>` | `{ ok, data: { message } }` | 401, 503 |
| `/api/platform/auth/logout-all` | POST | — | `Authorization: Bearer <token>` | `{ ok, data: { message, revokedCount } }` | 401, 503 |
| `/api/platform/auth/mfa/setup` | POST | — | `Authorization: Bearer <challengeToken>` | `{ ok, data: { secret, uri } }` | 401, 404, 409, 503 |
| `/api/platform/auth/mfa/confirm` | POST | `{ token }` | `Authorization: Bearer <challengeToken>` | `{ ok, data: { backupCodes } }` | 400, 401, 404, 409, 429, 500, 503 |
| `/api/platform/auth/mfa/verify` | POST | `{ challengeToken, token }` | — | `{ ok, data: { token, session, user } }` | 400, 401, 403, 429, 500, 503 |
| `/api/platform/auth/mfa/recovery` | POST | `{ challengeToken, recoveryCode }` | — | `{ ok, data: { token, session, user } }` | 400, 401, 403, 503 |

## Storage definitivo

| Clave | Ubicación | Contenido |
|---|---|---|
| `manecomb-platform-token` | localStorage | Access token JWT |
| `manecomb-platform-refresh-token` | localStorage | Refresh token JWT |
| `manecomb-platform-challenge` | sessionStorage | Challenge MFA (eliminado tras éxito/logout) |

No se reutilizan:
- `manecomb-ventas-token` (ventas)
- `admin-platform-token` ni `admin-platform-refresh-token` (legacy, migrados automáticamente)

## Tratamiento del challenge

- Se almacena en memoria (Zustand) + sessionStorage (`manecomb-platform-challenge`).
- No se persiste en localStorage.
- Se elimina después de: verify exitoso, recovery exitoso, logout, error de expiración, cancelación.
- Tiene clave separada en sessionStorage.
- Nunca se confunde con accessToken o refreshToken.
- No se imprime en consola.
- No se coloca en URL.
- No se envía a telemetría.

## Login

**POST /api/platform/auth/login**

### mfa_enroll
- Conserva challenge (memoria + sessionStorage).
- No guarda access token.
- No guarda refresh token.
- Limpia contraseña (estado local del componente, liberado al desmontar).
- Redirige a `/admin/mfa/setup`.

### mfa_verify
- Conserva challenge (memoria + sessionStorage).
- No guarda access token.
- No guarda refresh token.
- Limpia contraseña.
- Redirige a `/admin/mfa`.

### acceso completo
- Almacena access + refresh tokens cuando el backend entrega credenciales de sesión con MFA verificado.
- No acepta un challenge como acceso completo.

## Setup

**POST /api/platform/auth/mfa/setup** (método real: POST, no GET)
- Exige challenge `mfa_enroll` (validado por `platformMfaChallenge("mfa_enroll")` backend).
- No solicita contraseña actual (el challenge token ya autentica).
- Usa POST.
- Recibe provisioning URI y clave manual.
- Genera QR localmente con librería `qrcode` (cliente, sin servicios externos).
- Request: body vacío, header `Authorization: Bearer <challengeToken>`.
- Response: `{ ok, data: { secret, uri } }`.

## Confirm

**POST /api/platform/auth/mfa/confirm**
- Envía TOTP de 6 dígitos.
- Recibe recovery codes (una sola vez).
- El backend **no entrega access/refresh tokens** en confirm (solo `backupCodes`).
- Después de confirm:
  1. Se eliminan inmediatamente: contraseña, secreto manual, provisioning URI, QR, TOTP, challenge.
  2. Se muestran recovery codes una sola vez.
  3. Se exige confirmación manual de almacenamiento (checkbox + botón habilitado).
  4. Se permite copiar códigos individuales o todos como bloque.
  5. Después de confirmar guardado, se redirige a `/admin/login`.
  6. El usuario debe iniciar sesión nuevamente para obtener un challenge `mfa_verify`.
- No se guardan recovery codes en localStorage, sessionStorage, ni Zustand persistente.
- No permanecen después de navegar.

## Recovery codes

- Se muestran una sola vez.
- No se guardan en localStorage, sessionStorage, ni Zustand persistente.
- No se imprimen en consola.
- No permanecen después de navegar (estado local del componente).
- Se permite: copiar uno, copiar todos como bloque, marcar confirmación manual.
- Después de confirmar: se limpia memoria y se navega a `/admin/login`.

## Verify

**POST /api/platform/auth/mfa/verify**
- Envía `{ challengeToken, token }`.
- Después de éxito:
  1. Guarda access token de la respuesta.
  2. Llama a refresh con el refreshToken guardado del login (no con el access token).
  3. Guarda nuevo par access + refresh.
  4. Elimina challenge.
  5. Elimina TOTP ingresado.
  6. Consulta `/session`.
  7. Establece `authenticated`.
  8. Redirige a `/admin`.
- Después de error:
  1. Limpia código ingresado.
  2. Conserva challenge (sigue válido).
  3. Muestra error genérico.
  4. No crea sesión autenticada.

## Recovery

**POST /api/platform/auth/mfa/recovery**
- Envía `{ challengeToken, recoveryCode }`.
- Flujo idéntico a verify después del éxito/error.

## Refresh

**POST /api/platform/auth/refresh** (no `/api/auth/refresh`)
- Se evita refresh cuando:
  - Solo existe challenge (no hay session).
  - No existe refresh token Platform.
  - La sesión está en `mfa_enrollment` o `mfa_challenge`.
  - El backend responde 403 pre-MFA.
  - El backend responde 503.
  - Ya hay refresh en progreso (no implementado interceptor).
- Ante fallo definitivo: limpia solo almacenamiento Platform.
- No borra Portal, no borra token enterprise.
- Redirige a `/admin/login`.
- No hay loop de interceptores (el store no configura interceptores automáticos).

## Guards

### AdminLoginGuard (`/admin/login`)
- authenticated válido → `/admin`
- no autenticado → renderiza login

### AdminMfaEnrollGuard (`/admin/mfa/setup`)
- challenge `mfa_enroll` → renderiza setup
- otro estado → `/admin/login`

### AdminMfaChallengeGuard (`/admin/mfa`)
- challenge `mfa_verify` → renderiza verify
- otro estado → `/admin/login`

### AdminProtectedRoute (`/admin`)
- Requiere access token Platform.
- Consulta `GET /api/platform/auth/session`.
- Requiere `mfaVerified === true`.
- Rechaza challenge.
- Rechaza token Portal (clave de storage diferente).
- Rechaza token enterprise (clave de storage diferente).
- No confía solo en existencia del token en localStorage.

## Store (useAdminStore)

Completamente separado del Portal. Estados:

```
idle → login → loading → mfa_enrollment | mfa_challenge | authenticated | error
```

**No persiste:**
- password (en useState, liberado al desmontar)
- challengeToken en localStorage (solo sessionStorage + memoria)
- TOTP ingresado
- recovery code ingresado
- recovery codes generados
- provisioning URI
- secreto TOTP
- QR data URL
- respuesta completa del backend

**Persiste únicamente:**
- `manecomb-platform-token` (localStorage)
- `manecomb-platform-refresh-token` (localStorage)

El usuario se obtiene nuevamente desde `/session`.

## QR

- Dependencia `qrcode` ya existente en `ventas/package.json` desde antes de esta fase.
- No se agregó ninguna dependencia nueva.
- `@types/qrcode` también preexistente.
- El QR se genera completamente en cliente (`QRCode.toDataURL`).
- No se envía provisioning URI a servicios externos.
- Verificación: `git log --oneline -- ventas/package.json` muestra que `qrcode` no aparece en commits de admin.

## Pruebas

- `ventas/package.json` **no tiene script `npm test`**.
- Solo existen scripts: `dev`, `build`, `preview`, `typecheck`.
- **NO_TEST_SCRIPT** — no hay runner de tests.
- No se agregó infraestructura de testing (no existía previamente).
- Validaciones estáticas ejecutadas:
  - `npm run typecheck` → **aprobado** (0 errores)
  - `npm run build` → **aprobado** (build exitoso)

### Verificaciones manuales realizadas

| Aspecto | Estado |
|---|---|
| login usa POST con email/password | ✓ |
| login enroll conserva challenge, no guarda tokens | ✓ |
| login verify conserva challenge, no guarda tokens | ✓ |
| challenge fuera de localStorage | ✓ (sessionStorage + memoria) |
| setup usa POST (no GET) | ✓ |
| confirm no entrega access/refresh (backdoor) | ✓ documentado |
| confirm almacena solo backupCodes | ✓ |
| recovery codes no persisten en storage | ✓ |
| confirm redirige a login (por diseño backend) | ✓ |
| verify autentica + guarda tokens | ✓ |
| recovery autentica + guarda tokens | ✓ |
| refresh usa endpoint Platform | ✓ |
| refresh usa refreshToken real (no access token) | ✓ corregido |
| Portal storage intacto | ✓ (claves diferentes) |
| logout limpia solo Platform | ✓ |
| guards corrigen purpose | ✓ |
| /admin valida session + mfaVerified | ✓ |
| `admin-platform-*` migrado a `manecomb-platform-*` | ✓ |

## Typecheck

```
npm run typecheck
→ 0 errors
```

## Build

```
npm run build
→ ✓ built in ~7s
→ Chunks admin: admin-auth-layout (2 kB), admin-login-screen (3 kB),
  admin-placeholder-screen (4 kB), admin-mfa-verify-screen (4 kB),
  admin-mfa-setup-screen (7 kB)
```

## Archivos modificados (esta corrección)

| Archivo | Cambio |
|---|---|
| `ventas/features/admin/store.ts` | Storage keys migradas; challenge en sessionStorage; refreshToken guardado en challenge; verify/recovery usan refreshToken real; migración automática old→new keys; confirm limpia sessionChallenge |
| `ventas/features/admin/types.ts` | `AdminChallengeData.refreshToken` agregado |
| `ventas/features/admin/screens/admin-mfa-setup-screen.tsx` | Backup codes: copia individual, copia todos, checkbox confirmación; limpieza de secret/uri/qr/código después de confirm |
| `ventas/features/admin/screens/admin-login-screen.tsx` | Import `router` eliminado (no usado) |
| `ventas/features/admin/components/admin-route-guard.tsx` | `AdminProtectedRoute` verifica sesión MFA vía `GET /session`; fallback a sessionStorage para challenge |

## Archivos nuevos (fase completa)

Ninguno en esta corrección. Los archivos del módulo se crearon en `2fae9f7`.

## Limitaciones

1. **Backend no entrega tokens en mfa/confirm** — por diseño de seguridad (requiere re-login con MFA). Documentado como decisión arquitectónica, no como bloqueo.
2. **Sin tests automatizados** — `npm test` no existe en el proyecto. Solo validación estática.
3. **Sin interceptor de refresh automático** — el store no configura interceptores axios; los calls a refresh son explícitos.
4. **Sin soporte mobile** — el módulo está en `ventas/` (web). Mobile no está cubierto.

## Rollback

```bash
git checkout 2fae9f7 -- ventas/features/admin/ ventas/src/App.tsx ADM-UI-AUTH-01.md
```

## Veredicto

**CLOSED**

Todas las verificaciones de ADM-UI-AUTH-01-R1.1 se completaron satisfactoriamente.
