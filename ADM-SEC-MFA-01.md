# ADM-SEC-MFA-01: Autenticación Multifactor (MFA) para Platform Admin

## Objetivo

Implementar TOTP-based MFA obligatorio para usuarios Platform con roles
sensibles (`platform_owner`, `platform_admin`), manteniendo el aislamiento
completo respecto a la autenticación enterprise.

## Decisiones técnicas

- **MFA pertenece exclusivamente a `PlatformUserModel`**. `UserModel`
  enterprise no tiene ningún campo MFA.
- **Clave de cifrado**: `PLATFORM_MFA_ENCRYPTION_KEY` (AES-256-GCM) para
  proteger secrets TOTP en reposo. Representación Base64 de exactamente 32
  bytes. No reutiliza `JWT_SECRET` ni `PLATFORM_JWT_SECRET`.
- **TOTP**: 6 dígitos, período 30s, SHA-1, ventana ±1 paso. Issuer
  `"ManeComb"`.
- **Challenge token**: `tokenType: "platform_mfa_challenge"`, 5min TTL,
  firmado con `PLATFORM_JWT_SECRET`. Rechazado por middleware `platformAuth`
  (que exige `tokenType === "platform"`).
- **Códigos de recuperación**: 10 códigos, `crypto.randomBytes(10)`,
  almacenados como hash SHA-256, uso único.
- **`PlatformSessionModel.mfaVerified`** es la fuente de verdad persistente.
- **Rate limiting**: 5 intentos fallidos → bloqueo de 30 minutos
  (independiente del rate limit de login).
- **Auditoría**: Eventos `platform.mfa.*` via `recordPlatformAction`.
  Severidad `warning` para uso de códigos de recuperación.
- **Fail-closed**: Sin `PLATFORM_MFA_ENCRYPTION_KEY` válida, toda operación
  MFA retorna 503. El arranque del backend no se ve afectado.

## Archivos modificados

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

## Archivos nuevos

| Archivo | Propósito |
|---|---|
| `backend/src/utils/platform-mfa-crypto.js` | Cifrado AES-256-GCM |
| `backend/src/utils/platform-totp.js` | TOTP (generación, verificación, URI) |
| `backend/src/modules/platform/platform-mfa-service.js` | Lógica de setup, confirm, verify, recovery |
| `backend/src/middlewares/platform-mfa-challenge.js` | Middleware que valida challenge token |
| `backend/test/platform-mfa.test.js` | 43 tests de MFA |

## Pruebas

- **platform-mfa.test.js**: 43 tests (fail-closed, crypto, TOTP, setup,
  confirm, login+MFA, verify, recovery, rate limit, middleware)
- **platform-auth.test.js**: 43 tests (regresión, sin cambios)
- **Total**: 86 tests, todos pasan

## Commit

```
54b0e82 ─→ feat(admin): add mandatory platform MFA
```
