# Admin Global — despliegue privado con Cloudflare Access

## Estado

Esta guía prepara el despliegue, pero **no afirma que DNS, Cloudflare Access, Render o Producción ya estén configurados**. Esos cambios externos deben ejecutarse y verificarse después del merge de P0–P5.

## Arquitectura objetivo

```text
Administrador interno
  -> https://admin.manecomb.com
  -> Cloudflare Access (aplicación self-hosted)
  -> Cloudflare Worker manecomb-admin + Static Assets admin-global/dist
  -> https://admin-api.manecomb.com/api/platform/*
  -> Cloudflare Access (aplicación self-hosted o política por hostname/ruta)
  -> backend ManeComb en Render
  -> middleware platformAccess
  -> platformAuth + sesión + MFA + RBAC
```

Cloudflare Access agrega el JWT de aplicación al encabezado `Cf-Access-Jwt-Assertion`. El backend valida firma RS256 mediante el JWKS del equipo, `iss`, `aud`, expiración, `sub` y `type=app`. La identidad Access **no sustituye** al usuario Platform: la API sigue requiriendo su token, sesión activa, MFA y permisos.

## Hostnames

| Uso | Hostname objetivo |
|---|---|
| Frontend interno | `admin.manecomb.com` |
| API Platform privada | `admin-api.manecomb.com` |
| Backend origin | Servicio Render actual, no expuesto por el frontend |

El build productivo valida ambos hostnames. El Admin no inicializa en dominios `workers.dev`, previews de commit, Pages temporales ni otro hostname distinto de `admin.manecomb.com`. La API privada también debe pasar por Cloudflare Access. Proteger solamente el frontend no impide llamadas directas al backend público.

## Cloudflare Workers

- Proyecto conectado a la carpeta raíz del repositorio.
- Archivo de configuración: `admin-global/wrangler.jsonc`.
- Comando de build: `npm ci --prefix admin-global && npm run build --prefix admin-global`.
- Static Assets: `admin-global/dist`.
- Fallback SPA: `assets.not_found_handling = "single-page-application"`.
- Dominio personalizado: `admin.manecomb.com`.
- `workers_dev=false` y `preview_urls=false` permanecen versionados.
- Variables de build:

```env
VITE_API_URL=https://admin-api.manecomb.com
VITE_PLATFORM_ACCESS_REQUIRED=true
VITE_PLATFORM_API_HOST=admin-api.manecomb.com
VITE_PLATFORM_ADMIN_HOST=admin.manecomb.com
```

El artefacto `dist` debe contener `_headers` y `robots.txt`. **No debe contener `_redirects`**: ese archivo corresponde al fallback de Pages y provoca comportamiento incorrecto con Workers Static Assets.

La integración de Git puede generar URLs técnicas de preview aun cuando estén deshabilitadas en Wrangler. El runtime productivo las rechaza por hostname y no monta la aplicación administrativa. Las pruebas funcionales se realizan únicamente en `admin.manecomb.com` detrás de Access.

## Cloudflare Access

Crear aplicaciones self-hosted para:

1. `admin.manecomb.com/*`
2. `admin-api.manecomb.com/api/platform/*`

Política mínima recomendada:

- permitir únicamente identidades internas explícitas o grupo corporativo;
- exigir el proveedor de identidad configurado;
- exigir MFA en el IdP;
- evitar reglas públicas tipo `Everyone`;
- usar una sesión corta para el panel interno;
- registrar decisiones y accesos en Cloudflare Zero Trust.

Guardar el **Application AUD** de la aplicación que protege la API. El AUD no es un secreto, pero debe corresponder exactamente a esa aplicación.

## Backend / Render

Variables requeridas cuando la protección se active:

```env
PLATFORM_ACCESS_ENFORCEMENT_ENABLED=true
PLATFORM_ACCESS_ISSUER=https://TU-EQUIPO.cloudflareaccess.com
PLATFORM_ACCESS_AUDIENCE=APPLICATION_AUD_DE_LA_API
# Opcional. Por defecto se deriva como ISSUER/cdn-cgi/access/certs
PLATFORM_ACCESS_JWKS_URL=https://TU-EQUIPO.cloudflareaccess.com/cdn-cgi/access/certs
CLIENT_ORIGIN=https://admin.manecomb.com
```

Reglas de arranque:

- protección deshabilitada: el resto de ManeComb conserva su comportamiento actual;
- protección habilitada y configuración incompleta: el backend aborta antes de escuchar tráfico;
- JWKS temporalmente no disponible: `/api/platform/*` responde `503`;
- JWT ausente o inválido: responde `403`;
- JWT Access válido pero token Platform ausente: responde `401`;
- ambas barreras válidas: continúa MFA, sesión y RBAC Platform;
- un `kid` nuevo fuerza una única recarga de JWKS antes de rechazarlo.

No usar `Cf-Access-Authenticated-User-Email` como autenticación del backend. El correo del JWT se conserva únicamente como identidad auxiliar sanitizada.

## DNS y proxy

- `admin.manecomb.com`: custom domain del Worker `manecomb-admin`.
- `admin-api.manecomb.com`: hostname proxied de Cloudflare hacia el servicio Render.
- Mantener proxy naranja activo para que Access procese la solicitud.
- No publicar un segundo origin alterno que permita saltar Access para `/api/platform/*`.

El backend público existente puede seguir atendiendo la aplicación empresarial, pero sus rutas Platform quedan protegidas por el middleware cuando `PLATFORM_ACCESS_ENFORCEMENT_ENABLED=true`. Antes de habilitarlo, el frontend Admin debe consumir el hostname privado.

## Orden de despliegue

1. Confirmar P0 y P1 integrados y fusionar la consolidación P2–P5 con CI completo verde.
2. Confirmar nuevamente CI, dependency audit y dry-run Worker en `main`.
3. Configurar `admin-api.manecomb.com` y su política Access.
4. Configurar variables Platform Access en Render sin desplegar todavía el frontend público.
5. Desplegar backend y comprobar que una llamada sin Access a `/api/platform/capabilities` devuelve `403`.
6. Comprobar con Access válido y sin token Platform que devuelve `401`.
7. Configurar y desplegar `admin.manecomb.com` con las cuatro variables Vite privadas.
8. Verificar que un hostname de preview no inicializa el Admin.
9. Probar login Platform, MFA, renovación, logout, overview, empresas, comercial, sistema, auditoría, personal y sesiones.
10. Probar una acción controlada sobre una cuenta fixture, provocar un fallo recuperable y repetirla con la misma `Idempotency-Key`.
11. Revisar auditoría Platform y logs de Access.

## Rollback

1. Restringir la política Access o retirar temporalmente el custom domain del Worker.
2. Revertir el Worker al release anterior.
3. Revertir el backend al commit anterior cuando el incidente también afecte la API.
4. No apuntar el frontend privado al backend público como bypass.
5. Conservar registros de auditoría y sesiones para análisis.

## Evidencias requeridas para declarar P5 operativo

- configuración de ambas aplicaciones Access;
- AUD de la aplicación API confirmado, sin compartir tokens;
- DNS proxied y certificados activos;
- variables presentes en Render y Worker, con valores ocultos;
- `403` sin Access;
- `401` con Access pero sin Platform;
- `200` con Access + Platform + MFA;
- hostname de preview bloqueado;
- headers CSP/no-index activos;
- deep link `/admin/companies/<organizationId>`;
- refresh de sesión antes de expirar y logout sin restauración tardía;
- acción fallida reintentada con la misma `Idempotency-Key` sin duplicación;
- auditoría registrada.
