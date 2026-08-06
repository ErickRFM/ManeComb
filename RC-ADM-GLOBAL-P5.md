# ADM-GLOBAL-P5 — Acceso privado y despliegue Worker

**Rama consolidada:** `merge/adm-global-p2-p5-final`  
**Base funcional:** ADM-GLOBAL-P0 a P4  
**Estado:** código estabilizado; aprovisionamiento y certificación externa pendientes

## Alcance cerrado

- Protección origin-side de todo `/api/platform/*` mediante `Cf-Access-Jwt-Assertion`.
- Verificación RS256 contra JWKS, `issuer`, `audience`, expiración, `sub` y `type=app`.
- Cache temporal de JWKS, recarga única ante rotación de `kid` y respuesta fail-closed ante proveedor no disponible.
- Doble barrera: Cloudflare Access y autenticación Platform con sesión, MFA y RBAC.
- Preflight de configuración antes de que el backend escuche tráfico.
- Admin Global con API privada, cookie Access mediante `withCredentials` y runtime HTTPS validado.
- Hostname frontend restringido a `admin.manecomb.com` y API restringida a `admin-api.manecomb.com`.
- Worker estático reproducible mediante `wrangler.jsonc`, fallback SPA nativo y sin `_redirects` de Pages.
- `workers_dev=false` y `preview_urls=false` versionados.
- URLs técnicas de preview generadas por la integración de Git bloqueadas por el runtime productivo.
- CSP, anti-frame, no-index, cache privada y smoke posterior al build.
- Suites P0–P5 y contrato de entorno incorporados a gates permanentes.
- Renovación de sesión Platform antes del vencimiento y aislamiento de respuestas tardías después del logout.
- Invalidación de respuestas obsoletas en Empresas, Comercial, Sistema, Auditoría, Personal y Sesiones.
- Recuperación segura de acciones idempotentes fallidas o abandonadas, sin permitir otra solicitud con la misma clave.

## Estado operativo externo

El código se mantiene seguro con `PLATFORM_ACCESS_ENFORCEMENT_ENABLED=false` hasta completar:

1. `admin.manecomb.com` protegido por una aplicación Cloudflare Access.
2. `admin-api.manecomb.com` proxied y protegido por Access.
3. `PLATFORM_ACCESS_ISSUER` y `PLATFORM_ACCESS_AUDIENCE` reales en Render.
4. Las cuatro variables Vite privadas configuradas en el Worker.
5. Pruebas `403` sin Access, `401` con Access sin token Platform y `200` con ambas barreras.
6. Login, MFA, renovación, logout y acciones idempotentes con cuentas fixture reales.

No se versionan secretos, AUD, tokens, cookies o credenciales.

## Rollback

- Revertir el merge P5 o el release del backend.
- Retirar temporalmente el custom domain o restringir la política Access.
- Mantener `PLATFORM_ACCESS_ENFORCEMENT_ENABLED=false` mientras se corrige el aprovisionamiento externo.
- No habilitar un hostname alterno ni apuntar Admin Global al backend público como bypass.

## Veredicto

```text
ADM_GLOBAL_P2_P5_CODE_STABILIZED
ADM_GLOBAL_PRIVATE_HOSTS_ENFORCED
ADM_GLOBAL_EXTERNAL_ACCESS_CONFIG_PENDING
ADM_GLOBAL_PRODUCTION_AUTH_CERT_PENDING
```
