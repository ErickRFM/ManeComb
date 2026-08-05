# ADM-GLOBAL-P1 — Shell, navegación, capabilities y overview

**Rama:** `feat/adm-global-p1-shell`  
**Base apilada:** `fix/adm-global-p0-security`  
**Estado:** implementación técnica cerrada; pendiente de revisión y merge secuencial

## Alcance cerrado

- Cliente HTTP Platform aislado y compartido por autenticación y módulos administrativos.
- Consumo autenticado de `GET /api/platform/capabilities`.
- Consumo autenticado de `GET /api/platform/overview`.
- Navegación construida exclusivamente desde capacidades y permisos efectivos.
- Shell responsive independiente del Portal empresarial.
- Dashboard real con empresas, usuarios, unidades y órdenes cuando el rol lo permite.
- Estados de carga, acceso limitado, error y reintento.
- Cierre de sesión que limpia también el estado Platform.
- Rutas posteriores identificadas por fase sin datos simulados ni acciones anticipadas.
- Prueba frontend P1 obligatoria dentro del job `Admin Global build` de CI.

## Límites

P1 no implementa todavía listados de empresas, comercial, sistema, auditoría, personal interno, sesiones ni acciones administrativas. Esos alcances permanecen en P2, P3 y P4.

No se modificaron secretos, usuarios, MongoDB, Render, Cloudflare ni Producción.

## Certificación

- Admin Global typecheck: PASS
- Admin Global P1 contract test: PASS
- Admin Global build: PASS
- Fallback SPA: PASS
- Platform backend suites: PASS
- Environment contract: PASS
