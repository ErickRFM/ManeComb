# Deploy de Ventas en Cloudflare Pages

Esta guia publica la web de ventas/portal que vive en `ventas/` sin tocar la app movil.

## Estructura

Cloudflare Pages debe construir desde la carpeta `ventas`.

Configuracion:

- Root directory: `ventas`
- Framework preset: `Vite` o `None`
- Build command: `npm install && npm run build`
- Build output directory: `dist`

`ventas/public/_redirects` se copia al build para que rutas SPA como `/portal` y `/ventas/login` recarguen contra `index.html`.

## Variables de entorno

En Cloudflare Pages, configurar:

```env
VITE_API_URL=https://api.tudominio.com/api
VITE_SOCKET_URL=https://api.tudominio.com
```

Para desarrollo local, copiar `ventas/.env.example` a `ventas/.env` si necesitas cambiar los defaults:

```env
VITE_API_URL=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000
```

## Backend y CORS

El backend ahora acepta una lista separada por comas en `CLIENT_ORIGIN`.

Ejemplo para produccion:

```env
CLIENT_ORIGIN=http://localhost:5173,https://manecomb1.pages.dev,https://*.manecomb1.pages.dev,https://manecomb.pages.dev,https://app.tudominio.com
```

Usa el dominio custom futuro agregandolo a esa lista. El backend soporta patrones con `*` para previews de Cloudflare Pages y Socket.IO usa la misma configuracion.

## Validacion local

Desde la raiz del repo:

```bash
cd ventas
npm install
npm run dev
npm run build
```

El build debe crear:

```text
ventas/dist/
```

## Produccion

1. Publica el backend en `https://api.tudominio.com`.
2. Configura `CLIENT_ORIGIN` del backend con el dominio de Pages y el dominio custom.
3. Configura `VITE_API_URL` y `VITE_SOCKET_URL` en Cloudflare Pages.
4. Despliega Pages con root `ventas` y output `dist`.

## Notas

- La web reutiliza las pantallas existentes de `ventas/screens` y `ventas/features/portal`.
- La app usa adaptadores web locales para navegacion, store, UI compartida y compatibilidad React Native Web.
- Las rutas operativas como `/mapa` y `/radio` quedan como placeholders porque pertenecen a la app/panel operativo, no al scope de ventas.
