# Troubleshooting ManeComb

## Backend Render

### CORS en Cloudflare Pages

Sintoma:

- Browser console muestra CORS en `/api/commercial/plans` o `/api/auth/session`.

Revisar:

```env
CLIENT_ORIGIN=https://manecomb1.pages.dev,https://*.manecomb1.pages.dev,http://localhost:5173,http://127.0.0.1:5173
```

Probar:

```powershell
curl.exe -s -D - -o NUL -H "Origin: https://manecomb1.pages.dev" https://manecomb.onrender.com/api/commercial/plans
```

Debe devolver `Access-Control-Allow-Origin: https://manecomb1.pages.dev`.

`/api/auth/session` puede devolver `401 Unauthorized` si no hay token; eso es correcto si incluye CORS.

### Render cold start

Sintoma:

- Primera llamada tarda varios segundos.

Accion:

- Reintentar health.
- Ver logs Render.
- Confirmar que Atlas no esta rechazando conexion.

## Ventas web

### Pantalla negra

Revisar:

- `ventas/index.html` debe tener `<div id="root"></div>`.
- `ventas/src/main.tsx` debe montar React en `root`.
- `ventas/public/_redirects` debe enviar rutas SPA a `index.html`.

Comandos:

```powershell
cd ventas
& "C:\Program Files\nodejs\npm.cmd" run build
```

Si `npm --prefix ventas run build` falla en Windows/OneDrive con `Cannot read directory "../../../.."`, ejecutar desde `ventas/` como cwd real:

```powershell
cd ventas
& "C:\Program Files\nodejs\npm.cmd" run build
```

### URL API mal normalizada

La variable correcta en Cloudflare es:

```env
VITE_API_URL=https://manecomb.onrender.com/api
VITE_SOCKET_URL=https://manecomb.onrender.com
```

No usar:

```text
https://manecomb.onrender.com/api.
https://manecomb.onrender.com/api//
https://manecomb.onrender.com:5000/api
```

### Chunk grande en Vite

`vite build` puede advertir que el chunk supera 500 kB. No bloquea deploy.
La causa actual es reutilizar pantallas de `ventas/screens` y `ventas/features` dentro de una SPA.

## Mobile Android

### Render con puerto `:5000`

Produccion correcta:

```env
MANECOMB_API_URL=https://manecomb.onrender.com/api
MANECOMB_SOCKET_URL=https://manecomb.onrender.com
```

Si aparece `https://manecomb.onrender.com:5000/api`, revisar:

- `mobile/.env.production`
- `mobile/src/config/api_config.ts`
- APK instalado viejo.

Reinstalar limpio:

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb uninstall com.anonymous.combiscontrol
& $adb install -r mobile\dist\app-release.apk
```

### Error falso de permiso de ubicacion

Causa habitual:

- Se llama GPS inmediatamente despues del dialogo Android y `check/request` aun no refleja el permiso.
- Se confunde fallo de GPS/timeout con permiso denegado.

Correccion actual:

- Verificar fine/coarse con `PermissionsAndroid.check`.
- Pedir fine/coarse con `requestMultiple`.
- Esperar un pequeno settle antes de declarar denegado.
- No bloquear mapa si `getCurrentPosition` tarda.
- Consultar background sin bloquear el primer flujo.

### Iconos como cuadros

Causa:

- Fuentes de `react-native-vector-icons` no copiadas al APK release.

Verificar:

```powershell
tar -tf mobile\dist\app-release.apk | Select-String "assets/fonts"
```

Debe listar:

- `MaterialCommunityIcons.ttf`
- `MaterialIcons.ttf`
- `Ionicons.ttf`
- `Feather.ttf`
- `FontAwesome.ttf`
- `FontAwesome5_Brands.ttf`
- `FontAwesome5_Regular.ttf`
- `FontAwesome5_Solid.ttf`

### Crash despues de login

Revisar:

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb logcat -d -t 1000 AndroidRuntime:E ReactNativeJS:E '*:S'
```

Guardas actuales:

- ErrorBoundary global.
- Timeout de bootstrap.
- Pantalla recuperable con reintentar/reiniciar sesion.
- Map screen ya no retorna `null` si falta `mapData`.
- Si falta plan, muestra estado recuperable y enlace a plan para owner/admin.

### `pm clear` falla

En algunos OnePlus/Oppo:

```text
SecurityException: does not have permission android.permission.CLEAR_APP_USER_DATA
```

Usar:

```powershell
adb uninstall com.anonymous.combiscontrol
adb install -r mobile\dist\app-release.apk
```

## Limpieza segura

Archivos locales que no deben subirse:

- `manecomb-*.png`
- `manecomb-*.xml`
- `ventas-*.png`
- `ventas-*.xml`
- `.env`
- `.env.*`
- `*.apk`
- `*.aab`
- `*.jks`
- `*.keystore`
- `node_modules`
- `.gradle`
- `build`
- `dist`

Si se detecta una carpeta legacy como `apps/mobile-rn-cli`, listar primero y no borrar sin confirmacion.
