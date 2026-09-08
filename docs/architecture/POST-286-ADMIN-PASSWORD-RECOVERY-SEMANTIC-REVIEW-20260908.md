# ManeComb — revisión semántica post-286 / recuperación de contraseña Admin Global — 2026-09-08

## Alcance

Esta revisión cubre la evolución desde `main@6c04591cd7c99214305206bc60adf860e6edee90`, la integración de PR #286 y la integración final de PR #289 en `main@fe0ec43dff528eca19599630038daa4e128ef21d`.

## Ventana de `main` revisada

Los commits incorporados desde el baseline anterior corresponden al endurecimiento temporal de GPS offline, correcciones de dependencias de seguridad, la implementación de recuperación de contraseña de Admin Global y su integración. La autoridad de tracking permanece en backend; los cambios de dependencias no introducen nuevas fuentes de verdad de negocio.

## PR #289 — recuperación de contraseña Platform

La recuperación de contraseña agrega dos operaciones públicas del namespace Platform: solicitud de recuperación y restablecimiento mediante token de propósito exclusivo. El cambio no desplaza la autoridad de identidad al frontend ni a Cloudflare:

- **Identidad Platform**: permanece en backend y en el modelo `PlatformUser`.
- **Contraseña**: la política, el hash y `passwordChangedAt` permanecen bajo autoridad del backend.
- **Token de recuperación**: es emitido y validado por backend con audiencia separada; no se persiste como credencial de sesión.
- **MFA**: no se desactiva ni se sustituye durante la recuperación; después del cambio, el acceso vuelve al flujo normal de login/MFA.
- **Sesiones**: el backend invalida las sesiones Platform existentes al completar el restablecimiento.
- **Enumeración de cuentas**: la solicitud responde de forma neutral exista o no el correo.
- **Transporte**: Admin Global continúa usando el proxy same-origin `/api/platform/*`; Cloudflare no decide identidad, rol ni autorización.

## Dependencias de seguridad cerradas con PR #289

Los gates de dependencias detectaron advisories recientes y se resolvieron sin relajar CI:

- `morgan` se actualizó a `^1.12.0`;
- `multer` se actualizó a `^2.3.0`;
- el lock de backend fue reparado por `npm audit fix --package-lock-only` para retirar los advisories transitivos aplicables, incluido `qs`;
- `nodemailer` se actualizó a `^9.1.1` dentro de `communication-service`, preservando compatibilidad con la línea Node >=18 declarada por el paquete;
- ambos árboles pasaron `npm audit --omit=dev --audit-level=high` antes del merge y el Dependency audit de `main@fe0ec43` volvió a pasar después de la integración.

## Gate físico

PR #289 no modifica runtime móvil, sensores, GPS, radio, permisos nativos ni hardware. La certificación física se declaró `N/A`; el cambio es web/backend/correo y quedó cubierto por los gates de Admin Global, backend, integración y seguridad. El CI completo de la PR, incluida la certificación Android exigida por el repositorio, terminó en verde antes del merge.

## Rebaseline post-merge

El merge de una rama con varios commits hace que el contador de drift basado en `git rev-list` avance aunque la autoridad semántica ya haya sido revisada. Por ello, después de integrar PR #289 se fija la nueva evidencia canónica en `main@fe0ec43dff528eca19599630038daa4e128ef21d`. No se amplían los límites de drift ni se relaja ningún gate.

## Resultado

```text
MAIN_FE0EC43_SEMANTICALLY_RECONCILED
PLATFORM_IDENTITY_REMAINS_BACKEND_AUTHORITATIVE
PASSWORD_RECOVERY_DOES_NOT_BYPASS_MFA
PASSWORD_RESET_INVALIDATES_OLD_PLATFORM_SESSIONS
CLOUDFLARE_REMAINS_TRANSPORT_ONLY
DEPENDENCY_ADVISORIES_PATCHED_WITHOUT_RELAXING_GATES
PHYSICAL_GATE_NOT_APPLICABLE_TO_WEB_BACKEND_ONLY_CHANGE
POST_MERGE_AUDIT_BASELINE_REFRESHED_WITH_LIMITS_UNCHANGED
```

Se refrescan `baseline.commit` y `authorityReview.commit` a `main@fe0ec43dff528eca19599630038daa4e128ef21d` sin ampliar los límites de drift (`5`).
