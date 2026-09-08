# ManeComb — reconciliación post-280 para Admin Global same-origin — 2026-09-08

## Alcance

Esta reconciliación parte de `main@c95150a02a5e3b436103340b53c51af820e7dfc3`, después de integrar #278 y #280. Reaplica únicamente la preparación segura de Admin Global que había quedado aislada en #275 y evita arrastrar sus baselines históricos.

## Revisión semántica

Entre el baseline previo `f25de8df878c5f90d69c8113a5347da6e12bf010` y el `main` actual se integraron cambios de Ventas, filtrado de incidencias Mobile y observabilidad GPS. Ninguno mueve la autoridad de identidad, tenant, Platform RBAC, tracking, navegación, comunicación o release.

Para que una revisión semántica pueda refrescarse sin reescribir el mapa completo cuando su contenido no cambia, `system-audit-gates.json` registra ahora `authorityReview`: el commit hasta el que se revisó semánticamente el mapa. El validador exige que ese review descienda del baseline de procedencia del mapa y mantiene el mismo límite de frescura de 5 commits. No se relaja ningún gate.

## Admin Global

La preparación integrada mantiene estas fronteras:

- `admin.manecomb.com` es el único origen visto por el navegador.
- Cloudflare Access protege la aplicación privada y entrega `Cf-Access-Jwt-Assertion`.
- El Worker intercepta exclusivamente `/api/platform` y `/api/platform/*`.
- El Worker reenvía la assertion Access y los headers API permitidos a `https://manecomb.onrender.com`, pero no reenvía cookies.
- Render conserva la autoridad real: valida Access y después token Platform, sesión, MFA y RBAC.
- `admin-api.manecomb.com` y el origin Render no quedan expuestos como API directa del bundle.
- `workers.dev` y preview URLs permanecen desactivados para esta superficie.

La integración de repositorio no ejecuta un despliegue productivo: CI sólo ejecuta `wrangler deploy --dry-run`.

## Gate externo y físico

El corte real continúa en #279. Antes de declarar producción operativa deben configurarse y probarse Cloudflare Access/DNS/Worker y las variables Platform Access de Render. El navegador real debe demostrar `403` sin Access, `401` con Access pero sin token Platform y `200` con Access + Platform + MFA, además de los flujos de Admin y auditoría.

```text
MAIN_POST_280_RECONCILED
AUTHORITY_OWNERS_UNCHANGED
ADMIN_GLOBAL_REPO_PREPARATION_SAFE_TO_INTEGRATE_WITH_GREEN_GATES
PHYSICAL_GATE_ACCEPTED_PENDING
PRODUCTION_CUTOVER_STILL_PENDING_ISSUE_279
```
