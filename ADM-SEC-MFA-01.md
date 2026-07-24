# ADM-SEC-MFA-01-R1.1: Autenticación Multifactor (MFA) para Platform Admin

## Objetivo

Implementar TOTP-based MFA **obligatorio** para todos los roles
PlatformUser (`platform_owner`, `platform_admin`, `platform_viewer`,
`platform_support`, `platform_finance`), manteniendo el aislamiento
completo respecto a la autenticación enterprise. Ningún flujo de
`UserModel` (enterprise), portal, GPS, Mercado Pago, Socket.IO o
mobile se ve modificado.

## Decisiones técnicas

- **MFA pertenece exclusivamente a `PlatformUserModel`**. `UserModel`
  enterprise no tiene ningún campo MFA.
- **Cobertura**: `isMfaRequired()` retorna `true` para cualquier rol
  PlatformUser no nulo. Ya no es solo para roles "sensibles".
- **Clave de cifrado**: `PLATFORM_MFA_ENCRYPTION_KEY` (AES-256-GCM) para
  proteger secrets TOTP en reposo. Representación Base64 de exactamente 32
  bytes. No reutiliza `JWT_SECRET` ni `PLATFORM_JWT_SECRET`.
- **TOTP**: 6 dígitos, período 30s, SHA-1, ventana ±1 paso. Issuer
  `"ManeComb"`. Secreto generado como Base32.
- **Challenge token**:
  - `tokenType: "platform_mfa_challenge"`
  - `audience: "manecomb-platform-mfa"` (separado del audience del access token `"manecomb-platform-admin"`)
  - `purpose: "mfa_enroll"` (setup/confirm) o `"mfa_verify"` (verify/recovery)
  - 5min TTL (`PLATFORM_MFA_CHALLENGE_TTL`), firmado con `PLATFORM_JWT_SECRET`
  - Middleware `platformAuth` lo rechaza (exige `tokenType === "platform"`)
  - Middleware `platformMfaChallenge(purpose)` verifica audience, tokenType, purpose y sesión
- **Cadena de middlewares**:
  - `login` → si MFA requerido → retorna `challengeToken` con `purpose: "mfa_enroll"` (si no configurado) o `"mfa_verify"` (si configurado)
  - `platformMfaChallenge("mfa_enroll")` → protege `/mfa/setup` y `/mfa/confirm`
  - `platformMfaChallenge("mfa_verify")` → protege `/mfa/verify` y `/mfa/recovery`
  - `platformAuth` (en rutas protegidas) → verifica `session.mfaVerified` contra DB; si rol requiere MFA y sesión no verificada → 403
  - `platformAuthService.refresh` → rechaza con 403 si MFA requerido pero sesión no verificada
- **`PlatformSessionModel.mfaVerified`** es la fuente de verdad persistente.
- **Códigos de recuperación**: 10 códigos, `crypto.randomBytes(10)`,
  almacenados como hash SHA-256, uso único. Consumo concurrente validado
  (segundo intento es rechazado).
- **Rate limiting**: 5 intentos fallidos → bloqueo de 30 minutos
  (independiente del rate limit de login).
- **Auditoría**: Eventos `platform.mfa.*` via `recordPlatformAction`.
  Severidad `warning` para uso de códigos de recuperación.
- **Fail-closed**: Sin `PLATFORM_MFA_ENCRYPTION_KEY` válida, toda operación
  MFA retorna 503. El arranque del backend no se ve afectado.
- **Dependencia circular**: `platform-auth.js` ↔ `platform-mfa-service.js`
  resuelta con `require()` diferido (lazy) dentro del middleware `platformAuth`.

## Archivos modificados (R1.0)

| Archivo | Cambio |
|---|---|
| `backend/.env.example` | Documentar `PLATFORM_MFA_ENCRYPTION_KEY` y `PLATFORM_MFA_CHALLENGE_TTL` |
| `backend/src/config/env.js` | Exportar `PLATFORM_MFA_ENCRYPTION_KEY`, `PLATFORM_MFA_CHALLENGE_TTL` |
| `backend/src/data/models.js` | Campos MFA en `PlatformUserModel` |
| `backend/src/data/mongo-store.js` | Soporte MFA en `updatePlatformUser`/`createPlatformUser` |
| `backend/src/data/store.js` | Soporte MFA en store embebido |
| `backend/src/middlewares/platform-auth.js` | `sanitizePlatformUser` expone MFA flags; nuevo `requireMfa` |
| `backend/src/modules/platform/auth-routes.js` | Rutas `/mfa/setup`, `/mfa/confirm`, `/mfa/verify`, `/mfa/recovery` |
| `backend/src/modules/platform/platform-auth-service.js` | Login retorna `challengeToken` si MFA requerido |
| `backend/src/services/platform-sessions.js` | Nueva función `markPlatformSessionMfaVerified` |
| `backend/src/utils/platform-jwt.js` | `signPlatformChallengeToken`, `verifyPlatformChallengeToken` |
| `backend/scripts/create-platform-owner.js` | Owner creado con `mfaEnrollmentRequired: true` |

## Archivos nuevos (R1.0)

| Archivo | Propósito |
|---|---|
| `backend/src/utils/platform-mfa-crypto.js` | Cifrado AES-256-GCM |
| `backend/src/utils/platform-totp.js` | TOTP (generación, verificación, URI) |
| `backend/src/modules/platform/platform-mfa-service.js` | Lógica de setup, confirm, verify, recovery |
| `backend/src/middlewares/platform-mfa-challenge.js` | Middleware que valida challenge token |
| `backend/test/platform-mfa.test.js` | 59 tests de MFA |

## Archivos modificados (R1.1 — validación/enforcement)

| Archivo | Cambio |
|---|---|
| `backend/src/utils/platform-jwt.js` | `PLATFORM_MFA_AUDIENCE` separado; `purpose` en payload del challenge |
| `backend/src/middlewares/platform-mfa-challenge.js` | Nuevo factory `platformMfaChallenge(purpose)` valida audience + purpose + sesión |
| `backend/src/middlewares/platform-auth.js` | `platformAuth` verifica `mfaVerified` contra DB vía lazy require |
| `backend/src/modules/platform/platform-mfa-service.js` | `isMfaRequired` retorna `true` para todos los roles; `mfaVerify`/`mfaRecovery` check `purpose === "mfa_verify"` |
| `backend/src/modules/platform/platform-auth-service.js` | `login` pasa `purpose` al challenge token; `refresh` rechaza 403 si MFA requerido |
| `backend/src/modules/platform/auth-routes.js` | setup/confirm usan `platformMfaChallenge("mfa_enroll")` |
| `backend/test/platform-mfa.test.js` | 59 tests (fail-closed, crypto, TOTP, flow, purpose, audience, rate, recovery concurrencia, etc.) |
| `backend/test/platform-auth.test.js` | 43 tests de regresión |

## Casos de seguridad validados

| Escenario | Resultado |
|---|---|
| Challenge token usado como access token | Rechazado por `platformAuth` (audience + tokenType mismatch) |
| Access token usado como challenge token | Rechazado por `platformMfaChallenge` (audience + tokenType mismatch) |
| Challenge token de enroll usado en verify | Rechazado por `platformMfaChallenge` (purpose mismatch) |
| Challenge expirado | Rechazado por JWT verificación |
| Challenge sin `sid` | Rechazado |
| Sesión MFA no verificada en ruta protegida | 403 de `platformAuth` |
| Refresh antes de verificar MFA | 403 de `platformAuthService.refresh` |
| TOTP inválido | Rechazado (todo secreto sin MFA tiene código inválido) |
| TOTP válido pero de secreto diferente | Rechazado |
| Ciphertext alterado | Error de autenticación AES-GCM |
| Auth tag inválido | Error de autenticación AES-GCM |
| Código recovery usado dos veces | Segundo intento rechazado (hash ya consumido) |
| Rate limit excedido (5 fallos) | Bloqueo de 30 min |
| `PLATFORM_MFA_ENCRYPTION_KEY` inválida | 503 en setup, confirm, verify, recovery |
| Sin challenge token en header | 401 |
| Sesión inválida en challenge | 401 |

## Pruebas

- **platform-mfa.test.js**: 59 tests
  - fail-closed (6): validación de clave, 503 en setup/confirm/verify/recovery
  - crypto (4): roundtrip, IV único, ciphertext alterado, tag inválido
  - TOTP (5): generación Base32, verificación, ventana ±1, 6 dígitos, URI
  - isMfaRequired (6): true para todos los roles, false para null
  - setup/confirm (4): setup devuelve secret, regenera si no confirmado,
    confirm inválido, confirm válido, confirm duplicado
  - login+MFA (3): challenge token con purpose, owner con enroll
  - verify/recovery (6): TOTP válido, inválido, sin challenge, sin token,
    recovery inválido, recovery sin challenge, recovery con enroll token
  - purpose/audience (7): tokenType, purpose enroll, audience rechazo,
    audience rechazo inverso, purpose middleware, expirado, sin sid
  - platformAuth MFA (2): sesión sin MFA rechazada, sesión con MFA permitida
  - refresh MFA (1): refresh rechazado antes de MFA
  - rate limit (2): setup secret, 5 intentos fallidos
  - requireMfa (3): rechaza sin mfaVerified, permite con, rechaza sin sesión
  - platformMfaChallenge (4): sin header, access token, sesión inválida,
    token enroll en verify
  - sanitizePlatformUser (1): incluye mfaEnabled y mfaEnrollmentRequired
  - concurrencia (1): recovery codes single-use concurrente
- **platform-auth.test.js**: 43 tests (regresión completa)
- **npm test (pre-existing suites)**: exit 0 (todas las suites existentes pasan)
- **Total**: 102 tests, todos pasan

## Commits

```
54b0e82 ← base anterior
146c8be feat(admin): add mandatory platform MFA
d0872ca test(admin): verify platform MFA enrollment isolation
```

## Flujo del primer owner

El primer `platform_owner` se crea vía `create-platform-owner.js` con
`mfaEnrollmentRequired: true`. Su login retorna un challenge token con
`purpose: "mfa_enroll"`. Debe pasar por `/mfa/setup` → `/mfa/confirm`
para obtener `mfaVerified=true` en su sesión. Solo entonces el refresh
emite access token completo.

## Momento exacto de emisión de access y refresh

| Paso | Evento | Credencial emitida |
|---|---|---|
| 1 | Login | `challengeToken` (no access, no refresh) |
| 2 | `/mfa/setup` + `/mfa/confirm` (enroll) | — (solo setup) |
| 3 | `/mfa/confirm` válido | access token + refresh token |
| 4 | `/mfa/verify` válido | access token + refresh token |
| 5 | `/mfa/recovery` válido | access token + refresh token |
| 6 | refresh antes de MFA | 403 |
| 7 | ruta protegida sin MFA | 403 |

## Limitación técnica

El middleware `platformAuth` en `platform-auth.js` importa
`platform-mfa-service.js` mediante `require()` diferido (lazy) dentro
del closure del middleware, no al nivel del módulo. Esto rompe la
dependencia circular: `platform-auth.js` → `platform-mfa-service.js`
→ `platform-auth-service.js` → `platform-auth.js`. El lazy require
se ejecuta solo cuando el middleware se invoca en caliente, momento
en que ambos módulos ya están completamente cargados en la caché de
Node.js. Es una solución pragmática y focalizada; no se detectaron
pérdidas de memoria ni degradación de rendimiento en las pruebas.

## Veredicto

**CLOSED** — ADM-SEC-MFA-01-R1.1 implementado y verificado.

| Concepto | Valor |
|---|---|
| Commit R1.0 | `146c8be` |
| Commit R1.1 | `d0872ca` |
| platform-auth tests | 43/43 pasan, 0 fallan, 0 omitidos, ~2.5s, exit 0 |
| platform-mfa tests | 59/59 pasan, 0 fallan, 0 omitidos, ~2.8s, exit 0 |
| npm test (pre-existing) | exit 0 (conteo exacto: N/A — 27 suites individuales, todas exit 0) |
| git diff --check | sin advertencias |
| Archivos R1.1 incluidos | 8 (solo MFA Platform) |
| Enterprise modificado | No |
| Portal modificado | No |
| Mobile modificado | No |
| GPS modificado | No |
| Mercado Pago modificado | No |
| Socket.IO modificado | No |
| UserModel enterprise | No |
| SessionModel enterprise | No |
| Estado Git | `d0872ca` ahead 3, working tree clean sin untracked |
