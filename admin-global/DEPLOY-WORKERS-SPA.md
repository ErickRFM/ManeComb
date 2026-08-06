# Admin Global — despliegue SPA en Cloudflare Workers

Admin Global se publica como Cloudflare Worker con Static Assets.

La navegación SPA se resuelve exclusivamente mediante `admin-global/wrangler.jsonc`:

```json
{
  "assets": {
    "directory": "./dist",
    "not_found_handling": "single-page-application"
  }
}
```

No debe existir `admin-global/public/_redirects`. La regla de Pages `/* /index.html 200` no es una redirección válida para Workers Static Assets y, combinada con el fallback SPA de Wrangler, Cloudflare la rechaza por bucle infinito (`100324`).

## Comandos de producción

Desde `admin-global`:

```bash
npm ci
npm run build
npx wrangler deploy
```

El build debe producir `dist` sin `_redirects`. Wrangler publica los assets de `dist` y entrega `index.html` con estado 200 para rutas que no correspondan a un archivo estático.
