# Final QA ManeComb

Fecha: 2026-06-11.

## Resumen

Se estabilizo la integracion de produccion entre backend Render, ventas Cloudflare Pages y mobile Android React Native CLI. Los cambios fueron quirurgicos: permisos de ubicacion, guardas post-login, rutas de usuario, icon fonts en APK release, limpieza segura de capturas locales y documentacion operativa.

No se reinstalo Expo, no se cambio branding, no se tocaron endpoints de negocio y no se subieron secrets.

## Problemas encontrados

1. Permiso falso de ubicacion en Android:
   - El flujo pedia ubicacion y podia llamar GPS antes de que Android terminara de reflejar `granted`.
   - Un timeout/fallo de GPS se podia tratar como permiso denegado.

2. Iconos rotos en release:
   - El APK release no copiaba explicitamente las fuentes de `react-native-vector-icons`.
   - La app podia mostrar cuadros/simbolos vacios en mapa, botones y navegacion.

3. Riesgo de pantalla negra post-login:
   - `Redirect` renderizaba `null`.
   - `MapScreen` podia retornar `null` si faltaba `user` o `mapData`.
   - El bootstrap podia quedarse en "Sincronizando centro de control..." sin salida recuperable.

4. Ruta incorrecta para usuarios comerciales:
   - Usuarios tipo `company_owner` podian caer al mapa operativo aunque su destino natural es `/portal`.

5. Reutilizacion ventas/mobile con alias:
   - Pantallas en `ventas/screens` importan `@/src/utils/checkout-context`.
   - En mobile, el alias `@` resuelve a `mobile/`, por lo que faltaba un adaptador equivalente.

6. CORS historico:
   - Se valido que Render ya responde con CORS correcto para Cloudflare Pages y previews.

7. Basura local detectada:
   - Capturas `manecomb-*.png`, `ventas-*.png` y XML de UI en raiz.
   - No se eliminaron; se agregaron reglas `.gitignore`.

8. Carpeta candidata a legado:
   - `apps/mobile-rn-cli/` existe y contiene una app RN CLI anterior.
   - No se elimino porque puede servir como respaldo historico y el pedido exige listar antes de borrar.

## Problemas corregidos

- `mobile/src/native/location.ts`:
  - Verifica fine/coarse con `PermissionsAndroid.check`.
  - Pide permisos foreground con `requestMultiple`.
  - Reintenta despues de un pequeno delay antes de declarar denegado.
  - `getCurrentPositionAsync` ya revisa permiso real antes de llamar GPS.
  - `watchPositionAsync` no crashea si falta permiso.

- `mobile/src/hooks/use-user-location.ts`:
  - GPS lento no bloquea mapa.
  - Error de GPS no se convierte automaticamente en `denied`.
  - Watcher inicia best-effort.

- `mobile/App.tsx`:
  - ErrorBoundary global.
  - Timeout recuperable de bootstrap.
  - Botones de reintentar, reiniciar sesion y continuar sin ubicacion cuando hay usuario.

- `mobile/src/navigation/router.tsx`:
  - `Redirect` muestra loading visible en lugar de `null`.

- `mobile/src/screens/map-screen.native.tsx`:
  - Si no hay usuario, vuelve a login.
  - Si no hay `mapData`, muestra estado recuperable.

- `mobile/android/app/build.gradle`:
  - Copia icon fonts de `react-native-vector-icons` al APK release.

- `mobile/android/build.gradle`:
  - Fija `playServicesLocationVersion = "21.0.1"` para alinear geolocation/maps.

- `mobile/src/utils/account-routing.ts`:
  - Usuarios comerciales van a `/portal`.

- `mobile/src/utils/checkout-context.ts`:
  - Adaptador mobile para pantallas reutilizadas de ventas.

- `.gitignore`:
  - Ignora capturas locales de QA.

## Archivos modificados

- `.gitignore`
- `mobile/App.tsx`
- `mobile/android/app/build.gradle`
- `mobile/android/build.gradle`
- `mobile/src/hooks/use-user-location.ts`
- `mobile/src/native/location.ts`
- `mobile/src/navigation/router.tsx`
- `mobile/src/screens/customer-auth-screen.tsx`
- `mobile/src/screens/map-screen.native.tsx`
- `mobile/src/store/use-app-store.ts`
- `mobile/src/utils/account-routing.ts`
- `mobile/src/utils/checkout-context.ts`
- `docs/final-qa-report.md`
- `docs/mobile-release.md`
- `docs/deployment.md`
- `docs/troubleshooting.md`

## Archivos eliminados

Ninguno.

No se borraron capturas, XML, legacy apps ni backups. Solo se ignoraron capturas locales para evitar subirlas.

## Dependencias

Agregadas: ninguna.

Eliminadas: ninguna.

## Backend Render

Produccion validada:

- `https://manecomb.onrender.com/api/health`: `200 OK`.
- `https://manecomb.onrender.com/api/commercial/plans`: `200 OK`.
- `https://manecomb.onrender.com/api/auth/session`: `401 Unauthorized` sin sesion, correcto.
- CORS con `Origin: https://manecomb1.pages.dev`: OK.
- CORS con `Origin: https://preview.manecomb1.pages.dev`: OK.

Variables finales recomendadas:

```env
CLIENT_ORIGIN=https://manecomb1.pages.dev,https://*.manecomb1.pages.dev,http://localhost:5173,http://127.0.0.1:5173
APP_URL=https://manecomb1.pages.dev
```

## MongoDB Atlas

No se leyeron ni modificaron secrets. Las pruebas backend pasan aun cuando el entorno local cae a almacenamiento interno por timeout de MongoDB. En Render se debe confirmar `MONGODB_URI` y logs sin errores persistentes.

## Ventas Cloudflare

Produccion validada por HTTP:

- `https://manecomb1.pages.dev/`: `200 OK`.
- `https://manecomb1.pages.dev/ventas/login`: `200 OK`.
- `https://manecomb1.pages.dev/portal/plan`: `200 OK`.

Build local:

- `cd ventas`
- `npm run build`: OK.
- Advertencia: chunk JS mayor a 500 kB. No bloquea deploy.

Variables finales Cloudflare:

```env
VITE_API_URL=https://manecomb.onrender.com/api
VITE_SOCKET_URL=https://manecomb.onrender.com
```

## Mobile Android

Validaciones:

- `npm run typecheck`: OK.
- `npm run lint`: OK, 0 errores, 100 warnings preexistentes.
- `npm run android:release`: OK.
- APK generado: `mobile/dist/app-release.apk`.
- AAB generado: `mobile/dist/app-release.aab`.
- APK instalado en OnePlus 9 Pro: OK.
- Logcat fatal tras instalacion: sin `AndroidRuntime` ni `ReactNativeJS`.

Artefactos finales:

```text
mobile/dist/app-release.apk
mobile/dist/app-release.aab
```

Tamanos validados:

- APK: 76009324 bytes.
- AAB: 53030573 bytes.

Icon fonts confirmadas dentro del APK:

- `Feather.ttf`
- `FontAwesome.ttf`
- `FontAwesome5_Brands.ttf`
- `FontAwesome5_Regular.ttf`
- `FontAwesome5_Solid.ttf`
- `Ionicons.ttf`
- `MaterialCommunityIcons.ttf`
- `MaterialIcons.ttf`

## Prueba fisica

Dispositivo detectado:

```text
OnePlus9Pro / LE2121
```

Resultado:

- APK release instalado limpio con `adb uninstall` + `adb install`.
- El dispositivo quedo bloqueado por lockscreen/PIN/huella antes de poder automatizar login.
- No se pudo validar login y permiso de ubicacion en esa corrida por bloqueo externo del telefono.
- No se detectaron fatales en logcat despues de instalacion.

## Comandos ejecutados

```powershell
& "C:\Program Files\nodejs\npm.cmd" --prefix backend test
& "C:\Program Files\nodejs\npm.cmd" audit
cd ventas
& "C:\Program Files\nodejs\npm.cmd" run build
cd ..\mobile
& "C:\Program Files\nodejs\npm.cmd" run typecheck
& "C:\Program Files\nodejs\npm.cmd" run lint
& "C:\Program Files\nodejs\npm.cmd" run android:release
```

Produccion:

```powershell
curl.exe -s -D - -o NUL -H "Origin: https://manecomb1.pages.dev" https://manecomb.onrender.com/api/health
curl.exe -s -D - -o NUL -H "Origin: https://manecomb1.pages.dev" https://manecomb.onrender.com/api/commercial/plans
curl.exe -s -D - -o NUL -H "Origin: https://preview.manecomb1.pages.dev" https://manecomb.onrender.com/api/auth/session
curl.exe -s -D - -o NUL https://manecomb1.pages.dev/
curl.exe -s -D - -o NUL https://manecomb1.pages.dev/ventas/login
curl.exe -s -D - -o NUL https://manecomb1.pages.dev/portal/plan
```

## Pendientes reales

- Desbloquear el celular y repetir login fisico completo con permiso de ubicacion desde instalacion limpia.
- Revisar visualmente que los iconos ya no aparezcan como cuadros en mapa/navegacion despues de login fisico.
- Evaluar code-splitting en ventas si el chunk grande afecta performance real.
- Decidir si `apps/mobile-rn-cli/` se conserva como historico o se archiva/elimina en una tarea separada.
- Reducir warnings de lint mobile en una limpieza posterior.

## Riesgos restantes

- Render cold start puede causar demoras de primera llamada.
- Atlas depende de configuracion real de Render, no de pruebas locales.
- Android vendors pueden comportarse distinto con permisos background/foreground.
- La prueba fisica quedo bloqueada por lockscreen, aunque build/instalacion/logcat fueron correctos.
