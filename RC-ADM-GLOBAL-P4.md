# ADM-GLOBAL-P4 — Gobierno interno y acciones controladas

**Estado:** cerrado e integrado en la consolidación P2-P5.

## Alcance

- Personal Platform paginado y sanitizado.
- Alta interna con contraseña temporal y MFA obligatorio.
- Sesiones sanitizadas sin IP, user-agent ni hashes.
- Acciones owner-only con razón, confirmación e Idempotency-Key.
- Protección de la sesión actual, auto-modificación y último owner.
- Revocación de sesiones al suspender o cambiar privilegios.
- Auditoría de lecturas, altas y acciones sensibles.
- Pantallas responsive de Personal y Sesiones.
- Pruebas backend, HTTP y frontend incorporadas a gates permanentes.

No habilita acciones empresariales o comerciales destructivas.
