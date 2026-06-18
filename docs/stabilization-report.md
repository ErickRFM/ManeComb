# ManeComb Stabilization Report

## Fase 0 - Preparacion y baseline

Fecha local: 2026-06-17

### Estado del repositorio

- Rama inicial revisada: `main`.
- Rama de trabajo creada y activa: `stabilization/production-hardening`.
- Arbol antes de crear la rama: limpio.
- Arbol despues de crear este reporte: solo queda pendiente este archivo de reporte.
- Commit local actual: `1e42edd72ef6a5dcb4400aa80c572245fad69b40`.
- Commit corto: `1e42edd Fix Render proxy trust, remove legacy mobile app, and tidy repo artifacts.`
- `origin/main`: `1e42edd72ef6a5dcb4400aa80c572245fad69b40`.
- Diferencia local contra `origin/main`: `0 ahead / 0 behind`.
- Commit `1e42edd`: confirmado localmente y confirmado en `origin/main`.
- Commit viejo observado en Render por logs previos: `d2cc420bcb519b25cd623da10eacf0f4bbc30cba`.

### Carpetas principales

- `backend/`: presente.
- `mobile/`: presente.
- `ventas/`: presente.
- `docs/`: presente.

### Apps activas detectadas

- Backend activo: `backend/package.json`.
- Mobile activo: `mobile/index.js` registra `mobile/App.tsx` via React Native CLI.
- Ventas web activa: `ventas/src/main.tsx` monta `ventas/src/App.tsx` con Vite.
- No se detecto otra app movil activa fuera de `mobile/`.
- Nota corregida en Fase 7: `mobile/app/*` no se elimina; funciona como arbol de rutas de la app React Native CLI mediante el router propio del proyecto.

### Scripts disponibles

Raiz:

- No existe `package.json` raiz.
- Script auxiliar raiz: `scripts/dev-windows.ps1`.

Backend:

- `npm run dev`
- `npm start`
- `npm test`
- `npm run diagnose:auth`

Mobile:

- `npm start`
- `npm run start:clear`
- `npm run android`
- `npm run android:device`
- `npm run android:debug`
- `npm run android:install`
- `npm run android:bundle`
- `npm run android:debug-bundled`
- `npm run android:release`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run test:e2e:web`
- `npm run test:e2e:mobile`
- `npm run build:apk:android`
- `npm run device:doctor`
- `npm run device:lan`

Ventas:

- `npm run dev`
- `npm run build`
- `npm run preview`

### Riesgos inmediatos

- Render puede necesitar redeploy manual si aun sirve el commit `d2cc420`; GitHub ya tiene `1e42edd`.
- Si Render corre `d2cc420`, `POST /api/auth/login` puede fallar con 502 por `express-rate-limit` y `X-Forwarded-For` cuando `trust proxy` no esta activo.
- `JWT_SECRET` tiene default en codigo actual; debe endurecerse en Fase 1 con validacion y test.
- Ventas en Cloudflare depende de `VITE_API_URL=https://manecomb.onrender.com/api`; si falta, el fallback `/api` puede fallar sin proxy.
- `mobile/app/*` es candidato legacy, pero no se debe eliminar hasta Fase 7 con referencias, typecheck y build.
- Existen carpetas/archivos locales ignorados (`node_modules`, `.env`, builds, logs); no se deben subir ni tocar sin necesidad.

### Tag recomendado

- Sugerido, no creado en esta fase: `v1.0.0-pre-hardening`.

### Siguiente fase recomendada

- Fase 1 - Produccion Render / Cloudflare.
- Prioridad: confirmar endurecimiento de `TRUST_PROXY`, `JWT_SECRET`, CORS, health y `VITE_API_URL` de Cloudflare.

### Estado de salida

- Fase 0 lista para revision.
- Se puede continuar a Fase 1 si se autoriza.

## Fase 1 - Produccion Render / Cloudflare

Fecha local: 2026-06-17

### Estado

- Fase 1 completada localmente en rama `stabilization/production-hardening`.
- No se hicieron cambios de UI, mobile, onboarding ni flujos comerciales.
- No se modificaron secretos ni archivos `.env` locales.
- No se avanzo a Fase 2.

### Causa tecnica cubierta

- Render envia `X-Forwarded-For`; si Express no activa `trust proxy`, `express-rate-limit` puede lanzar `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` y romper requests como `POST /api/auth/login`.
- El backend aceptaba un `JWT_SECRET` default en runtime productivo, lo que permitia despliegues inseguros o mal configurados.
- La web de ventas podia compilar en produccion sin `VITE_API_URL` y caer a `/api`, lo que falla en Cloudflare Pages si no existe proxy.
- La documentacion de variables no estaba alineada con aliases usados por deploys (`MONGODB_URI`, `JWT_EXPIRES_IN`, `CLIENT_URL`, `MERCADOPAGO_ACCESS_TOKEN`).

### Cambios realizados

- Backend detecta Render como runtime productivo y activa `TRUST_PROXY` por defecto en Render.
- Backend falla al iniciar en produccion/Render si `JWT_SECRET` falta, usa el default antiguo o mide menos de 32 caracteres.
- Backend acepta aliases seguros de deploy: `MONGODB_URI`, `JWT_EXPIRES_IN`, `CLIENT_URL` y `MERCADOPAGO_ACCESS_TOKEN`.
- `/api/health` ahora expone datos operativos no sensibles: `environment`, `version`, `commit`, `uptimeSeconds`, `render` y `trustProxy`.
- Tests de backend cubren `trust proxy`, health productivo y validacion estricta de `JWT_SECRET`/aliases.
- Build de ventas falla de forma explicita si falta `VITE_API_URL`.
- Cliente de ventas deja de depender silenciosamente de `/api` en produccion.
- Docs de Render y Cloudflare quedan alineadas con `https://manecomb.onrender.com` y `https://manecomb1.pages.dev`.

### Archivos modificados

- `backend/src/config/env.js`
- `backend/src/app.js`
- `backend/test/proxy.test.js`
- `backend/test/env.test.js`
- `backend/package.json`
- `backend/.env.example`
- `ventas/vite.config.js`
- `ventas/src/lib/api.ts`
- `ventas/.env.example`
- `docs/deployment.md`
- `docs/deploy-ventas-cloudflare.md`
- `docs/stabilization-report.md`

### Tests ejecutados

- `git diff --check`
- `npm test` en `backend/`
- `npm run build` en `ventas/`

### Resultados

- `git diff --check`: OK, sin errores de whitespace. Solo warnings esperados de LF -> CRLF en Windows.
- `npm test` backend: OK.
- `npm run build` ventas: OK.

### Riesgos restantes

- Falta que Render redepliegue desde el commit correcto y con `JWT_SECRET` fuerte configurado; si Render sigue en un commit viejo, puede repetirse el 502.
- Si Cloudflare Pages no tiene `VITE_API_URL=https://manecomb.onrender.com/api`, el build debe fallar por diseno.
- No se validaron aun mobile, APK, autenticacion real ni OnePlus en esta fase.

### Siguiente fase recomendada

- Fase 2 - Backend auth/subscription contract para que mobile use solo `canAccessMobile` y `mobileBlockReason`.

### Estado de salida

- Fase 1 lista para revision.
- Se puede continuar a Fase 2 si se autoriza.

## Fase 2 - Autenticacion, planes y tenant

Fecha local: 2026-06-17

### Estado

- Fase 2 completada localmente en rama `stabilization/production-hardening`.
- No se tocaron pantallas mobile, ventas, activation keys ni UI.
- No se modificaron secretos ni archivos `.env` locales.
- No se avanzo a Fase 3.

### Causa tecnica cubierta

- `requireOperationalAccess` calculaba acceso operativo leyendo ordenes comerciales directamente, separado de `buildAuthContext`.
- `/auth/login` y `/auth/me` calculaban `canUseOperations` antes de crear el `authContext`, lo que duplicaba decisiones y podia divergir.
- `resolvePostLoginRoute` enviaba conductores a `/mapa` solo por rol, aun cuando no hubiera plan activo; mobile prioriza `canAccessMobile`, pero el backend devolvia una ruta contradictoria.
- El contexto de tenant no representaba estados suspendidos si venian como senales de usuario/organizacion/orden.

### Cambios realizados

- `auth-context` queda como fuente central para `canAccessMobile`, `mobileBlockReason`, `canUseOperations`, `tenant` y `subscription`.
- `requireOperationalAccess` ahora construye `authContext` y permite/bloquea con `authContext.canUseOperations`.
- Bloqueos operativos registran logs seguros con `userId`, `tenantId`, `role`, `reason`, `planStatus` y `tenantStatus`; no se imprimen tokens ni datos sensibles.
- `/auth/login`, `/auth/refresh`, `/auth/session` y `/auth/me` dejan de calcular acceso operativo por una ruta secundaria.
- El tenant puede reflejar estados no activos (`suspended`, `inactive`, `disabled`, `cancelled`) usando senales existentes del usuario u orden sin crear un modelo nuevo.
- Conductores sin plan activo ya no reciben `destination=HomeConductor` ni `route=/mapa` desde el backend.
- Se agrego una prueba dedicada de matriz de acceso backend.

### Matriz validada

- Owner sin plan: `subscription.status=inactive`, `tenant.status=registered`, `canAccessMobile=false`, `mobileBlockReason=no_plan`.
- Owner con plan activo: `subscription.status=active`, `tenant.status=active`, `canAccessMobile=true`, `mobileBlockReason=null`, `unitsLimit=6`.
- Tenant suspendido: `subscription.status=active`, `tenant.status=suspended`, `canAccessMobile=false`, `mobileBlockReason=missing_tenant`.
- Pago pendiente: `subscription.status=pending`, `tenant.status=registered`, `canAccessMobile=false`, `mobileBlockReason=payment_pending`.
- Plan vencido: `subscription.status=active`, `subscription.isActive=false`, `canAccessMobile=false`, `mobileBlockReason=inactive_plan`.
- Usuario invitado pendiente con tenant activo: `subscription.status=active`, `tenant.status=active`, `canAccessMobile=true`, `mobileBlockReason=null`.
- Conductor activo con tenant activo: `subscription.status=active`, `tenant.status=active`, `canAccessMobile=true`, `mobileBlockReason=null`, `route=/mapa`.
- Conductor sin plan: `canAccessMobile=false`, `mobileBlockReason=no_plan`, sin ruta operativa.

### Archivos modificados

- `backend/src/services/auth-context.js`
- `backend/src/middlewares/operational-access.js`
- `backend/src/modules/auth/routes.js`
- `backend/test/auth-context.test.js`
- `backend/package.json`
- `docs/stabilization-report.md`

### Tests ejecutados

- `npm test` en `backend/`
- `git diff --check`

### Resultados

- `npm test` backend: OK.
- `git diff --check`: OK, sin errores de whitespace. Solo warnings esperados de LF -> CRLF en Windows.
- Smoke existente sigue cubriendo `/auth/register`, `/auth/login`, `/auth/me`, `PLAN_REQUIRED`, plan activo, usuario pendiente invitado y rutas operativas con store embebido/Mongo fallback.

### Riesgos restantes

- No se hizo prueba contra una cuenta real en Render ni OnePlus en esta fase.
- No se modifico `/driver/activation/register`; queda para Fase 3.
- `tenant.status` sigue siendo contexto calculado porque no hay modelo `Tenant` separado confirmado en el backend actual.
- Mobile todavia debe revisarse en Fase 4 para asegurar que ignore cache vieja y use solo `canAccessMobile`.

### Siguiente fase recomendada

- Fase 3 - Activation keys y conductores.

### Estado de salida

- Fase 2 lista para revision.
- Se puede continuar a Fase 3 si se autoriza.

## Fase 3 - Activation keys y conductores

Fecha local: 2026-06-17

### Estado

- Fase 3 completada localmente en rama `stabilization/production-hardening`.
- No se tocaron pantallas ni estilos de mobile/ventas.
- No se modificaron secretos ni archivos `.env` locales.
- No se avanzo a Fase 4.

### Causa tecnica cubierta

- `/driver/activation/register` devolvia token y usuario, pero no devolvia el mismo contrato de acceso que `/auth/login`.
- Mobile compensaba llamando `/auth/me` despues de guardar token, pero el endpoint de activation quedaba incompleto para diagnostico y compatibilidad.
- Faltaban pruebas para key sin plan, key expirada, aislamiento tenant y regla de cupo tras suspender conductor.
- Se encontro un typo de marca en fallback de activation keys: `MancComb`.

### Regla oficial de conteo de plan

- El limite operativo se toma de la orden activa: `fleetSize`, `maxDrivers` o `maxUnits`.
- Ocupan cupo:
  - Conductores con `role=driver` y `userStatus` distinto de `suspended`.
  - Keys con estado efectivo `available`.
- No ocupan cupo:
  - Keys `used`, `expired` o `revoked`.
  - Conductores suspendidos.
- Una key usada nunca se puede reutilizar.
- Suspender un conductor libera cupo para generar una nueva key, pero conserva la key usada como historial.
- Si el plan tiene 2 combis, no se pueden tener mas de 2 conductores activos/no suspendidos mas keys disponibles.

### Contrato final de `/driver/activation/register`

- `ok`
- `token`
- `tokenExpiresAt`
- `refreshToken`
- `refreshTokenExpiresAt`
- `session`
- `user`
- `authContext`
- `canAccessMobile`
- `mobileBlockReason`
- `tenant`
- `subscription`
- `onboarding`
- `postLoginRoute`
- `dashboard`
- `activation`

### Cambios realizados

- `driver/activation/register` ahora construye `authContext` con la misma fuente central que `/auth/login` y `/auth/me`.
- La respuesta de activation register incluye `canAccessMobile`, `mobileBlockReason`, `tenant`, `subscription` y `postLoginRoute`.
- El dashboard solo se devuelve si `authContext.canUseOperations` es verdadero.
- Se corrigio fallback de marca `MancComb` a `ManeComb`.
- Se amplio el smoke de activation keys para cubrir:
  - no crear key sin plan activo;
  - key expirada no usable;
  - owner no puede activar su propia cuenta como driver;
  - driver activado recibe contrato mobile completo;
  - key usada no se reutiliza;
  - conductor de Tenant A no actualiza unidad de Tenant B;
  - limite de 2 combis bloquea tercera key;
  - suspender conductor libera un cupo para reemplazo.

### Archivos modificados

- `backend/src/modules/activation-keys/routes.js`
- `backend/src/services/activation-keys.js`
- `backend/test/activation-keys.test.js`
- `docs/stabilization-report.md`

### Tests ejecutados

- `npm test` en `backend/`
- `npm run typecheck` en `mobile/`
- `git diff --check`

### Resultados

- `npm test` backend: OK.
- `npm run typecheck` mobile: OK.
- `git diff --check`: OK, sin errores de whitespace. Solo warnings esperados de LF -> CRLF en Windows.

### Riesgos restantes

- No se hizo QA fisico en OnePlus en esta fase.
- No se instalo APK ni se probo activation key real contra Render.
- La relacion vehiculo/conductor suspendido queda como regla funcional actual: suspender libera cupo de conductor, pero no elimina vehiculo historico.
- Mobile cache y retries de Render frio quedan para Fase 4.

### Siguiente fase recomendada

- Fase 4 - Mobile bootstrap, login y errores.

### Estado de salida

- Fase 3 lista para revision.
- Se puede continuar a Fase 4 si se autoriza.

## Fase 4 - Mobile bootstrap, login y errores

Fecha local: 2026-06-17

### Estado

- Fase 4 completada localmente en rama `stabilization/production-hardening`.
- No se redisenaron pantallas ni se cambio navegacion visual.
- No se tocaron secrets ni archivos `.env` locales.
- No se avanzo a Fase 5.

### Causa tecnica cubierta

- Login y registro normal no marcaban `_allowRetry`, asi que 502/503/504 o timeout de Render frio no usaban el retry controlado que ya existia en el cliente HTTP.
- En bootstrap, si `/auth/me` fallaba por red y habia cache, la app podia hidratar `authContext` cacheado y navegar con una decision vieja.
- Si una ruta operativa devolvia `PLAN_REQUIRED`, `refreshAll` limpiaba datos operativos pero podia conservar un `authContext` anterior con acceso activo.
- En refresh de token, si la respuesta no traia contrato nuevo, se conservaba el `authContext` anterior.

### Cambios realizados

- `loginRequest`, `registerRequest` y `validateDriverActivationKeyRequest` usan `_allowRetry=true` y `_skipAuthRefresh=true`.
- El retry sigue limitado por el cliente HTTP a maximo 2 intentos.
- Mensajes de 502/503/504 en produccion ahora indican Render/servidor despertando.
- Bootstrap ya no aplica `stateFromCache(cached)` antes de validar `/auth/me`.
- Si `/auth/me` falla por red durante bootstrap y hay usuario cacheado, la app queda en `sync-error` con `authContext=null`; no entra al mapa con permisos viejos.
- Si una ruta operativa responde `PLAN_REQUIRED`, la app llama `/auth/me` para reemplazar el contrato local antes de decidir ruta.
- Refresh de token ya no conserva `authContext` viejo si la respuesta no trae contrato vigente.
- Tests de routing cubren:
  - backend `canAccessMobile=false` gana sobre plan/tenant cacheados activos;
  - usuario cacheado sin respuesta vigente de backend va a `/sync-error`;
  - plan y tenant locales no conceden acceso sin `canAccessMobile`.

### Archivos modificados

- `mobile/src/api/client.ts`
- `mobile/src/store/use-app-store.ts`
- `mobile/src/utils/account-routing.test.ts`
- `docs/stabilization-report.md`

### Tests ejecutados

- `tsc --noEmit --pretty false` directo en `mobile/`
- `eslint .` directo en `mobile/`
- `node ./scripts/run-point-to-point-test.mjs` directo en `mobile/`
- `jest --runInBand --runTestsByPath src/utils/account-routing.test.ts` directo en `mobile/`
- `npm test` en `backend/`
- `git diff --check`

### Resultados

- Typecheck mobile: OK.
- Lint mobile completo: OK.
- Point-to-point core test: OK.
- Account routing Jest: OK, 12 tests.
- Backend tests: OK.
- `git diff --check`: OK, sin errores de whitespace. Solo warnings esperados de LF -> CRLF en Windows.
- `npm test` mobile por wrapper se quedo sin salida y expiro; se ejecutaron sus dos comandos internos directos y ambos pasaron.

### Riesgos restantes

- No se construyo APK debug/release en esta fase.
- No se instalo ni valido en OnePlus.
- No se probo Render frio fisicamente desde el celular.
- GPS Android y mapa recuperable quedan para Fase 5.

### Siguiente fase recomendada

- Fase 5 - GPS Android y operacion en ruta.

### Estado de salida

- Fase 4 lista para revision.
- Se puede continuar a Fase 5 si se autoriza.

## Fase 5 - GPS Android y operacion en ruta

Fecha local: 2026-06-17

### Estado

- Fase 5 completada localmente en rama `stabilization/production-hardening`.
- No se tocaron auth, planes, ventas ni contrato backend.
- No se redisenaron pantallas; solo se agrego feedback operativo de GPS en mapa Android.
- No se avanzo a Fase 6.

### Causa tecnica cubierta

- `react-native-geolocation-service` devolvia errores de permisos, timeout, provider apagado o posicion no disponible, pero el wrapper nativo no los clasificaba.
- `watchPositionAsync` descartaba errores del watcher con un callback vacio, dejando al mapa sin forma de saber si el GPS estaba apagado, lento o con baja precision.
- `useUserLocation` convertia cualquier fallo de posicion inicial en `servicesEnabled=false`, mezclando timeout, permiso, provider apagado y baja precision.
- Mapa Android mostraba solo `GPS OK/OFF` basado en permisos, aunque Android podia tener permiso concedido y GPS sin respuesta.
- Checklist dependia de `coordinates` para "GPS inicial/final" sin explicar el estado real cuando no habia posicion confiable.

### Cambios realizados

- El wrapper nativo de ubicacion ahora normaliza errores en:
  - `permission_denied`
  - `services_disabled`
  - `timeout`
  - `unavailable`
  - `unknown`
- `watchPositionAsync` acepta callback de error y ya no silencia fallos del watcher.
- `useUserLocation` expone `issue` y `retryCount`, mantiene ultima posicion confiable y distingue:
  - permiso denegado;
  - GPS/proveedor apagado;
  - timeout;
  - posicion no disponible;
  - precision baja.
- Se filtran puntos con precision mayor a 120 m; si la precision baja llega despues de una posicion buena, se conserva la ultima posicion confiable.
- El mapa Android muestra HUD GPS con etiquetas `OK`, `OFF`, `GPS`, `TIME`, `LOW`, `WAIT` o `ERR`.
- El mapa Android agrega un aviso compacto con accion de reintento cuando el GPS necesita intervencion.
- Checklist usa el mismo traductor de estado GPS para explicar por que no puede tomar "GPS inicial/final" y mantiene la alternativa de usar la unidad seleccionada.
- Se agrego utilidad pura `getLocationStatus` con pruebas unitarias.

### Archivos modificados

- `mobile/src/native/location.ts`
- `mobile/src/hooks/use-user-location.ts`
- `mobile/src/screens/map-screen.native.tsx`
- `mobile/src/screens/checklist-screen.tsx`
- `mobile/src/utils/location-status.ts`
- `mobile/src/utils/location-status.test.ts`
- `mobile/package.json`
- `docs/stabilization-report.md`

### Tests ejecutados

- `tsc --noEmit --pretty false` directo en `mobile/`
- `eslint .` directo en `mobile/`
- `node ./scripts/run-point-to-point-test.mjs` directo en `mobile/`
- `jest --runInBand --runTestsByPath src/utils/account-routing.test.ts src/utils/location-status.test.ts` directo en `mobile/`
- `npm test` en `mobile/`
- `npm test` en `backend/`
- `git diff --check`
- `gradlew.bat assembleDebug` en `mobile/android/`

### Resultados

- Typecheck mobile: OK.
- Lint mobile completo: OK.
- Point-to-point core test: OK.
- Jest mobile: OK, 2 suites y 16 tests.
- `npm test` mobile: OK.
- Backend tests: OK.
- `git diff --check`: OK, sin errores de whitespace. Solo warnings esperados de LF -> CRLF en Windows.
- Android `assembleDebug`: OK.

### Riesgos restantes

- No se instalo todavia el APK en OnePlus en esta fase.
- No se hizo prueba fisica caminando/conduciendo con GPS apagado, timeout real y baja precision real.
- `hasServicesEnabledAsync` sigue siendo conservador; el estado de provider apagado se detecta por errores reales de Android al pedir posicion.
- No se construyo release APK; se valido debug APK.

### Siguiente fase recomendada

- Fase 6 - Sincronizacion en tiempo real, sockets y operacion offline/online.

### Estado de salida

- Fase 5 lista para revision.
- Se puede continuar a Fase 6 si se autoriza.

## Fase 6 - Ventas web, portal y pago

Fecha local: 2026-06-17

### Estado

- Fase 6 completada localmente en rama `stabilization/production-hardening`.
- Se corrigio el alcance real de la fase: ventas web, portal y pago.
- No se tocaron sockets operativos ni flujos offline/online de la app movil.
- No se redisenaron pantallas; solo se reforzo sincronizacion de estado comercial y errores.
- No se avanzo a Fase 7.

### Causa tecnica cubierta

- El portal de ventas refrescaba solo `overview` despues de eventos comerciales como `payment:confirmed`, `plan:active` y `subscription:updated`.
- Eso podia dejar datos comerciales secundarios desactualizados, especialmente facturas, metodos de pago y sesiones, aunque el plan ya estuviera activo.
- Los errores de checkout usaban mensajes genericos de Axios cuando el backend devolvia una respuesta legible.
- Los errores 502/503/504 del backend desplegado podian mostrarse como fallas internas sin explicar el caso comun de Render iniciando o tardando.

### Cambios realizados

- Se centralizo el mensaje legible de errores de API para checkout y portal.
- Los estados 502, 503 y 504 ahora muestran una indicacion clara para reintentar cuando el servidor esta iniciando o tardo demasiado.
- `payment:confirmed`, `plan:active` y `subscription:updated` ahora disparan `loadAll()` en el portal para refrescar:
  - overview;
  - subscription;
  - onboarding;
  - activation keys;
  - invoices;
  - payment methods;
  - sessions.
- El checkout ahora muestra el mensaje real del backend cuando existe.
- El store del portal reutiliza el parser comun de errores para evitar mensajes inconsistentes.

### Archivos modificados

- `ventas/src/lib/api.ts`
- `ventas/features/portal/api.ts`
- `ventas/features/portal/store/use-portal-store.ts`
- `ventas/screens/plan-checkout-screen.tsx`
- `docs/stabilization-report.md`

### Bugs encontrados

- El portal podia quedar parcialmente desincronizado despues de confirmar pago o activar plan porque solo recargaba `overview`.
- Checkout podia mostrar `Request failed with status code ...` en vez del mensaje util del backend.
- Los errores 502/503/504 no diferenciaban una falla real de un backend frio o lento.
- En Windows, `node` esta sombreado por `C:\Windows\System32\node`; los tests directos con `node` dan acceso denegado o cuelgan wrappers. Ejecutando con `C:\Program Files\nodejs\node.exe` funcionan.
- `ventas` tiene deuda previa de typecheck: faltan tipos/configuracion para `react-native`, `react-native-svg`, `replaceAll` requiere lib ES2021 y hay errores de tipos de iconos/componentes no tocados en esta fase.

### Tests ejecutados

- `npm run build` en `ventas/`
- `tsc --noEmit --pretty false` directo en `ventas/`
- Tests backend individuales con `C:\Program Files\nodejs\node.exe`:
  - `test/proxy.test.js`
  - `test/env.test.js`
  - `test/auth-context.test.js`
  - `test/cors.test.js`
  - `test/telemetry.test.js`
  - `test/navigation-trips.test.js`
  - `test/activation-keys.test.js`
  - `test/tenant-isolation.test.js`
  - `test/app-smoke.test.js`
- `git diff --check`

### Resultados

- Build de ventas: OK.
- Tests backend directos con Node real: OK.
- `git diff --check`: OK, sin errores de whitespace. Solo warnings esperados de LF -> CRLF en Windows.
- Typecheck de ventas: bloqueado por deuda previa de configuracion/tipos no introducida por esta fase.
- No se hizo QA manual en Cloudflare ni prueba real de Mercado Pago/SPEI en produccion.

### Riesgos restantes

- Falta validar visualmente el portal desplegado en Cloudflare despues de publicar.
- Falta probar un pago real o sandbox completo de Mercado Pago/SPEI contra Render produccion.
- La deuda de typecheck de ventas debe limpiarse en una fase posterior para que `tsc --noEmit` sea una compuerta confiable.
- Conviene corregir el PATH local de Windows para que `node` apunte a `C:\Program Files\nodejs\node.exe`.

### Siguiente fase recomendada

- Fase 7 - Limpieza legacy controlada.

### Estado de salida

- Fase 6 lista para revision.
- Se puede continuar a Fase 7 si se autoriza.

## Fase 7 - Limpieza legacy controlada

Fecha local: 2026-06-17

### Estado

- Fase 7 completada localmente en rama `stabilization/production-hardening`.
- Se aplico limpieza controlada solo despues de buscar referencias con `rg`.
- No se elimino `mobile/app/` porque sigue siendo parte real del arbol de rutas de la app React Native CLI.
- No se tocaron rutas publicas de backend ni contratos activos.
- No se avanzo a Fase 8.

### Causa tecnica cubierta

- `mobile` mantenia alias Metro/Babel hacia `../ventas`, aunque no quedaban imports reales `ventas/...`.
- Ese acoplamiento podia hacer que el APK dependiera de codigo web comercial o de `node_modules` de ventas.
- La app movil conservaba archivos comerciales huerfanos: pantalla de perfil comprador, constantes comerciales, checkout context y declaraciones de modulos de ventas.
- `mobile/src/api/client.ts` exportaba helpers comerciales/portal sin consumidores en mobile, contradiciendo la regla de que compra/plan/renovacion se abren en navegador externo.
- `desktop/README.md` hablaba de Expo y `npm run desktop`, pero ese flujo ya no existe.
- `docs/alcance-sistema-combis.md` conservaba referencias historicas a Expo/desktop sin advertir que no son el stack activo.

### Cambios realizados

- Se elimino el alias `ventas` de `mobile/babel.config.js`.
- Se elimino `watchFolders` y `extraNodeModules.ventas` de `mobile/metro.config.js`.
- Se retiraron helpers comerciales/portal no usados del cliente API movil.
- Se eliminaron archivos moviles huerfanos ligados a ventas web legacy.
- Se actualizo `desktop/README.md` como nota historica.
- Se creo `docs/legacy-notes.md` con la evidencia y decisiones de limpieza.
- Se agrego nota de estabilizacion a `docs/alcance-sistema-combis.md`.
- Se corrigio la nota antigua de Fase 0 sobre `mobile/app/*`: no es basura; es arbol de rutas activo.

### Archivos modificados

- `mobile/babel.config.js`
- `mobile/metro.config.js`
- `mobile/src/api/client.ts`
- `desktop/README.md`
- `docs/legacy-notes.md`
- `docs/alcance-sistema-combis.md`
- `docs/stabilization-report.md`

### Archivos eliminados

- `mobile/src/types/ventas-modules.d.ts`
- `mobile/src/screens/buyer-profile-screen.tsx`
- `mobile/src/constants/commercial.ts`
- `mobile/src/utils/checkout-context.ts`

### Bugs encontrados

- `mobile/app/*` parecia legacy por su forma tipo expo-router, pero en este proyecto es ruta activa; no se debe borrar.
- El wrapper `npm run typecheck` de mobile se quedo sin salida y expiro, pero el `tsc.cmd` directo paso correctamente.
- El smoke backend falla si `.env` local activa Mercado Pago real porque intenta crear una preferencia externa; en modo manual/deterministico pasa.
- `docs/alcance-sistema-combis.md` y scripts de documentacion generada aun conservan referencias historicas a Expo; se documento el estado activo sin regenerar DOCX.

### Tests ejecutados

- `rg` para referencias de archivos y helpers eliminados.
- `tsc --noEmit --pretty false` directo en `mobile/`
- `npm run lint` en `mobile/`
- `npm test` en `mobile/`
- `npm run build` en `ventas/`
- Tests backend individuales con `C:\Program Files\nodejs\node.exe`
- `app-smoke.test.js` backend con `PAYMENT_PROVIDER=manual` y `MERCADO_PAGO_ACCESS_TOKEN=`
- `git diff --check`

### Resultados

- No quedan referencias `ventas/...` desde `mobile`.
- Typecheck mobile directo: OK.
- Lint mobile: OK.
- Tests mobile: OK.
- Build ventas: OK.
- Backend tests individuales previos a `app-smoke`: OK.
- `app-smoke` con pago manual/deterministico: OK.
- `git diff --check`: OK, sin errores de whitespace. Solo warnings esperados de LF -> CRLF en Windows.

### Riesgos restantes

- No se ejecuto Android `assembleDebug` porque no se tocaron `mobile/android` ni scripts Android.
- No se regenero documentacion DOCX; el script generador aun contiene texto historico Expo/Flutter.
- La falla ambiental de `app-smoke` con Mercado Pago real queda documentada; conviene hacer ese smoke deterministicamente por defecto en una fase posterior.
- No se publico ni se hizo QA visual en dispositivo en esta fase.

### Siguiente fase recomendada

- Fase 8 - CI y pruebas automaticas.

### Estado de salida

- Fase 7 lista para revision.
- Se puede continuar a Fase 8 si se autoriza.

## Fase 8 - CI y pruebas automaticas

Fecha local: 2026-06-17

### Estado

- Fase 8 completada localmente en rama `stabilization/production-hardening`.
- Se agrego GitHub Actions simple sin deploy automatico.
- No se agregaron secrets.
- No se corrio Android release en CI.
- No se avanzo a Fase 9.

### Causa tecnica cubierta

- No existia `.github/workflows` en la raiz del repo.
- La validacion dependia de ejecuciones locales y podia dejar regresar bugs de auth, plan activo, GPS, ventas o limpieza legacy.
- `app-smoke.test.js` podia usar variables reales del `.env` local y llamar Mercado Pago o Mongo real, haciendo el smoke no deterministico.

### Cambios realizados

- Se creo `.github/workflows/ci.yml`.
- Se agregaron jobs independientes:
  - backend tests;
  - mobile typecheck/lint/test;
  - ventas build.
- Cada job usa `actions/setup-node@v4` con cache npm por lockfile.
- Ventas build define `VITE_API_URL=https://manecomb.onrender.com/api` y `VITE_SOCKET_URL=https://manecomb.onrender.com`.
- Backend CI fuerza entorno deterministico sin Mongo real ni Mercado Pago real.
- `backend/test/app-smoke.test.js` ahora fuerza pago manual, sin tokens Mercado Pago y sin Mongo real antes de importar la app.

### Archivos modificados

- `.github/workflows/ci.yml`
- `backend/test/app-smoke.test.js`
- `docs/stabilization-report.md`

### Bugs encontrados

- `Get-ChildItem -Recurse .github` buscaba tambien `.github` dentro de `node_modules`; se confirmo luego que no habia `.github` real en la raiz.
- `app-smoke` era sensible a `.env` local con Mercado Pago, lo que podia fallar por red/proveedor externo.
- En Windows local sigue existiendo el problema de `node` sombreado por `C:\Windows\System32\node`; CI Linux no tendra ese problema.

### Tests ejecutados

- Verificacion de ausencia de `.github` raiz.
- `gradlew.bat assembleDebug` en `mobile/android/`
- `tsc --noEmit --pretty false` directo en `mobile/`
- `npm run lint` en `mobile/`
- `npm test` en `mobile/`
- `npm run build` en `ventas/`
- Tests backend directos con `C:\Program Files\nodejs\node.exe`
- `npm test` backend con smoke deterministico
- `git diff --check`

### Resultados

- Android `assembleDebug`: OK.
- Typecheck mobile directo: OK.
- Lint mobile: OK.
- Tests mobile: OK.
- Build ventas: OK.
- Backend tests directos: OK.
- Backend `npm test`: OK.
- `git diff --check`: OK, sin errores de whitespace. Solo warnings esperados de LF -> CRLF en Windows.

### Riesgos restantes

- El workflow todavia no esta ejecutado en GitHub hasta pushear la rama.
- No valida Android en CI para no meter builds pesados por defecto.
- No valida deploy Render/Cloudflare ni pagos reales.
- No valida QA fisico OnePlus.

### Siguiente fase recomendada

- Fase 9 - QA final produccion.

### Estado de salida

- Fase 8 lista para revision.
- Se puede continuar a Fase 9 si se autoriza.

## Fase 9 - QA final produccion

Fecha local: 2026-06-18

### Estado

- Fase 9 ejecutada parcialmente.
- Estado final: no listo para cliente.
- Se valido superficie publica Cloudflare/Render y se instalo APK release local en OnePlus.
- No se completo flujo transaccional completo de cliente real por bloqueo/intermitencia en POST a Render desde esta sesion y falta de credenciales QA productivas confirmadas.
- No se hicieron cambios de codigo en esta fase.

### Causa tecnica cubierta

- Produccion esta accesible, pero `/api/health` reporta `status=degraded`.
- MongoDB esta conectado y el storage esta listo.
- Pagos no estan listos: faltan `MERCADO_PAGO_ACCESS_TOKEN` o datos bancarios `BANK_TRANSFER_ACCOUNT_NAME`/`BANK_TRANSFER_CLABE`.
- Email/WhatsApp no estan listos: faltan variables de Resend y Twilio.
- RTC avanzado no esta listo: faltan variables TURN.
- Render responde con latencia alta desde mobile en backend frio: OnePlus reporto `22873 ms`.
- La rama local `stabilization/production-hardening` contiene cambios sin commit/push, por lo que Render/Cloudflare aun no reflejan todo el hardening de fases 1-8.

### Cambios realizados

- Se agrego este reporte de QA final al documento de estabilizacion.
- Se instalo `app-release.apk` limpio en OnePlus mediante ADB:
  - paquete: `com.anonymous.combiscontrol`;
  - dispositivo: `9e9f922`;
  - modelo detectado por ADB: `LE2121`;
  - APK: `mobile/android/app/build/outputs/apk/release/app-release.apk`.

### Archivos modificados

- `docs/stabilization-report.md`

### Bugs encontrados

- Produccion no esta lista para cliente por health `degraded`.
- Pagos productivos no estan configurados; checkout real no puede considerarse listo.
- Notificaciones email/WhatsApp no estan configuradas.
- TURN/RTC no esta configurado para llamadas robustas fuera de STUN.
- POST a Render desde esta sesion fallo intermitentemente con `curl: (7) Failed to connect`, aunque GET `/api/health` y `/api/commercial/plans` respondieron.
- `device:doctor` detecto OnePlus conectado, pero backend LAN local no respondia; no afecta produccion, pero bloquea QA local LAN.
- Build release/debug de Gradle se quedo en timeout aunque genero `app-release.apk`; hubo que detener daemon Gradle.
- Login real owner/admin, conductor, activation key desde app, mapa autenticado, chat, radio, incidencias y checklist no se completaron por falta de credenciales QA/flujo registro estable contra produccion.

### Tests ejecutados

- `curl -I https://manecomb1.pages.dev`
- `curl https://manecomb.onrender.com/`
- `curl https://manecomb.onrender.com/api/health`
- `curl -I https://manecomb.onrender.com/api/health`
- Preflight CORS `OPTIONS /api/auth/login` con origin `https://manecomb1.pages.dev`
- `curl https://manecomb.onrender.com/api/commercial/plans`
- POST probes a `/api/auth/login`, `/api/auth/register` y `/api/driver/activation/validate`
- `npm run device:doctor` con Node real
- `npm run android:release`
- `gradlew.bat assembleDebug`
- `gradlew.bat assembleDebug --no-daemon`
- `gradlew.bat --stop`
- Instalacion limpia ADB de `app-release.apk`
- Lanzamiento de app en OnePlus con `adb shell monkey`
- Capturas ADB de pantalla de login y prueba de conexion

### Resultados

- Cloudflare landing: HTTP 200 OK.
- Cloudflare `/ventas/pago`: HTTP 200 OK.
- Cloudflare `/portal`: redirige 308 a `/`; requiere revisar redirects si se espera deep link directo a portal.
- Render `/`: HTTP 200 OK.
- Render `/api/health`: HTTP 200 OK con `status=degraded`.
- Render `/api/commercial/plans`: HTTP 200 OK y devuelve planes.
- CORS Cloudflare -> Render: preflight OK con `access-control-allow-origin: https://manecomb1.pages.dev`.
- Rate limit con proxy no exploto con `X-Forwarded-For`; `/api/health` respondio OK.
- OnePlus detectado por ADB: OK.
- APK release instalado limpio en OnePlus: OK.
- App abre en login sin pantalla negra: OK.
- Boton `Probar conexion` desde OnePlus: OK, backend produccion `degraded / mongo`, latencia `22873 ms`.
- Login operativo real y flujo completo cliente: no validado.

### Riesgos restantes

- Listo para cliente: NO.
- Severidad P0: pagos productivos no configurados.
- Severidad P0: cambios locales de estabilizacion aun no estan publicados en `main`/Render/Cloudflare.
- Severidad P1: produccion `degraded`; health no puede firmarse como listo.
- Severidad P1: backend frio/lento desde OnePlus, observado en 22.8s.
- Severidad P1: falta QA autenticado real en app movil.
- Severidad P2: `/portal` en Cloudflare redirige a `/`; revisar si la ruta SPA debe resolver portal directamente en produccion.
- Workaround temporal: usar prueba de conexion y login solo cuando Render este caliente; configurar pagos manuales o Mercado Pago antes de demo comercial.
- Monitorear: `/api/health`, logs Render en POST auth/register/login, pagos, CORS, rate limit, latencia cold start, errores mobile de auth.

### Siguiente fase recomendada

- Fase 10 - Publicacion controlada a main, redeploy Render/Cloudflare y QA productivo con cuenta real.

### Estado de salida

- Fase 9 queda parcial por dependencias productivas y publicacion pendiente.
- Se puede continuar a Fase 10 si se autoriza subir cambios, redeployar y repetir QA final.

## Fase 10 - Publicacion controlada a main

Fecha local: 2026-06-18

### Estado

- Fase 10 en proceso de publicacion controlada.
- Objetivo: llevar a GitHub `main` los cambios de estabilizacion para activar redeploy en Render/Cloudflare.
- No se agregaron secrets.
- No se hizo deploy manual desde consola de Render/Cloudflare en esta fase; se depende del deploy conectado al push.

### Causa tecnica cubierta

- Produccion seguia ejecutando codigo anterior porque las fases 1-9 estaban en cambios locales sin commit/push.
- La web de ventas y el backend necesitan los contratos nuevos en la misma rama para evitar desincronizacion.
- El CI nuevo solo puede ejecutarse cuando el workflow exista en GitHub.

### Cambios realizados

- Se preparo commit unico de estabilizacion con backend, mobile, ventas, CI y documentacion.
- Commit local creado antes del push: `8c023da Stabilize production auth, mobile access, and CI`.
- Se validaron los comandos equivalentes al CI antes de publicar.
- Se confirmo que `ventas` requiere `VITE_API_URL` en build de produccion; el build local se ejecuto con `https://manecomb.onrender.com/api`.

### Archivos modificados

- `.github/workflows/ci.yml`
- `backend/`
- `mobile/`
- `ventas/`
- `docs/`
- `desktop/README.md`

### Bugs encontrados

- `npm run build` en `ventas` falla correctamente si falta `VITE_API_URL`; no es regresion, es guardia de produccion.
- El warning de chunk grande de Vite permanece; no bloquea build.

### Tests ejecutados

- `npm test` en `backend/`
- `npm run typecheck` en `mobile/`
- `npm run lint` en `mobile/`
- `npm test` en `mobile/`
- `npm run build` en `ventas/` con `VITE_API_URL=https://manecomb.onrender.com/api` y `VITE_SOCKET_URL=https://manecomb.onrender.com`
- `git diff --check`

### Resultados

- Backend tests: OK.
- Mobile typecheck: OK.
- Mobile lint: OK.
- Mobile tests: OK.
- Ventas build: OK con variables productivas.
- `git diff --check`: OK, sin errores de whitespace. Solo warnings esperados LF -> CRLF en Windows.
- Commit local: OK.

### Riesgos restantes

- Falta confirmar que el push llegue a `origin/main`.
- Falta esperar y verificar redeploy de Render/Cloudflare.
- Falta reintentar QA productivo autenticado tras redeploy.
- Produccion seguira `degraded` hasta configurar pagos/notificaciones/TURN.

### Siguiente fase recomendada

- Verificacion post-deploy y QA productivo autenticado.

### Estado de salida

- Commit local creado; push a `origin/main` pendiente al momento de cerrar este reporte documental.
