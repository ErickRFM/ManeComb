# Certificación de la ruleset de `main` — 2026-08-17

## Estado certificado

- Repositorio: `ErickRFM/ManeComb`.
- Rama objetivo: rama por defecto (`main`).
- Ruleset: `20485564`, nombre `Protect main`.
- Enforcement: `active`.
- Actores con bypass: ninguno.
- API de rama: `main.protected=true`.

## Reglas activas

- Los cambios a `main` deben entrar mediante Pull Request.
- El head debe probarse contra la versión más reciente de `main`.
- Todas las conversaciones de review deben quedar resueltas.
- Se bloquean eliminación y non-fast-forward/force-push.
- Se requieren estos contextos:
  - `Backend tests`
  - `Communication service tests`
  - `Mobile quality`
  - `Mobile Jest (Windows)`
  - `Android debug APK certification`
  - `Ventas build`
  - `Admin Global build`
  - `Infrastructure validation`
  - `Cross-layer audit contract`
  - `Production dependencies (backend)`
  - `Production dependencies (communication-service)`
  - `Production dependencies (mobile)`
  - `Production dependencies (ventas)`
  - `Production dependencies (admin-global)`

## Decisiones operativas

El repositorio tiene un único propietario y los Pull Requests de automatización se publican con su identidad. Por eso la ruleset exige el Pull Request y sus gates, pero no una autoaprobación imposible: `required_approving_review_count=0` y `require_code_owner_review=false`. `CODEOWNERS` sigue declarando la autoridad final.

La regla de firmas no está activa todavía. Los commits actuales de automatización son `unsigned`; GitHub sólo debe exigir firmas cuando el propietario configure y valide una llave real y el flujo automatizado sea compatible. Los merge commits creados por GitHub pueden aparecer verificados, pero eso no convierte retroactivamente los heads locales en commits firmados.

## Verificación

La certificación se realizó mediante las APIs de GitHub para:

1. leer la ruleset completa y comprobar sus condiciones, reglas y lista vacía de bypass;
2. leer `repos/ErickRFM/ManeComb/branches/main` y confirmar `protected=true`;
3. leer las reglas aplicables a `main` y confirmar Pull Request, required status checks, deletion y non-fast-forward.

Este archivo registra la autoridad auditada; la configuración efectiva continúa viviendo en GitHub y debe revalidarse si cambia la ruleset.
