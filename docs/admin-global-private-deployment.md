# Admin Global — despliegue privado con Cloudflare Access

## Estado

Esta guía prepara el despliegue, pero **no afirma que DNS, Cloudflare Access, Render o Producción ya estén configurados**. Esos cambios externos deben ejecutarse y verificarse después del merge.

## Arquitectura objetivo

```text
Administrador interno
  -> https://admin.manecomb.com
  -> Cloudflare Access (una sola aplicación self-hosted)
  -> Cloudflare Worker manecomb-admin
       ├─ Static Assets admin-global/dist
       └─ /api/platform/* -> proxy same-origin
                            -> https://manecomb.onrender.com/api/platform/*
                            -> middleware platformAccess
                            -> platformAuth + sesión + MFA + RBAC
```

El navegador **no llama directamente a un segundo hostname de API**. Todas las solicitudes de Admin Global permanecen bajo `https://admin.manecomb.com`. Cloudflare Access autentica la solicitud antes de entregarla al Worker y agrega `Cf-Access-Jwt-Assertion`; el Worker reenvía esa assertion al backend Render únicamente para `/api/platform/*`.

La identidad Access no sustituye al usuario Platform: la API sigue requiriendo su token, sesión activa, MFA y permisos. El Worker no reenvía cookies del navegador al backend.

## Por qué se usa same-origin

La arquitectura anterior hacía que el bundle llamara desde `admin.manecomb.com` a `admin-api.manecomb.com`. Con dos superficies Access/CORS, un challenge o cookie no disponible para XHR podía convertirse en `Network Error` antes de que el frontend recibiera un `401` o `403` útil.

El proxy same-origin elimina esa segunda frontera del navegador:

- una sola sesión Cloudflare Access;
- sin CORS entre Admin y Platform;
- el CSP puede limitar `connect-src` a `'self'`;
- los errores del origin se transforman en respuestas HTTP legibles en vez de fallos de transporte;
- `/api/platform/*` sigue fail-closed porque Render valida `Cf-Access-Jwt-Assertion` y luego la autenticación Platform.

## Hostnames y origin

| Uso | Valor |
|---|---|
| Frontend y API vista por el navegador | `admin.manecomb.com` |
| Backend origin del Worker | `https://manecomb.onrender.com` |
| Namespace permitido por el proxy | `/api/platform/*` |

`admin-api.manecomb.com` deja de ser dependencia del navegador. Puede mantenerse temporalmente durante el corte si ya existe, pero no debe volver a configurarse como `VITE_API_URL` ni permitirse en el CSP del Admin.

## Cloudflare Workers

- Proyecto conectado a la carpeta raíz del repositorio.
- Archivo de configuración: `admin-global/wrangler.jsonc`.
- Entry point: `admin-global/worker.mjs`.
- Comando de build: `npm ci --prefix admin-global && npm run build --prefix admin-global`.
- Static Assets: `admin-global/dist`, binding `ASSETS`.
- `run_worker_first=true` para que el Worker pueda interceptar Platform antes del fallback SPA.
- Fallback SPA: `assets.not_found_handling = "single-page-application"`.
- Dominio personalizado: `admin.manecomb.com`.
- `workers_dev=false` y `preview_urls=false` permanecen versionados.
- Origin productivo del proxy: `ADMIN_API_ORIGIN=https://manecomb.onrender.com` en `wrangler.jsonc`.
- Variables de build:

```env
VITE_API_URL=https://admin.manecomb.com
VITE_PLATFORM_ACCESS_REQUIRED=true
VITE_PLATFORM_API_HOST=admin.manecomb.com
VITE_PLATFORM_ADMIN_HOST=admin.manecomb.com
```

El artefacto `dist` debe contener `_headers` y `robots.txt`. **No debe contener `_redirects`**.

## Contrato del proxy

`worker.mjs` solo reenvía la ruta exacta `/api/platform` y sus subrutas. Cualquier otra petición se entrega a Static Assets.

Antes de proxy:

1. exige `Cf-Access-Jwt-Assertion`;
2. valida que `ADMIN_API_ORIGIN` sea un origin HTTPS sin credenciales, ruta, query ni hash;
3. construye una nueva solicitud hacia Render;
4. reenvía únicamente headers permitidos de API, incluyendo `Authorization`, `Idempotency-Key`, `Origin`, `X-Trace-Id` y la assertion Access;
5. no reenvía cookies del navegador;
6. no sigue redirecciones del origin;
7. devuelve `502`/`503` JSON si el origin no está disponible o el proxy está mal configurado.

## Cloudflare Access

Crear/proteger una aplicación self-hosted para:

`admin.manecomb.com/*`

Política mínima recomendada:

- permitir únicamente identidades internas explícitas o grupo corporativo;
- exigir el proveedor de identidad configurado;
- exigir MFA en el IdP;
- evitar reglas públicas tipo `Everyone`;
- usar una sesión corta para el panel interno;
- registrar decisiones y accesos en Cloudflare Zero Trust.

Guardar el **Application AUD de esta aplicación Admin**. El AUD no es secreto, pero debe corresponder exactamente al JWT que recibe `admin.manecomb.com`.

## Backend / Render

Variables requeridas cuando la protección se active:

```env
PLATFORM_ACCESS_ENFORCEMENT_ENABLED=true
PLATFORM_ACCESS_ISSUER=https://TU-EQUIPO.cloudflareaccess.com
PLATFORM_ACCESS_AUDIENCE=APPLICATION_AUD_DEL_ADMIN
# Opcional. Por defecto se deriva como ISSUER/cdn-cgi/access/certs
PLATFORM_ACCESS_JWKS_URL=https://TU-EQUIPO.cloudflareaccess.com/cdn-cgi/access/certs
CLIENT_ORIGIN=https://admin.manecomb.com
```

**Importante para el corte:** `PLATFORM_ACCESS_AUDIENCE` debe ser el AUD de la aplicación Access que protege `admin.manecomb.com`, porque esa es la assertion que el Worker reenvía. Si Render conserva el AUD de una aplicación antigua para `admin-api.manecomb.com`, el backend rechazará correctamente la assertion con `403`.

Reglas de arranque:

- protección deshabilitada: el resto de ManeComb conserva su comportamiento actual;
- protección habilitada y configuración incompleta: el backend aborta antes de escuchar tráfico;
- JWKS temporalmente no disponible: `/api/platform/*` responde `503`;
- JWT ausente o inválido: responde `403`;
- JWT Access válido pero token Platform ausente: responde `401`;
- ambas barreras válidas: continúa MFA, sesión y RBAC Platform;
- un `kid` nuevo fuerza una única recarga de JWKS antes de rechazarlo.

No usar `Cf-Access-Authenticated-User-Email` como autenticación del backend.

## Orden de despliegue

1. Fusionar el cambio same-origin con CI y Dependency Audit verdes.
2. En Cloudflare Access, confirmar que `admin.manecomb.com/*` exige la identidad interna prevista.
3. Copiar el AUD de esa aplicación Admin y actualizar **solo el valor** de `PLATFORM_ACCESS_AUDIENCE` en Render, sin publicar tokens ni secretos.
4. Confirmar `PLATFORM_ACCESS_ISSUER` y JWKS de la misma cuenta Access.
5. Desplegar/reiniciar Render y verificar que una llamada a `/api/platform/capabilities` sin assertion devuelve `403`.
6. Desplegar el Worker de `admin.manecomb.com` desde el commit fusionado.
7. Abrir `https://admin.manecomb.com` y completar Access una sola vez.
8. Probar `POST /api/platform/auth/login` desde DevTools: debe dirigirse a `admin.manecomb.com`, nunca a `admin-api.manecomb.com`.
9. Probar login Platform, MFA, renovación, logout, overview, empresas, comercial, sistema, auditoría, personal y sesiones.
10. Verificar `401` con Access válido y sin token Platform, y `200` con Access + Platform + MFA.
11. Probar una acción controlada con `Idempotency-Key` y revisar auditoría Platform/logs de Access.

## Rollback

1. Revertir el Worker al release anterior si el problema es exclusivo del proxy.
2. Revertir `PLATFORM_ACCESS_AUDIENCE` al valor anterior únicamente si también se revierte la arquitectura del Worker.
3. Restringir la política Access o retirar temporalmente el custom domain si existe un incidente de seguridad.
4. No apuntar el navegador directamente al backend Render ni reintroducir `admin-api.manecomb.com` como bypass.
5. Conservar registros de auditoría y sesiones para análisis.

## Evidencias requeridas para declarar operativo

- `admin.manecomb.com` detrás de Cloudflare Access;
- `POST https://admin.manecomb.com/api/platform/auth/login` visible en DevTools;
- ninguna solicitud browser a `admin-api.manecomb.com`;
- `403` sin Access;
- `401` con Access pero sin token Platform;
- `200` con Access + Platform + MFA;
- MFA, refresh, expiry, revoke y logout reales;
- headers CSP/no-index activos;
- deep link `/admin/companies/<organizationId>`;
- acción fallida reintentada con la misma `Idempotency-Key` sin duplicación;
- auditoría registrada.
