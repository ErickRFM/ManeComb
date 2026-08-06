# ADM-GLOBAL-P5 — Acceso privado y despliegue Worker

**Rama:** `feat/adm-global-p5-private-access`  
**Base funcional:** ADM-GLOBAL-P0 a P4  
**Estado:** código cerrado; aprovisionamiento externo pendiente

## Alcance cerrado

- Protección origin-side de todo `/api/platform/*` mediante `Cf-Access-Jwt-Assertion`.
- Verificación RS256 contra JWKS, `issuer`, `audience`, expiración, `sub` y `type=app`.
- Cache temporal de JWKS y respuesta fail-closed ante configuración o proveedor no disponible.
- Doble barrera: Cloudflare Access y autenticación Platform con sesión, MFA y RBAC.
- Preflight de configuración antes de que el backend escuche tráfico.
- Admin Global con API privada, cookie Access mediante `withCredentials` y runtime HTTPS validado.
- Worker estático reproducible mediante `wrangler.jsonc`, fallback SPA nativo y sin `_redirects` de Pages.
- `workers.dev` y Preview URLs desactivados para evitar hostnames alternos públicos.
- CSP, anti-frame, no-index, cache privada y smoke posterior al build.
- Suites P0-P5 y contrato de entorno incorporados a gates permanentes.

## Estado operativo externo

El código se mantiene seguro con `PLATFORM_ACCESS_ENFORCEMENT_ENABLED=false` hasta completar:

1. `admin.manecomb.com` protegido por una aplicación Cloudflare Access.
2. `admin-api.manecomb.com` proxied y protegido por Access.
3. `PLATFORM_ACCESS_ISSUER` y `PLATFORM_ACCESS_AUDIENCE` reales en Render.
4. Pruebas `403` sin Access, `401` con Access sin token Platform y `200` con ambas barreras.

No se versionan secretos, AUD, tokens, cookies o credenciales.

## Rollback

- Revertir el merge P5 o el release del backend.
- Mantener `PLATFORM_ACCESS_ENFORCEMENT_ENABLED=false` mientras se corrige el aprovisionamiento externo.
- No habilitar `workers.dev` ni apuntar Admin Global al hostname público del backend como bypass.
