# ADM-GLOBAL-P1 — Shell, navegación, capabilities y overview

**Estado:** fusionado en `main`; certificación productiva autenticada pendiente  
**Merge:** `41aca028ca5e95078bf508af497a47c620389155`  
**Seguimiento:** `CERT-PROD-01` — issue #29

## Alcance integrado

- Cliente HTTP Platform aislado y compartido por autenticación y módulos administrativos.
- Consumo autenticado de `GET /api/platform/capabilities`.
- Consumo autenticado de `GET /api/platform/overview`.
- Navegación construida exclusivamente desde capacidades y permisos efectivos.
- Shell responsive independiente del Portal empresarial.
- Dashboard real con empresas, usuarios, unidades y órdenes cuando el rol lo permite.
- Estados de carga, acceso limitado, error, actualización y reintento.
- Cierre de sesión que limpia también el estado Platform.
- Rutas posteriores identificadas por fase, sin datos simulados ni acciones anticipadas.
- Prueba de contrato P1 obligatoria dentro del job `Admin Global build` de CI.

## Integración limpia

La rama P1 fue reconstruida sobre el P0 ya fusionado. El PR #28 quedó limitado a 14 archivos propios de P1 y no volvió a introducir ni modificar la lógica MFA fail-closed.

Validación previa al merge:

- CI `31058411787`: PASS.
- Dependency audit `31058411401`: PASS.
- Admin Global typecheck: PASS.
- `p1-contract.test.mjs`: PASS.
- Admin Global build: PASS.
- Fallback SPA: PASS.
- Backend, Mobile, Ventas, Communication Service e infraestructura: PASS.
- Android debug APK: PASS.

## Límites vigentes

P1 no implementa todavía la operación completa de:

- empresas;
- conciliación comercial;
- diagnóstico de sistema;
- auditoría paginada;
- personal interno Platform;
- gestión detallada de sesiones.

Esos alcances permanecen en P2, P3 y P4. La navegación puede identificarlos cuando las capabilities del rol los permiten, pero muestra un estado pendiente explícito.

## Certificación productiva pendiente

Antes de declarar Admin Global productivo debe comprobarse:

1. `PLATFORM_JWT_SECRET` y `PLATFORM_MFA_ENCRYPTION_KEY` configurados sin exponer valores.
2. Primer `platform_owner` en la base productiva correcta.
3. `https://admin.manecomb.com` permitido por el CORS real.
4. Login, TOTP, recuperación, refresh, revocación y expiración con Mongo productivo.
5. Capabilities y overview contra datos reales.
6. Responsive y estados de error en 360, 768, 1024, 1280 y 1440 px.

No se modificaron secretos, usuarios, MongoDB, Render, Cloudflare ni Producción durante esta integración.

## Veredicto

```text
ADM_GLOBAL_P0_MERGED
ADM_GLOBAL_P1_MERGED
ADM_GLOBAL_CODE_READY
ADM_GLOBAL_PRODUCTION_AUTH_CERT_PENDING
```
