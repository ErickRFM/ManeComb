# Deployment ManeComb

Fecha de validacion: 2026-06-11.

## Backend Render

URL publica:

```text
https://manecomb.onrender.com
https://manecomb.onrender.com/api/health
```

Variables relevantes:

```env
NODE_ENV=production
MONGODB_URI=<mongodb-atlas-uri>
JWT_SECRET=<secret>
JWT_REFRESH_SECRET=<secret>
CLIENT_ORIGIN=https://manecomb1.pages.dev,https://*.manecomb1.pages.dev,http://localhost:5173,http://127.0.0.1:5173
APP_URL=https://manecomb1.pages.dev
```

`CLIENT_ORIGIN` acepta lista separada por comas y patrones `*` para previews de Cloudflare Pages.
No publicar `.env`, secrets, keystores ni credenciales.

Comandos de validacion:

```powershell
& "C:\Program Files\nodejs\npm.cmd" --prefix backend test
curl.exe -s -D - -o NUL -H "Origin: https://manecomb1.pages.dev" https://manecomb.onrender.com/api/health
curl.exe -s -D - -o NUL -H "Origin: https://manecomb1.pages.dev" https://manecomb.onrender.com/api/commercial/plans
curl.exe -s -D - -o NUL -H "Origin: https://preview.manecomb1.pages.dev" https://manecomb.onrender.com/api/auth/session
```

Resultados esperados:

- `/api/health`: `200 OK`.
- `/api/commercial/plans`: `200 OK`.
- `/api/auth/session` sin cookie/token: `401 Unauthorized`, con `Access-Control-Allow-Origin`.
- Header CORS reflejando el origen permitido.

## MongoDB Atlas

El backend intenta usar Atlas si `MONGODB_URI` esta presente. En pruebas locales sin acceso a Atlas, el backend mantiene almacenamiento interno y las pruebas pasan.

Validar en Render:

- `MONGODB_URI` configurado.
- IP allowlist / network access correcto.
- Logs sin errores recurrentes de conexion.
- Health responde.

## Ventas Cloudflare Pages

URL:

```text
https://manecomb1.pages.dev
```

Configuracion Cloudflare Pages:

- Root directory: `ventas`
- Framework preset: `Vite` o `None`
- Build command: `npm install && npm run build`
- Build output directory: `dist`

Variables:

```env
VITE_API_URL=https://manecomb.onrender.com/api
VITE_SOCKET_URL=https://manecomb.onrender.com
```

Rutas SPA esperadas:

- `/`
- `/ventas/login`
- `/ventas/registro`
- `/portal`
- `/portal/plan`
- `/portal/facturacion`
- `/portal/pagos`
- `/portal/perfil`

Validacion local:

```powershell
cd ventas
& "C:\Program Files\nodejs\npm.cmd" install
& "C:\Program Files\nodejs\npm.cmd" run build
& "C:\Program Files\nodejs\npm.cmd" run preview
```

Validacion HTTP produccion:

```powershell
curl.exe -s -D - -o NUL https://manecomb1.pages.dev/
curl.exe -s -D - -o NUL https://manecomb1.pages.dev/ventas/login
curl.exe -s -D - -o NUL https://manecomb1.pages.dev/portal/plan
```

## Mobile Android

Stack activo: React Native CLI sin Expo.

Release:

```powershell
cd mobile
& "C:\Program Files\nodejs\npm.cmd" run typecheck
& "C:\Program Files\nodejs\npm.cmd" run lint
& "C:\Program Files\nodejs\npm.cmd" run android:release
```

Variables release:

```env
MANECOMB_APP_ENV=production
MANECOMB_API_URL=https://manecomb.onrender.com/api
MANECOMB_SOCKET_URL=https://manecomb.onrender.com
MANECOMB_API_TIMEOUT_MS=15000
MANECOMB_ANDROID_CLEARTEXT=0
```

Artefactos:

```text
mobile/dist/app-release.apk
mobile/dist/app-release.aab
```

## Git

Antes de publicar:

```powershell
git status
git add .gitignore mobile/App.tsx mobile/android/app/build.gradle mobile/android/build.gradle mobile/src/hooks/use-user-location.ts mobile/src/native/location.ts mobile/src/navigation/router.tsx mobile/src/screens/customer-auth-screen.tsx mobile/src/screens/map-screen.native.tsx mobile/src/store/use-app-store.ts mobile/src/utils/account-routing.ts mobile/src/utils/checkout-context.ts docs/final-qa-report.md docs/mobile-release.md docs/deployment.md docs/troubleshooting.md
git commit -m "stabilize ManeComb production integration"
git push origin main
```

No usar `git add .` si hay capturas, `.env`, keystores, APK/AAB o caches visibles.
