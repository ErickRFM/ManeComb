# Admin Global — despliegue SPA + proxy same-origin en Cloudflare Workers

Admin Global se publica como un Cloudflare Worker con Static Assets y un proxy restringido para Platform.

La navegación SPA y el proxy se resuelven mediante `admin-global/wrangler.jsonc`:

```json
{
  "main": "./worker.mjs",
  "assets": {
    "binding": "ASSETS",
    "directory": "./dist",
    "not_found_handling": "single-page-application",
    "run_worker_first": true
  },
  "vars": {
    "ADMIN_API_ORIGIN": "https://manecomb.onrender.com"
  }
}
```

`worker.mjs` intercepta únicamente `/api/platform` y `/api/platform/*`. El resto se delega al binding `ASSETS`. La API que ve el navegador es `https://admin.manecomb.com/api/platform/*`; Render nunca se configura como `VITE_API_URL`.

No debe existir `admin-global/public/_redirects`. La regla de Pages `/* /index.html 200` no corresponde a Workers Static Assets y puede generar un bucle (`100324`).

## Comandos de producción

Desde `admin-global`:

```bash
npm ci
npm run build
npx wrangler deploy
```

El build debe producir `dist` sin `_redirects`. Wrangler publica los assets, ejecuta primero el Worker, exige la assertion de Cloudflare Access para Platform y reenvía solo ese namespace al origin Render.

## Gate manual después del deploy

En DevTools > Network, un login debe aparecer como:

```text
POST https://admin.manecomb.com/api/platform/auth/login
```

No debe existir ninguna llamada del navegador a `admin-api.manecomb.com` ni a `manecomb.onrender.com`.
