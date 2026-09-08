# ManeComb — revisión semántica post-286 / recuperación de contraseña Admin Global — 2026-09-08

## Alcance

Esta revisión refresca la autoridad semántica desde `main@6c04591cd7c99214305206bc60adf860e6edee90` hasta `main@3eaf9adf3a88004b5d98fd8d3c009f154bcbb532` y revisa la propuesta de PR #289 (`feat/admin-password-recovery`).

## Ventana de `main` revisada

Los commits incorporados desde el baseline anterior corresponden al endurecimiento temporal de GPS offline, correcciones de dependencias `js-yaml` y su integración. La autoridad de tracking permanece en backend; los cambios de dependencias no introducen nuevas fuentes de verdad de negocio.

## PR #289 — recuperación de contraseña Platform

La recuperación de contraseña agrega dos operaciones públicas del namespace Platform: solicitud de recuperación y restablecimiento mediante token de propósito exclusivo. El cambio no desplaza la autoridad de identidad al frontend ni a Cloudflare:

- **Identidad Platform**: permanece en backend y en el modelo `PlatformUser`.
- **Contraseña**: la política, el hash y `passwordChangedAt` permanecen bajo autoridad del backend.
- **Token de recuperación**: es emitido y validado por backend con audiencia separada; no se persiste como credencial de sesión.
- **MFA**: no se desactiva ni se sustituye durante la recuperación; después del cambio, el acceso vuelve al flujo normal de login/MFA.
- **Sesiones**: el backend invalida las sesiones Platform existentes al completar el restablecimiento.
- **Enumeración de cuentas**: la solicitud responde de forma neutral exista o no el correo.
- **Transporte**: Admin Global continúa usando el proxy same-origin `/api/platform/*`; Cloudflare no decide identidad, rol ni autorización.

## Dependencias de seguridad detectadas al cerrar PR #289

Los gates de dependencias detectaron advisories recientes y se resolvieron sin relajar CI:

- `morgan` se actualizó a `^1.12.0`;
- `multer` se actualizó a `^2.3.0`;
- el lock de backend fue reparado por `npm audit fix --package-lock-only` para retirar los advisories transitivos aplicables, incluido `qs`;
- `nodemailer` se actualizó a `^9.1.1` dentro de `communication-service`, preservando compatibilidad con la línea Node >=18 declarada por el paquete;
- ambos árboles pasaron `npm audit --omit=dev --audit-level=high` después de la actualización.

## Gate físico

La PR no modifica runtime móvil, sensores, GPS, radio, permisos nativos ni hardware. La certificación física se declara `N/A`; el cambio es web/backend/correo y se valida mediante los gates de Admin Global, backend, integración y seguridad.

## Resultado

```text
MAIN_3EAF9AD_SEMANTICALLY_RECONCILED
PLATFORM_IDENTITY_REMAINS_BACKEND_AUTHORITATIVE
PASSWORD_RECOVERY_DOES_NOT_BYPASS_MFA
PASSWORD_RESET_INVALIDATES_OLD_PLATFORM_SESSIONS
CLOUDFLARE_REMAINS_TRANSPORT_ONLY
DEPENDENCY_ADVISORIES_PATCHED_WITHOUT_RELAXING_GATES
PHYSICAL_GATE_NOT_APPLICABLE_TO_WEB_BACKEND_ONLY_CHANGE
```

Se refrescan `baseline.commit` y `authorityReview.commit` a `main@3eaf9adf3a88004b5d98fd8d3c009f154bcbb532` sin ampliar los límites de drift (`5`).
