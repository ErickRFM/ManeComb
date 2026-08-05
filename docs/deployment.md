# Despliegue reproducible de ManeComb

Ultima revision: 2026-08-05.

Este documento describe el contrato de despliegue. Los valores secretos viven exclusivamente en Render, Cloudflare, el proveedor correspondiente o archivos `.env` locales ignorados por Git.

## Versiones base

- Node.js 22 (`.nvmrc` y `.node-version`).
- Java 17 para Android.
- Instalaciones reproducibles con `npm ci`.
- Cambios mediante rama y Pull Request; no publicar directamente desde una copia local sin CI.

## Matriz de artefactos

| Artefacto | Carpeta | Comando de validacion | Salida/puerto |
|---|---|---|---|
| Backend | `backend` + `communication-service` | `npm ci --prefix backend && npm test --prefix backend` | HTTP `5000` |
| Ventas/Portal | `ventas` | `npm ci && npm run typecheck && npm run build` | `ventas/dist` |
| Mobile | `mobile` | `npm ci && npm run typecheck && npm run lint && npm test` | APK/AAB |
| Admin Global | `admin-global` | `npm ci && npm run typecheck && npm run build` | `admin-global/dist` |
| Docker | raiz | `docker compose config` | API + web + Redis + Nginx |

CI ejecuta estas validaciones, construye el APK debug, construye las imagenes Docker y levanta contenedores de prueba antes de autorizar merge.

## Backend en Render

Backend productivo de referencia:

```text
https://manecomb.onrender.com
```

Backend Sandbox de referencia:

```text
https://manecomb-backend-sandbox.onrender.com
```

Render debe clonar el monorepo completo. `backend` consume `communication-service` como carpeta hermana; no se debe desplegar un ZIP que contenga solamente `backend/`.

Configuracion sin Docker desde la raiz del repo:

```text
Build command: npm ci --prefix backend
Start command: npm start --prefix backend
```

Configuracion Docker:

```text
Dockerfile: backend/Dockerfile
Build context: raiz del repositorio
```

Variables obligatorias o condicionadas se documentan en `backend/.env.example`. Reglas principales:

- `JWT_SECRET`: obligatorio y minimo 32 caracteres.
- `MONGO_URI`/`MONGODB_URI`: Atlas del ambiente correcto.
- `MONGO_DB_NAME`: nunca compartir la misma base entre Sandbox y Produccion.
- `CLIENT_ORIGIN`: lista exacta de clientes permitidos; no usar `*` global en Produccion.
- `APP_URL`, `PORTAL_PUBLIC_URL`, `APP_PUBLIC_URL`: URLs del mismo ambiente.
- `PAYMENT_PROVIDER`: `manual` mientras se usan transferencias; `mercado_pago` solamente con credenciales y URLs del ambiente correspondiente.
- `REQUIRE_MONGO=true` en servicios persistentes.
- `ENABLE_REDIS`, `ENABLE_QUEUES` y `REDIS_URL` deben activarse juntos cuando se requieran colas durables.

Endpoints de comprobacion:

```text
GET /api/health/live
GET /api/health
GET /api/health/ready
GET /api/commercial/plans
```

`/api/health/live` valida que el proceso atiende HTTP. `/api/health` puede indicar `degraded` cuando una integracion opcional no esta lista; no equivale por si solo a que el proceso este caido.

## Ventas y Portal en Cloudflare Pages

Configuracion:

```text
Root directory: ventas
Build command: npm ci && npm run build
Build output directory: dist
```

Produccion:

```env
VITE_API_URL=https://manecomb.onrender.com/api
VITE_SOCKET_URL=https://manecomb.onrender.com
```

Preview/Sandbox:

```env
VITE_API_URL=https://manecomb-backend-sandbox.onrender.com/api
VITE_SOCKET_URL=https://manecomb-backend-sandbox.onrender.com
```

No mezclar una URL de API Sandbox con un Socket de Produccion, ni al contrario. El build rechaza URLs vacias, invalidas, con credenciales o protocolos diferentes de HTTP(S).

`ventas/public/_redirects` debe llegar al artefacto como `dist/_redirects` con:

```text
/* /index.html 200
```

Esto permite recargar directamente `/portal`, `/ventas/login`, `/reset-password` y las demas rutas SPA.

## Mobile Android/iOS

Produccion se fija en `mobile/.env.production`:

```env
MANECOMB_APP_ENV=production
MANECOMB_API_URL=https://manecomb.onrender.com/api
MANECOMB_SOCKET_URL=https://manecomb.onrender.com
MANECOMB_ANDROID_CLEARTEXT=0
```

Desarrollo en dispositivo fisico puede usar una IP LAN por HTTP solamente cuando `__DEV__` esta activo:

```env
MANECOMB_APP_ENV=development
MANECOMB_API_URL=http://192.168.1.20:5000/api
MANECOMB_SOCKET_URL=http://192.168.1.20:5000
MANECOMB_ANDROID_CLEARTEXT=1
```

Un build operativo rechaza la URL LAN y conserva el destino de Produccion. Sandbox debe compilarse con URLs HTTPS explicitas y `MANECOMB_APP_ENV=sandbox`.

Comandos:

```powershell
cd mobile
npm ci
npm run typecheck
npm run lint
npm test
npm run android:release
```

## Admin Global

Desarrollo local usa proxy Vite hacia el backend en `5000`:

```env
API_PORT=5000
```

Cualquier build estatico exige un origen absoluto:

```env
VITE_API_URL=https://manecomb.onrender.com
```

No agregar `/api/platform/auth`; el cliente agrega la ruta internamente. La URL no puede contener usuario, contraseña ni otro protocolo distinto de HTTP(S).

## Docker local/servidor propio

```bash
cp backend/.env.example backend/.env
# Completar solamente el archivo local ignorado por Git.
docker compose config
docker compose up --build
```

Produccion autogestionada:

```bash
docker compose -f docker-compose.prod.yml config
docker compose -f docker-compose.prod.yml up --build -d
```

El backend Docker incluye `communication-service`. API, Redis y web tienen healthchecks, y Nginx espera a que API/web esten saludables.

## Cierre antes de merge/despliegue

1. Rama actualizada contra `main` sin conflictos.
2. Todos los jobs de CI verdes, incluido Android debug APK.
3. Contrato de entorno verde.
4. Ningun `.env`, keystore, APK, temporal `.tmp-*` o credencial versionado.
5. Variables del proveedor revisadas sin copiar valores a Git ni al PR.
6. Cloudflare Preview apunta al backend del mismo ambiente.
7. Health, planes, autenticacion y Socket.IO comprobados despues del despliegue.
8. Produccion se despliega solamente desde un commit identificado y reversible.
