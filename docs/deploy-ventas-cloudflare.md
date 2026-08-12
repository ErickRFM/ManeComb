# Ventas/Portal en Cloudflare Pages

Ultima revision: 2026-08-12.

La aplicacion estatica vive en `ventas/`. No usa el build de Mobile ni debe compartir variables entre Preview y Produccion.

## Configuracion del proyecto

```text
Root directory: ventas
Framework preset: Vite o None
Build command: npm ci && npm run build
Build output directory: dist
Node.js: 22
```

El repositorio fija Node mediante `.nvmrc` y `.node-version`.

## Variables por ambiente

### Produccion

```env
VITE_API_URL=https://manecomb.onrender.com/api
VITE_SOCKET_URL=https://manecomb.onrender.com
VITE_MAPBOX_ACCESS_TOKEN=
```

### Preview/Sandbox

```env
VITE_API_URL=https://manecomb-backend-sandbox.onrender.com/api
VITE_SOCKET_URL=https://manecomb-backend-sandbox.onrender.com
VITE_MAPBOX_ACCESS_TOKEN=
```

La API y Socket.IO deben pertenecer al mismo ambiente. Las variables de Preview no deben heredarse ciegamente de Produccion.

`VITE_*` se incrusta en el JavaScript entregado al navegador. No colocar Access Tokens privados, secretos de webhook, Mongo URI, JWT, Resend, Twilio ni credenciales bancarias en variables `VITE_*`.

El build se detiene cuando `VITE_API_URL` falta o cuando una URL configurada es invalida, contiene credenciales o usa un protocolo no admitido.

## Rutas SPA

`ventas/public/_redirects` contiene:

```text
/* /index.html 200
```

Vite debe copiarlo a:

```text
ventas/dist/_redirects
```

CI comprueba el archivo después de cada build. Deben responder con la aplicacion, incluso después de recargar:

- `/`
- `/ventas/login`
- `/ventas/registro`
- `/portal`
- `/portal/plan`
- `/portal/facturacion`
- `/portal/pagos`
- `/portal/perfil`
- `/reset-password?token=test`

## Backend y CORS

En Render, `CLIENT_ORIGIN` debe incluir exactamente los clientes autorizados del ambiente. Ejemplo de Produccion:

```env
CLIENT_ORIGIN=https://manecomb.com,https://www.manecomb.com,https://manecomb1.pages.dev,https://*.manecomb1.pages.dev
```

CORS conserva el patrón `https://*.manecomb1.pages.dev` para que el ambiente Preview/Sandbox pueda responder a previews controlados del proyecto. Sin embargo, el perímetro adicional de **producción** es más estricto: solo acepta los dominios canónicos y el deployment exacto `https://manecomb1.pages.dev`; un preview aleatorio como `https://branch.manecomb1.pages.dev` no puede consumir el backend productivo.

Mientras `manecomb1.pages.dev` siga siendo la superficie productiva usada por usuarios, debe permanecer en el `production-origin-guard`. Cuando `manecomb.com` / `www.manecomb.com` sustituyan completamente ese deployment, se puede retirar el host `pages.dev` en un cambio coordinado con Cloudflare y Render.

No usar `CLIENT_ORIGIN=*` en Produccion.

## Validacion local

```bash
cd ventas
cp .env.example .env
npm ci
npm run typecheck
npm run build
npm run preview
```

Antes de publicar, comprobar:

```bash
test -f dist/_redirects
grep -Fx '/* /index.html 200' dist/_redirects
```

## Validacion posterior al despliegue

1. Abrir la raiz del deployment.
2. Abrir directamente `/reset-password?token=test` y recargar.
3. Confirmar en Network que `/api/commercial/plans` usa el backend esperado.
4. Confirmar que la conexion Socket.IO usa el mismo origen base.
5. Verificar CORS desde el dominio exacto del deployment.
6. No probar pagos de Produccion desde un Preview Sandbox.
