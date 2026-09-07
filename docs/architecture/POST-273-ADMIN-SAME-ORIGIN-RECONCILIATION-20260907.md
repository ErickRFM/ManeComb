# ManeComb — reconciliación semántica post-273 y Admin same-origin — 2026-09-07

## Alcance

Esta revisión refresca los baselines de auditoría desde `main@7a8c015756204f8b9e322fbedec777fbdd0e3806` hasta `main@f25de8df878c5f90d69c8113a5347da6e12bf010` y audita el cambio de topología propuesto por PR #275 sin cambiar propietarios de autoridad.

## Ventana revisada de `main`

| Commit | Clasificación | Decisión semántica |
|---|---|---|
| `d2ddb963` | Mobile UX/lifecycle | Preserva foco del teclado al usar Next en login; no cambia autenticación, sesión ni autoridad de identidad. |
| `c4698638` | Merge metadata | Integra la corrección de teclado; sin decisión adicional de autoridad. |
| `270f1711` | Mobile presentation | Respeta el safe inset del aviso de conexión; no cambia conectividad, sesión ni estado remoto. |
| `d2eebb0e` | Merge metadata | Integra el ajuste visual; sin decisión adicional de autoridad. |
| `586b0514` | Backend GPS consistency | Espera la unidad enriquecida antes de publicar la actualización realtime. Conserva al backend como autoridad de tracking y evita perder identidad de vehículo por orden asíncrono. |
| `f25de8df` | Merge metadata | Integra la regresión GPS y su prueba; no introduce una segunda autoridad. |

Resultado: no se detecta cambio de propietario en identity, tenant, capabilities, tracking, navigation, communication, Platform RBAC ni release authority. El mapa puede refrescar su baseline a `f25de8df878c5f90d69c8113a5347da6e12bf010` conservando esas decisiones.

## PR #275 — Admin Global same-origin

### Síntoma

`admin.manecomb.com` carga el frontend, pero el login productivo puede terminar como `Network Error` antes de recibir una respuesta HTTP útil porque el navegador cruza a `admin-api.manecomb.com`, una segunda frontera de Cloudflare Access/CORS.

### Cambio de topología

```text
browser
  -> admin.manecomb.com
  -> Cloudflare Access
  -> Worker manecomb-admin
       ├─ Static Assets
       └─ /api/platform/* -> Render origin
                             -> platformAccess
                             -> platformAuth + MFA + Platform RBAC
```

El navegador deja de consumir un hostname API separado. El Worker solo transporta `/api/platform/*`; no decide identidad, sesión, MFA, permisos ni datos. Render continúa validando `Cf-Access-Jwt-Assertion` y después la autenticación Platform.

### Autoridades

- `platform-access`: sigue propiedad de `infrastructure`; cambia la topología de dos fronteras browser-visible a una frontera Access same-origin + proxy restringido.
- `identity`: sigue propiedad del backend.
- `capabilities`: sigue propiedad del backend/Platform RBAC.
- `api-errors`: continúa parcial; el proxy convierte fallos de transporte/origin en HTTP JSON legible, pero no crea un nuevo envelope global.
- `environment`: sigue propiedad de infrastructure; `PLATFORM_ACCESS_AUDIENCE` debe corresponder a la aplicación Access de `admin.manecomb.com` al desplegar.

## Seguridad y fail-closed

El Worker propuesto:

1. intercepta exclusivamente `/api/platform` y subrutas;
2. exige `Cf-Access-Jwt-Assertion` antes del proxy;
3. valida un origin HTTPS sin credenciales, ruta, query ni hash;
4. reenvía una allowlist de headers de API;
5. no reenvía cookies del navegador a Render;
6. no sigue redirecciones del origin;
7. devuelve errores HTTP explícitos ante configuración inválida o origin no disponible;
8. delega cualquier otra ruta a Static Assets.

El backend conserva `platformAccess`, `platformAuth`, MFA, sesión y RBAC como barreras posteriores. El proxy no es un bypass.

## Evidencia automatizada inicial de PR #275

- Dependency audit: PASS.
- Admin Global: typecheck PASS.
- Admin Global contratos: PASS.
- Admin Global build: PASS.
- Worker/SPA contract: PASS.
- Wrangler deployment dry-run: PASS.
- Backend tests: PASS en la primera corrida de CI observada.
- El primer System audit falló exclusivamente por drift previo `6/5`; este documento y el refresh de baselines corrigen esa deuda sin modificar el umbral `5`.

## Gate externo que permanece abierto

No declarar Admin Global productivo solo por CI. Después del merge se requiere:

- desplegar el Worker exacto fusionado;
- usar en Render el AUD de la aplicación Cloudflare Access que protege `admin.manecomb.com`;
- comprobar que DevTools muestra `POST https://admin.manecomb.com/api/platform/auth/login` y ninguna llamada browser a `admin-api.manecomb.com`;
- `403` sin Access;
- `401` con Access pero sin Platform auth;
- `200` con Access + Platform + MFA;
- `platform_owner` productivo y pruebas de MFA, refresh, expiry, revoke y logout.

## Veredicto

```text
MAIN_7A8C015_TO_F25DE8DF_SEMANTICALLY_RECONCILED
AUTHORITY_OWNERS_UNCHANGED
ADMIN_GLOBAL_TRANSPORT_TOPOLOGY_CHANGED_NOT_AUTHORITY
EXTERNAL_ADMIN_PRODUCTION_AUTH_STILL_PENDING
```
